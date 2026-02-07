import React, { useEffect, useState } from 'react';
import './App.css';
import Navbar from './Components/Navbar/Navbar';
import HomePage from './Pages/HomePage/HomePage'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Login from './Pages/LoginPage/Login';
import TvShowsPage from './Pages/TvShowsPage/TvShows';
import Watch from './Pages/WatchPage/WatchPage';
import MoviesPage from './Pages/MoviesPage/Movies';
import Footer from './Components/Footer/Footer';
import SearchPage from './Pages/SearchPage/SearchPage';
import withSplashScreen from './Components/SplashScreen/withSplashScreen';

import PrivateRoute from './Utils/PrivateRoute';
import Signup from './Pages/SignupPage/SignupPage';
import NotFoundPage from './Pages/ErrorsPages/NotFoundPage/NotFoundPage';
import AdminPage from './Pages/AdminPanel/AdminPage';
import ProfilePage from './Pages/ProfilePage/ProfilePage';
import ServiceDownPage from './Pages/ErrorsPages/ServiceDownPage/ServiceDownPage';
import { Alert } from 'antd';
import MyListPage from './Pages/MyListPage/MyListPage';
import HelpPage from './Pages/HelpPage/HelpPage';
import MoviesCategoryPage from './Pages/MovieCategoryPage/MovieCategoryPage';
import ShowCategoryPage from './Pages/ShowCategoryPage/ShowCategoryPage';
import NewTitlesPage from './Pages/NewTitlesPage/NewTitlesPage';
import ScrollToTop from './Utils/ScrolltoTop';
import { API_URL } from './config';
import ComingSoonPage from './Pages/ComingSoonPage/ComingSoonPage';
import MaintenancePage from './Pages/ErrorsPages/MaintenancePage/MaintenancePage';

function App() {
  const [clientIp, setClientIp] = useState('');
  const [showComingSoon, setShowComingSoon] = useState(false)
  const [serviceStatus, setServiceStatus] = useState({ is_available: true, checked: false });

  const AllowedIPS = [
    '221.51.39.33'
  ]

  // Check service status on app load
  useEffect(() => {
    const checkServiceStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/service/status`);
        if (response.ok) {
          const data = await response.json();
          setServiceStatus({ ...data, checked: true });
        } else {
          // If we can't check status, assume service is available
          setServiceStatus({ is_available: true, checked: true });
        }
      } catch (error) {
        console.error('Error checking service status:', error);
        // If we can't reach the server at all, we'll show maintenance
        setServiceStatus({ is_available: false, checked: true, maintenance_mode: true });
      }
    };

    checkServiceStatus();
  }, []);

  useEffect(() => {
    const getIP = async () => {
      try {
        const response = await fetch(`${API_URL}/ip`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const json = await response.json();
        console.log(json);
        setClientIp(json.ip)
      } catch (error) {
        console.log('There was an error fetching data:', error);
      }
    }
    
    getIP()
  }, [clientIp]);

  useEffect(() => {
    
    let timeoutId;
    const body = document.body;
    const handleScroll = () => {
      body.classList.remove('hide-scroll');
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => body.classList.add('hide-scroll'), 1000); // 2000ms = 2s
    };

    window.addEventListener('scroll', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    // Initialize analytics session
    const initAnalytics = async () => {
      try {
        console.log("---- ANALYTICS SESSION INITIALIZATION ----");
        // Check if we already have a session ID in localStorage
        let sessionId = localStorage.getItem('analytics_session_id');
        console.log("Existing session ID:", sessionId);
        
        if (!sessionId) {
          console.log("No existing session, creating new one...");
          // Create a new session
          const response = await fetch(`${API_URL}/api/analytics/sessions`, {
            method: 'POST',
            headers: {
              'Authorization': localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '',
              'Content-Type': 'application/json'
            }
          });
          
          console.log("Session creation response status:", response.status);
          
          if (response.ok) {
            const data = await response.json();
            console.log("New session created:", data);
            sessionId = data.session_id;
            localStorage.setItem('analytics_session_id', sessionId);
          } else {
            console.error("Failed to create session:", await response.text());
          }
        }
        
        // Set up session heartbeat
        const heartbeatInterval = setInterval(async () => {
          // Send heartbeat to keep session alive
          if (sessionId) {
            await fetch(`${API_URL}/api/analytics/heartbeat`, {
              method: 'POST',
              headers: {
                'X-Session-ID': sessionId,
                'Authorization': localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ session_id: sessionId })
            });
          }
        }, 300000); // Every minute
        
        // Set up event handler to end session when user leaves
        const handleBeforeUnload = async () => {
          if (sessionId) {
            // Use sendBeacon for more reliable delivery during page unload
            navigator.sendBeacon(
              `${API_URL}/api/analytics/end-session`,
              JSON.stringify({ session_id: sessionId })
            );
          }
        };
        
        window.addEventListener('beforeunload', handleBeforeUnload);
        
        // Clean up
        return () => {
          clearInterval(heartbeatInterval);
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      } catch (error) {
        console.error('Error initializing analytics:', error);
      }
    };
    
    initAnalytics();
  }, []);
  
  // Setup request interceptors to include session ID
  useEffect(() => {
    // Add analytics session ID to all fetch requests
    const originalFetch = window.fetch;
    window.fetch = function() {
      const sessionId = localStorage.getItem('analytics_session_id');
      
      // Debug log the session ID for all API requests
      if (arguments[0] && arguments[0].includes('/api/')) {
        console.log(`[Request] ${arguments[0]} - Using session ID:`, sessionId);
      }
      
      if (sessionId && arguments[1] && typeof arguments[1] === 'object') {
        if (!arguments[1].headers) {
          arguments[1].headers = {};
        }
        
        // Convert headers to regular object if it's a Headers instance
        if (arguments[1].headers instanceof Headers) {
          const headersObj = {};
          for (let pair of arguments[1].headers.entries()) {
            headersObj[pair[0]] = pair[1];
          }
          arguments[1].headers = headersObj;
        }
        
        arguments[1].headers['X-Session-ID'] = sessionId;
        
        // Add debug log
        if (arguments[0] && arguments[0].includes('/api/')) {
          console.log(`[Headers] Added X-Session-ID for ${arguments[0]}:`, sessionId);
        }
      }
      
      return originalFetch.apply(this, arguments);
    };
    
    // Cleanup function to restore original fetch
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  if (!AllowedIPS.includes(clientIp) && showComingSoon) {
    return (
      <ComingSoonPage/>
    )
  }

  // Show maintenance page if service is unavailable (but allow admin panel access)
  // We need to check if the current path is an admin route
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  
  if (serviceStatus.checked && !serviceStatus.is_available && !isAdminRoute) {
    return (
      <Router>
        <MaintenancePage />
      </Router>
    );
  }

  return (
    <div className="App">
      <Router>
        <ScrollToTop/>
        <Navbar/> 
        <Routes>
          <Route path='/' element={<PrivateRoute><HomePage /></PrivateRoute>}/>
          <Route path='/:contentId' element={<PrivateRoute><HomePage /></PrivateRoute>}/>
          <Route path='/signin' element={<Login />}/>
          <Route path='/signup' element={<Signup />}/>
          <Route path='/shows' element={<PrivateRoute><TvShowsPage /></PrivateRoute>}/>
          <Route path='/shows/:categoryId' element={<PrivateRoute><ShowCategoryPage /></PrivateRoute>}/>
          <Route path='/movies' element={<PrivateRoute><MoviesPage /></PrivateRoute>}/>
          <Route path='/movies/:categoryId' element={<PrivateRoute><MoviesCategoryPage /></PrivateRoute>}/>
          <Route path='/new-titles' element={<PrivateRoute><NewTitlesPage /></PrivateRoute>}/>
          <Route path="/watch/:watch_id" element={<PrivateRoute><Watch/></PrivateRoute>} />
          <Route path='/search' element={<PrivateRoute><SearchPage/></PrivateRoute>} />
          <Route path='/profile' element={<PrivateRoute><ProfilePage/></PrivateRoute>} />
          <Route path='/admin/*' element={<AdminPage/>} />
          <Route path='/error' element={<ServiceDownPage/>} />
          <Route path='/maintenance' element={<MaintenancePage/>} />
          <Route path='/list' element={<MyListPage/>} />
          <Route path='/help' element={<HelpPage/>} />
          <Route path='*' element={<NotFoundPage/>} />
        </Routes>
        <Footer/>
      </Router>
    </div>
  );
}

// export default App;
export default withSplashScreen(App);