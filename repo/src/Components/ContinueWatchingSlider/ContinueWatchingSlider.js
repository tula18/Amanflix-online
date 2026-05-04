import React, { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../../config';
import './ContinueWatchingSlider.css';
import SliderRow from '../Slider/SliderRow';
import Card from '../Card/Card';
import MovieModal from '../Model/Model';
import HoverCard from '../HoverCard/HoverCard';

const ContinueWatchingSlider = () => {
    const [continueWatching, setContinueWatching] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal state
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [modalOriginRect, setModalOriginRect] = useState(null);

    // Hover card state
    const [hoveredMovie, setHoveredMovie]       = useState(null);
    const [hoverAnchorRect, setHoverAnchorRect] = useState(null);
    const [hoverCardClosing, setHoverCardClosing] = useState(false);
    const hoverShowTimerRef  = useRef(null);
    const hoverHideTimerRef  = useRef(null);
    const isSliderDraggingRef = useRef(false);
    const hoveredMovieRef     = useRef(null);
    const sliderIdRef         = useRef(`s-${Math.random().toString(36).slice(2)}`);
    const moviesRef           = useRef([]);
    const lastMousePos        = useRef({ x: 0, y: 0 });

    useEffect(() => { moviesRef.current = continueWatching; }, [continueWatching]);
    useEffect(() => {
        const track = (e) => { lastMousePos.current = { x: e.clientX, y: e.clientY }; };
        window.addEventListener('mousemove', track, { passive: true });
        return () => window.removeEventListener('mousemove', track);
    }, []);

    // Modal closing animation state
    const [modalClosing, setModalClosing] = useState(false);

    const handleCardMouseEnter = (movie, e) => {
        if (isSliderDraggingRef.current) return;
        clearTimeout(hoverHideTimerRef.current);
        clearTimeout(hoverShowTimerRef.current);
        const rect = e.currentTarget.getBoundingClientRect();

        if (hoveredMovieRef.current) {
            setHoverCardClosing(true);
        } else {
            setHoverCardClosing(false);
        }

        hoverShowTimerRef.current = setTimeout(() => {
            if (!isSliderDraggingRef.current) {
                setHoverAnchorRect(rect);
                hoveredMovieRef.current = movie;
                setHoveredMovie(movie);
            }
        }, 400);
    };

    const handleCardMouseLeave = () => {
        if (isSliderDraggingRef.current) return;
        clearTimeout(hoverShowTimerRef.current);
        hoverHideTimerRef.current = setTimeout(() => {
            setHoverCardClosing(true);
        }, 200);
    };

    const handleHoverClose = () => {
        clearTimeout(hoverHideTimerRef.current);
        setHoverCardClosing(true);
    };

    const handleDragStateChange = useCallback((dragging) => {
        if (dragging) {
            isSliderDraggingRef.current = true;
            clearTimeout(hoverShowTimerRef.current);
            clearTimeout(hoverHideTimerRef.current);
            if (hoveredMovieRef.current) {
                hoveredMovieRef.current = null;
                setHoveredMovie(null);
                setHoverAnchorRect(null);
                setHoverCardClosing(false);
            }
        } else {
            // Keep drag guard active for the full 400ms so that mouseleave
            // events from the 350ms snap animation can't cancel the timer.
            hoverShowTimerRef.current = setTimeout(() => {
                isSliderDraggingRef.current = false;
                const { x, y } = lastMousePos.current;
                const el = document.elementFromPoint(x, y);
                const sid = sliderIdRef.current;
                const wrapper = el?.closest(`[data-slider-id="${sid}"]`);
                if (wrapper) {
                    const idx = parseInt(wrapper.dataset.sliderIdx, 10);
                    const movie = moviesRef.current[idx];
                    if (movie) {
                        const rect = wrapper.getBoundingClientRect();
                        setHoverAnchorRect(rect);
                        hoveredMovieRef.current = movie;
                        setHoveredMovie(movie);
                    }
                }
            }, 400);
        }
    }, []); // stable

    const handleHoverExitComplete = () => {
        hoveredMovieRef.current = null;
        setHoveredMovie(null);
        setHoverAnchorRect(null);
        setHoverCardClosing(false);
    };

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

    const getRectSnapshot = (rect) => {
        if (!rect) return null;
        return {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
        };
    };

    const handleMovieClick = (movie, event, sourceRect = null) => {
        event.stopPropagation();
        const clickedRect = sourceRect || event.currentTarget?.getBoundingClientRect();
        clearTimeout(hoverShowTimerRef.current);
        clearTimeout(hoverHideTimerRef.current);
        hoveredMovieRef.current = null;
        setHoveredMovie(null);
        setHoverAnchorRect(null);
        setHoverCardClosing(false);
        setModalClosing(false);
        setModalOriginRect(getRectSnapshot(clickedRect));
        setSelectedMovie(movie);
        setShowModal(true);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    };

    const handleModalClose = () => {
        setModalClosing(true);
    };

    const handleModalClosed = () => {
        setModalClosing(false);
        setShowModal(false);
        setSelectedMovie(null);
        setModalOriginRect(null);
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
        return <SliderRow title="Continue Watching" isLoading skeletonCount={6} />;
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
    };

    // Hide the entire slider if there are no titles to show
    if (!isLoading && !error && continueWatching.length === 0) {
        return null;
    }

    return (
        <>
            <SliderRow title="Continue Watching" onDragStateChange={handleDragStateChange}>
                {continueWatching.map((item, index) => {
                    const progressPercentage = getProgressPercentage(item);
                    const episodeInfo = getEpisodeInfo(item);

                    return (
                        <div
                            key={index}
                            className="slider-item-wrapper"
                            data-slider-id={sliderIdRef.current}
                            data-slider-idx={index}
                            onMouseEnter={(e) => handleCardMouseEnter(item, e)}
                            onMouseLeave={handleCardMouseLeave}
                        >
                            <button className="slider-btn" onClick={(event) => handleMovieClick(item, event)}>
                                <Card
                                    movie={item}
                                    title={item.title || item.name}
                                    mediaType={item.media_type || item.content_type}
                                    image={item.backdrop_path}
                                    watchProgress={progressPercentage}
                                    episodeInfo={episodeInfo}
                                />
                                {progressPercentage > 0 && (
                                    <div className="netflix-progress-container">
                                        <div
                                            className="netflix-progress-bar"
                                            style={{ width: `${progressPercentage}%` }}
                                        />
                                    </div>
                                )}
                            </button>
                        </div>
                    );
                })}
            </SliderRow>

            {showModal && (
                <MovieModal
                    movie={selectedMovie}
                    onClose={handleModalClose}
                    onClosed={handleModalClosed}
                    closing={modalClosing}
                    originRect={modalOriginRect}
                    handleMovieClick={handleMovieClick}
                />
            )}

            {hoveredMovie && hoverAnchorRect && !showModal && (
                <HoverCard
                    movie={hoveredMovie}
                    anchorRect={hoverAnchorRect}
                    closing={hoverCardClosing}
                    onClose={handleHoverClose}
                    onExitComplete={handleHoverExitComplete}
                    onInfoClick={handleMovieClick}
                    onPopupEnter={() => clearTimeout(hoverHideTimerRef.current)}
                />
            )}
        </>
    );
};

export default ContinueWatchingSlider;
