import {useEffect, useState} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './SearchPage.css'
import Card from '../../Components/Card/Card';
import MovieModal from '../../Components/Model/Model';
import { API_URL } from '../../config';

const SearchPage = () => {
    const [results, setResults] = useState([]);
    const [explore, setExplore] = useState([]);
    const navigate = useNavigate();
    let query = new URLSearchParams(useLocation().search).get('q') || '';
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Check if user is logged in
    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsLoggedIn(!!token);
    }, []);

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

    const removeDuplicates = (arr) => {
        // Create empty array to store unique objects
        let uniqueArr = [];
    
        // Iterate through array of objects
        for (let i = 0; i < arr.length; i++) {
          // Check if current object's title already exists in array of unique objects
          if (!uniqueArr.some((item) => item.title === arr[i].title)) {
            // If title does not exist, add object to array of unique objects
            uniqueArr.push(arr[i]);
          }
        }
    
        return uniqueArr;
    };

    useEffect(() => {
        if (query) {
            const newQuery = decodeURIComponent(query);
            console.log(newQuery);
            
            // Choose the appropriate endpoint based on authentication status
            const searchEndpoint = isLoggedIn ? 'auth-search' : 'search';
            const options = {};
            
            if (isLoggedIn) {
                const token = localStorage.getItem('token');
                options.headers = {
                    'Authorization': `Bearer ${token}`
                };
            }

            fetch(`${API_URL}/cdn/${searchEndpoint}?q=${encodeURIComponent(newQuery)}&with_images=true&include_watch_history=true`, options)
                .then((response) => response.json())
                .then((data) => {
                    console.log("results", data);
                    setResults(data);
                })
                .catch((error) => console.error('Error fetching search results:', error));
        
            fetch(`${API_URL}/cdn/autocomplete?q=${encodeURIComponent(newQuery)}`)
                .then((response) => response.json())
                .then((data) => {
                    console.log("explore", data);
                    console.log("explore-unique", removeDuplicates(data));
                    setExplore(removeDuplicates(data));
                })
                .catch((error) => console.error('Error fetching search results:', error));
        }
    }, [query, isLoggedIn]);

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

    const handleExploreClick = (title) => {
        console.log('explore', title);
        title = title.name || title.title;
        navigate(`/search?q=${encodeURIComponent(title.trim())}`);
    };

    if (query === '') {
        return (
            <div className='SearchPage'>
                <div className='search-grid'>
                <div className='no-results'>Please enter a title to search.</div>
                </div>
            </div>
        );
    }

    return (
        <div className='SearchPage'>
            {(explore.length && results.length) ? (
                <div className='more-to-explore'>
                    <span>More to explore:</span>
                    {explore.length ? (
                        explore.map((title, index) => (
                            /* eslint-disable-next-line jsx-a11y/anchor-is-valid */
                            <a className={((title.title || title.name) === query ? 'disabled' : '')} onClick={() => handleExploreClick(title)} key={index}>
                                {title.title || title.name}
                            </a>
                        ))
                    ) : ''}
                </div>
            ) : ""}
            
            <div className='search-grid'>
                {results.length ? (
                    results.map((result, idx) => (
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
                    ))
                ) : (
                    <div className='no-results'>No results found.</div>
                )}
            </div>

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

export default SearchPage;