import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import InfiniteScroll from 'react-infinite-scroll-component';
import Card from '../../Components/Card/Card';
import { API_URL } from '../../config';
import './MovieCategoryPage.css'
import ErrorHandler from '../../Utils/ErrorHandler';
import MovieModal from '../../Components/Model/Model';

const MoviesCategoryPage = () => {
    const { categoryId } = useParams();
    const [genres, setGenres] = useState([]);
    const [isLoading, SetIsLoading] = useState(true);
    const [genresLoaded, SetGenresLoaded] = useState(false);
    const [movies, setMovies] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const navigate = useNavigate();
    const location = useLocation()
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    
    const [categories, setCategories] = useState({
        uploaded: {
            type: 'static',
            title: "Uploaded Movies",
            url: `${API_URL}/api/movies?page=page_num&per_page=30&include_watch_history=true`
        },
        random: {
            type: 'static',
            title: "Random Movies",
            url: `${API_URL}/cdn/tv/random?page=page_num&per_page=30&with_images=true&random=true&include_watch_history=true`
        }
    });

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

    // Check if user is logged in
    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsLoggedIn(!!token);
    }, []);

    useEffect(() => {
        // Reset state when categoryId changes
        setMovies([]);
        setPage(1);
        setHasMore(true);
        setSelectedMovie(null);
        setShowModal(false);
        if (genresLoaded) {
            fetchMovies();
        }
    }, [categoryId, location.pathname]);

    
    const fetchGenres = async () => {
        try {
            SetIsLoading(true);
            const response = await fetch(`${API_URL}/cdn/genres?list_type=movies`);
            const data = await response.json();
            const newCategories = {...categories}
            for (const genreId in data) {
                const genre = data[genreId]
                let capitalizedGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
                const encodedGenre = encodeURIComponent(genre);
                const url = `${API_URL}/cdn/${isLoggedIn ? 'auth-search' : 'search'}?media_type=movies&with_images=true&genre=${encodedGenre}&page=page_num&per_page=36&include_watch_history=true`
                newCategories[genre] = {
                    type: 'genre',
                    title: `${String(capitalizedGenre)} Movies`,
                    url: url
                }
            }
            SetGenresLoaded(true);
            setCategories(newCategories)
            
        } catch (error) {
            console.error('Error fetching genres:', error);
        } finally {
            SetIsLoading(false);
            SetGenresLoaded(true);
        }
    }

    useEffect(() => {
        if (!genresLoaded) {
            fetchGenres();
        }
    }, [genresLoaded, isLoggedIn]);
    
    useEffect(() => {
        if (genresLoaded) {
            fetchMovies();
        }
    }, [page, genresLoaded]);

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
        setSelectedMovie(null);
        setShowModal(false);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.remove('navbar_hide');
        }
    };


    const fetchMovies = async () => {
        try {
            const category = categories[categoryId];
            if (!category) {
                console.error('Category not found:', categoryId);
                ErrorHandler("not_found", navigate);
                return;
            }
            const url = category.url.replace(`page=page_num`, `page=${page}`);
            
            const options = {};
            if (isLoggedIn) {
                const token = localStorage.getItem('token');
                options.headers = {
                    'Authorization': `Bearer ${token}`
                };
            }
            
            const response = await fetch(url, options);
            const data = await response.json();
            if (data.length > 0) {
                setMovies(prevMovies => [...prevMovies, ...data]);
            } else {
                setHasMore(false);
            }
        } catch (error) {
            console.error('Error fetching movies:', error);
        } finally {
            SetIsLoading(false);
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
        <div className='MoviesCategoryPage'>
            <h1 className='MoviesCategory_title'>{(categoryId in categories) ? categories[categoryId].title : ""}</h1>
            <InfiniteScroll
                dataLength={movies.length}
                next={() => setPage(prevPage => prevPage + 1)}
                hasMore={hasMore}
                loader={<h4 className='MoviesCategory_title'>Loading...</h4>}
                endMessage={
                    <p className='MoviesCategory_title' style={{ textAlign: 'center' }}>
                        <b>Yay! You have seen it all</b>
                    </p>
                }
            >
                <div className='search-grid'>
                    {movies.map((result, idx) => (
                        <span key={idx}>
                            <button className="button3" onClick={(event) => handleMovieClick(result, event)}>
                                <Card 
                                    movie={result} 
                                    title={result.title || result.name} 
                                    mediaType={result.media_type || result.type} 
                                    image={result.backdrop_path}
                                    watchProgress={getProgressPercentage(result)}
                                    episodeInfo={getEpisodeInfo(result)}
                                />
                            </button>
                        </span>
                    ))}
                </div>
            </InfiniteScroll>
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

export default MoviesCategoryPage;