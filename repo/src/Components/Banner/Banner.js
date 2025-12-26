import React, { useEffect, useState } from "react";
import { FaPlay } from 'react-icons/fa'
import { MdInfoOutline } from 'react-icons/md'
import './Banner.css'
import MovieModal from '../Model/Model'
import { useNavigate } from "react-router";
import { API_URL } from "../../config";
import { message } from 'antd'; // Add this import for message notifications

const LoadingBanner = () => {
    return (
      <div className="loading-banner">
        <div className='banner-opacity'></div>
        <div className='banner-shadow'></div>
        <div className="loading-banner__image skeleton"></div>
        <div className="loading-banner__title skeleton"></div>
        <div className='banner_container'>
                <div className='intro__containter'>
                    <div className='banner_title skeleton_title'></div>
                    <p className='banner_description skeleton_desc'></p>
                </div>
                <div className='banner_buttons'>
                    <button className='banner_play_button skeleton_button'>
                        <FaPlay style={{fontSize:25, paddingRight:'5px'}}/>Play
                    </button>
                    <button className='banner_info_button skeleton_button'>
                        <MdInfoOutline style={{fontSize:32, paddingRight:'5px' }}/>
                        <p>More Info</p>
                    </button>
                </div>
            </div>
      </div>
    );
  };

function Banner() {
    const navigate = useNavigate();

    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [movie, setMovies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [watchHistory, setWatchHistory] = useState(null); // Add this state for watch history
    const [currentEpisode, setCurrentEpisode] = useState(null);
    const [isFirstRender, setIsFirstRender] = useState(true);

    useEffect(() => {
      const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.log("No authentication token found");
                setIsLoading(false);
                return;
            }


            // Try API discovery endpoint first
            const response = await fetch(`${API_URL}/api/discovery/random?per_page=1`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            


            if (response.ok) {
                const data = await response.json();
                
                // Check if we got valid content
                if (data && data.length > 0 && data[0]) {
                    console.log("api not zero");
                    
                    setMovies(data[0]);
                    
                    // If we have content and user is logged in, fetch watch history
                    if (localStorage.getItem('token')) {
                        fetchWatchHistory(data[0]);
                    }
                    setIsLoading(false);
                    return;
                }
            }
            
            // Fallback to CDN discovery endpoint
            console.log('API discovery failed or returned no content, falling back to CDN');
            const cdnResponse = await fetch(`${API_URL}/cdn/discovery/random?per_page=1&with_images=true`);
            
            if (cdnResponse.ok) {
                const cdnData = await cdnResponse.json();
                
                if (cdnData && cdnData.length > 0 && cdnData[0]) {
                    setMovies(cdnData[0]);
                } else {
                    console.error('No content available from both API and CDN');
                }
            } else {
                console.error('Both API and CDN discovery endpoints failed');
            }
            
        } catch (error) {
            console.error('Error in fetch:', error);
            
            // Try CDN as fallback on any error
            try {
                console.log('Trying CDN discovery as fallback due to error');
                const cdnResponse = await fetch(`${API_URL}/cdn/discovery/random?per_page=1&with_images`);
                
                if (cdnResponse.ok) {
                    const cdnData = await cdnResponse.json();
                    
                    if (cdnData && cdnData.length > 0 && cdnData[0]) {
                        setMovies(cdnData[0]);
                    }
                }
            } catch (cdnError) {
                console.error('CDN fallback also failed:', cdnError);
            }
        }
        setIsLoading(false);
      };
      fetchData();
    }, []);

    useEffect(() => {
        if (isFirstRender) {
            setIsFirstRender(false);
            fetchWatchHistory();
        }
        // eslint-disable-next-line 
      }, [movie, isFirstRender]);
    
    // Add function to fetch watch history for the banner movie
    const fetchWatchHistory = async (movieData = null) => {
        try {
          // Use the provided movieData parameter if available, otherwise use the state
          const currentMovie = movieData || movie;
          
          // Guard clause to prevent calls with invalid movie data
          if (!currentMovie || !currentMovie.id) {
            console.log('No valid movie data available for fetching watch history');
            return;
          }
          
          console.log('Fetching watch history for:', currentMovie);
            
          const token = localStorage.getItem('token');
          if (!token) return; // Not logged in, no watch history
          
          const mediaType = currentMovie.media_type || 'movie';
          const contentId = currentMovie.id;
          
          // Use the new /current endpoint to get comprehensive watch data
          const response = await fetch(`${API_URL}/api/watch-history/current/${mediaType}/${contentId}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            console.log('No watch history available');
            return;
          }
          
          const data = await response.json();
          console.log('Current progress data:', data);
          
          // Set watch history from the response
          setWatchHistory(data);
          
          // For TV shows, if episode details are included, set them directly
          if (mediaType === 'tv' && data.episode_details) {
            setCurrentEpisode(data.episode_details);
          } 
          // If no episode details in response but we need them, fetch separately
          else if (mediaType === 'tv' && !data.episode_details && data.season_number && data.episode_number) {
            try {
              await fetchEpisodeDetails(data.season_number, data.episode_number);
            } catch (err) {
              console.error('Failed to get episode details:', err);
            }
          }
        } catch (error) {
          console.error('Error fetching watch history:', error);
        }
      };

    const fetchEpisodeDetails = async (seasonNumber, episodeNumber) => {
        try {
          const response = await fetch(`${API_URL}/api/shows/${movie.id}/season/${seasonNumber}/episode/${episodeNumber}`);
          
          if (!response.ok) return;
          
          const episodeData = await response.json();
          setCurrentEpisode(episodeData);
        } catch (error) {
          console.error('Error fetching episode details:', error);
        }
      };

    const handlePlay = async () => {
        if (movie.media_type === 'tv') {
          try {
            const token = localStorage.getItem('token');
            if (!token) {
              // No token, play first episode
              message.info("Sign in to save your viewing progress", 5);
              navigate(`/watch/t-${movie.id}-1-1`);
              return;
            }
            
            // First check if we need to get fresh watch history data
            if (!watchHistory) {
              try {
                const historyResponse = await fetch(`${API_URL}/api/watch-history/current/tv/${movie.id}`, {
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                });
                
                if (historyResponse.ok) {
                  const historyData = await historyResponse.json();
                  setWatchHistory(historyData);
                }
              } catch (error) {
                console.error('Error fetching watch history:', error);
              }
            }
            
            const response = await fetch(`${API_URL}/api/watch-history/next-episode/${movie.id}`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log('modal play', data);
              
              // Check if content is completed and add timestamp=0 parameter if so
              const isCompleted = data.is_completed || (watchHistory && watchHistory.is_completed);
              const timestampParam = isCompleted ? '?timestamp=0' : '';
              
              if (data.episode_id) {
                navigate(`/watch/${data.episode_id}${timestampParam}`);
              } else {
                navigate(`/watch/t-${movie.id}-${data.season_number}-${data.episode_number}${timestampParam}`);
              }
            } else {
              // Fallback to first episode
              navigate(`/watch/t-${movie.id}-1-1`);
            }
          } catch (error) {
            console.error('Error fetching next episode:', error);
            navigate(`/watch/t-${movie.id}-1-1`); // Fallback to first episode
          }
        } else {
          // For movies, always get the latest watch history
          try {
            const token = localStorage.getItem('token');
            if (token) {
              const historyResponse = await fetch(`${API_URL}/api/watch-history/current/movie/${movie.id}`, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                console.log('Fresh movie history:', historyData);
                
                const isCompleted = historyData.is_completed;
                const timestampParam = isCompleted ? '?timestamp=0' : '';
                navigate(`/watch/m-${movie.id}${timestampParam}`);
                return;
              }
            }
          } catch (error) {
            console.error('Error fetching movie history:', error);
          }
          
          // Fallback if no token or history fetch failed
          console.log('HANDLE fallback', watchHistory);
          const isCompleted = watchHistory && watchHistory.is_completed;
          const timestampParam = isCompleted ? '?timestamp=0' : '';
          navigate(`/watch/m-${movie.id}${timestampParam}`);
        }
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

      useEffect(() => {
        if (showModal) {
          document.body.classList.add('no-scroll');
        } else {
          document.body.classList.remove('no-scroll');
        }
  
      }, [showModal])
  
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

      function formatText(text, maxLength) {
        if (typeof text === 'string' && text !== null && text !== undefined) {
            if (text.length > maxLength) {
                let trimmedString = text.substring(0, maxLength);
                let lastSpaceIndex = trimmedString.lastIndexOf(" ");
                return trimmedString.substring(0, lastSpaceIndex) + '...';
            } else {
                return text;
            }
        } else {
            return '';
        }
    }
      if (isLoading || !movie || Object.keys(movie).length === 0) {
      return <LoadingBanner />;
    }

    const title = movie.name || movie.title || 'Title not available';

    const fontSize = '5vh';

    const firstDate = movie.media_type === 'tv' ? new Date(movie.first_air_date) : new Date(movie.release_date)

    function formatMinutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
    
        return `${hours}h ${remainingMinutes}m`;
    }


    return (
        <div className='banner' style={{backgroundImage: `url('${API_URL}/cdn/images${movie.backdrop_path}')`}}>
            <div className='banner-opacity'></div>
            {/* <div className={!isDark ? 'banner-opacity' : ''}></div> */}
            {/* {!isDark ? <div className='banner-opacity'></div> : <div/>} */}
            <div className='banner-shadow'></div>
            <div className='banner_container'>
                <div className='intro__containter'>
                    <h1 className='banner_title' style={{fontSize: fontSize}}>{title}</h1>
                    <div className="banner_info">
                        <p className={`banner_vote_average ${movie.vote_average >= 5 ? 'green' : movie.vote_average >= 3 ? 'yellow' : 'red'}`}>
                            {parseFloat(movie.vote_average).toFixed(1)} Points
                        </p>
                        <p className="banner_release_year">
                            {firstDate.getFullYear()}
                        </p>
                        {(movie.media_type === 'tv') ? (
                            <p className="banner_release_year">
                                {movie.number_of_seasons} Season{movie.number_of_seasons !== 1 ? 's' : ''}
                            </p>
                        ) : ''}
                        {(movie.media_type === 'movie') ? (
                            <p className="banner_runtime">
                                {formatMinutesToTime(movie.runtime)}
                            </p>
                        ) : ''}
                    </div>
                    <p className='banner_description'>
                        {formatText(movie.overview, 170)}
                    </p>
                </div>
                <div className='banner_buttons'>
                    <button className='banner_play_button' onClick={() => handlePlay(movie)}>
                        <FaPlay style={{fontSize:25, paddingRight:'5px'}}/>
                        {movie.media_type === 'tv' ? (
                          watchHistory ? (
                            watchHistory.is_completed && watchHistory.next_episode ? (
                              watchHistory.next_episode.restarted ? 'Play' : 'Play Next Episode'
                            ) : (
                              'Resume'
                            )
                          ) : (
                            'Play'
                          )
                        ) : (
                          watchHistory && watchHistory.progress_percentage < 98 ? 'Resume' : 'Play'
                        )}
                    </button>
                    <button className='banner_info_button' onClick={(event) => handleMovieClick(movie, event)}>
                        <MdInfoOutline style={{fontSize:32, paddingRight:'5px' }}/>
                        <p>More Info</p>
                    </button>
                </div>
            </div>

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

export default Banner