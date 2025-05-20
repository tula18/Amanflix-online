import React, { useState, useEffect } from 'react';
import './Movies.css'
import MovieSlider from '../../Components/Slider/Slider';
import { API_URL } from '../../config';

const MoviesPage = () => {
  const [genres, setGenres] = useState([]);
  const [isLoading, SetIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      SetIsLoading(true);
      const response = await fetch(`${API_URL}/cdn/genres?list_type=movies`);
      const data = await response.json();
      setGenres(data);
      SetIsLoading(false);
    };
    fetchData();
  }, []);

  const spinnerStyle = {
    display: genres.length === 0 ? 'flex' : 'none',
  };

  if (genres.length === 0 || isLoading) {
      return (
          <div className="spinner-container" style={spinnerStyle}>
              <div className="spinner-border"></div>
              {/* Your component content */}
          </div>
      )
  }

  return (
    <div className='MoviesContainer'>
      {genres.map((genre, idx) => {
        let capitalizedGenre = genre.charAt(0).toUpperCase() + genre.slice(1);
        return (
          <MovieSlider 
            key={idx}
            lessItems={6}
            category={genre}
            title={`${String(capitalizedGenre)} Movies`} 
            apiUrl={`${API_URL}/cdn/search?media_type=movies&random=true&with_images=true&genre=${genre}&per_page=10`}
          />
        );
      })}
    </div>
  );
};

export default MoviesPage;