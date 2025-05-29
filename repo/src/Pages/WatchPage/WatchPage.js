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
    const [disableBuffer, setDisableBuffer] = useState(false);

    // State for player props
    const [mediaTitle, setMediaTitle] = useState('');
    const [mediaSubTitle, setMediaSubTitle] = useState('');
    const [mediaTitleMedia, setMediaTitleMedia] = useState('');
    const [mediaExtraInfoMedia, setMediaExtraInfoMedia] = useState('');
    const [mediaDataNext, setMediaDataNext] = useState(null);
    const [mediaReproductionList, setMediaReproductionList] = useState([]);
    const [isLoadingMediaData, setIsLoadingMediaData] = useState(true);

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

    // Fetch media details
    useEffect(() => {
        const fetchMediaData = async () => {
            if (!contentId || !contentType) return;

            setIsLoadingMediaData(true);
            const token = localStorage.getItem('token');
            if (!token) {
                ErrorHandler("token_not_found", navigate);
                setIsLoadingMediaData(false);
                return;
            }

            let contentDetailsUrl = '';
            if (contentType === 'movie') {
                contentDetailsUrl = `${API_URL}/api/movies/${contentId}`;
            } else if (contentType === 'tv') {
                contentDetailsUrl = `${API_URL}/api/shows/${contentId}`;
            }

            try {
                const response = await fetch(contentDetailsUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch media details');
                }
                const data = await response.json();
                console.log('API Response Data:', data); // DEBUGGING

                if (contentType === 'movie') {
                    setMediaTitle(data.title || 'Movie');
                    setMediaSubTitle(data.tagline || '');
                    setMediaTitleMedia(data.title || 'Movie');
                    // setMediaExtraInfoMedia(`Release Date: ${data.release_date}`);
                    // For movies, dataNext and reproductionList might be empty or based on recommendations (future enhancement)
                    setMediaDataNext(null); 
                    setMediaReproductionList([]);
                } else if (contentType === 'tv') {
                    setMediaTitle(data.title || 'TV Show');
                    console.log('TV Show Name:', data.title); // DEBUGGING
                    
                    // Find the current season and episode
                    const currentSeason = data.seasons?.find(s => s.season_number === seasonNumber);
                    const currentEpisode = currentSeason?.episodes?.find(ep => ep.episode_number === episodeNumber);
                    console.log('Current Season:', currentSeason); // DEBUGGING
                    console.log('Current Episode:', currentEpisode); // DEBUGGING

                    if (currentEpisode) {
                        setMediaSubTitle(`S${seasonNumber} E${episodeNumber}: ${currentEpisode.title}`);
                        setMediaTitleMedia(`${data.title} - S${seasonNumber} E${episodeNumber}: ${currentEpisode.title}`);
                    } else {
                        setMediaSubTitle(`Season ${seasonNumber} Episode ${episodeNumber}`);
                        setMediaTitleMedia(`${data.title} - Season ${seasonNumber} Episode ${episodeNumber}`);
                    }
                    // setMediaExtraInfoMedia(`First Aired: ${data.first_air_date}`);                    // Populate reproductionList (episodes of the current season)
                    if (currentSeason && currentSeason.episodes) {
                        const episodeList = currentSeason.episodes.map(ep => ({
                            id: `t-${contentId}-${currentSeason.season_number}-${ep.episode_number}`,
                            name: `E${ep.episode_number}: ${ep.title}`,
                            playing: ep.episode_number === episodeNumber,
                            percent: 50,
                            seasonNumber: currentSeason.season_number,
                            episodeNumber: ep.episode_number
                            // percent: calculate from watch history if available (future enhancement)
                        }));
                        setMediaReproductionList(episodeList);
                        console.log('Populated Reproduction List:', episodeList); // DEBUGGING
                    } else {
                        setMediaReproductionList([]);
                        console.log('No current season or episodes for reproduction list.'); // DEBUGGING
                    }

                    // Populate dataNext (next episode)
                    let nextEpisode;
                    if (currentSeason && currentEpisode) {
                        const currentEpisodeIndex = currentSeason.episodes.findIndex(ep => ep.episode_number === episodeNumber);
                        if (currentEpisodeIndex !== -1 && currentEpisodeIndex < currentSeason.episodes.length - 1) {
                            nextEpisode = currentSeason.episodes[currentEpisodeIndex + 1];
                            setMediaDataNext({
                                title: `Next: S${seasonNumber} E${nextEpisode.episode_number} - ${nextEpisode.title}`,
                                description: nextEpisode.overview,
                                // Add identifiers for the next episode
                                nextSeasonNumber: seasonNumber,
                                nextEpisodeNumber: nextEpisode.episode_number,
                                nextContentId: contentId
                            });
                            console.log('Next Episode Data:', { 
                                title: `Next: S${seasonNumber} E${nextEpisode.episode_number} - ${nextEpisode.title}`,
                                nextSeasonNumber: seasonNumber,
                                nextEpisodeNumber: nextEpisode.episode_number
                            }); // DEBUGGING
                        } else {
                            // Potentially look for next season or mark as end of series
                            setMediaDataNext(null); 
                            console.log('No next episode in current season.'); // DEBUGGING
                        }
                    } else {
                        setMediaDataNext(null);
                        console.log('No current season or episode to determine next episode.'); // DEBUGGING
                    }
                }
                setIsLoadingMediaData(false);
            } catch (error) {
                console.error('Failed to fetch media data:', error);
                ErrorHandler("media_load_error", navigate);
                setIsLoadingMediaData(false);
            }
        };

        fetchMediaData();
    }, [contentId, contentType, seasonNumber, episodeNumber, navigate]);


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
    };    // Handle video progress and time updates with throttling
    const lastProgressUpdate = useRef(0);
    const handleProgress = () => {
        if (videoRef.current) {
            const newTime = videoRef.current.currentTime;
            const now = Date.now();
            
            // Throttle progress updates to reduce state changes and re-renders
            if (now - lastProgressUpdate.current > 1000) { // Update max 1 time per second for better performance
                lastProgressUpdate.current = now;
                setCurrentTime(newTime);
                setProgress((newTime / videoRef.current.duration) * 100);
            }
            
            // Save progress if we've moved at least 10 seconds since last save
            if (Math.abs(newTime - lastSavedTime) > 10) {
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
        }, 10000); // Save every 30 seconds
        
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
    };    const handleNextEpisode = () => {
        if (mediaDataNext && mediaDataNext.nextContentId && mediaDataNext.nextSeasonNumber && mediaDataNext.nextEpisodeNumber) {
            const { nextContentId, nextSeasonNumber, nextEpisodeNumber } = mediaDataNext;
            const nextWatchId = `t-${nextContentId}-${nextSeasonNumber}-${nextEpisodeNumber}`;
            console.log(`Navigating to next episode: /watch/${nextWatchId}`); // DEBUGGING
            navigate(`/watch/${nextWatchId}`, { replace: true });
        } else {
            console.log("No next episode data available to navigate."); // DEBUGGING
        }
    };

    const handleEpisodeClick = (episodeId, isCurrentEpisode) => {
        // Don't navigate if it's the current episode
        if (isCurrentEpisode) {
            console.log('Already watching this episode');
            return;
        }
        
        // Save current progress before navigating
        if (videoRef.current && videoRef.current.currentTime > 0) {
            saveWatchHistory();
        }
        
        // Navigate to the selected episode
        console.log(`Navigating to episode: /watch/${episodeId}`);
        navigate(`/watch/${episodeId}`, { replace: true });
    };

    if (isLoadingMediaData && !useOldPlayer) {
        return <div className="watchPageLoading">Loading player data...</div>; // Or a proper loading spinner
    }

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
            ) : (                <ReactNetflixPlayer 
                    src={`${API_URL}/api/stream/${watch_id}`}
                    onErrorVideo={handleError}
                    onTimeUpdate={handleProgress}
                    onLoadedMetadata={handleMetadataLoaded}
                    autoPlay
                    backButton={() => navigate(-1)}
                    disablePreview={disablePreview}
                    disableBufferPreview={disableBuffer}
                    primaryColor='#e50914'
                    title={mediaTitle}
                    subTitle={mediaSubTitle}
                    titleMedia={mediaTitleMedia}
                    extraInfoMedia={mediaExtraInfoMedia}
                    dataNext={mediaDataNext}
                    reproductionList={mediaReproductionList}
                    onClickItemListReproduction={handleEpisodeClick}
                    videoRef={videoRef}
                    onNextClick={mediaDataNext ? handleNextEpisode : undefined} // Pass the handler
                />
            )}
            
        </div>
    );
};

export default WatchPage;