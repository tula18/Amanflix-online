import React, { useState, useEffect } from 'react';
import './TvShows.css'
import MovieSlider from '../../Components/Slider/Slider';
import { API_URL } from '../../config';

const TvShowsPage = () => {
  const [genres, setGenres] = useState([]);
  // const [isLoading, SetIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      // SetIsLoading(true);
      const response = await fetch(`${API_URL}/cdn/genres?list_type=tv`);
      const data = await response.json();
      console.log(data);
      setGenres(data);
      // SetIsLoading(false);
    };
    fetchData();
  }, []);

  const spinnerStyle = {
    display: genres.length === 0 ? 'flex' : 'none',
  };

  if (genres.length === 0) {
      return (
          <div className="spinner-container" style={spinnerStyle}>
              <div className="spinner-border"></div>
              {/* Your component content */}
          </div>
      )
  }

  return (
    <div className='TvShowsContainer'>
      {genres.map((genre, idx) => {
        let capitalizedGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
        const encodedGenre = encodeURIComponent(genre);
        const url = `${API_URL}/cdn/search?media_type=tv&random=true&with_images=true&genre=${encodedGenre}&per_page=10`
        return (
          <MovieSlider 
            key={idx}
            lessItems={6}
            category={genre}
            mediaType='shows'
            title={`${String(capitalizedGenre)} TV Shows`} 
            apiUrl={url}
          />
        );
      })}
    </div>
  );
};

export default TvShowsPage;