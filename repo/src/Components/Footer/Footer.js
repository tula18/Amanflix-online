import React from 'react';
import { useLocation } from 'react-router-dom';

const Footer = () => {
    const location = useLocation();
    return (
        <footer className={`${location.pathname === '/signin' || location.pathname === '/signup' || location.pathname.startsWith('/watch') || location.pathname.startsWith('/admin') ? 'footer_hide' : ''}`}>
            <p>ⓒ כל הזכויות שמורות למדור מערכות מידע פצ"ן </p>
        </footer>
    );
};

export default Footer;