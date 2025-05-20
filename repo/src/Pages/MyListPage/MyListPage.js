import React, { useEffect, useState } from 'react';
import './MyListPage.css'
import { API_URL } from '../../config';
import InfiniteScroll from 'react-infinite-scroll-component';
import Card from '../../Components/Card/Card';
import MovieModal from '../../Components/Model/Model';

const MyListPage = () => {
    const [watchlistMovies, setWatchlistMovies] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isLoading, SetIsLoading] = useState(true);

    // Helper functions for watch progress and episode info
    const shouldShowNextEpisode = (item) => {
        // Don't show next episode if show is finished
        if (item.watch_history?.finished_show) return false;
        
        return (
            (item.media_type === 'tv' || item.type === 'tv_series') && 
            item.watch_history?.is_completed &&
            item.watch_history?.next_episode
        );
    };

    const getProgressPercentage = (item) => {
        if (!item.watch_history) return 0;
        
        // Don't show progress if show is finished
        if (item.watch_history.finished_show) return 0;
        
        if (shouldShowNextEpisode(item)) {
            // For next episodes, return progress if available, otherwise 0
            return item.watch_history.next_episode.progress_percentage || 0;
        }
        return item.watch_history.progress_percentage || 0;
    };

    const getEpisodeInfo = (item) => {
        if (!item.watch_history || 
            !(item.media_type === 'tv' || item.type === 'tv_series')) {
            return null;
        }
        
        // Don't show episode info if show is finished
        if (item.watch_history.finished_show) return null;
        
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

    useEffect(() => {
        const fetchWatchlistMovies = async (currentPage) => {
          try {
            SetIsLoading(true);
            const response = await fetch(`${API_URL}/api/mylist/all?page=${currentPage}&per_page=10&include_watch_history=true`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}` // Assuming you have a token stored in localStorage
              }
            });
    
            const data = await response.json();
            console.log(data);
            if (response.ok) {
                if (data.length > 0) {
                    setWatchlistMovies(prevMovies => [...prevMovies, ...data]);
                    
                    // If we received fewer items than requested per page, we've reached the end
                    if (data.length < 10) {
                        setHasMore(false);
                    }
                } else {
                    setHasMore(false);
                }
            } else {
              console.error(data.message);
            }
          } catch (error) {
            console.error('Error:', error);
          } finally {
            SetIsLoading(false);
          }
        };
    
        fetchWatchlistMovies(page);
      }, [page]);

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
         timeoutId = setTimeout(() => console.log('hello'), 1000); // 2000ms = 2s
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
    }, [showModal])

    const spinnerStyle = {
        display: isLoading ? 'flex' : 'none',
      };

    if (isLoading) {
        return (
            <div className="spinner-container" style={spinnerStyle}>
                <div className="spinner-border"></div>
            </div>
        )
    }

    return (
        <div className='MyListPage'>
            {watchlistMovies.length === 0 ? (
                <div className="empty-list-message">
                    <p className='MoviesCategory_title' style={{ textAlign: 'center' }}>
                        <b>Your watchlist is empty</b>
                    </p>
                    <p className='MoviesCategory_title' style={{ textAlign: 'center', fontSize: '16px' }}>
                        Add movies and shows to your list by clicking the + button
                    </p>
                </div>
            ) : (
                <InfiniteScroll
                    dataLength={watchlistMovies.length}
                    next={() => setPage(prevPage => prevPage + 1)}
                    hasMore={hasMore}
                    loader={
                        hasMore && (
                            <p className='MoviesCategory_title' style={{ textAlign: 'center' }}>
                                <b>Loading...</b>
                            </p>
                        )
                    }
                    endMessage={
                        watchlistMovies.length > 0 && (
                            <p className='MoviesCategory_title' style={{ textAlign: 'center' }}>
                                <b>Yay! You have seen it all</b>
                            </p>
                        )
                    }
                >
                    <div className='search-grid'>
                        {watchlistMovies.map((result, idx) => (
                            <span key={idx}>
                                <button className="button3" onClick={(event) => handleMovieClick(result, event)}>
                                    <Card movie={result} title={result.title} mediaType={result.media_type} image={result.backdrop_path} watchProgress={getProgressPercentage(result)} episodeInfo={getEpisodeInfo(result)}></Card>
                                </button>
                            </span>
                        ))}
                    </div>
                </InfiniteScroll>
            )}
            {showModal && (
                <MovieModal
                  movie={selectedMovie}
                  onClose={handleModalClose}
                  handleMovieClick={handleMovieClick}
                />
            )}
        </div>
    )
}

export default MyListPage