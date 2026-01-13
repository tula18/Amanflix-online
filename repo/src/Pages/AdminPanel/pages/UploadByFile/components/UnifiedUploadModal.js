import { CloseOutlined, UploadOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import React, { useState, useEffect, useRef } from "react";
import { Alert, Progress, Upload, notification, Button, Flex, Tooltip, Popconfirm, Image, AutoComplete } from "antd";
import { FaPlay } from "react-icons/fa6";
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../../../../../config";
import './UnifiedUploadModal.css';
import FormGroup from "../../../Components/FormGroup/FormGroup";
import TextareaFormGroup from "../../../Components/FormGroup/TextareaFormGroup";
import axios from 'axios';

const UnifiedUploadModal = ({ 
    isVisible, 
    onClose, 
    onSuccess, 
    type, // 'movie' or 'tv_show'
    prefilledData,
    // New props for edit mode (to replace MovieEditModal and TvShowEditModal)
    contentId,      // movieID or ShowID
    fetchType = 'new', // 'new', 'api', 'cdn'
    openDelForm,    // Delete form callback
    refresh         // Refresh callback
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Determine if we're in edit mode
    const isEdit = contentId !== undefined && fetchType !== 'cdn' && fetchType !== 'new';
    
    const token = localStorage.getItem('admin_token');
    const [saveLoading, setSaveLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [timeStart, setTimeStart] = useState(null);
    const [inputErrors, setInputErrors] = useState({});
    const [inputSuccess, setInputSuccess] = useState({});
    const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
    const [showBackdrop, setShowBackdrop] = useState(false);
    const [showPoster, setShowPoster] = useState(false);
    
    // Video existence state (for edit mode)
    const [vidExist, setVidExist] = useState({
        message: "",
        exist: false,
        return_reason: ""
    });
    const [episodeExists, setEpisodeExists] = useState({});
    
    // AutoComplete suggestions
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSearch, setLoadingSearch] = useState(false);

    // Validation function for upload pre-check
    const validateUpload = async (contentType, contentId, episodes = null, contentData = null) => {
        try {
            const token = localStorage.getItem('admin_token');
            const payload = {
                content_type: contentType,
                content_id: contentId,
                validation_type: 'upload'
            };
            
            if (episodes) {
                payload.episodes = episodes;
            }
            
            if (contentData) {
                payload.content_data = contentData;
            }
            
            console.log(`🔍 Validating ${contentType} ID ${contentId}:`, payload);
            
            const response = await fetch(`${API_URL}/api/upload/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            console.log(`📡 Validation response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`❌ Validation failed for ${contentType} ID ${contentId}:`, {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorText
                });
                
                return {
                    success: false,
                    can_upload: false,
                    errors: [{ 
                        type: 'validation_request_failed', 
                        message: `Validation request failed: ${response.status} ${response.statusText}`,
                        details: { status: response.status, error: errorText }
                    }],
                    warnings: [],
                    info: []
                };
            }
            
            const result = await response.json();
            console.log(`✅ Validation result for ${contentType} ID ${contentId}:`, result);
            
            return result;
        } catch (error) {
            console.error(`💥 Validation error for ${contentType} ID ${contentId}:`, error);
            
            return {
                success: false,
                can_upload: false,
                errors: [{ 
                    type: 'validation_network_error', 
                    message: `Network error during validation: ${error.message}`,
                    details: { 
                        name: error.name,
                        message: error.message,
                        stack: error.stack
                    }
                }],
                warnings: [],
                info: []
            };
        }
    };

    // Movie data state
    const [movieData, setMovieData] = useState({
        id: '',
        title: '',
        overview: '',
        tagline: '',
        release_date: '',
        vote_average: '',
        genres: '',
        keywords: '',
        poster_path: '',
        backdrop_path: '',
        runtime: '',
        production_companies: '',
        production_countries: '',
        spoken_languages: '',
        budget: '',
        revenue: '',
        status: '',
        has_subtitles: false,
        in_production: false,
        force: false,   
        vid_movie: null
    });

    // TV Show data state
    const [showData, setShowData] = useState({
        show_id: '',
        title: '',
        genres: '',
        created_by: '',
        overview: '',
        poster_path: '',
        backdrop_path: '',
        vote_average: '',
        tagline: '',
        spoken_languages: '',
        first_air_date: '',
        last_air_date: '',
        production_companies: '',
        production_countries: '',
        networks: '',
        status: '',
        seasons: []
    });

    const [episodePreviews, setEpisodePreviews] = useState({});
    const [showPreviewEpisodes, setShowPreviewEpisodes] = useState({});
    const [errors, setErrors] = useState({});
    const [success, setSuccess] = useState({});
    const [uploadedSize, setUploadedSize] = useState(0);

    const modalContentRef = useRef(null);
    const seasonRef = useRef(null);
    const episodeRef = useRef(null);

    // Fetch content details for edit mode
    useEffect(() => {
        if (isVisible && (isEdit || fetchType === 'cdn') && contentId) {
            if (type === 'movie') {
                fetchMovieDetails();
            } else if (type === 'tv_show') {
                fetchShowDetails();
            }
        }
    }, [isVisible, isEdit, fetchType, contentId, type]);

    // Initialize from prefilledData when available
    useEffect(() => {
        if (isVisible && prefilledData && !contentId) {
            if (type === 'movie') {
                initializeMovieForm();
            } else if (type === 'tv_show') {
                initializeTVShowForm();
            }
        }
    }, [isVisible, prefilledData, type]);

    // Check video existence for movies
    useEffect(() => {
        if (type === 'movie' && movieData.id && fetchType !== 'new') {
            checkVideoExist();
        }
    }, [movieData.id, fetchType, type]);

    // Check episodes existence for shows
    useEffect(() => {
        if (type === 'tv_show' && showData.show_id && fetchType !== 'new') {
            checkEpisodesExist();
        }
    }, [showData.show_id, fetchType, type]);

    // Fetch movie details for edit mode
    const fetchMovieDetails = async () => {
        try {
            setFetchLoading(true);
            const userToken = localStorage.getItem('token');
            if (!userToken) {
                console.log("No authentication token found");
                setFetchLoading(false);
                return;
            }

            const response = await fetch(`${API_URL}/${isEdit ? "api" : fetchType}/movies/${contentId}`, {
                headers: {
                    'Authorization': `Bearer ${userToken}`
                }
            });
            const data = await response.json();
            console.log("Fetched movie data:", data);
            const newMovieData = { ...movieData };

            for (const key in data) {
                if (data.hasOwnProperty(key) && movieData.hasOwnProperty(key)) {
                    if (key === "release_date") {
                        newMovieData[key] = fixReleaseDateFormat(data[key]);
                    } else {
                        newMovieData[key] = data[key];
                    }
                }
            }

            setMovieData(newMovieData);
            validateForm(newMovieData, true);

        } catch (error) {
            console.error('Error fetching movie details:', error);
        } finally {
            setFetchLoading(false);
        }
    };

    // Fetch show details for edit mode
    const fetchShowDetails = async () => {
        try {
            setFetchLoading(true);
            const userToken = localStorage.getItem('token');
            
            // API uses /api/shows/, CDN uses /cdn/tv/
            const endpoint = isEdit ? `api/shows/${contentId}` : `cdn/tv/${contentId}`;
            const response = await fetch(`${API_URL}/${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${userToken}`
                }
            });
            const data = await response.json();
            console.log("Fetched show data:", data);
            
            const newShowData = { ...showData };

            // Handle special mappings first (CDN uses different field names)
            if (data.name) {
                newShowData.title = data.name;
            }
            if (data.id) {
                newShowData.show_id = data.id;
            }

            for (const key in data) {
                if (data.hasOwnProperty(key) && showData.hasOwnProperty(key)) {
                    if (key === "first_air_date" || key === "last_air_date") {
                        newShowData[key] = fixReleaseDateFormat(data[key]);
                    } else if (key === "seasons" && Array.isArray(data[key])) {
                        newShowData.seasons = data[key].map(season => ({
                            seasonNumber: season.season_number,
                            episodes: Array.isArray(season.episodes) ? season.episodes.map(episode => ({
                                episodeNumber: episode.episode_number,
                                title: episode.title,
                                overview: episode.overview,
                                has_subtitles: episode.has_subtitles || false,
                                force: false,
                                videoFile: null
                            })) : []
                        }));
                    } else {
                        newShowData[key] = data[key];
                    }
                }
            }

            setShowData(newShowData);

        } catch (error) {
            console.error('Error fetching show details:', error);
            setErrors({general: `Error fetching show: ${error.message}`});
        } finally {
            setFetchLoading(false);
        }
    };

    // Check if movie video exists
    const checkVideoExist = async () => {
        if (movieData.id) {
            try {
                const userToken = localStorage.getItem('token');
                if (!userToken) return;

                const res = await fetch(`${API_URL}/api/movies/${movieData.id}/check`, {
                    headers: {
                        'Authorization': `Bearer ${userToken}`
                    }
                });
                const json = await res.json();
                setVidExist(json);
            } catch (error) {
                console.error(`Couldn't check video: ${String(error)}`);
            }
        }
    };

    // Check if episode files exist
    const checkEpisodesExist = async () => {
        if (!showData.show_id) return;
        
        try {
            const response = await fetch(`${API_URL}/api/upload/show/${showData.show_id}/check`, {
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                }
            });
            const json = await response.json();
            console.log("Episode existence check:", json);
            setEpisodeExists(json);
        } catch (error) {
            console.error(`Couldn't check episodes: ${String(error)}`);
        }
    };

    // AutoComplete search for movies
    const processMovieData = data => {
        return data.map(movie => ({
            value: `${movie.title} | ${new Date(movie.release_date).getFullYear() || 'Unknown'}`,
            label: `${movie.title} | ${new Date(movie.release_date).getFullYear() || 'Unknown'}`,
            movie: movie
        }));
    };

    const fetchMoviesForSearch = async (query = '') => {
        if (query) {
            try {
                setLoadingSearch(true);
                const res = await fetch(`${API_URL}/cdn/search?q=${encodeURIComponent(decodeURIComponent(query))}&max_results=10&media_type=movies`);
                const data = await res.json();
                setSuggestions(processMovieData(data));
            } catch (error) {
                console.error('Error searching movies:', error);
            } finally {
                setLoadingSearch(false);
            }
        }
    };

    const handleMovieSearchSelect = (value, option) => {
        const selectedMovie = option.movie;
        const newMovieData = { ...movieData };
        for (const key in selectedMovie) {
            if (selectedMovie.hasOwnProperty(key) && movieData.hasOwnProperty(key)) {
                if (key === "release_date") {
                    newMovieData[key] = fixReleaseDateFormat(selectedMovie[key]);
                } else {
                    newMovieData[key] = selectedMovie[key];
                }
            }
        }
        setMovieData(newMovieData);
        validateForm(newMovieData, true);
    };

    // AutoComplete search for shows
    const processShowData = data => data.map(show => ({ value: show.name, label: show.name, show }));

    const fetchShowsForSearch = async (query = '') => {
        if (query) {
            try {
                setLoadingSearch(true);
                const newQuery = decodeURIComponent(query);
                const res = await fetch(`${API_URL}/cdn/search?q=${encodeURIComponent(newQuery)}&max_results=10&media_type=tv`);
                const data = await res.json();
                setSuggestions(processShowData(data));
            } catch (error) {
                console.error('Error searching shows:', error);
            } finally {
                setLoadingSearch(false);
            }
        }
    };

    const handleShowSearchSelect = (value, option) => {
        const selectedShow = option.show;
        const newShowData = { ...showData };
        for (const key in selectedShow) {
            if (selectedShow.hasOwnProperty(key) && showData.hasOwnProperty(key)) {
                newShowData[key] = key === "release_date" ? fixReleaseDateFormat(selectedShow[key]) : selectedShow[key];
            } else if (key === 'name') {
                newShowData['title'] = selectedShow['name'];
            } else if (key === 'id') {
                newShowData['show_id'] = selectedShow['id'];
            }
        }
        setShowData(newShowData);
    };

    // Navigate to watch page (for edit mode)
    const navigateToContent = () => {
        if (type === 'movie' && movieData.id) {
            navigate(`/watch/m-${movieData.id}`);
        } else if (type === 'tv_show' && showData.show_id) {
            navigate(`/watch/t-${showData.show_id}-1-1`);
        }
    };

    // Cleanup when component unmounts or modal closes
    useEffect(() => {
        return () => {
            // Cleanup any object URLs when component unmounts
            if (videoPreviewUrl) {
                URL.revokeObjectURL(videoPreviewUrl);
            }
            Object.values(episodePreviews).forEach(url => {
                URL.revokeObjectURL(url);
            });
        };
    }, []);

    // Close modal when not visible (unless upload is in progress)
    useEffect(() => {
        if (!isVisible && !saveLoading) {
            // Reset form state when modal closes
            setProgress(0);
            setRemainingTime(0);
            setUploadSpeed(0);
        }
    }, [isVisible, saveLoading]);

    // Handle escape key and click outside
    useEffect(() => {
        const handleEscapeKey = (event) => {
            if (!saveLoading && event.key === 'Escape') {
                onClose();
            }
        };
    
        const handleClickOutside = (event) => {
            if (!saveLoading && event.target.classList.contains('modal')) {
                onClose();
            }
        };
    
        document.addEventListener('keydown', handleEscapeKey);
        document.addEventListener('mousedown', handleClickOutside);
    
        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [saveLoading, onClose]);

    // Before unload handling
    const onBeforeUnload = (event) => {
        if (saveLoading) {
          event.preventDefault();
          event.returnValue = 'Are you sure you want to leave? Your upload is in progress.';
          return 'Are you sure you want to leave? Your upload is in progress.';
        }
    };

    useEffect(() => {
        window.addEventListener('beforeunload', onBeforeUnload);

        return () => {
          window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [saveLoading]);

    const handleCloseForm = () => {
        if (!saveLoading) {
            onClose();
        }
    };

    const fixReleaseDateFormat = (date) => {
        if (!date) return "";
        const time_split = date.split('T');
        const [year, month, day] = time_split[0].split('-');
        return `${year}-${month}-${day}`;
    };

    const initializeMovieForm = () => {
        const newMovieData = { ...movieData };
        
        // Map prefilled data to movie form fields
        newMovieData.id = prefilledData.id || '';
        newMovieData.title = prefilledData.title || '';
        newMovieData.overview = prefilledData.overview || '';
        newMovieData.tagline = prefilledData.tagline || '';
        newMovieData.release_date = prefilledData.release_date ? fixReleaseDateFormat(prefilledData.release_date) : '';
        newMovieData.vote_average = prefilledData.vote_average || '';
        newMovieData.genres = Array.isArray(prefilledData.genres) ? prefilledData.genres.join(', ') : (prefilledData.genres || '');
        newMovieData.keywords = prefilledData.keywords || '';
        newMovieData.poster_path = prefilledData.poster_path || '';
        newMovieData.backdrop_path = prefilledData.backdrop_path || '';
        newMovieData.runtime = prefilledData.runtime || '';
        newMovieData.production_companies = prefilledData.production_companies || '';
        newMovieData.production_countries = prefilledData.production_countries || '';
        newMovieData.spoken_languages = prefilledData.spoken_languages || '';
        newMovieData.budget = prefilledData.budget || '';
        newMovieData.revenue = prefilledData.revenue || '';
        newMovieData.status = prefilledData.status || '';
        newMovieData.has_subtitles = prefilledData.has_subtitles || false;
        newMovieData.vid_movie = prefilledData.vid_movie || null;

        // If a file was pre-filled, create a preview URL
        if (prefilledData.vid_movie) {
            const url = URL.createObjectURL(prefilledData.vid_movie);
            setVideoPreviewUrl(url);
        }

        setMovieData(newMovieData);
        validateForm(newMovieData, true);
    };

    const initializeTVShowForm = () => {
        const newShowData = { ...showData };
        console.log('Initializing TV Show Form with prefilledData:', prefilledData);
        console.log('Initializing TV Show Form with newShowData:', newShowData);
        
        // Map prefilled data to show form fields
        newShowData.show_id = prefilledData.show_id || prefilledData.id || '';
        newShowData.title = prefilledData.title || prefilledData.name || '';
        newShowData.overview = prefilledData.overview || '';
        newShowData.tagline = prefilledData.tagline || '';
        newShowData.first_air_date = prefilledData.first_air_date ? fixReleaseDateFormat(prefilledData.first_air_date) : '';
        newShowData.last_air_date = prefilledData.last_air_date ? fixReleaseDateFormat(prefilledData.last_air_date) : '';
        newShowData.vote_average = prefilledData.vote_average || '';
        newShowData.genres = Array.isArray(prefilledData.genres) ? prefilledData.genres.join(', ') : (prefilledData.genres || '');
        newShowData.created_by = prefilledData.created_by || '';
        newShowData.poster_path = prefilledData.poster_path || '';
        newShowData.backdrop_path = prefilledData.backdrop_path || '';
        newShowData.production_companies = prefilledData.production_companies || '';
        newShowData.production_countries = prefilledData.production_countries || '';
        newShowData.spoken_languages = prefilledData.spoken_languages || '';
        newShowData.networks = prefilledData.networks || '';
        newShowData.status = prefilledData.status || '';

        // Initialize seasons from episodes
        if (prefilledData.seasons && Array.isArray(prefilledData.seasons)) {
            console.log("initializing seasons: ", prefilledData.seasons);
            
            const newEpisodePreviews = {};
            
            newShowData.seasons = prefilledData.seasons.map(season => ({
                seasonNumber: season.seasonNumber,
                episodes: season.episodes.map(episode => {
                    // If episode has a videoFile, create preview URL
                    if (episode.videoFile) {
                        const episodeKey = `S${season.seasonNumber}E${episode.episodeNumber}`;
                        const url = URL.createObjectURL(episode.videoFile);
                        newEpisodePreviews[episodeKey] = url;
                    }
                    
                    return {
                        episodeNumber: episode.episodeNumber,
                        title: episode.title || `Episode ${episode.episodeNumber}`,
                        overview: episode.overview || '',
                        has_subtitles: episode.has_subtitles || false,
                        force: episode.force || false,
                        videoFile: episode.videoFile || null,
                        filename: episode.filename || '' // Add filename reference
                    };
                })
            }));
            
            // Set episode previews if any files were pre-filled
            if (Object.keys(newEpisodePreviews).length > 0) {
                setEpisodePreviews(newEpisodePreviews);
            }
        } else if (prefilledData.episodes && typeof prefilledData.episodes === 'object') {
            // Handle episodes object format like {"1": [episode1, episode2], "2": [episode3]}
            console.log("Processing episodes object format:", prefilledData.episodes);
            const seasonsMap = {};
            
            Object.entries(prefilledData.episodes).forEach(([seasonNumber, episodes]) => {
                const seasonNum = parseInt(seasonNumber);
                seasonsMap[seasonNum] = {
                    seasonNumber: seasonNum,
                    episodes: episodes.map(ep => ({
                        episodeNumber: ep.episode,
                        title: ep.title || `Episode ${ep.episode}`,
                        overview: ep.overview || '',
                        has_subtitles: ep.has_subtitles || false,
                        force: false,
                        videoFile: ep.videoFile || null, // Handle pre-filled video files
                        filename: ep.filename || '' // Store filename for reference
                    }))
                };
            });
            
            newShowData.seasons = Object.values(seasonsMap).sort((a, b) => a.seasonNumber - b.seasonNumber);
        } else if (prefilledData.episodes && Array.isArray(prefilledData.episodes)) {
            // Handle array format for backward compatibility
            const seasonsMap = {};
            prefilledData.episodes.forEach(ep => {
                if (!seasonsMap[ep.season]) {
                    seasonsMap[ep.season] = {
                        seasonNumber: ep.season,
                        episodes: []
                    };
                }
                seasonsMap[ep.season].episodes.push({
                    episodeNumber: ep.episode,
                    title: ep.title || `Episode ${ep.episode}`,
                    overview: ep.overview || '',
                    has_subtitles: ep.has_subtitles || false,
                    force: false,
                    videoFile: ep.file || null,
                    filename: ep.filename || ''
                });
            });
            newShowData.seasons = Object.values(seasonsMap).sort((a, b) => a.seasonNumber - b.seasonNumber);
        } else {
            // Fallback: create a default season with one episode
            newShowData.seasons = [{
                seasonNumber: 1,
                episodes: [{
                    episodeNumber: 1,
                    title: 'Episode 1',
                    overview: '',
                    has_subtitles: false,
                    force: false,
                    videoFile: null,
                    filename: ''
                }]
            }];
        }

        console.log('Initialized seasons:', newShowData.seasons);
        setShowData(newShowData);
        validateForm(newShowData, true);
    };

    // Validation functions (from MovieModal)
    function validateDuplicates(value, fieldName) {
        if (value !== null && value !== undefined) {
            const array = value.split(",").map(item => item.trim());
            const uniqueList = new Set(array);
            if (uniqueList.size !== array.length) {
                return `No duplicate ${fieldName} allowed`;
            }
        }
        return null;
    }

    const validateInputs = async (name, value, only_valid=false) => {
        let errorMessage = '';
        let successMessage = '';
        
        const fieldsToValidate = {
            production_countries: true,
            production_companies: true,
            spoken_languages: true,
            keywords: true,
            tagline: true,
            genres: true,
        };

        if (name in fieldsToValidate) {
            const tempErrorMessage = validateDuplicates(value, name);
            if (tempErrorMessage) {
                errorMessage = validateDuplicates(value, name);
            }
        }

        switch (name) {
            case "id":
            case "show_id":
                if (!value) errorMessage = 'ID cannot be empty';
                break;
            case "title":
                if (!value || value.length < 3) successMessage = 'Title should be at least 3 characters';
                break;
            case "overview":
                if (!value || value.length < 3) errorMessage = 'Overview should be at least 3 characters';
                break;
            case "release_date":
            case "first_air_date":
                if (!value) errorMessage = 'Date cannot be empty';
                break;
            case "vote_average":
                if (!value) errorMessage = 'Vote Average cannot be empty';
                break;
            case "runtime":
                if (!value) errorMessage = 'Runtime cannot be empty';
                break;
            case "genres":
                if (value !== null && value !== undefined) {
                    const genresArray = value.split(",").map(genre => genre.trim());
                    if (genresArray.length === 0 || (genresArray.length === 1 && genresArray[0].trim() === '')) {
                        errorMessage = 'Genres cannot be empty';
                    }
                }
                break;
            case "backdrop_path":
            case "poster_path":
                if (!value || !value.startsWith('/') || !/\.jpg$/.test(value)) {
                    errorMessage = `${name} Path should start with "/" and end with .jpg`;
                } else {
                    try {
                        const url = `${API_URL}/cdn/images${value}/check`;
                        const res = await fetch(url);
                        const json = await res.json();
                        if (json.exist) {
                            successMessage = `${name} Image Exist`;
                        } else {
                            errorMessage = `${name} Image not Exist`;
                        }
                    } catch (error) {
                        errorMessage = `Error checking ${name}`;
                    }
                }
                break;
            default:
                break;
        }

        if (type === 'movie') {
            setInputSuccess((prevSuccess) => ({
                ...prevSuccess,
                [name]: successMessage
            }));
            setInputErrors((prevErrors) => ({
                ...prevErrors,
                [name]: errorMessage
            }));
        } else {
            setSuccess((prevSuccess) => ({
                ...prevSuccess,
                [name]: successMessage
            }));
            setErrors((prevErrors) => ({
                ...prevErrors,
                [name]: errorMessage
            }));
        }

        return { isValid: errorMessage === '', error: errorMessage, success: successMessage };
    };

    const validateForm = async (data, only_valid=false) => {
        let FormIsValid = true;
        for (const key in data) {
            const validationResult = await validateInputs(key, data[key], only_valid);
            if (!validationResult.isValid) {
                FormIsValid = false;
            }
        }
        return FormIsValid;
    };

    const handleChange = (e) => {
        const { name, value, type: inputType, checked } = e.target;
        validateInputs(name, value, true);
        
        if (type === 'movie') {
            setMovieData((prev) => ({
                ...prev,
                [name]: inputType === 'checkbox' ? checked : value
            }));
        } else {
            setShowData((prev) => ({
                ...prev,
                [name]: inputType === 'checkbox' ? checked : value
            }));
        }
    };

    // TV Show specific handlers
    const handleSeasonChange = (index, field, value) => {
        const newSeasons = [...showData.seasons];
        newSeasons[index][field] = value;
        setShowData({
            ...showData,
            seasons: newSeasons
        });
    };

    const deleteSeason = (index) => {
        const newSeasons = showData.seasons.filter((_, i) => i !== index);
        setShowData({
            ...showData,
            seasons: newSeasons
        });
    };

    const handleEpisodeChange = (seasonIndex, episodeIndex, field, value) => {
        const newSeasons = [...showData.seasons];
        newSeasons[seasonIndex].episodes[episodeIndex][field] = value;
        setShowData({
            ...showData,
            seasons: newSeasons
        });
    };

    const deleteEpisode = (seasonIndex, episodeIndex) => {
        const newSeasons = [...showData.seasons];
        newSeasons[seasonIndex].episodes = newSeasons[seasonIndex].episodes.filter((_, i) => i !== episodeIndex);
        setShowData({
            ...showData,
            seasons: newSeasons
        });
    };

    const moveEpisodeUp = (seasonIndex, episodeIndex) => {
        if (episodeIndex > 0) {
            const newSeasons = [...showData.seasons];
            const episodes = newSeasons[seasonIndex].episodes;
            [episodes[episodeIndex], episodes[episodeIndex - 1]] = [episodes[episodeIndex - 1], episodes[episodeIndex]];
            setShowData({
                ...showData,
                seasons: newSeasons
            });
        }
    };

    const moveEpisodeDown = (seasonIndex, episodeIndex) => {
        const newSeasons = [...showData.seasons];
        const episodes = newSeasons[seasonIndex].episodes;
        if (episodeIndex < episodes.length - 1) {
            [episodes[episodeIndex], episodes[episodeIndex + 1]] = [episodes[episodeIndex + 1], episodes[episodeIndex]];
            setShowData({
                ...showData,
                seasons: newSeasons
            });
        }
    };

    const addSeason = () => {
        const newSeasonNumber = showData.seasons.length > 0 
            ? Math.max(...showData.seasons.map(s => s.seasonNumber)) + 1 
            : 1;
        
        setShowData({
            ...showData,
            seasons: [...showData.seasons, {
                seasonNumber: newSeasonNumber,
                episodes: [{
                    episodeNumber: 1,
                    title: '',
                    overview: '',
                    has_subtitles: false,
                    force: false,
                    videoFile: null
                }]
            }]
        });
    };

    const formatEstimatedTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        const minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        return `${hours ? `${hours} hour${hours > 1 ? 's' : ''} `: ''} ${minutes ? `${minutes} minute${minutes > 1 ? 's' : ''} and` : ''} ${Math.round(seconds)} second${seconds === 1 ? '' : 's'}`;
    };

    const addEpisode = (seasonIndex) => {
        const newSeasons = [...showData.seasons];
        const season = newSeasons[seasonIndex];
        const newEpisodeNumber = season.episodes.length > 0 
            ? Math.max(...season.episodes.map(e => e.episodeNumber)) + 1 
            : 1;
        
        season.episodes.push({
            episodeNumber: newEpisodeNumber,
            title: '',
            overview: '',
            has_subtitles: false,
            force: false,
            videoFile: null
        });
        
        setShowData({
            ...showData,
            seasons: newSeasons
        });
    };


    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaveLoading(true);
        setProgress(0);
    
        try {
            const formData = new FormData();
            let isValid = false;
    
            if (type === 'movie') {
                isValid = await validateForm(movieData);
                if (!isValid) {
                    notification.error({
                        message: 'Validation Error',
                        description: 'Please fix the form errors before submitting.',
                    });
                    setSaveLoading(false);
                    return;
                }
    
                // Add movie data to formData
                Object.keys(movieData).forEach(key => {
                    if (key === 'vid_movie' && movieData[key]) {
                        formData.append('vid_movie', movieData[key]);
                    } else if (movieData[key] !== null && movieData[key] !== '') {
                        formData.append(key, movieData[key]);
                    }
                });

                // Pre-upload validation (only for new uploads)
                if (!isEdit) {
                    const validationResult = await validateUpload('movie', movieData.id, null, movieData);
                    if (validationResult && !validationResult.can_upload) {
                        const errorMessages = validationResult.errors.map(error => error.message).join('\n');
                        notification.error({
                            message: 'Upload Blocked',
                            description: errorMessages,
                            duration: 8,
                        });
                        setSaveLoading(false);
                        return;
                    }
                    if (validationResult && validationResult.warnings && validationResult.warnings.length > 0) {
                        const warningMessages = validationResult.warnings.map(warning => warning.message).join('\n');
                        notification.warning({
                            message: 'Upload Warnings',
                            description: warningMessages,
                        });
                    }
                }

                // Use XHR for better progress tracking
                const method = isEdit ? 'PUT' : 'POST';
                const url = isEdit ? `${API_URL}/api/upload/movie/${movieData.id}` : `${API_URL}/api/upload/movie`;

                const xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                let startTime = Date.now();

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const progress = Math.round((event.loaded / event.total) * 100);
                        setProgress(progress);
                        const elapsedTime = (Date.now() - startTime) / 1000;
                        const uploadSpeed = event.loaded / elapsedTime;
                        setUploadSpeed((uploadSpeed / 1024 / 1024).toFixed(2));
                        const remainingSize = event.total - event.loaded;
                        const estimatedTime = remainingSize / uploadSpeed;
                        setRemainingTime(formatEstimatedTime(estimatedTime.toFixed(2)));
                        setUploadedSize(event.loaded);
                    }
                };

                xhr.onload = function() {
                    const json = JSON.parse(xhr.responseText);
                    if (xhr.status === 200 || xhr.status === 201) {
                        notification.success({message: json.message, duration: 0});
                        if (onSuccess) onSuccess();
                        if (refresh) refresh();
                        onClose();
                    } else {
                        notification.error({message: json.message, duration: 0});
                    }
                    setSaveLoading(false);
                };

                xhr.onerror = function() {
                    notification.error({message: 'An error occurred during upload', duration: 0});
                    setSaveLoading(false);
                };

                xhr.onabort = () => {
                    notification.info({message: 'Upload canceled.'});
                    setSaveLoading(false);
                };

                xhr.send(formData);

            } else {
                // TV Show validation and formData preparation
                let hasFiles = false;
                let hasEpisodes = false;
                
                showData.seasons.forEach((season) => {
                    season.episodes.forEach((episode) => {
                        hasEpisodes = true;
                        // Check for either uploaded video files OR pre-filled filenames OR existing episodes on server
                        const episodeExistsOnServer = episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists;
                        if (episode.videoFile || (episode.filename && episode.filename.trim() !== '') || episodeExistsOnServer) {
                            hasFiles = true;
                            if (episode.videoFile) {
                                formData.append(`video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`, episode.videoFile);
                            }
                        }
                    });
                });
    
                // For edit mode, we don't require files if episodes already exist
                if (!hasFiles && !isEdit) {
                    notification.error({
                        message: 'Upload Error',
                        description: 'Please select at least one video file or ensure pre-filled data contains valid filenames.',
                    });
                    setSaveLoading(false);
                    return;
                }

                if (!hasEpisodes) {
                    notification.error({
                        message: 'Validation Error',
                        description: 'At least one season with one episode is required.',
                    });
                    setSaveLoading(false);
                    return;
                }
    
                // Add show data to formData
                Object.keys(showData).forEach(key => {
                    if (key !== 'seasons' && showData[key] !== null && showData[key] !== '') {
                        formData.append(key, showData[key]);
                    }
                });
    
                // Add seasons data
                const seasonsData = showData.seasons.map(season => ({
                    season_number: season.seasonNumber,
                    episodes: season.episodes.map(episode => ({
                        episode_number: episode.episodeNumber,
                        title: episode.title,
                        overview: episode.overview,
                        has_subtitles: episode.has_subtitles,
                        force: episode.force,
                        filename: episode.filename // Include filename for pre-filled data
                    }))
                }));
                
                formData.append('seasons', JSON.stringify(seasonsData));

                // Pre-upload validation (only for new uploads)
                if (!isEdit && showData.show_id) {
                    const episodes = [];
                    showData.seasons.forEach(season => {
                        season.episodes.forEach(episode => {
                            if (episode.videoFile || episode.filename) {
                                episodes.push({
                                    season_number: season.seasonNumber,
                                    episode_number: episode.episodeNumber
                                });
                            }
                        });
                    });
                    const validationResult = await validateUpload('tv', showData.show_id, episodes, showData);
                    
                    if (validationResult && !validationResult.can_upload) {
                        const errorMessages = validationResult.errors.map(error => error.message).join('\n');
                        notification.error({
                            message: 'Upload Blocked',
                            description: errorMessages,
                            duration: 8,
                        });
                        setSaveLoading(false);
                        return;
                    }
                    if (validationResult && validationResult.warnings && validationResult.warnings.length > 0) {
                        const warningMessages = validationResult.warnings.map(warning => warning.message).join('\n');
                        notification.warning({
                            message: 'Upload Warnings',
                            description: warningMessages,
                        });
                    }
                }

                // Use XHR for better progress tracking
                const method = isEdit ? 'PUT' : 'POST';
                const url = isEdit ? `${API_URL}/api/upload/show/${showData.show_id}` : `${API_URL}/api/upload/show`;

                const xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);

                let startTime = Date.now();
                setTimeStart(startTime);

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        const progress = Math.round((event.loaded / event.total) * 100);
                        setProgress(progress);
                        const elapsedTime = (Date.now() - startTime) / 1000;
                        const uploadSpeed = event.loaded / elapsedTime;
                        setUploadSpeed((uploadSpeed / 1024 / 1024).toFixed(2));
                        const remainingSize = event.total - event.loaded;
                        const estimatedTime = remainingSize / uploadSpeed;
                        setRemainingTime(formatEstimatedTime(estimatedTime.toFixed(2)));
                        setUploadedSize(event.loaded);
                    }
                };

                xhr.onload = function() {
                    const json = JSON.parse(xhr.responseText);
                    if (xhr.status === 200 || xhr.status === 201) {
                        notification.success({message: json.message, duration: 0});
                        if (onSuccess) onSuccess();
                        if (refresh) refresh();
                        onClose();
                    } else {
                        notification.error({message: json.message, duration: 0});
                    }
                    setSaveLoading(false);
                };

                xhr.onerror = function() {
                    notification.error({message: 'An error occurred during upload', duration: 0});
                    setSaveLoading(false);
                };

                xhr.onabort = () => {
                    notification.info({message: 'Upload canceled.'});
                    setSaveLoading(false);
                };

                xhr.send(formData);
            }
        } catch (error) {
            notification.error({
                message: 'Error',
                description: error.message,
            });
            setSaveLoading(false);
        }
    };

    // Loading state while fetching data
    if (fetchLoading) {
        return (
            <div className={`modal`} id="unifiedModal">
                <div className={`modal-content`}>
                    <div className="spinner-container" style={{display:"flex"}}>
                        <div className="spinner-border"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!isVisible) return null;

    return (
        <div className={`modal`} id="unifiedModal">
            <div className={`modal-content`} id="modal-content" ref={modalContentRef}>
                <div className='header' style={{ width: '100%', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '50px', marginBottom: 10, marginTop: 10 }}>
                    <h1 style={{paddingBottom: 10, paddingLeft: 10}}>{isEdit ? "Edit" : "Upload"} {type === 'movie' ? 'Movie' : 'TV Show'}</h1>
                    {/* Play button for edit mode when video exists */}
                    {type === 'movie' && vidExist.exist && isEdit && (
                        <button className='banner_play_button' style={{marginBottom: 12, marginLeft: 10}} onClick={navigateToContent}>
                            <FaPlay style={{fontSize:20, paddingRight:'0px'}}/>Play
                        </button>
                    )}
                    <span className="closeButton" onClick={handleCloseForm} style={{ position: 'absolute', top: '0', right: '0', margin: '10px' }}><CloseOutlined /></span>
                </div>

                <form required className="upload__form">
                    {/* AutoComplete search for new uploads */}
                    {fetchType === 'new' && type === 'movie' && (
                        <AutoComplete
                            style={{
                                width: "80%",
                                placeholderColor: '#1890ff',
                                paddingLeft: 16,
                                marginBottom: 16
                            }}
                            options={suggestions}
                            loading={loadingSearch}
                            onSearch={fetchMoviesForSearch}
                            onSelect={handleMovieSearchSelect}
                            placeholder="Search for movies from CDN"
                        />
                    )}
                    {fetchType === 'new' && type === 'tv_show' && (
                        <AutoComplete
                            style={{
                                width: "80%",
                                placeholderColor: '#1890ff',
                                paddingLeft: 16,
                                marginBottom: 16
                            }}
                            options={suggestions}
                            loading={loadingSearch}
                            onSearch={fetchShowsForSearch}
                            onSelect={handleShowSearchSelect}
                            placeholder="Search for shows from CDN"
                        />
                    )}
                    
                    {type === 'movie' ? (
                        <>
                            <FormGroup label="Movie ID" name="id" type="number" value={movieData.id} onChange={handleChange} error={inputErrors} success={inputSuccess} required disabled={contentId !== undefined} />
                            <FormGroup label="Movie Title" name="title" value={movieData.title} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                            <TextareaFormGroup label="Movie Overview" name="overview" value={movieData.overview} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                            <FormGroup label="Movie Tagline" name="tagline" value={movieData.tagline} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Movie Release Date" type="date" name="release_date" value={movieData.release_date} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                            <FormGroup label="Movie Vote average" type="number" step={0.1} name="vote_average" value={movieData.vote_average} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                            <FormGroup label="Movie Genres (separated by ', ')" name="genres" value={movieData.genres} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                            <FormGroup label="Movie Keywords (separated by ', ')" name="keywords" value={movieData.keywords} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Movie poster path" name="poster_path" value={movieData.poster_path} onChange={handleChange} error={inputErrors} success={inputSuccess} required btnText={showPoster ? "Hide Image" : "Show Image"} btnOnClick={(e) => setShowPoster(!showPoster)} showBtn={inputSuccess.poster_path}/>
                            {showPoster && (
                                <Image
                                    src={`${API_URL}/cdn/images${movieData.poster_path}`}
                                    alt="Movie Poster"
                                    style={{marginBottom: 10, borderRadius: 10, height: 400}}
                                    preview={{
                                        mask: "Click to preview"
                                    }}
                                />
                            )}
                            <FormGroup label="Movie backdrop path" name="backdrop_path" value={movieData.backdrop_path} onChange={handleChange} error={inputErrors} success={inputSuccess} required btnText={showBackdrop ? "Hide Image" : "Show Image"} btnOnClick={(e) => setShowBackdrop(!showBackdrop)} showBtn={inputSuccess.backdrop_path} />
                            {showBackdrop && (
                                <Image
                                    src={`${API_URL}/cdn/images${movieData.backdrop_path}`}
                                    alt="Movie Backdrop"
                                    style={{marginBottom: 10, borderRadius: 10}}
                                    preview={{
                                        mask: "Click to preview"
                                    }}
                                />
                            )}
                            <FormGroup label="Movie runtime" name="runtime" type="number" value={movieData.runtime} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                            <FormGroup label="Production Countries (separated by ', ')" name="production_countries" value={movieData.production_countries} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Production Companies (separated by ', ')" name="production_companies" value={movieData.production_companies} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Movie spoken languages (separated by ', ')" name="spoken_languages" value={movieData.spoken_languages} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Budget" type="number" name="budget" value={movieData.budget} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Revenue" type="number" name="revenue" value={movieData.revenue} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            <FormGroup label="Status" name="status" value={movieData.status} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                            
                            <div className="form-group checkbox">
                                <label htmlFor="has_subtitles">Has Subtitles:</label>
                                <input
                                    type={"checkbox"}
                                    id="has_subtitles"
                                    name="has_subtitles"
                                    checked={movieData.has_subtitles}
                                    onChange={(e) => handleChange(e)}
                                />
                            </div>
                            <div className="form-group checkbox">
                                <label htmlFor="in_production">In Production:</label>
                                <input
                                    type={"checkbox"}
                                    id="in_production"
                                    className="form-group-checkbox"
                                    name="in_production"
                                    value={movieData.in_production}
                                    checked={movieData.in_production}
                                    onChange={(e) => handleChange(e)}
                                />
                            </div>
                            <div className="form-group checkbox">
                                <label htmlFor="force">Force Overwrite:</label>
                                <input
                                    type={"checkbox"}
                                    id="force"
                                    className="form-group-checkbox"
                                    name="force"
                                    value={movieData.force}
                                    checked={movieData.force}
                                    onChange={(e) => handleChange(e)}
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="vid_movie">Upload File:</label>
                                {/* Show upload only if force is enabled, it's a new upload, or video doesn't exist */}
                                {(movieData.force === true || fetchType === 'new' || !vidExist.exist) && (
                                    <Upload
                                        id="vid_movie"
                                        name="vid_movie"
                                        fileList={movieData.vid_movie ? [{
                                            uid: '-1',
                                            name: movieData.vid_movie.name,
                                            status: 'done',
                                        }] : []}
                                        beforeUpload={(file, fileList) => {
                                            setMovieData({
                                                ...movieData,
                                                vid_movie: file
                                            });
                                            const url = URL.createObjectURL(file);
                                            setVideoPreviewUrl(url);
                                            return false;
                                        }}
                                        onRemove={(file) => {
                                            setVideoPreviewUrl(null);
                                            setMovieData({
                                                ...movieData,
                                                vid_movie: null
                                            });
                                        }}
                                    >
                                        <Button id="vid_movie" icon={<UploadOutlined />}>
                                            {movieData.vid_movie ? 'Change Video File' : 'Upload a video'}
                                        </Button>
                                    </Upload>
                                )}
                                {/* Video existence message */}
                                {vidExist.message && (movieData.force !== true || !vidExist.exist) && (
                                    <Alert
                                        closable={true}
                                        message={vidExist.message}
                                        type={vidExist.exist ? 'success' : 'error'}
                                        style={{marginTop: '10px'}}
                                    />
                                )}
                            </div>
                        </>
                    ) : (
                        <>
                            <FormGroup label="Show ID" name="show_id" type="number" value={showData.show_id} onChange={handleChange} error={errors} success={success} required disabled={contentId !== undefined} />
                            <FormGroup label="Show Title" name="title" value={showData.title} onChange={handleChange} error={errors} success={success} required />
                            <TextareaFormGroup label="Show Overview" name="overview" value={showData.overview} onChange={handleChange} error={errors} success={success} required />
                            <FormGroup label="Show Tagline" name="tagline" value={showData.tagline} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="First Air Date" type="date" name="first_air_date" value={showData.first_air_date} onChange={handleChange} error={errors} success={success} required />
                            <FormGroup label="Last Air Date" type="date" name="last_air_date" value={showData.last_air_date} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="Show Vote average" type="number" step={0.1} name="vote_average" value={showData.vote_average} onChange={handleChange} error={errors} success={success} required />
                            <FormGroup label="Show Genres (separated by ', ')" name="genres" value={showData.genres} onChange={handleChange} error={errors} success={success} required />
                            <FormGroup label="Created By" name="created_by" value={showData.created_by} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="Show poster path" name="poster_path" value={showData.poster_path} onChange={handleChange} error={errors} success={success} required btnText={showPoster ? "Hide Image" : "Show Image"} btnOnClick={(e) => setShowPoster(!showPoster)} showBtn={success.poster_path}/>
                            {showPoster && (
                                <Image
                                    src={`${API_URL}/cdn/images${showData.poster_path}`}
                                    alt="Show Poster"
                                    style={{marginBottom: 10, borderRadius: 10, height: 400}}
                                    preview={{
                                        mask: "Click to preview"
                                    }}
                                />
                            )}
                            <FormGroup label="Show backdrop path" name="backdrop_path" value={showData.backdrop_path} onChange={handleChange} error={errors} success={success} required btnText={showBackdrop ? "Hide Image" : "Show Image"} btnOnClick={(e) => setShowBackdrop(!showBackdrop)} showBtn={success.backdrop_path} />
                            {showBackdrop && (
                                <Image
                                    src={`${API_URL}/cdn/images${showData.backdrop_path}`}
                                    alt="Show Backdrop"
                                    style={{marginBottom: 10, borderRadius: 10}}
                                    preview={{
                                        mask: "Click to preview"
                                    }}
                                />
                            )}
                            <FormGroup label="Production Countries (separated by ', ')" name="production_countries" value={showData.production_countries} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="Production Companies (separated by ', ')" name="production_companies" value={showData.production_companies} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="Show spoken languages (separated by ', ')" name="spoken_languages" value={showData.spoken_languages} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="Networks" name="networks" value={showData.networks} onChange={handleChange} error={errors} success={success} />
                            <FormGroup label="Status" name="status" value={showData.status} onChange={handleChange} error={errors} success={success} />

                            {showData.seasons.length !== 0 ? (<div className="divider"/>) : (
                                <Flex gap={5} align="center">
                                    <div className="divider"/>
                                    <Button type="dashed" onClick={addSeason}>
                                        Add Season
                                    </Button>
                                    <div className="divider"/>
                                </Flex>
                            )}
                            {showData.seasons.map((season, seasonIndex) => (
                                <div key={seasonIndex} ref={seasonIndex === showData.seasons.length - 1 ? seasonRef : null}>
                                    <Flex gap={10}>
                                        <FormGroup
                                            label={`Season Number`}
                                            name={`S${seasonIndex + 1}-seasonNumber`}
                                            type="number"
                                            value={season.seasonNumber}
                                            onChange={(e) => handleSeasonChange(seasonIndex, 'seasonNumber', e.target.value)}
                                            error={errors}
                                            success={success}
                                            disabled
                                            required
                                        />
                                        {showData.seasons.length !== 0 && (
                                            <Button danger style={{height: 45}} onClick={() => deleteSeason(seasonIndex)}>
                                                Delete Season
                                            </Button>
                                        )}
                                    </Flex>
                                    {season.episodes.length !== 0 ? (<Flex style={{marginLeft: '25%'}}><div className="divider" /></Flex>) : (
                                        <Flex gap={5} style={{marginLeft: '25%'}} align="center">
                                            <div className="divider" />
                                            <Button type="default" onClick={() => addEpisode(seasonIndex)}>
                                                Add Episode
                                            </Button>
                                            <div className="divider" />
                                        </Flex>
                                    )}
                                    {season.episodes.map((episode, episodeIndex) => (
                                        <div key={episodeIndex} className="modal_show_episode_list" ref={episodeIndex === season.episodes.length - 1 ? episodeRef : null}>
                                            <Flex gap={5}>
                                                <Flex gap={2}>
                                                    <Flex align="center" style={{flexDirection: 'column', height:45}}>
                                                        {episodeIndex > 0 && (
                                                            <Tooltip title="Swap Up">
                                                                <Button type="dashed" style={{width: 10, height: 45}} onClick={() => moveEpisodeUp(seasonIndex, episodeIndex)}>
                                                                    <ArrowUpOutlined style={{fontSize:12}}/>
                                                                </Button>
                                                            </Tooltip>
                                                        )}
                                                        {episodeIndex < season.episodes.length - 1 && (
                                                            <Tooltip title="Swap Down">
                                                                <Button type="dashed" style={{width: 10, height: 45}} onClick={() => moveEpisodeDown(seasonIndex, episodeIndex)}>
                                                                    <ArrowDownOutlined style={{fontSize:12}}/>
                                                                </Button>
                                                            </Tooltip>
                                                        )}
                                                    </Flex>
                                                    <Button danger style={{height: 45}} onClick={() => deleteEpisode(seasonIndex, episodeIndex)}>
                                                        Delete Episode
                                                    </Button>
                                                </Flex>
                                                <FormGroup
                                                    label={`Episode Number`}
                                                    name={`S${seasonIndex + 1}-episodeNumber`}
                                                    type="number"
                                                    value={episode.episodeNumber}
                                                    onChange={(e) => handleSeasonChange(seasonIndex, 'seasonNumber', e.target.value)}
                                                    error={errors}
                                                    success={success}
                                                    disabled
                                                    required
                                                />
                                            </Flex>
                                            <FormGroup
                                                label={`Episode ${episode.episodeNumber} Title`}
                                                name={`S${seasonIndex + 1}E${episode.episodeNumber}-title`}
                                                value={episode.title}
                                                onChange={(e) => handleEpisodeChange(seasonIndex, episodeIndex, 'title', e.target.value)}
                                                error={errors}
                                                success={success}
                                                required
                                            />
                                            <TextareaFormGroup 
                                                label={`Episode ${episode.episodeNumber} Overview`}
                                                name={`S${seasonIndex + 1}E${episode.episodeNumber}-overview`}
                                                value={episode.overview}
                                                onChange={(e) => handleEpisodeChange(seasonIndex, episodeIndex, 'overview', e.target.value)}
                                                error={errors}
                                                success={success}
                                                maxLength={300}
                                                required
                                            />
                                            <div className="form-group">
                                                <label htmlFor={`video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`}>
                                                    {`Episode ${episode.episodeNumber} File`} <span style={{fontSize: "1.1rem", color: 'gold', marginLeft: 5, cursor: 'help'}}>*</span>
                                                </label>
                                                
                                                {/* Episode existence message for edit mode */}
                                                {episodeExists?.episodes && 
                                                episodeExists.episodes[season.seasonNumber] && 
                                                episodeExists.episodes[season.seasonNumber][episode.episodeNumber] && 
                                                !episode.force && (
                                                    <Alert
                                                        closable={true}
                                                        message={episodeExists.episodes[season.seasonNumber][episode.episodeNumber].message}
                                                        type={episodeExists.episodes[season.seasonNumber][episode.episodeNumber].exists ? 'success' : 'error'}
                                                        style={{marginBottom: '10px'}}
                                                    />
                                                )}
                                                
                                                {/* Display expected filename if available */}
                                                {episode.filename && (
                                                    <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: '#2a304d', borderRadius: '4px', fontSize: '12px', color: '#a0a0a0' }}>
                                                        <strong>Expected file:</strong> {episode.filename}
                                                    </div>
                                                )}
                                                
                                                {/* Force upload checkbox */}
                                                <div className="form-group checkbox" style={{marginBottom: '10px'}}>
                                                    <label htmlFor={`S${season.seasonNumber}E${episode.episodeNumber}-force`}>Force Overwrite:</label>
                                                    <input
                                                        type="checkbox"
                                                        id={`S${season.seasonNumber}E${episode.episodeNumber}-force`}
                                                        name={`S${season.seasonNumber}E${episode.episodeNumber}-force`}
                                                        checked={episode.force || false}
                                                        onChange={(e) => handleEpisodeChange(seasonIndex, episodeIndex, 'force', e.target.checked)}
                                                    />
                                                </div>
                                                
                                                {/* Show upload only if force is enabled or episode doesn't exist */}
                                                {(episode.force === true || 
                                                !episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists) && (
                                                <Upload
                                                    id={`video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`}
                                                    name={`video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`}
                                                    fileList={episode.videoFile ? [{
                                                        uid: `${season.seasonNumber}-${episode.episodeNumber}`,
                                                        name: episode.videoFile.name,
                                                        status: 'done',
                                                    }] : []}
                                                    beforeUpload={(file, fileList) => {
                                                        console.log(`File selected for S${season.seasonNumber}E${episode.episodeNumber}:`, file);
                                                        
                                                        // Update episode file in state
                                                        const seasons = [...showData.seasons];
                                                        seasons[seasonIndex].episodes[episodeIndex].videoFile = file;
                                                        
                                                        // Create preview URL
                                                        const url = URL.createObjectURL(file);
                                                        const episodeKey = `S${season.seasonNumber}E${episode.episodeNumber}`;
                                                        
                                                        // Store the preview URL
                                                        setEpisodePreviews(prev => ({
                                                            ...prev,
                                                            [episodeKey]: url
                                                        }));
                                                        
                                                        // Explicitly set the preview to be hidden by default
                                                        setShowPreviewEpisodes(prev => ({
                                                            ...prev,
                                                            [episodeKey]: false
                                                        }));
                                                        
                                                        setShowData({
                                                            ...showData,
                                                            seasons
                                                        });
                                                        
                                                        // Clear error if file is selected
                                                        const errorKey = episodeKey + '-file';
                                                        setErrors(prev => {
                                                            const newErrors = {...prev};
                                                            delete newErrors[errorKey];
                                                            return newErrors;
                                                        });
                                                        
                                                        setSuccess(prev => ({
                                                            ...prev,
                                                            [errorKey]: 'File selected successfully'
                                                        }));
                                                        
                                                        return false; // Prevent auto upload
                                                    }}
                                                    onRemove={() => {
                                                        // Remove file from state
                                                        const seasons = [...showData.seasons];
                                                        seasons[seasonIndex].episodes[episodeIndex].videoFile = null;
                                                        setShowData({
                                                            ...showData,
                                                            seasons
                                                        });
                                                        
                                                        // Clear preview URL
                                                        const episodeKey = `S${season.seasonNumber}E${episode.episodeNumber}`;
                                                        setEpisodePreviews(prev => {
                                                            const newPreviews = {...prev};
                                                            delete newPreviews[episodeKey];
                                                            return newPreviews;
                                                        });
                                                        
                                                        // Turn off preview toggle for this episode
                                                        setShowPreviewEpisodes(prev => ({
                                                            ...prev,
                                                            [episodeKey]: false
                                                        }));
                                                        
                                                        // Reset error for this episode's file
                                                        setErrors(prev => ({
                                                            ...prev,
                                                            [`S${season.seasonNumber}E${episode.episodeNumber}-file`]: 'Episode video file is required'
                                                        }));
                                                        setSuccess(prev => {
                                                            const newSuccess = {...prev};
                                                            delete newSuccess[`S${season.seasonNumber}E${episode.episodeNumber}-file`];
                                                            return newSuccess;
                                                        });
                                                    }}
                                                >
                                                    <Button icon={<UploadOutlined />}>
                                                        {episode.videoFile ? `Change file for Episode ${episode.episodeNumber}` : `Upload video for Episode ${episode.episodeNumber}`}
                                                    </Button>
                                                </Upload>
                                                )}
                                                
                                                {errors[`S${season.seasonNumber}E${episode.episodeNumber}-file`] && (
                                                    <Alert
                                                        closable={true}
                                                        message={errors[`S${season.seasonNumber}E${episode.episodeNumber}-file`]}
                                                        type="error"
                                                    />
                                                )}
                                                
                                                {success[`S${season.seasonNumber}E${episode.episodeNumber}-file`] && (
                                                    <Alert
                                                        closable={true}
                                                        message={success[`S${season.seasonNumber}E${episode.episodeNumber}-file`]}
                                                        type="success"
                                                    />
                                                )}
                                            </div>

                                            {/* Keep the has_subtitles checkbox but after the file upload */}
                                            <div className="form-group checkbox">
                                                <label htmlFor={`S${season.seasonNumber}E${episode.episodeNumber}-subtitles`}>Has Subtitles:</label>
                                                <input
                                                    type="checkbox"
                                                    id={`S${season.seasonNumber}E${episode.episodeNumber}-subtitles`}
                                                    name={`S${season.seasonNumber}E${episode.episodeNumber}-subtitles`}
                                                    checked={episode.has_subtitles || false}
                                                    onChange={(e) => handleEpisodeChange(seasonIndex, episodeIndex, 'has_subtitles', e.target.checked)}
                                                />
                                            </div>
                                            
                                            {/* Show preview button when there's a video file or episode exists on server */}
                                            {(episode.videoFile || episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists) && (
                                                <div className="form-group" style={{ marginTop: '10px' }}>
                                                    <Button 
                                                        type={showPreviewEpisodes[`S${season.seasonNumber}E${episode.episodeNumber}`] ? 'primary' : 'default'}
                                                        onClick={() => {
                                                            const episodeKey = `S${season.seasonNumber}E${episode.episodeNumber}`;
                                                            setShowPreviewEpisodes(prev => ({
                                                                ...prev,
                                                                [episodeKey]: !prev[episodeKey]
                                                            }));
                                                        }}
                                                    >
                                                        {showPreviewEpisodes[`S${season.seasonNumber}E${episode.episodeNumber}`] ? "Hide Preview" : "Show Preview"}
                                                    </Button>
                                                </div>
                                            )}

                                            {/* Video preview - show from server if exists, or local file preview */}
                                            {showPreviewEpisodes[`S${season.seasonNumber}E${episode.episodeNumber}`] && 
                                            (episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists || 
                                            (episode.videoFile && episodePreviews[`S${season.seasonNumber}E${episode.episodeNumber}`])) && (
                                                <div className="video-container" style={{ marginTop: '20px' }}>
                                                    <div className="divider"/>
                                                    <video
                                                        controls
                                                        autoPlay
                                                        muted
                                                        width="420" height="340"
                                                        src={episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists 
                                                            ? `${API_URL}/api/stream/t-${showData.show_id}-${season.seasonNumber}-${episode.episodeNumber}` 
                                                            : episodePreviews[`S${season.seasonNumber}E${episode.episodeNumber}`]}
                                                        controlsList="nodownload nofullscreen"
                                                    >
                                                        Your browser does not support the video tag.
                                                    </video>
                                                </div>
                                            )}

                                            {episodeIndex === season.episodes.length - 1 ? (
                                                <Flex gap={5} style={{marginLeft: '25%'}} align="center">
                                                    <div className="divider" />
                                                    <Button type="default" onClick={() => addEpisode(seasonIndex)}>
                                                        Add Episode
                                                    </Button>
                                                    <div className="divider" />
                                                </Flex>
                                            ) : (<Flex style={{marginLeft: '25%'}}><div className="divider" /></Flex>)}
                                        </div>
                                    ))}
                                    {seasonIndex === showData.seasons.length - 1 ? (
                                        <Flex gap={5} align="center">
                                            <div className="divider"/>
                                            <Button type="dashed" onClick={addSeason}>
                                                Add Season
                                            </Button>
                                            <div className="divider"/>
                                        </Flex>
                                    ) : (
                                        <div className="divider"/>
                                    )}
                                </div>
                            ))}
                        </>
                    )}
                </form>

                {/* Movie video preview - show existing video from server or local file */}
                {type === 'movie' && (videoPreviewUrl || vidExist.exist) && (
                    <div className="video-container" style={{ marginTop: '20px' }}>
                        <div className="divider"/>
                        <video
                            controls
                            autoPlay
                            muted
                            width="420" height="340"
                            src={vidExist.exist && !videoPreviewUrl ? `${API_URL}/api/stream/m-${movieData.id}` : videoPreviewUrl}
                            controlsList="nodownload nofullscreen"
                        >
                            Your browser does not support the video tag.
                        </video>
                    </div>
                )}

                {saveLoading && (
                    <div className="profile-form_uploading">
                        <Progress
                            type="circle"
                            percent={progress}
                            strokeWidth={6}
                            status={progress === 100 ? "success" : "active"}
                        />
                        Remaining Time... {remainingTime}, Upload speed... {uploadSpeed} MB/s
                    </div>
                )}

                <div className="upload__form">
                    <div className="divider"/>
                    <div className="profile-form_buttons" style={{marginBottom:40}}>
                        <button 
                            className="profile_save_btn" 
                            onClick={(e) => {
                                handleSubmit(e);
                            }} 
                            disabled={saveLoading}
                        >
                            {isEdit ? (saveLoading ? "Saving" : "Save") : (saveLoading ? "Uploading" : "Upload")}
                        </button>
                        {/* Delete button for edit mode */}
                        {isEdit && openDelForm && (
                            <button 
                                className="profile_delete_btn" 
                                onClick={() => {
                                    if (type === 'movie') {
                                        openDelForm(movieData.id, movieData.title);
                                    } else {
                                        openDelForm(showData.show_id, showData.title);
                                    }
                                }}
                            >
                                Delete {type === 'movie' ? 'Movie' : 'Show'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UnifiedUploadModal;