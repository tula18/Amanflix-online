import React, { useState, useRef, useEffect } from 'react';
import './WatchPage.css';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { API_URL } from '../../config';
import ErrorHandler from '../../Utils/ErrorHandler';
import ReactNetflixPlayer from '../../Components/NetflixPlayer/index.tsx';

const WatchPage = () => {
    const { watch_id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const videoRef = useRef(null);
    const initialSeekPerformed = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(1);
    
    // Content tracking state
    const [contentType, setContentType] = useState(null);
    const [contentId, setContentId] = useState(null);
    const [seasonNumber, setSeasonNumber] = useState(null);
    const [episodeNumber, setEpisodeNumber] = useState(null);
    const [totalDuration, setTotalDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [lastSavedTime, setLastSavedTime] = useState(0);
    const [startTimeFromParams, setStartTimeFromParams] = useState(null);
    const [useOldPlayer, setUseOldPlayer] = useState(false)
    const [disablePreview, setDisablePreview] = useState(true);

    // Parse the watch ID and URL parameters once
    useEffect(() => {
        if (!watch_id) return;
        
        // Parse watch ID format
        const parts = watch_id.split('-');
        
        if (parts[0] === 'm' && parts.length >= 2) {
            setContentType('movie');
            setContentId(parseInt(parts[1]));
        } else if (parts[0] === 't' && parts.length >= 4) {
            setContentType('tv');
            setContentId(parseInt(parts[1]));
            setSeasonNumber(parseInt(parts[2]));
            setEpisodeNumber(parseInt(parts[3]));
        } else {
            ErrorHandler("invalid_id_format", navigate);
        }
        
        // Get timestamp from URL parameters
        const queryParams = new URLSearchParams(location.search);
        const timestampParam = queryParams.get('timestamp');
        
        if (timestampParam) {
            const timestamp = parseFloat(timestampParam);
            if (!isNaN(timestamp) && timestamp >= 0) {
                setStartTimeFromParams(timestamp);
                initialSeekPerformed.current = false; // Reset flag when timestamp changes
            }
        } else {
            setStartTimeFromParams(null);
            initialSeekPerformed.current = false;
        }
    }, [watch_id, navigate, location.search]);

    // Handle initial video loading
    useEffect(() => {
        if (!startTimeFromParams) {
            loadWatchHistory();
        }
    }, [startTimeFromParams]);

    // Handle metadata loaded - this is when video is ready to seek
    const handleMetadataLoaded = () => {
        if (!videoRef.current) return;
        
        setTotalDuration(videoRef.current.duration);
        
        // Set initial playback position only once when metadata is loaded
        if (!initialSeekPerformed.current) {
            if (startTimeFromParams !== null) {
                console.log(`Setting video time to ${startTimeFromParams} seconds from URL parameter`);
                videoRef.current.currentTime = startTimeFromParams;
                setCurrentTime(startTimeFromParams);
                initialSeekPerformed.current = true;
            } else if (!startTimeFromParams) {
                // If no URL timestamp parameter, load from watch history instead
                loadWatchHistory();
            }
        }
    };

    const loadWatchHistory = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${API_URL}/api/watch-history/get-by-id/${watch_id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.watch_timestamp && videoRef.current && !initialSeekPerformed.current) {
                    // Only set this if we haven't already performed the initial seek
                    // and if the video element is ready
                    if (videoRef.current.readyState >= 1) {
                        videoRef.current.currentTime = data.watch_timestamp;
                        setCurrentTime(data.watch_timestamp);
                        initialSeekPerformed.current = true;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load watch history:', error);
        }
    };

    // Enhance saveWatchHistory to be more robust
    const saveWatchHistory = async () => {
        if (!videoRef.current || !totalDuration || !contentType || !contentId) return;
        
        try {
            const token = localStorage.getItem('token');
            if (!token) return;
            
            const currentTime = videoRef.current.currentTime;
            // Don't save if we're at the beginning (avoid saving abandoned views)
            if (currentTime < 10) return;
            
            const payload = {
                content_type: contentType,
                content_id: contentId,
                watch_timestamp: currentTime,
                total_duration: totalDuration
            };
            
            if (contentType === 'tv') {
                payload.season_number = seasonNumber;
                payload.episode_number = episodeNumber;
            }
            
            const response = await fetch(`${API_URL}/api/watch-history/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                setLastSavedTime(currentTime);
            }
        } catch (error) {
            console.error('Failed to save watch history:', error);
        }
    };

    // Handle video progress and time updates
    const handleProgress = () => {
        if (videoRef.current) {
            const newTime = videoRef.current.currentTime;
            setCurrentTime(newTime);
            setProgress((newTime / videoRef.current.duration) * 100);
            
            // Save progress if we've moved at least 5 seconds since last save
            if (Math.abs(newTime - lastSavedTime) > 5) {
                saveWatchHistory();
            }
        }
    };

    // Auto-save interval
    useEffect(() => {
        const saveInterval = setInterval(() => {
            if (videoRef.current && videoRef.current.currentTime > 0) {
                saveWatchHistory();
            }
        }, 30000); // Save every 30 seconds
        
        return () => {
            clearInterval(saveInterval);
            // Final save when component unmounts
            if (videoRef.current && videoRef.current.currentTime > 0) {
                saveWatchHistory();
            }
        };
    }, [contentId, contentType, seasonNumber, episodeNumber, totalDuration]);

    // Handle errors
    const handleError = (event) => {
        ErrorHandler("video_error", navigate);
        console.error("Video playback error");
    };

    return (
        <div className={`watchPageContainer ${useOldPlayer ? 'use-old-player' : ''}`}>
            {useOldPlayer ? (
                <video
                    ref={videoRef}
                    src={`${API_URL}/api/stream/${watch_id}`}
                    controls={true}
                    onError={handleError}
                    onTimeUpdate={handleProgress}
                    onLoadedMetadata={handleMetadataLoaded}
                    autoPlay
                    width="100%"
                    height="100%"
                />
            ) : (
                <ReactNetflixPlayer 
                    src={`${API_URL}/api/stream/${watch_id}`}
                    onErrorVideo={handleError}
                    onTimeUpdate={handleProgress}
                    autoPlay
                    backButton={() => navigate(-1)}
                    disablePreview={disablePreview}
                    primaryColor='#e50914'
                    title="Title"
                    subTitle="SubTitlt"
                />
            )}
            
        </div>
    );
};

export default WatchPage;