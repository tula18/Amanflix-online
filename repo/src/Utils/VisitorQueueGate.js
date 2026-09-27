import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import WaitingRoomPage from '../Pages/ErrorsPages/WaitingRoomPage/WaitingRoomPage';
import { checkIn, QUEUE_REQUIRED_EVENT } from './visitorQueue';

// The admin panel sends the admin token with its requests, so it needs no ticket. Elsewhere admins
// check in too: the server recognises their token and lets them in without taking a slot.
const isExempt = (pathname) => pathname.startsWith('/admin');

// Shows the site to admitted visitors and the waiting page to everyone else while the site is
// full (visitor limit, api/api/visitor_queue.py). Checks in with the server regularly: that keeps
// the visitor's slot, or their place in line, and lets them in when it's their turn.
const VisitorQueueGate = ({ children }) => {
    const location = useLocation();
    const exempt = isExempt(location.pathname);
    const [queue, setQueue] = useState(null);
    const [unavailable, setUnavailable] = useState(false);
    const timer = useRef(null);

    const check = useCallback(async () => {
        clearTimeout(timer.current);
        let nextSeconds = 20;
        try {
            const data = await checkIn();
            setQueue(data);
            setUnavailable(false);
            nextSeconds = data.next_check_seconds || nextSeconds;
        } catch (error) {
            // The queue can't be reached: let the visitor in rather than lock them out
            // (a server that is down is handled by the maintenance page)
            console.error('Visitor queue check-in failed:', error);
            setUnavailable(true);
            nextSeconds = 10;
        }
        timer.current = setTimeout(check, nextSeconds * 1000);
    }, []);

    useEffect(() => {
        if (exempt) return undefined;
        check();
        // A request was turned away (the slot was lost): check now instead of at the next interval
        window.addEventListener(QUEUE_REQUIRED_EVENT, check);
        return () => {
            clearTimeout(timer.current);
            window.removeEventListener(QUEUE_REQUIRED_EVENT, check);
        };
    }, [exempt, check]);

    // Fail open only if the queue never answered; a later blip keeps the last answer
    if (exempt || (unavailable && !queue)) {
        return children;
    }

    if (!queue) {
        // Wait for the first answer, so pages don't start loading data for a visitor who must wait
        return (
            <div className="spinner-container" style={{ display: 'flex' }}>
                <div className="spinner-border"></div>
            </div>
        );
    }

    if (queue.status === 'waiting') {
        return <WaitingRoomPage queue={queue} onCheckNow={check} />;
    }

    return children;
};

export default VisitorQueueGate;
