import React, { useEffect, useState } from "react";
import './Slider.css';
import SliderRow from './SliderRow';
import Card from "../Card/Card";
import MovieModal from "../Model/Model";
import { useNavigate } from "react-router-dom";

/* ── ShowMoreCard ─────────────────────────────────────────────
   Pure-CSS chevron card. No external icon library.
   ─────────────────────────────────────────────────────────── */
function ShowMoreCard() {
  return (
    <div className="show-more-card">
      <div className="show-more-card__inner">
        <div className="show-more-card__circle">
          <span className="show-more-card__arrow">›</span>
        </div>
        <span className="show-more-card__label">Browse All</span>
      </div>
    </div>
  );
}


function MovieSlider({ title, apiUrl, lessItems = 0, category = "", mediaType = "movies", redirect = null }) {
  const navigate = useNavigate();
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [movies_fetch, setMovies] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTitles = async () => {
    try {
      const token = localStorage.getItem('token');
      const options = { headers: {} };
      if (token) options.headers['Authorization'] = `Bearer ${token}`;

      const urlWithWatchHistory = apiUrl.includes('?')
        ? `${apiUrl}&include_watch_history=true`
        : `${apiUrl}?include_watch_history=true`;

      const res = await fetch(urlWithWatchHistory, options);
      if (res.ok) {
        const data = await res.json();
        setMovies(data);
        console.log(`${title}: `, data);
      }
    } catch (err) {
      console.error('Error fetching titles:', err);
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsLoading(true);
    setMovies([]);
    fetchTitles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  // ── Modal helpers ───────────────────────────────────────────
  const handleMovieClick = (movie, event) => {
    event.stopPropagation();
    setSelectedMovie(movie);
    setShowModal(true);
    const navbar = document.getElementsByClassName('navbar');
    if (navbar[0]) navbar[0].classList.add('navbar_hide');
  };

  const handleModalClose = () => {
    setSelectedMovie(null);
    setShowModal(false);
    const navbar = document.getElementsByClassName('navbar');
    if (navbar[0]) navbar[0].classList.remove('navbar_hide');
  };

  useEffect(() => {
    document.body.classList.toggle('no-scroll', showModal);
  }, [showModal]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModal && event.target.classList.contains('modal')) handleModalClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (showModal && event.key === 'Escape') handleModalClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal]);

  // ── Watch-progress helpers ──────────────────────────────────
  const shouldShowNextEpisode = (movie) => {
    if (movie.watch_history?.finished_show) return false;
    return (
      (movie.media_type === 'tv' || movie.content_type === 'tv') &&
      movie.watch_history?.is_completed &&
      movie.watch_history?.next_episode
    );
  };

  const getProgressPercentage = (movie) => {
    if (!movie.watch_history || movie.watch_history?.finished_show) return 0;
    if (shouldShowNextEpisode(movie)) return movie.watch_history.next_episode.progress_percentage || 0;
    return movie.watch_history.progress_percentage || 0;
  };

  const getEpisodeInfo = (movie) => {
    if (!movie.watch_history || movie.watch_history?.finished_show) return null;
    if (shouldShowNextEpisode(movie)) {
      return {
        season: movie.watch_history.next_episode.season_number,
        episode: movie.watch_history.next_episode.episode_number,
        isNext: true,
      };
    }
    if (
      (movie.media_type === 'tv' || movie.content_type === 'tv') &&
      movie.watch_history.season_number &&
      movie.watch_history.episode_number
    ) {
      return {
        season: movie.watch_history.season_number,
        episode: movie.watch_history.episode_number,
        isNext: false,
      };
    }
    return null;
  };

  // ── Navigate ────────────────────────────────────────────────
  const navigateToCategory = () => {
    if (redirect !== null) { navigate(redirect); return; }
    if (category.trim() !== '') navigate(`/${mediaType}/${category}`);
  };

  const isClickable = category.trim() !== '' || redirect !== null;

  // ── Loading state ───────────────────────────────────────────
  if (isLoading) {
    return <SliderRow title={title} isLoading skeletonCount={6} />;
  }

  // ── Too few items ───────────────────────────────────────────
  if (movies_fetch.length < lessItems && lessItems !== 0) return null;

  // ── Empty / error ───────────────────────────────────────────
  if (!error && movies_fetch.length === 0) return null;

  return (
    <>
      <SliderRow
        title={title}
        isClickable={isClickable}
        onTitleClick={navigateToCategory}
      >
        {movies_fetch.map((movie, idx) => {
          const progressPercentage = getProgressPercentage(movie);
          const episodeInfo = getEpisodeInfo(movie);
          return (
            <div key={idx} className="slider-item-wrapper">
              <button className="slider-btn" onClick={(event) => handleMovieClick(movie, event)}>
                <Card
                  movie={movie}
                  title={movie.title || movie.name}
                  mediaType={movie.media_type}
                  image={movie.backdrop_path}
                  watchProgress={progressPercentage}
                  episodeInfo={episodeInfo}
                />

                {progressPercentage > 0 && (
                  <div className="netflix-progress-container">
                    <div className="netflix-progress-bar" style={{ width: `${progressPercentage}%` }} />
                  </div>
                )}
              </button>
            </div>
          );
        })}

        {isClickable && movies_fetch.length > 0 && (
          <button className="slider-btn" onClick={navigateToCategory}>
            <ShowMoreCard />
          </button>
        )}
      </SliderRow>

      {showModal && (
        <MovieModal
          movie={selectedMovie}
          onClose={handleModalClose}
          handleMovieClick={handleMovieClick}
        />
      )}
    </>
  );
}

export default MovieSlider;