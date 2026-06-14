import React, { useEffect, useState } from 'react';
import InfiniteScroll from 'react-infinite-scroll-component';
import Card from '../../Components/Card/Card';
import CategoryHeader from '../../Components/CategoryHeader/CategoryHeader';
import CategoryFilters, { CategoryFiltersToggle, DEFAULT_CATEGORY_FILTERS } from '../../Components/CategoryFilters/CategoryFilters';
import MovieModal from '../../Components/Model/Model';
import { API_URL } from '../../config';
import { applyNewTitleFiltersToUrl } from '../../Utils/categoryFilters';
import './NewTitlesPage.css';

const NewTitlesPage = () => {
    const [titles, setTitles] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [filters, setFilters] = useState(DEFAULT_CATEGORY_FILTERS);
    const [filtersOpen, setFiltersOpen] = useState(false);

    const perPage = 30;

    // Helper functions for watch progress and episode info
    const shouldShowNextEpisode = (item) => {
        if (item.watch_history?.finished_show) return false;
        return (
            (item.media_type === 'tv' || item.type === 'tv_series') &&
            item.watch_history?.is_completed &&
            item.watch_history?.next_episode
        );
    };

    const getProgressPercentage = (item) => {
        if (!item.watch_history) return 0;
        if (item.watch_history.finished_show) return 0;
        if (shouldShowNextEpisode(item)) {
            return item.watch_history.next_episode.progress_percentage || 0;
        }
        return item.watch_history.progress_percentage || 0;
    };

    const getEpisodeInfo = (item) => {
        if (!item.watch_history ||
            !(item.media_type === 'tv' || item.type === 'tv_series')) {
            return null;
        }
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

    const fetchTitles = async (pageToFetch = page, replace = false) => {
        try {
            const token = localStorage.getItem('token');
            const options = {
                headers: {}
            };
            if (token) {
                options.headers['Authorization'] = `Bearer ${token}`;
            }

            const baseUrl = `${API_URL}/api/discovery/new-titles?page=${pageToFetch}&per_page=${perPage}&with_images=true&days=30&include_watch_history=true`;
            const url = applyNewTitleFiltersToUrl(baseUrl, filters);
            const response = await fetch(url, options);
            const data = await response.json();

            if (data.length > 0) {
                setTitles(prevTitles => replace ? data : [...prevTitles, ...data]);
            } else if (replace) {
                setTitles([]);
            }
            setHasMore(data.length >= perPage);
        } catch (error) {
            console.error('Error fetching new titles:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setTitles([]);
        setPage(1);
        setHasMore(true);
        setIsLoading(true);
        fetchTitles(1, true);
    }, [filters]);

    useEffect(() => {
        if (page > 1) {
            fetchTitles(page, false);
        }
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
        setSelectedMovie(null);
        setShowModal(false);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.remove('navbar_hide');
        }
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showModal && (event.target.classList.contains('modal') || event.key === 'Escape')) {
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
            <div className="spinner-container" style={{ display: 'flex' }}>
                <div className="spinner-border"></div>
            </div>
        );
    }

    return (
        <div className='NewTitlesPage'>
            <CategoryHeader
                title="New Titles"
                eyebrow="Fresh additions"
                description="Recently added movies and shows from the last 30 days."
                meta={[hasMore ? 'More titles available' : 'Complete list']}
                actions={
                    <CategoryFiltersToggle
                        filtersOpen={filtersOpen}
                        onToggle={() => setFiltersOpen(open => !open)}
                    />
                }
                backgroundPath={titles[0]?.backdrop_path}
                tone="new"
            />
            <CategoryFilters
                filters={filters}
                onChange={setFilters}
                filtersOpen={filtersOpen}
                hideToggle
                showMediaType
            />
            {titles.length === 0 ? (
                <p className='category-status-message'>
                    <b>No new titles match these filters.</b>
                </p>
            ) : (
                <InfiniteScroll
                    dataLength={titles.length}
                    next={() => setPage(prevPage => prevPage + 1)}
                    hasMore={hasMore}
                    loader={<h4 className='category-status-message'>Loading...</h4>}
                    endMessage={
                        <p className='category-status-message'>
                            <b>Yay! You have seen it all</b>
                        </p>
                    }
                >
                    <div className='search-grid'>
                        {titles.map((result, idx) => (
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

export default NewTitlesPage;
