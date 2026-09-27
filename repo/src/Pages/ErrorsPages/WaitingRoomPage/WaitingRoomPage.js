import React, { useEffect, useState } from 'react';
import { formatWait, leaveQueue } from '../../../Utils/visitorQueue';
import './WaitingRoomPage.css';

// Shown instead of the site while it is full (see Utils/VisitorQueueGate.js).
// `queue` is the server's latest answer: {position, ahead, queue_length, eta_seconds, next_check_seconds, reason}
const WaitingRoomPage = ({ queue, onCheckNow }) => {
    const [secondsToCheck, setSecondsToCheck] = useState(queue.next_check_seconds || 5);
    const hasAdminToken = !!localStorage.getItem('admin_token');

    // Count down to the next automatic check (the gate does the checking)
    useEffect(() => {
        setSecondsToCheck(queue.next_check_seconds || 5);
        const timer = setInterval(() => setSecondsToCheck((s) => Math.max(s - 1, 0)), 1000);
        return () => clearInterval(timer);
    }, [queue]);

    // Closing the tab gives the place to the next person (a refresh keeps it, see leaveQueue)
    useEffect(() => {
        window.addEventListener('pagehide', leaveQueue);
        return () => window.removeEventListener('pagehide', leaveQueue);
    }, []);

    const ahead = queue.ahead ?? Math.max((queue.position || 1) - 1, 0);

    return (
        <div className="waiting-room-page">
            <div className="waiting-room-container">
                <div className="waiting-room-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
                        <path d="M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89318 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>

                <h1 className="waiting-room-title">Amanflix is full right now</h1>

                <p className="waiting-room-message">
                    {queue.reason === 'idle'
                        ? 'You were away for a while, so your spot went to someone who was waiting. You are back in line.'
                        : 'Too many people are watching at the moment. You are in line and will get in automatically.'}
                </p>

                <div className="waiting-room-position">
                    <span className="waiting-room-position-label">Your place in line</span>
                    <span className="waiting-room-position-number">#{queue.position}</span>
                    <span className="waiting-room-position-ahead">
                        {ahead === 0 ? 'You are next' : `${ahead} ${ahead === 1 ? 'person' : 'people'} ahead of you`}
                    </span>
                </div>

                <div className="waiting-room-estimate">
                    <span className="waiting-room-estimate-label">Estimated wait:</span>
                    <span className="waiting-room-estimate-value">{formatWait(queue.eta_seconds)}</span>
                </div>

                <p className="waiting-room-note">
                    Keep this page open: it lets you in as soon as a spot frees up.
                </p>

                <div className="waiting-room-refresh">
                    Checking again in <span className="waiting-room-countdown">{secondsToCheck}</span> seconds
                    <button className="waiting-room-check-now" onClick={onCheckNow}>Check now</button>
                </div>

                {hasAdminToken && (
                    <div className="waiting-room-footer">
                        <a href="/admin" className="waiting-room-admin-link">Admin Access</a>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WaitingRoomPage;
