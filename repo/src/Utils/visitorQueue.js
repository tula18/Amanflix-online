// Visitor limit: when the site is full, visitors wait in line (api/api/visitor_queue.py).
//
// This module keeps the browser's ticket (shared by all its tabs), tracks whether the visitor is
// active, and adds the ticket to every API request. It is imported first in index.js, so the
// header is on every fetch, including ones made while the first page renders.
import { API_URL } from '../config';

const TICKET_KEY = 'visitor_ticket';
const TICKET_HEADER = 'X-Visitor-Ticket';

// Fired when the server turns a request away because this visitor is waiting in line
export const QUEUE_REQUIRED_EVENT = 'visitor-queue-required';

// Requests the server never checks: no header, so they don't need an extra CORS preflight
const UNCHECKED_PATHS = ['/api/service/', '/api/admin/', '/api/analytics/', '/cdn/images/', '/api/stream/', '/ip'];

export const getTicket = () => {
  try {
    return localStorage.getItem(TICKET_KEY);
  } catch (e) {
    return null;
  }
};

const setTicket = (ticket) => {
  try {
    localStorage.setItem(TICKET_KEY, ticket);
  } catch (e) {
    // Private mode or storage disabled: the ticket then lives only as long as the page
  }
};

// ── Activity: input anywhere, or a video playing ────────────────────────────
let lastActivity = Date.now();
const markActive = () => {
  lastActivity = Date.now();
};
const idleSeconds = () => Math.round((Date.now() - lastActivity) / 1000);

['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((type) =>
  window.addEventListener(type, markActive, { passive: true, capture: true })
);
// Media events don't bubble, but they do pass through the document in the capture phase
document.addEventListener('timeupdate', (event) => {
  if (event.target && !event.target.paused) markActive();
}, true);

// ── Ticket on every checked API request ─────────────────────────────────────
const originalFetch = window.fetch.bind(window);

const needsTicket = (url) =>
  url.startsWith(API_URL) && !UNCHECKED_PATHS.some((path) => url.startsWith(API_URL + path));

const withTicket = (headers, ticket) => {
  if (headers instanceof Headers) {
    const copy = new Headers(headers);
    copy.set(TICKET_HEADER, ticket);
    return copy;
  }
  if (Array.isArray(headers)) {
    return [...headers, [TICKET_HEADER, ticket]];
  }
  return { ...(headers || {}), [TICKET_HEADER]: ticket };
};

window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  const ticket = getTicket();
  if (ticket && needsTicket(url)) {
    const headers = init && init.headers ? init.headers : (input instanceof Request ? input.headers : undefined);
    init = { ...(init || {}), headers: withTicket(headers, ticket) };
  }

  const response = await originalFetch(input, init);
  if (response.status === 503 && needsTicket(url)) {
    try {
      const body = await response.clone().json();
      if (body && body.error === 'queue_required') {
        window.dispatchEvent(new Event(QUEUE_REQUIRED_EVENT));
      }
    } catch (e) {
      // Not JSON: some other 503
    }
  }
  return response;
};

// ── Queue ───────────────────────────────────────────────────────────────────

// Join the line, or tell the server this browser is still here. Returns the server's answer:
// {status: 'admitted'|'waiting', position, ahead, queue_length, eta_seconds, next_check_seconds, reason}
// An admin's check-in carries the admin token: admins get in without taking a visitor's slot.
export const checkIn = async () => {
  const headers = { 'Content-Type': 'application/json' };
  const adminToken = localStorage.getItem('admin_token');
  if (adminToken) headers.Authorization = `Bearer ${adminToken}`;
  const response = await originalFetch(`${API_URL}/api/service/queue/check-in`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: getTicket(), idle_seconds: idleSeconds() }),
  });
  if (!response.ok) {
    throw new Error(`Queue check-in failed (${response.status})`);
  }
  const data = await response.json();
  if (data.ticket) setTicket(data.ticket);
  return data;
};

// Give up the place in line (the waiting page is being closed). A refresh also sends this; the
// server keeps the place for a few seconds so the reloaded page gets it back.
export const leaveQueue = () => {
  const ticket = getTicket();
  if (ticket && navigator.sendBeacon) {
    navigator.sendBeacon(`${API_URL}/api/service/queue/leave`, JSON.stringify({ ticket }));
  }
};

// "less than a minute", "about 4 minutes", "about 2 hours"
export const formatWait = (seconds) => {
  if (!seconds || seconds < 60) return 'less than a minute';
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? '' : 's'}`;
};
