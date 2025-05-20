import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { MdClose, MdClosedCaption } from 'react-icons/md';
import './Model.css';
import { useNavigate } from "react-router";
import SimilarVideoCard from '../SimilarVideoCard/SimilarVideoCard';
import { FaCheck, FaPlus, FaPlay } from 'react-icons/fa6';
import { API_URL } from '../../config';
import { CheckCircleFilled, CheckCircleOutlined, PlusCircleOutlined } from '@ant-design/icons';
import { Flex, Tooltip, message } from 'antd';
import EpisodeSelector from '../EpisodeSelector/EpisodeSelector';

const MovieModal = ({ movie, onClose, handleMovieClick }) => {
  const navigate = useNavigate();

  const [modalClass, setModalClass] = React.useState('modal-close');
  const [imgSrc, setImgSrc] = useState(`${API_URL}/cdn/images/${movie.backdrop_path}`);
  const [imageFailed, setImageFailed] = useState(false);
  const [inList, setInList] = useState(false)
  const [askUpload, setAskUpload] = useState(false)
  const [similarTitles, setSimilarTitles] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFirstRender, setIsFirstRender] = useState(true);
  // eslint-disable-next-line no-unused-vars
  const [showFullList, setShowFullList] = useState(false);
  const [vidExist, setVidExist] = useState({
    message: "",
    exist: false,
    return_reason: ""
  })
  const [watchHistory, setWatchHistory] = useState(null);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [checkedMovieIds, setCheckedMovieIds] = useState({});

  useEffect(() => {
    setImgSrc(`${API_URL}/cdn/images/${movie.backdrop_path}`)
    setImageFailed(false)
    console.log(movie);
    
  }, [movie])

  useEffect(() => {
    const checkInMyList = async () => {
      const formData = new FormData();
      formData.append('content_type', movie.media_type);
      formData.append('content_id', movie.id);
  
      try {
        const response = await fetch(API_URL+'/api/mylist/check', {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}` // Assuming you have a token stored in localStorage
          }
        });
  
        const data = await response.json();
        console.log(data);
        if (response.ok) {
          setInList(data.exists);
        } else {
          console.error(data.message);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };

    const checkInAskUpload = async () => {
      const formData = new FormData();
      formData.append('content_type', movie.media_type);
      formData.append('content_id', movie.id);
  
      try {
        const response = await fetch(API_URL+'/api/uploadRequest/check', {
          method: 'POST',
          body: formData,
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
  
        const data = await response.json();
        console.log(data);
        if (response.ok) {
          setAskUpload(data.exists);
        } else {
          console.error(data.message);
        }
      } catch (error) {
        console.error('Error:', error);
      }
    };
  
    if (movie) {
      checkInMyList();
      checkInAskUpload();
    }
  }, [movie]);

  const handleError = () => {
    if (!imageFailed) {
        console.log("model image error");
        setImgSrc(`${API_URL}/cdn/images/unkwon_image.jpg`); // replace with your default image path
        setImageFailed(true);
    }
  };

  const fetchSimilarData = async () => {
    setIsLoading(true);
    setSimilarTitles([]);
    
    try {
      const token = localStorage.getItem('token');
      const options = {
        headers: {}
      };
      
      if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(
        `${API_URL}/cdn/${movie.media_type === 'movie' ? 'movies' : 'tv'}/${movie.id}/similar?with_images=true&include_watch_history=true`, 
        options
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log(data);
        setSimilarTitles(data);
      } else {
        console.error('Failed to fetch similar titles:', await response.text());
      }
    } catch (error) {
      console.error('Error fetching similar titles:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const checkVideoExist = async () => {
    try {
      // Skip if we've already checked this movie
      if (checkedMovieIds[movie.id]) {
        setVidExist(checkedMovieIds[movie.id]);
        return;
      }
      
      const mediaEndpoint = movie.media_type === 'tv' ? 'shows' : 'movies';
      const res = await fetch(`${API_URL}/api/${mediaEndpoint}/${movie.id}/check`);
      const json = await res.json();
      
      // Cache the result
      setCheckedMovieIds(prev => ({
        ...prev,
        [movie.id]: json
      }));
      
      setVidExist(json);
    } catch (error) {
      message.error(`Couldn't check video: ${String(error)}`);
    }
  }

  const fetchWatchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return; // Not logged in, no watch history
      
      const mediaType = movie.media_type || 'movie';
      const contentId = movie.id;
      
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
  
  useEffect(() => {
    if (isFirstRender) {
        setIsFirstRender(false);
        fetchSimilarData();
        checkVideoExist();
        fetchWatchHistory();
        console.log(movie)
    }
    // eslint-disable-next-line 
  }, [movie, isFirstRender]);

  useEffect(() => {
    const img = new Image();
    img.src = imgSrc;
    img.onload = () => {
      setImgSrc(imgSrc);
    };
    img.onerror = handleError;
    // eslint-disable-next-line
  }, [imgSrc]);

  React.useEffect(() => {
    setModalClass('modal-open');
    return () => {
      setModalClass('modal-close');
    };
  }, [movie]);

  useEffect(() => {
    const modalElement = document.querySelector('.modal');
    if (modalElement) {
        modalElement.classList.add('modal-open');
    }

    return () => {
        modalElement.classList.remove('modal-open');
    };
}, []);

  function formatText(text, maxLength) {
    if (typeof text === 'string' && text !== null && text !== undefined) {
        if (text.length > maxLength) {
            let trimmedString = text.substring(0, maxLength);
            // return trimmedString
            let lastSpaceIndex = trimmedString.lastIndexOf(" ");
            return trimmedString.substring(0, lastSpaceIndex) + '...';
        } else {
            return text;
        }
    } else {
        return '';
    }
  }

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
        
        const response = await fetch(`${API_URL}/api/watch-history/next-episode/${movie.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('modal play', data);
          
          // Check if content is completed and add timestamp=0 parameter if so
          const isCompleted = watchHistory && watchHistory.is_completed;
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
      
      console.log('HANDLE', watchHistory);
      
      // For movies, check if completed and add timestamp=0 parameter if so
      const isCompleted = watchHistory && watchHistory.is_completed;
      const timestampParam = isCompleted ? '?timestamp=0' : '';
      navigate(`/watch/m-${movie.id}${timestampParam}`);
    }
  };

  const toggleAskUpload = async () => {
    setAskUpload(!askUpload)
    const formData = new FormData();
    formData.append('content_type', movie.media_type);
    formData.append('content_id', movie.id);

    try {
      const url = `${API_URL}/api/uploadRequest/${inList ? 'delete' : 'add'}`
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }

      });

      const data = await response.json();
      console.log(data);
      if (response.ok) {
        console.log(data.message);
        if (data.exist === true) {
          setInList(true);
        } else {
          setInList(false)
        }
      } else {
        console.error(data.message);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  const toggleInList = async () => {
    if (!movie) return;
    
    setInList(!inList);
    const formData = new FormData();
    formData.append('content_type', movie.media_type);
    formData.append('content_id', movie.id);

    try {
      const url = `${API_URL}/api/mylist/${inList ? 'delete' : 'add'}`
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
  
      const data = await response.json();
      console.log(data);
      if (response.ok) {
        console.log(data.message);
        if (data.exist === true) {
          setInList(true);
        } else {
          setInList(false)
        }
      } else {
        console.error(data.message);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  }

  function formatMinutesToTime(minutes) {
if (!minutes && minutes !== 0) return 'Unknown';
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  const handleGenreClick = (genre) => {
    console.log(`/${movie.media_type === 'tv' ? 'shows' : 'movies'}/${encodeURIComponent(String(genre)).toLocaleLowerCase()}`);
    navigate(`/${movie.media_type === 'tv' ? 'shows' : 'movies'}/${encodeURIComponent(String(genre)).toLocaleLowerCase()}`);
    onClose()
  };

  const handleEpisodeSelect = (episodeId) => {
    navigate(`/watch/${episodeId}`);
  };

  const title = movie.media_type === 'tv' || movie.content_type === 'tv' ? 
    (movie.name || movie.title) : 
    (movie.title || movie.name);

  const mediaType = movie.media_type || movie.content_type;

  const fontSize = title ? (title.length > 10 ? '5vh' : '7vh') : '7vh';

  const firstDate = movie.media_type === 'tv' ? new Date(movie.first_air_date) : new Date(movie.release_date)

  if (isLoading) {
    return (
      <div className={`modal`} id="movieModal">
        <div className={`modal-content ${modalClass}`}>
          <div className="spinner-container" style={{display:"flex"}}>
            <div className="spinner-border"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`modal blur`} id="movieModal">
      <div className={`modal-content ${modalClass}`}>
        <div className='header' style={{ backgroundImage: `url(${imgSrc})`, width: '100%', backgroundSize: 'cover', backgroundPosition: 'top', minHeight: '600px' }}>
          <div className='header-shadow'></div>
          <div className='header-interactive'>
            <h2 className='header-title' style={{fontSize: fontSize}}>{title}</h2>
            
            {/* Progress Bar */}
            {watchHistory && (
              <>
                <div className="modal-progress-info">
                  {watchHistory.is_completed && watchHistory.next_episode ? (
                    watchHistory.next_episode.progress_percentage ? (
                      <span>{Math.floor(watchHistory.next_episode.watch_timestamp / 60)} out of {Math.floor(watchHistory.next_episode.total_duration / 60)} min</span>
                    ) : (
                      <span>Ready to start next episode</span>
                    )
                  ) : (
                    <span>{Math.floor(watchHistory.watch_timestamp / 60)} out of {Math.floor(watchHistory.total_duration / 60)} min</span>
                  )}
                </div>
                <div className="modal-progress-container">
                  <div 
                    className="modal-progress-bar" 
                    style={{ 
                      width: watchHistory.is_completed && watchHistory.next_episode ? 
                        (watchHistory.next_episode.progress_percentage ? `${watchHistory.next_episode.progress_percentage}%` : '0%') : 
                        `${watchHistory.progress_percentage}%` 
                    }}
                  ></div>
                </div>
              </>
            )}

            
            <div className="button-group">
              {mediaType === 'tv' ? (
                vidExist.exist ? (
                  <button className="play-button" onClick={() => handlePlay(movie)}>
                    <FaPlay style={{ fontSize: 15, paddingRight: 10 }} />
                    {watchHistory ? (
                      watchHistory.is_completed && watchHistory.next_episode ? (
                        watchHistory.next_episode.restarted ? 'Play' : 'Play Next Episode'
                      ) : (
                        'Resume'
                      )
                    ) : (
                      'Play'
                    )}
                    </button>
                ) : (
                  <button className='ask_button' onClick={toggleAskUpload}>
                    {!askUpload ? (<PlusCircleOutlined style={{ fontSize: 25, paddingRight: 10 }} />) : (<CheckCircleFilled style={{ fontSize: 25, paddingRight: 10 }} />)}
                    <p>בקש הלבנה</p>
                  </button>
                )
              ) : (!vidExist.exist) ? (
                <button className='ask_button' onClick={toggleAskUpload}>
                  {!askUpload ? (<PlusCircleOutlined style={{ fontSize: 25, paddingRight: 10 }} />) : (<CheckCircleFilled style={{ fontSize: 25, paddingRight: 10 }} />)}
                  <p>בקש הלבנה</p>
                </button>
              ) : (
                <button className="play-button" onClick={() => handlePlay(movie)}>
                  <FaPlay style={{ fontSize: 15, paddingRight: 10 }} />
                  {watchHistory && watchHistory.progress_percentage < 98 ? 'Resume' : 'Play'}
                </button>
              )}
              {vidExist.exist && (<button className='similar_add-button model_add-button' onClick={toggleInList}>
                  <span className='similar_add-icon'>{inList ? <FaCheck/> : <FaPlus/>}</span>
              </button>)}
            </div>
          </div>
          <span className="closeButton" onClick={onClose} style={{ position: 'absolute', top: '0', right: '0', margin: '10px' }}><MdClose /></span>
        </div>
        <div className="movie-info">
          <div className='movie-info-left'>
            <div className="banner_info movie-info-model">
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
                  {movie.has_subtitles && (
                    <p style={{ fontSize: 25, display: 'flex', alignContent: 'center', alignSelf: 'center'}}>
                        <Tooltip title="Has Subtitles">
                          <MdClosedCaption/>
                        </Tooltip>
                    </p>
                  )}
              </div>
              {/* Episode Info for TV Shows */}
            {(movie.media_type === 'tv' && watchHistory) && (
              <div className="episode-info-title">
              {watchHistory.is_completed && watchHistory.next_episode ? (
                `Up Next: S${watchHistory.next_episode.season_number} E${watchHistory.next_episode.episode_number}${watchHistory.next_episode.title ? ` - ${watchHistory.next_episode.title}` : ''}`
              ) : (
                `Continue Watching: S${watchHistory.season_number} E${watchHistory.episode_number}${watchHistory.episode_details?.title ? ` - ${watchHistory.episode_details.title}` : ''}`
              )}
            </div>
            )}
            <p className='movie-info-desc'>{formatText(movie.overview, 300)}</p>
          </div>
          <div className='movie-info-right' >
            <p className='movie-info-genres'>Genres: {movie.genres ? movie.genres.split(', ').map((genre, idx) => (
                <span key={idx} className='genre-link' onClick={() => handleGenreClick(genre)}>
                  {genre}
                  {idx < movie.genres.split(', ').length - 1 ? ', ' : ''}
                </span>
              )) : 'Unknown'}</p>
            <p className='movie-info-langs'>Available in: {movie.spoken_languages}</p>
          </div>
          
        </div>
        {mediaType === 'tv' && vidExist.exist && (
          <div className='more-like-this'>
            <hr className='separator' />
            <EpisodeSelector showId={movie.id} onEpisodeSelect={handleEpisodeSelect} />
          </div>
        )}
        <hr className='separator' />
        {(similarTitles.length !== 0) ? (
          <div className='more-like-this'>
            <h1 className='more-like-this_title'>More Like This</h1>
            {/* <div className='more-like-this_grid show-less'>
              {similarTitles.map((title, idx) => (<SimilarVideoCard fetchSimilarData={fetchSimilarData} isFirstRender={setIsFirstRender} handleMovieClick={handleMovieClick} video={title}/>))}
            </div> */}
            <div className='more-like-this_grid'>
              {similarTitles && similarTitles.slice(0, showFullList ? similarTitles.length : 9).map((title, idx) => (
                <SimilarVideoCard
                  key={idx}
                  fetchSimilarData={fetchSimilarData}
                  isFirstRender={setIsFirstRender}
                  handleMovieClick={handleMovieClick}
                  video={title}
                  watchProgress={getProgressPercentage(title)}
                  episodeInfo={getEpisodeInfo(title)}
                />
              ))}
              {/* {showFullList && (
               similarTitles.slice(9, similarTitles.length).map((title, idx) => {
                <SimilarVideoCard
                  fetchSimilarData={fetchSimilarData}
                  isFirstRender={setIsFirstRender}
                  handleMovieClick={handleMovieClick}
                  video={title}
                />
               })
              )} */}
            </div>
            {/* <div className='showMore'>
              <div className='showMore-shadow'/>
            </div> */}
            {/* <div className='showMore' onClick={() => setShowFullList(!showFullList)}>
              {showFullList ? 'Show Less' : 'Show More'}
              {!showFullList && (<div className='showMore-shadow' />)}
            </div> */}
            
          </div>
        ) : ''}
        {/* <hr className='separator' /> */}
        <div className='AboutSection'>
          <h1 className='About-title'>About {title}</h1>
          <div className='About-peregraphs'>
            {mediaType === 'tv' && (<p className='peregraph-title'>Creator: <p className='peregraph-p'>{movie.created_by || "Unknown"}</p></p>)}
            {mediaType === 'tv' && (<p className='peregraph-title'>In Production: <p className='peregraph-p'>{movie.in_production ? "Yes" : "No" || "Unknown"}</p></p>)}
            {mediaType === 'tv' && (<p className='peregraph-title'>Production Companies: <p className='peregraph-p'>{movie.production_companies || "Unknown"}</p></p>)}
            {mediaType === 'tv' && (<p className='peregraph-title'>Production Countries: <p className='peregraph-p'>{movie.production_countries || "Unknown"}</p></p>)}
            
            <p className='peregraph-title'>Genres: <p className='peregraph-p'>{movie.genres || "Unknown"}</p></p>
            <p className='peregraph-title'>Score: <p className='peregraph-p'>{parseFloat(movie.vote_average).toFixed(1) || "Unknown"}</p></p>
          </div>
        </div>
      </div>
      
      
    </div>
  );
};

// Helper functions to determine watch progress and episode info
const shouldShowNextEpisode = (item) => {
  // Don't show next episode if show is finished
  if (item.watch_history?.finished_show) return false;
  
  return (
    (item.media_type === 'tv' || item.content_type === 'tv') && 
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
      !(item.media_type === 'tv' || item.content_type === 'tv')) {
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

MovieModal.propTypes = {
  movie: PropTypes.shape({
    title: PropTypes.string.isRequired,
    backdrop_path: PropTypes.string.isRequired,
    overview: PropTypes.string.isRequired,
    release_date: PropTypes.string.isRequired,
    runtime: PropTypes.number.isRequired,
    genres: PropTypes.string.isRequired,
    production_companies: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string.isRequired })).isRequired,
    production_countries: PropTypes.arrayOf(PropTypes.shape({ name: PropTypes.string.isRequired })).isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
};

export default MovieModal;