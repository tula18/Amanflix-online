import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Carousel from 'react-elastic-carousel';
import { API_URL } from '../../config';
import './ContinueWatchingSlider.css';
import Card from '../Card/Card';
import LoadingCard from '../Card/LoadingCard';
import MovieModal from '../Model/Model';

const ContinueWatchingSlider = () => {
    const [continueWatching, setContinueWatching] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    
    // Add these state variables for the modal
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Breakpoints for responsive design (matching other sliders)
    const breakPoints = [
        { width: 1, itemsToShow: 1 },
        { width: 500, itemsToShow: 2 },
        { width: 768, itemsToShow: 3 },
        { width: 1200, itemsToShow: 4 },
        { width: 1350, itemsToShow: 4.5 },
        { width: 1750, itemsToShow: 6 },
    ];

    useEffect(() => {
        const fetchContinueWatching = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                const token = localStorage.getItem('token');
                if (!token) {
                    console.log("No authentication token found");
                    setIsLoading(false);
                    return;
                }

                console.log("Fetching continue watching data...");
                const response = await fetch(`${API_URL}/api/watch-history/continue-watching?per_page=20`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!response.ok) {
                    console.error("API Error:", response.status, response.statusText);
                    setError(`API error: ${response.status}`);
                    setIsLoading(false);
                    return;
                }
                
                const data = await response.json();
                console.log("Watch history data received:", data);
                
                if (!data || data.length === 0) {
                    console.log("No continue watching data available");
                    setIsLoading(false);
                    return;
                }
                
                // Group TV shows to show only one entry per show
                const groupedData = [];
                const tvShowMap = new Map(); // Use Map to track TV shows by ID
                
                data.forEach(item => {
                    // Normalize content type
                    const contentType = item.media_type || item.content_type;
                    
                    if (!contentType) {
                        console.warn("Item missing media_type/content_type:", item);
                        return;
                    }
                    
                    // Store the content type in a consistent field for later use
                    item.content_type = contentType;
                    
                    // Normalize ID - could be id, show_id, or movie_id depending on API
                    const itemId = item.id || item.show_id || item.movie_id;
                    
                    if (!itemId) {
                        console.warn("Item missing ID:", item);
                        return;
                    }
                    
                    // Store the ID in a consistent field for later use
                    item.id = itemId;
                    
                    if (contentType === 'movie') {
                        // Movies are added directly
                        groupedData.push(item);
                    } else if (contentType === 'tv') {
                        // Check if watch_history exists
                        if (!item.watch_history || !item.watch_history.last_watched) {
                            console.warn("Item missing watch_history:", item);
                            return;
                        }
                        
                        // Compare dates and keep the most recent episode for each show
                        if (!tvShowMap.has(itemId) || 
                            new Date(item.watch_history.last_watched) > 
                            new Date(tvShowMap.get(itemId).watch_history.last_watched)) {
                            tvShowMap.set(itemId, item);
                        }
                    }
                });
                
                // Add all TV shows from the map to our result
                tvShowMap.forEach(show => {
                    groupedData.push(show);
                });
                
                // Sort by last watched time (most recent first)
                groupedData.sort((a, b) => 
                    new Date(b.watch_history.last_watched) - new Date(a.watch_history.last_watched)
                );
                
                console.log("Processed continue watching data:", groupedData);
                setContinueWatching(groupedData);
            } catch (error) {
                console.error('Error fetching continue watching data:', error);
                setError("Failed to load continue watching: " + (error.response?.data?.message || error.message));
            } finally {
                setIsLoading(false);
            }
        };

        fetchContinueWatching(); 
    }, []);

    const handleMovieClick = (movie, event) => {
        event.stopPropagation();
        setSelectedMovie(movie);
        setShowModal(true);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    };

    const handleModalClose = () => {
        let timeoutId;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => console.log('hello'), 1000);
        setSelectedMovie(null);
        setShowModal(false);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.remove('navbar_hide');
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showModal && (event.target.classList.contains('modal') || (event.key === 'Escape'))) {
                handleModalClose();
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleClickOutside);
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleClickOutside);
        };
    }, [showModal]);

    useEffect(() => {
        if (showModal) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
    }, [showModal]);

    if (isLoading) {
        return (
          <div className="slider continue-watching-slider-wrapper">
            <div className="loading-slider-title"></div>
            <Carousel disableWindowSizeListener itemsToShow={5} className="my-carousel" breakPoints={breakPoints}>
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i}>
                    <LoadingCard key={i} />
                  </span>
                ))}
            </Carousel>
          </div>
        );
    }

    // Helper function to determine if we should show next episode info
    const shouldShowNextEpisode = (item) => {
        return (
            (item.media_type === 'tv' || item.content_type === 'tv') && 
            item.watch_history.is_completed &&
            item.watch_history.next_episode
        );
    };

    // Helper to get progress percentage (from current or next episode)
    const getProgressPercentage = (item) => {
        if (shouldShowNextEpisode(item)) {
            // For next episodes, always return 0 progress (not started yet)
            return 0;
        }
        return item.watch_history.progress_percentage;
    };

    // Helper to get season and episode numbers
    const getEpisodeInfo = (item) => {
        if (shouldShowNextEpisode(item)) {
            return {
                season: item.watch_history.next_episode.season_number,
                episode: item.watch_history.next_episode.episode_number,
                isNext: true
            };
        }
        return {
            season: item.watch_history.season_number,
            episode: item.watch_history.episode_number,
            isNext: false
        };
    };    // Hide the entire slider if there are no titles to show
    if (!isLoading && !error && continueWatching.length === 0) {
        return null;
    }

    return (
        <div className="slider continue-watching-slider-wrapper">
            <h2 className="slider-title">Continue Watching</h2>
            
            {error && <div className="continue-watching-error">{error}</div>}
            
            {!isLoading && !error && continueWatching.length === 0 && (
                <div className="continue-watching-empty">
                    <p>Your continue watching list is empty</p>
                    <p className="empty-suggestion">Start watching movies and shows to see them here</p>
                </div>
            )}
            
            {!isLoading && !error && continueWatching.length > 0 && (
                <Carousel 
                    disableWindowSizeListener 
                    itemsToShow={5} 
                    className="my-carousel continue-watching-carousel" 
                    breakPoints={breakPoints}
                    showEmptySlots
                >
                    {continueWatching.map((item, index) => {
                        const progressPercentage = getProgressPercentage(item);
                        const episodeInfo = getEpisodeInfo(item);
                        
                        return (
                            <div key={index} className="continue-item-wrapper">
                                <button className="button3" onClick={(event) => handleMovieClick(item, event)}>
                                    <Card 
                                        movie={item} 
                                        title={item.title || item.name}
                                        mediaType={item.media_type || item.content_type}
                                        image={item.backdrop_path}
                                        watchProgress={progressPercentage}
                                    />
                                    <div className="netflix-progress-container">
                                        <div 
                                            className="netflix-progress-bar" 
                                            style={{ width: `${progressPercentage}%` }}
                                        ></div>
                                    </div>
                                    {(item.media_type === 'tv' || item.content_type === 'tv') && (
                                        <div className={`netflix-episode-badge ${episodeInfo.isNext ? 'next-episode' : ''}`}>
                                            <span>
                                                {episodeInfo.isNext ? 'Next: ' : ''}
                                                S{episodeInfo.season} E{episodeInfo.episode}
                                            </span>
                                        </div>
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </Carousel>
            )}
            
            {showModal && (
                <MovieModal
                    movie={selectedMovie}
                    onClose={handleModalClose}
                    handleMovieClick={handleMovieClick}
                />
            )}
        </div>
    );
};

export default ContinueWatchingSlider;