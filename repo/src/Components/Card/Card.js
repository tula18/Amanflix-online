import React, { useState, useEffect, useRef } from 'react'
import './Card.css'
import { API_URL } from '../../config';

function Card({movie, watchProgress = 0, episodeInfo}) {
    // Guard clause to handle undefined movie objects
    // if (!movie) return null;

    const [imgSrc, setImgSrc] = useState(`${API_URL}/cdn/images/${movie.backdrop_path}`);
    const [imageFailed, setImageFailed] = useState(false);
    // eslint-disable-next-line 
    const [isLoading, setIsLoading] = useState(true);

    // Ref for the image element
    const imgRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // When the image is in the viewport, fetch and set the image source
                    setImgSrc(`${API_URL}/cdn/images/${movie.backdrop_path}`);
                    observer.unobserve(imgRef.current);
                    setIsLoading(false); // Set loading state to false
                }
            });
        });

        // Observe the image element
        observer.observe(imgRef.current);

        // Cleanup function to disconnect the observer when component unmounts
        return () => {
            observer.disconnect();
        };
    }, [movie]);

    useEffect(() => {
        setImgSrc(`${API_URL}/cdn/images/${movie.backdrop_path}`)
        setImageFailed(false)
        setIsLoading(true)
    }, [movie])

    const handleError = () => {
        if (!imageFailed) {
            setImgSrc(`${API_URL}/cdn/images/unkwon_image.jpg`); // replace with your default image path
            setImageFailed(true);
        }
    };

    const displayTitle = movie.name || movie.title || 'Title not available';

    return (
        <div className='card'>
            {/* {isLoading ? <LoadingCard /> : null} */}
            <img ref={imgRef} onContextMenu={(e) => e.preventDefault()} onError={handleError} loading={"lazy"} onLoadStart={() => setIsLoading(true)} onLoad={() => setIsLoading(false)} className='card__image' draggable="false" src={imgSrc} alt='' srcSet=''/>
            <h2>{displayTitle}</h2>
            
            {/* Add progress bar */}
            {watchProgress > 0 && (
                <div className="card__progress-container">
                    <div 
                        className="card__progress-bar" 
                        style={{ width: `${watchProgress}%` }}
                    ></div>
                </div>
            )}
            
            {/* Add episode badge for TV shows */}
            {episodeInfo && (
                <div className={`card-episode-badge ${episodeInfo.isNext ? 'next-episode' : ''}`}>
                    <span>
                        {episodeInfo.isNext ? 'Next: ' : ''}
                        S{episodeInfo.season} E{episodeInfo.episode}
                    </span>
                </div>
            )}
        </div>
    );
}

export default Card;