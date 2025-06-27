import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './HomePage.css'
import Banner from '../../Components/Banner/Banner';
import ContinueWatchingSlider from '../../Components/ContinueWatchingSlider/ContinueWatchingSlider';
import MovieSlider from '../../Components/Slider/Slider';
import MovieModal from '../../Components/Model/Model';
import { API_URL } from '../../config';
import ErrorHandler from '../../Utils/ErrorHandler';

const HomePage = () => {
  const { contentId } = useParams();
  const navigate = useNavigate();
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Fetch content if contentId is provided in URL
  useEffect(() => {
    const fetchContentById = async () => {
      if (!contentId) return;
      const isNumber = /^\d+$/.test(contentId);
      console.log("isNum: ", isNumber);

      if (!isNumber) {
        // redirect to 404 page or display an error message
        console.log("not a number");
        ErrorHandler("not_found", navigate);
      }
      
      setIsLoading(true);
      try {
        // Get authentication token from storage
        const token = localStorage.getItem('token');
        
        if (!token) {
          console.error('Authentication token is missing');
          setIsLoading(false);
          ErrorHandler("token_missing", navigate);
          return;
        }
        
        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        
        // First try as a movie
        const movieResponse = await fetch(`${API_URL}/cdn/movies/${contentId}`, {
          method: 'GET',
          headers: headers
        });
        
        if (movieResponse.ok) {
          const movieData = await movieResponse.json();
          setSelectedMovie(movieData);
          setShowModal(true);
          
          // Hide navbar when modal is open
          const navbar = document.getElementsByClassName('navbar');
          if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
          }
          setIsLoading(false);
          return;
        }
        
        // If not a movie, try as a TV show
        const tvResponse = await fetch(`${API_URL}/cdn/tv/${contentId}`, {
          method: 'GET',
          headers: headers
        });
        
        if (tvResponse.ok) {
          const tvData = await tvResponse.json();
          setSelectedMovie(tvData);
          setShowModal(true);
          
          // Hide navbar when modal is open
          const navbar = document.getElementsByClassName('navbar');
          if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
          }
          setIsLoading(false);
          return;
        }
        
        // If neither worked, show 404 error
        console.error('Content not found');
        setIsLoading(false);
        ErrorHandler("not_found", navigate);
      } catch (error) {
        console.error('Error fetching content:', error);
        setIsLoading(false);
        ErrorHandler(error, navigate);
      }
    };

    console.log(contentId)
    
    fetchContentById();
  }, [contentId, navigate]);
  
  // Handle modal close
  const handleModalClose = () => {
    setShowModal(false);
    setSelectedMovie(null);
    
    // Show navbar when modal is closed
    const navbar = document.getElementsByClassName('navbar');
    if (navbar[0]) {
      navbar[0].classList.remove('navbar_hide');
    }
    
    // Navigate to home page without the ID parameter
    navigate('/');
  };
  
  // Handler for clicking on a movie within the modal
  const handleMovieClick = (movie, event) => {
    if (event) event.stopPropagation();
    setSelectedMovie(movie);
    setShowModal(true);
    
    // Update URL to reflect the selected content
    const contentType = movie.media_type === 'tv' ? 'tv' : 'movies';
    const id = movie.id || movie.show_id || movie.movie_id;
    window.history.pushState({}, '', `/${id}`);
    
    const navbar = document.getElementsByClassName('navbar');
    if (navbar[0]) {
      navbar[0].classList.add('navbar_hide');
    }
  };

  // Add event listener for clicks outside modal
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

  // Add event listener for Escape key
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

  // Add effect to prevent scrolling when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
  }, [showModal]);

  return (
    <div className='homePageContainer'>
      <Banner />
      <ContinueWatchingSlider />
      <MovieSlider title="Uploaded Movies" apiUrl={`${API_URL}/api/movies?per_page=10&order=desc`} category='uploaded' mediaType='movies'/>
      <MovieSlider title="Uploaded Shows" apiUrl={`${API_URL}/api/shows?per_page=10&order=desc`} category='uploaded' mediaType='shows'/>
      <MovieSlider title="Random Movies" apiUrl={`${API_URL}/cdn/movies/random?min_rating=8.9&with_images=true&per_page=10`} category='random'/>
      <MovieSlider title="Random Tv Shows" apiUrl={`${API_URL}/cdn/tv/random?min_rating=8.9&with_images=true&per_page=10`} category='random' mediaType='shows'/>
      <MovieSlider title="Movies" apiUrl={`${API_URL}/cdn/movies?per_page=10&include_watch_history=true`} redirect={"/movies"}/>
      <MovieSlider title="Tv Shows" apiUrl={`${API_URL}/cdn/tv?per_page=10&include_watch_history=true`} redirect={"/shows"}/>
      
      {/* Modal for displaying content details */}
      {showModal && selectedMovie && (
        <MovieModal
          movie={selectedMovie}
          onClose={handleModalClose}
          handleMovieClick={handleMovieClick}
        />
      )}
      
      {/* Optional loading indicator */}
      {isLoading && (
        <div className="spinner-container" style={{display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000}}>
          <div className="spinner-border"></div>
        </div>
      )}
    </div>
  );
};

export default HomePage;