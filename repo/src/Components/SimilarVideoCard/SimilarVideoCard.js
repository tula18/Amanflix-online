import React, { useState, useEffect } from 'react';
import './SimilarVideoCard.css'
// import { FaPlus } from 'react-icons/fa';
import { FaCheck, FaPlus } from 'react-icons/fa6';
import { API_URL } from '../../config';

function SimilarVideoCard({ video, handleMovieClick, isFirstRender, fetchSimilarData, watchProgress = 0, episodeInfo }) {
    // Guard clause
    // if (!video) return null;
    
    // Now it's safe to use video.media_type
    const formData = new FormData();
    formData.append('content_type', video.media_type);

    const [imgSrc, setImgSrc] = useState(`${API_URL}/cdn/images/${video.backdrop_path}`);
    const [imageFailed, setImageFailed] = useState(false);
    // const [isLoading, setIsLoading] = useState(true);
    const [inList, setInList] = useState(false)
    const [vidExist, setVidExist] = useState({
        message: "",
        exist: false,
        return_reason: ""
    })
    const [checkedVideos, setCheckedVideos] = useState({});

    useEffect(() => {
        setImgSrc(`${API_URL}/cdn/images/${video.backdrop_path}`)
        setImageFailed(false)
        // setIsLoading(true)
    }, [video])

    useEffect(() => {
        const checkInMyList = async () => {
          const formData = new FormData();
          formData.append('content_type', video.media_type);
          formData.append('content_id', video.id);
      
          try {
            const response = await fetch(API_URL+'/api/mylist/check', {
              method: 'POST',
              body: formData,
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}` // Assuming you have a token stored in localStorage
              }
            });
      
            const data = await response.json();
            if (response.ok) {
              setInList(data.exists);
            } else {
              console.error(data.message);
            }
          } catch (error) {
            console.error('Error:', error);
          }
        };
      
        if (video) {
          checkInMyList();
          checkVideoExist();
        }
      }, [video]);

      const checkVideoExist = async () => {
        try {
            // Skip if we've already checked this video
            if (checkedVideos[video.id]) {
              setVidExist(checkedVideos[video.id]);
              return;
            }
            
            const res = await fetch(`${API_URL}/api/movies/${video.id}/check`)
            const json = await res.json();
            
            // Cache the result
            setCheckedVideos(prev => ({
              ...prev,
              [video.id]: json
            }));
            
            setVidExist(json)
        } catch (error) {
            console.error(`Couldn't get fetch! ${String(error)}`)
        };
      }

    const handleError = () => {
        if (!imageFailed) {
            setImgSrc(`${API_URL}/cdn/images/unkwon_image.jpg`); // replace with your default image path
            setImageFailed(true);
        }
    };

    const toggleInList = async () => {
        setInList(!inList)
        const formData = new FormData();
        formData.append('content_type', video.media_type);
        formData.append('content_id', video.id);
    
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

      if (hours == 0) {
        return `${remainingMinutes}m`;
      }

      return `${hours}h ${remainingMinutes}m`;
    }

    const number_of_seasons = (video.seasons && video.seasons.length) || 0

    const mediaTitle = video.media_type === 'tv' ? video.name : video.title

    const displayTitle = mediaTitle || 'Title not available';

    const firstDate = video.media_type === 'tv' ? new Date(video.first_air_date) : new Date(video.release_date)

    const handleSimilarClick = (e) => {
        isFirstRender(true)
        fetchSimilarData()
        handleMovieClick(video, e)
    }

    const handleSimilarClickTop = (e) => {
        if (!vidExist.exist) {
            isFirstRender(true)
            fetchSimilarData()
            handleMovieClick(video, e)
        }
    }

    return (
        <div className='SimilarCard' style={{zIndex:900}} onClick={(e) => handleSimilarClickTop(e)}>
            <div className='image-container' onClick={(e) => {handleSimilarClick(e)}}>
                <img
                loading={"lazy"}
                onError={handleError} 
                alt='Card Illustration'
                onClick={(e) => {
                    handleSimilarClick(e)
                }}
                // onClick={(e) => handleMovieClick(video, e)}
                // onLoadStart={() => setIsLoading(true)} 
                // onLoad={() => setIsLoading(false)} 
                className='image' 
                draggable="false" 
                src={imgSrc}
                />
                <div className='SimilarCard-shadow'></div>
                
                {/* Add progress bar */}
                {watchProgress > 0 && (
                <div className="similar-progress-container">
                    <div 
                    className="similar-progress-bar" 
                    style={{ width: `${watchProgress}%` }}
                    ></div>
                </div>
                )}
                
                {/* Add episode badge for TV shows */}
                {episodeInfo && (
                <div className={`similar-netflix-episode-badge ${episodeInfo.isNext ? 'next-episode' : ''}`}>
                    <span>
                    {episodeInfo.isNext ? 'Next: ' : ''}
                    S{episodeInfo.season} E{episodeInfo.episode}
                    </span>
                </div>
                )}
                
                {(video.media_type === 'tv') ? (
                    <div className='duration'>
                        {number_of_seasons} Season{number_of_seasons !== 1 ? 's' : ''}
                    </div>
                ) : (
                    <div className='duration'>
                        {formatMinutesToTime(video.runtime)}
                    </div>
                )}
                {/* <div className='duration'>
                    {formatMinutesToTime(video.runtime)}
                </div>
                <div className='duration'>
                    1 Seasons
                </div> */}
                <div className='title-container'>
                    <div className='title'>{video.media_type === 'tv' ? video.name : displayTitle}</div>
                </div>
            </div>
            <div className='SimilarCard-content'>
                <div className='match-row'>
                    <div className='match-info' onClick={(e) => {handleSimilarClick(e)}}>
                        <p className={`match-percentage ${video.vote_average >= 5 ? 'green' : video.vote_average >= 3 ? 'yellow' : 'red'}`}>
                            {parseFloat(video.vote_average).toFixed(1)}% Points
                        </p>
                        <div className='match-details'>
                            <div className='release-date'>{firstDate.getFullYear()}</div>
                        </div>
                    </div>
                    {vidExist.exist && (<button className='similar_add-button' onClick={toggleInList}>
                        <span className='similar_add-icon'>{inList ? <FaCheck/> : <FaPlus />}</span>
                    </button>)}
                </div>
                <div className='overview' onClick={(e) => {handleSimilarClick(e)}}>{video.overview || video.tagline}</div>
            </div>
        </div>
    )
}

export default SimilarVideoCard;