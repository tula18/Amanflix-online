import { CloseOutlined, UploadOutlined, ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";
import React, { useState, useEffect, useRef } from "react";
import { Alert, Progress, Upload, notification, Button, Flex, Tooltip, Popconfirm, Image } from "antd";
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
    prefilledData 
}) => {
    const token = localStorage.getItem('admin_token');
    const [saveLoading, setSaveLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [timeStart, setTimeStart] = useState(null);
    const [inputErrors, setInputErrors] = useState({});
    const [inputSuccess, setInputSuccess] = useState({});
    const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
    const [showBackdrop, setShowBackdrop] = useState(false);
    const [showPoster, setShowPoster] = useState(false);

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
    const [episodeExists, setEpisodeExists] = useState({});
    const [uploadedSize, setUploadedSize] = useState(0);

    const modalContentRef = useRef(null);
    const seasonRef = useRef(null);
    const episodeRef = useRef(null);

    useEffect(() => {
        if (isVisible && prefilledData) {
            if (type === 'movie') {
                initializeMovieForm();
            } else if (type === 'tv_show') {
                initializeTVShowForm();
            }
        }
    }, [isVisible, prefilledData, type]);

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
                if (!value || value.length < 3) errorMessage = 'Title should be at least 3 characters';
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
            } else {
                // TV Show validation and formData preparation
                let hasFiles = false;
                showData.seasons.forEach((season) => {
                    season.episodes.forEach((episode) => {
                        // Check for either uploaded video files OR pre-filled filenames
                        if (episode.videoFile || (episode.filename && episode.filename.trim() !== '')) {
                            hasFiles = true;
                            if (episode.videoFile) {
                                formData.append(`video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`, episode.videoFile);
                            }
                        }
                    });
                });
    
                if (!hasFiles) {
                    notification.error({
                        message: 'Upload Error',
                        description: 'Please select at least one video file or ensure pre-filled data contains valid filenames.',
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
            }
    
            // Pre-upload validation
            let validationResult = null;
            if (type === 'movie' && movieData.id) {
                validationResult = await validateUpload('movie', movieData.id, null, movieData);
            } else if (type === 'tv_show' && showData.show_id) {
                // Prepare episodes data for validation
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
                validationResult = await validateUpload('tv', showData.show_id, episodes, showData);
            }
    
            // Check validation result
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
    
            // Show warnings if any
            if (validationResult && validationResult.warnings && validationResult.warnings.length > 0) {
                const warningMessages = validationResult.warnings.map(warning => warning.message).join('\n');
                notification.warning({
                    message: 'Upload Warnings',
                    description: warningMessages,
                });
            }
    
            const config = {
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'multipart/form-data'
                },
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                    setProgress(progress);
                    const elapsedTime = (Date.now() - startTime) / 1000;
                    const uploadSpeed = progressEvent.loaded / elapsedTime;
                    setUploadSpeed((uploadSpeed / 1024 / 1024).toFixed(2));
                    const remainingSize = progressEvent.total - progressEvent.loaded;
                    const estimatedTime = remainingSize / uploadSpeed;
                    setRemainingTime(formatEstimatedTime(estimatedTime.toFixed(2)));
                    setUploadedSize(progressEvent.loaded);
                }
            };
    
            let startTime = Date.now();
    
            const response = await axios.post(`${API_URL}/api/upload/${type === 'movie' ? 'movie' : 'show'}`, formData, config);
    
            if (response.status === 200 || response.status === 201) {
                notification.success({
                    message: 'Success',
                    description: `${type === 'movie' ? 'Movie' : 'Show'} uploaded successfully!`,
                });
                setSaveLoading(false);
                setProgress(100);
                if (onSuccess) onSuccess();
                onClose();
            } else {
                notification.error({
                    message: 'Upload Error',
                    description: response.data.message || 'An error occurred during upload',
                });
                setSaveLoading(false);
            }
        } catch (error) {
            notification.error({
                message: 'Error',
                description: error.message,
            });
            setSaveLoading(false);
        }
    };

    if (!isVisible) return null;

    return (
        <div className={`modal`} id="unifiedModal">
            <div className={`modal-content`} id="modal-content" ref={modalContentRef}>
                <div className='header' style={{ width: '100%', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '50px', marginBottom: 10, marginTop: 10 }}>
                    <h1 style={{paddingBottom: 10, paddingLeft: 10}}>Upload {type === 'movie' ? 'Movie' : 'TV Show'}</h1>
                    <span className="closeButton" onClick={handleCloseForm} style={{ position: 'absolute', top: '0', right: '0', margin: '10px' }}><CloseOutlined /></span>
                </div>

                <form required className="upload__form">
                    {type === 'movie' ? (
                        <>
                            <FormGroup label="Movie ID" name="id" type="number" value={movieData.id} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
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
                            </div>
                        </>
                    ) : (
                        <>
                            <FormGroup label="Show ID" name="show_id" type="number" value={showData.show_id} onChange={handleChange} error={errors} success={success} required />
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
                                            
                                            {episode.videoFile && (
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

                                            {showPreviewEpisodes[`S${season.seasonNumber}E${episode.episodeNumber}`] && 
                                            episodePreviews[`S${season.seasonNumber}E${episode.episodeNumber}`] && (
                                                <div className="video-container" style={{ marginTop: '20px' }}>
                                                    <div className="divider"/>
                                                    <video
                                                        controls
                                                        autoPlay
                                                        muted
                                                        src={episodePreviews[`S${season.seasonNumber}E${episode.episodeNumber}`]}
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

                {(videoPreviewUrl || (type === 'movie' && movieData.vid_movie)) && type === 'movie' && (
                    <div className="video-container" style={{ marginTop: '20px' }}>
                        <div className="divider"/>
                        <video
                            controls
                            autoPlay
                            muted
                            width="420" height="340"
                            src={videoPreviewUrl}
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
                            {saveLoading ? "Uploading" : "Upload"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UnifiedUploadModal;
