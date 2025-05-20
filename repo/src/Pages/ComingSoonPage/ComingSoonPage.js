import React, { useState, useEffect  } from "react";
import { API_URL } from "../../config";
import Confetti from 'react-confetti';
import './ComingSoonPage.css'


const ComingSoonPage = () => {
    const [days, setDays] = useState(0);
    const [hours, setHours] = useState(0);
    const [minutes, setMinutes] = useState(0);
    const [seconds, setSeconds] = useState(0);

    const [showConfetti, setShowConfetti] = useState(false);


    const targetDate = new Date('2025-04-10T13:29:00').getTime(); // Set your target date here

    useEffect(() => {
        const interval = setInterval(() => {
          const now = new Date().getTime();
          const distance = targetDate - now;
    
          if (distance <= 0) {
            clearInterval(interval);
            setShowConfetti(true);
            setDays(0);
            setHours(0);
            setMinutes(0);
            setSeconds(0);
          } else {
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
    
            setDays(days);
            setHours(hours);
            setMinutes(minutes);
            setSeconds(seconds);
          }
        }, 100);
    
        return () => clearInterval(interval);
      }, [targetDate]);

    return (
        <div className='login' style={{backgroundImage: `url('${API_URL}/cdn/images/login_background.jpg')`}}>
          {showConfetti && <Confetti width={window.innerWidth} height={window.innerHeight} />}
          <div className='login__cover'>
            <div className='login__container'>
                <span className='navbar__logo' style={{marginTop: 10, fontSize: 30}}>AMANFLIX</span>
                <h1>Coming Soon</h1>
                <p>We're getting ready to launch something amazing!</p>
                <div className="countdown">
                <div className="countdown-item">
                    <span className="countdown-number">{days}</span>
                    <span className="countdown-label">Days</span>
                </div>
                <div className="countdown-item">
                    <span className="countdown-number">{hours}</span>
                    <span className="countdown-label">Hours</span>
                </div>
                <div className="countdown-item">
                    <span className="countdown-number">{minutes}</span>
                    <span className="countdown-label">Minutes</span>
                </div>
                <div className="countdown-item">
                    <span className="countdown-number">{seconds}</span>
                    <span className="countdown-label">Seconds</span>
                </div>
                
            </div>
            <div className='comingPage__footer'>
                <p>Stay tuned for more updates!</p>
                <p>לעזרה פנו למדור מערכות מידע</p>
            </div>
            </div>
          </div>
        </div>
      );
}

export default ComingSoonPage;