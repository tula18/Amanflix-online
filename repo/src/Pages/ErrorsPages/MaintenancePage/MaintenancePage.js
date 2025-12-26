import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from '../../../config';
import './MaintenancePage.css';

const MaintenancePage = () => {
    const navigate = useNavigate();
    const [serviceStatus, setServiceStatus] = useState(null);
    const [countdown, setCountdown] = useState(30);
    const [checking, setChecking] = useState(false);
    const hasAdminToken = !!localStorage.getItem('admin_token');

    const checkServiceStatus = async () => {
        try {
            setChecking(true);
            const response = await fetch(`${API_URL}/api/service/status`);
            const data = await response.json();
            setServiceStatus(data);
            
            if (data.is_available) {
                // Service is back online, redirect to home
                navigate('/', { replace: true });
                window.location.reload();
            }
        } catch (error) {
            console.error('Error checking service status:', error);
        } finally {
            setChecking(false);
        }
    };

    // Auto-refresh countdown
    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    checkServiceStatus();
                    return 30;
                }
                return prev - 1;
            });
        }, 1000);

        // Initial check
        checkServiceStatus();

        return () => clearInterval(timer);
    }, []);

    const handleManualRefresh = () => {
        setCountdown(30);
        checkServiceStatus();
    };

    return (
        <div className="maintenance-page">
            <div className="maintenance-container">
                <div className="maintenance-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2L2 7V10C2 16.05 5.84 21.74 12 23C18.16 21.74 22 16.05 22 10V7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="12" cy="16" r="1" fill="currentColor"/>
                    </svg>
                </div>
                
                <h1 className="maintenance-title">
                    {serviceStatus?.maintenance_title || 'Service Temporarily Unavailable'}
                </h1>
                
                <p className="maintenance-message">
                    {serviceStatus?.maintenance_message || 'We are currently performing scheduled maintenance. Please check back soon!'}
                </p>
                
                {serviceStatus?.estimated_downtime && (
                    <div className="maintenance-estimate">
                        <span className="estimate-label">Estimated downtime:</span>
                        <span className="estimate-value">{serviceStatus.estimated_downtime}</span>
                    </div>
                )}
                
                <div className="maintenance-status">
                    {serviceStatus?.maintenance_mode ? (
                        <span className="status-badge maintenance">
                            <span className="status-dot"></span>
                            Maintenance Mode
                        </span>
                    ) : (
                        <span className="status-badge offline">
                            <span className="status-dot"></span>
                            Service Offline
                        </span>
                    )}
                </div>

                <div className="maintenance-actions">
                    <button 
                        className="refresh-button"
                        onClick={handleManualRefresh}
                        disabled={checking}
                    >
                        {checking ? (
                            <>
                                <span className="spinner"></span>
                                Checking...
                            </>
                        ) : (
                            <>
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M23 4V10H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M1 20V14H7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M3.51 9C4.01717 7.56678 4.87913 6.2854 6.01547 5.27542C7.15182 4.26543 8.52547 3.55976 10.0083 3.22426C11.4911 2.88875 13.0348 2.93434 14.4952 3.35677C15.9556 3.77921 17.2853 4.56471 18.36 5.64L23 10M1 14L5.64 18.36C6.71475 19.4353 8.04437 20.2208 9.50481 20.6432C10.9652 21.0657 12.5089 21.1112 13.9917 20.7757C15.4745 20.4402 16.8482 19.7346 17.9845 18.7246C19.1209 17.7146 19.9828 16.4332 20.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                Check Again
                            </>
                        )}
                    </button>
                </div>

                <div className="auto-refresh-info">
                    Auto-checking in <span className="countdown">{countdown}</span> seconds
                </div>

                <div className="maintenance-footer">
                    <p>We apologize for any inconvenience.</p>
                    {hasAdminToken && (
                        <a href="/admin" className="admin-link">Admin Access</a>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MaintenancePage;
