import {useEffect, useState, useCallback} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import './SearchPage.css'
import Card from '../../Components/Card/Card';
import MovieModal from '../../Components/Model/Model';
import { API_URL } from '../../config';

const CURRENT_YEAR = new Date().getFullYear();

const SearchPage = () => {
    const [results, setResults] = useState([]);
    const [explore, setExplore] = useState([]);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    let query = new URLSearchParams(useLocation().search).get('q') || '';
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Filter / facet state
    const [facets, setFacets] = useState({ genres: [], year_min: 1900, year_max: CURRENT_YEAR });
    const [filterGenre, setFilterGenre] = useState('');
    const [filterYear, setFilterYear] = useState('');
    const [filterMinRating, setFilterMinRating] = useState(0);
    const [filterMaxRating, setFilterMaxRating] = useState(10);
    const [filterMediaType, setFilterMediaType] = useState('all');
    const [filtersOpen, setFiltersOpen] = useState(false);

    // Check if user is logged in
    useEffect(() => {
        const token = localStorage.getItem('token');
        setIsLoggedIn(!!token);
    }, []);

    // Load facets (genres, year range) once on mount
    useEffect(() => {
        fetch(`${API_URL}/cdn/facets`)
            .then(res => res.json())
            .then(data => setFacets({
                genres: data.genres || [],
                year_min: data.year_min || 1900,
                year_max: data.year_max || CURRENT_YEAR,
            }))
            .catch(() => {});
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
        if (!query) return;

        const controller = new AbortController();
        const { signal } = controller;

        const newQuery = decodeURIComponent(query);
        console.log(newQuery);

        const searchEndpoint = isLoggedIn ? 'auth-search' : 'search';
        const options = { signal };

        if (isLoggedIn) {
            const token = localStorage.getItem('token');
            options.headers = { 'Authorization': `Bearer ${token}` };
        }

        const params = new URLSearchParams({
            q: newQuery,
            with_images: 'true',
            include_watch_history: 'true',
            media_type: filterMediaType,
            min_rating: filterMinRating,
            max_rating: filterMaxRating,
            fuzzy: 'true',
        });
        if (filterGenre) params.set('genre', filterGenre);
        if (filterYear)  params.set('year', filterYear);

        setLoading(true);
        Promise.all([
            fetch(`${API_URL}/cdn/${searchEndpoint}?${params.toString()}`, options)
                .then((response) => response.json()),
            fetch(`${API_URL}/cdn/autocomplete?q=${encodeURIComponent(newQuery)}`, { signal })
                .then((response) => response.json())
        ])
            .then(([searchData, autocompleteData]) => {
                console.log("results", searchData);
                setResults(searchData);
                console.log("explore", autocompleteData);
                setExplore(removeDuplicates(autocompleteData));
            })
            .catch((error) => {
                if (error.name !== 'AbortError') {
                    console.error('Error fetching search results:', error);
                }
            })
            .finally(() => {
                if (!signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [query, isLoggedIn, filterGenre, filterYear, filterMinRating, filterMaxRating, filterMediaType]);

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

            {/* ── Filter panel ── */}
            <div className='search-filters'>
                <button
                    className='search-filters-toggle'
                    onClick={() => setFiltersOpen(o => !o)}
                    aria-expanded={filtersOpen}
                >
                    {filtersOpen ? '▲ Hide Filters' : '▼ Filters'}
                </button>

                {filtersOpen && (
                    <div className='search-filters-body'>

                        {/* Genre */}
                        <label className='search-filter-label'>
                            Genre
                            <select
                                className='search-filter-select'
                                value={filterGenre}
                                onChange={e => setFilterGenre(e.target.value)}
                            >
                                <option value=''>All genres</option>
                                {facets.genres.map(g => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                        </label>

                        {/* Year */}
                        <label className='search-filter-label'>
                            Year
                            <input
                                className='search-filter-input'
                                type='number'
                                placeholder={`${facets.year_min}–${facets.year_max}`}
                                min={facets.year_min || 1900}
                                max={facets.year_max || CURRENT_YEAR}
                                value={filterYear}
                                onChange={e => setFilterYear(e.target.value)}
                            />
                        </label>

                        {/* Rating range */}
                        <div className='search-filter-label'>
                            Rating
                            <div className='search-filter-rating-row'>
                                <span>{filterMinRating.toFixed(1)}</span>
                                <input
                                    type='range'
                                    className='search-filter-range'
                                    min={0} max={10} step={0.5}
                                    value={filterMinRating}
                                    onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        setFilterMinRating(v);
                                        if (v > filterMaxRating) setFilterMaxRating(v);
                                    }}
                                />
                                <span>–</span>
                                <input
                                    type='range'
                                    className='search-filter-range'
                                    min={0} max={10} step={0.5}
                                    value={filterMaxRating}
                                    onChange={e => {
                                        const v = parseFloat(e.target.value);
                                        setFilterMaxRating(v);
                                        if (v < filterMinRating) setFilterMinRating(v);
                                    }}
                                />
                                <span>{filterMaxRating.toFixed(1)}</span>
                            </div>
                        </div>

                        {/* Media type */}
                        <label className='search-filter-label'>
                            Type
                            <select
                                className='search-filter-select'
                                value={filterMediaType}
                                onChange={e => setFilterMediaType(e.target.value)}
                            >
                                <option value='all'>All</option>
                                <option value='movies'>Movies</option>
                                <option value='tv'>TV Shows</option>
                            </select>
                        </label>

                        {/* Reset */}
                        <button
                            className='search-filter-reset'
                            onClick={() => {
                                setFilterGenre('');
                                setFilterYear('');
                                setFilterMinRating(0);
                                setFilterMaxRating(10);
                                setFilterMediaType('all');
                            }}
                        >
                            Reset filters
                        </button>
                    </div>
                )}
            </div>
            
            <div className='search-grid'>
                {loading ? (
                    <div className='search-loading'>
                        <div className='search-spinner'></div>
                    </div>
                ) : results.length ? (
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