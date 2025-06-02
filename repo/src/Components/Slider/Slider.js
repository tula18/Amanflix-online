import React, { useEffect, useState } from "react";
import './Slider.css'
import Carousel from 'react-elastic-carousel'
import Card from "../Card/Card";
import MovieModal from "../Model/Model";
import LoadingCard from "../Card/LoadingCard";
import { useNavigate } from "react-router-dom";
import { ArrowRightOutlined } from "@ant-design/icons";
import { Flex } from "antd";

function ShowMoreCard() {
  return (
      <div className='newCard'>
          <Flex justify="center" align="center" style={{position: "relative", height: "100%"}}>
              <ArrowRightOutlined style={{fontSize: "44px"}}/>
          </Flex>
          <h2>Show More</h2>
      </div>
  )
}


function MovieSlider({title, apiUrl, lessItems=0, category="", mediaType="movies", redirect=null}) {

    const breakPoints = [
        {width:1, itemsToShow:1},
        {width:500, itemsToShow:2},
        {width:768, itemsToShow:3},
        {width:1200, itemsToShow:4},
        {width:1350, itemsToShow:4.5},
        {width:1750, itemsToShow:6},
    ]
    const navigate = useNavigate()
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [movies_fetch, setMovies] = useState([]);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const fetchTitles = async () => {
      try {
        const token = localStorage.getItem('token');
        const options = {
          headers: {}
        };
        
        if (token) {
          options.headers['Authorization'] = `Bearer ${token}`;
        }
        
        // Add include_watch_history=true parameter to the URL
        const urlWithWatchHistory = apiUrl.includes('?') 
          ? `${apiUrl}&include_watch_history=true` 
          : `${apiUrl}?include_watch_history=true`;
        
        const res = await fetch(urlWithWatchHistory, options);
        if (res.ok) {
          const data = await res.json();
          setMovies(data);
        }
      } catch (error) {
        console.error('Error fetching titles:', error);
        setError("Something went wrong. Please check your connection and try again.");
      } finally {
        setIsLoading(false);
      }
    }

    useEffect(() => {
      setIsLoading(true)
      setMovies([])
      fetchTitles()
    }, [apiUrl]);

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
      if (showModal) {
        document.body.classList.add('no-scroll');
      } else {
        document.body.classList.remove('no-scroll');
      }
    }, [showModal]);

    useEffect(() => {
      const handleClickOutside = (event) => {
          if (showModal && event.target.classList.contains('modal')) {
              handleModalClose();
          }
      };

      document.addEventListener('mousedown', handleClickOutside);

      return () => {
          document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [showModal]);

    useEffect(() => {
      const handleEscapeKey = (event) => {
        if (showModal && event.key === 'Escape') {
          handleModalClose();
        }
      };
    
      document.addEventListener('keydown', handleEscapeKey);
    
      return () => {
        document.removeEventListener('keydown', handleEscapeKey);
      };
    }, [showModal]);

    // Helper functions for handling watch progress and episode info
    const shouldShowNextEpisode = (movie) => {
      // Don't show next episode if show is finished
      if (movie.watch_history?.finished_show) return false;
      
      return (
        (movie.media_type === 'tv' || movie.content_type === 'tv') && 
        movie.watch_history?.is_completed &&
        movie.watch_history?.next_episode
      );
    };

    const getProgressPercentage = (movie) => {
      // Don't show progress if show is finished
      if (!movie.watch_history || movie.watch_history?.finished_show) return 0;
      
      if (shouldShowNextEpisode(movie)) {
        // For next episodes, return progress if available, otherwise 0
        return movie.watch_history.next_episode.progress_percentage || 0;
      }
      return movie.watch_history.progress_percentage || 0;
    };

    const getEpisodeInfo = (movie) => {
      // Don't show episode info if show is finished
      if (!movie.watch_history || movie.watch_history?.finished_show) return null;
      
      if (shouldShowNextEpisode(movie)) {
        return {
          season: movie.watch_history.next_episode.season_number,
          episode: movie.watch_history.next_episode.episode_number,
          isNext: true
        };
      }
      
      if ((movie.media_type === 'tv' || movie.content_type === 'tv') && 
          movie.watch_history.season_number && 
          movie.watch_history.episode_number) {
        return {
          season: movie.watch_history.season_number,
          episode: movie.watch_history.episode_number,
          isNext: false
        };
      }
      
      return null;
    };

    if (isLoading) {
      return (
        <div className="slider">
          <div className="loading-slider-title"></div>
          <Carousel itemsToShow={5} className="my-carousel" breakPoints={breakPoints}>
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i}>
                  <LoadingCard key={i} />
                </span>
              ))}
          </Carousel>
        </div>
      )
    }

    if (movies_fetch.length < lessItems && lessItems !== 0) {
      return null; // or return <div></div>
    }

    const navigateToCategory = () => {
      if (redirect !== null) {
        navigate(redirect)
      }
      if (category.trim() !== '') {
        console.log(`navigating to ${category}`);
        console.log(mediaType);
        navigate(`/${mediaType}/${category}`)
      } else {
        console.log("doesnt have category");
      }
    }

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

    if (!isLoading && !error && movies_fetch.length === 0) {
        return null;
    }

    return (
        <div className="slider">
          <h1 className={`slider-title ${(category.trim() !== '' || redirect !== null) ? "slider-title_link" : ""} `} onClick={navigateToCategory}>{title}</h1>
            {error && <div className="continue-watching-error">{error}</div>}
            
            {!isLoading && !error && movies_fetch.length === 0 && (
                <div className="continue-watching-empty">
                    <p>Theres no Titles to show!</p>
                    <p className="empty-suggestion">Check back later for new {mediaType === 'movies' ? 'movies' : 'shows'}</p>
                </div>
            )}

            {!isLoading && !error && movies_fetch.length > 0 && (
              <Carousel disableWindowSizeListener itemsToShow={5} className="my-carousel" breakPoints={breakPoints}>
                  {movies_fetch.map((movie, idx) => {
                    const progressPercentage = getProgressPercentage(movie);
                    const episodeInfo = getEpisodeInfo(movie);
                    
                    return (
                      <span key={idx}>
                        <button className="button3" onClick={(event) => handleMovieClick(movie, event)}>
                          <Card 
                            movie={movie} 
                            title={movie.title || movie.name} 
                            mediaType={movie.media_type} 
                            image={movie.backdrop_path}
                            watchProgress={progressPercentage}
                          />
                          
                          {progressPercentage > 0 && (
                            <div className="netflix-progress-container">
                              <div 
                                className="netflix-progress-bar" 
                                style={{ width: `${progressPercentage}%` }}
                              ></div>
                            </div>
                          )}
                          
                          {episodeInfo && (
                            <div className={`netflix-episode-badge ${episodeInfo.isNext ? 'next-episode' : ''}`}>
                              <span>
                                {episodeInfo.isNext ? 'Next: ' : ''}
                                S{episodeInfo.season} E{episodeInfo.episode}
                              </span>
                            </div>
                          )}
                        </button>
                      </span>
                    );
                  })}
                  {(category.trim() !== '' || redirect !== null) && (!isLoading && !error && movies_fetch.length > 0) && (
                    <button className="button3" onClick={navigateToCategory}>
                        <ShowMoreCard/>
                    </button>
                  )}
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
    )
}

export default MovieSlider