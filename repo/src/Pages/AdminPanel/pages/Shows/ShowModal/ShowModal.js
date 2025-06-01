import React, { useState, useEffect, useRef } from "react";
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined } from "@ant-design/icons";
import { FaPlay } from "react-icons/fa6";
import FormGroup from "../../../Components/FormGroup/FormGroup";
import { API_URL } from "../../../../../config";
import { AutoComplete, Button, Flex, Popconfirm, Tooltip, notification, Upload, Alert, Progress } from "antd";
import './ShowModal.css'
import Icon from "@ant-design/icons/lib/components/Icon";
import TextareaFormGroup from "../../../Components/FormGroup/TextareaFormGroup";

const TvShowEditModal = ({ onClose, ShowID, openDelForm, refresh, fetchType="api" }) => {
    const isEdit = ShowID !== undefined && fetchType !== 'cdn'
    const [saveLoading, setSaveLoading] = useState(false);
    const token = localStorage.getItem('admin_token')
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
    console.log("ShowModal rendering with props:", { ShowID, fetchType, isEdit });

    const [errors, setErrors] = useState({});
    const [success, setSuccess] = useState({});

    const [loadingShows, setLoadingShows] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [fetchLoading, setFetchLoading] = useState(false);

    const seasonRef = useRef(null);
    const episodeRef = useRef(null);

    const fixReleaseDateFormat = (date) => {
        if (!date) return "";
        
        const time_split = date.split('T')
        const parts = time_split[0].split('-');
    
        if (parts.length !== 3 || parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) return "";
        
        return `${parts[0]}-${parts[1]}-${parts[2]}`;
    };

    useEffect(() => {
        console.log("Component mounted with:", { isEdit, fetchType, ShowID });
        if (isEdit || fetchType === "cdn") {
            console.log("Attempting to fetch show details...");
            fetchShowDetails();
        }
    }, [isEdit, fetchType, ShowID]); // Add dependencies

    const fetchShowDetails = async () => {
        console.log(`Fetching show details from: ${API_URL}/${isEdit ? "api" : fetchType}/shows/${ShowID}`);
        try {
            setFetchLoading(true);
            const response = await fetch(`${API_URL}/${isEdit ? "api" : fetchType}/shows/${ShowID}`);
            const data = await response.json();
            console.log("Fetched show data:", data);
            
            const newShowData = { ...showData };

            // Map the data to showData properties
            for (const key in data) {
                if (data.hasOwnProperty(key) && showData.hasOwnProperty(key)) {
                    if (key === "first_air_date" || key === "last_air_date") {
                        newShowData[key] = fixReleaseDateFormat(data[key]);
                    } else if (key === "name") {
                        newShowData["title"] = data[key];
                    } else if (key === "id") {
                        newShowData["show_id"] = data[key];
                    } else if (key === "seasons" && Array.isArray(data[key])) {
                        // Format seasons data
                        newShowData.seasons = data[key].map(season => ({
                            seasonNumber: season.season_number,
                            episodes: Array.isArray(season.episodes) ? season.episodes.map(episode => ({
                                episodeNumber: episode.episode_number,
                                title: episode.title,
                                overview: episode.overview,
                                has_subtitles: episode.has_subtitles || false,
                                videoFile: null
                            })) : []
                        }));
                    } else {
                        newShowData[key] = data[key];
                    }
                }
            }
            console.log(newShowData)

            setShowData(newShowData);
            // validateForm();

        } catch (error) {
            console.error('Error fetching show details:', error);
            setErrors({general: `Error fetching show: ${error.message}`});
        } finally {
            setFetchLoading(false);
        }
    };

    useEffect(() => {
        const handleEscapeKey = (event) => {
          if (!saveLoading && event.key === 'Escape') {
            onClose();
          }
    };
      
        document.addEventListener('keydown', handleEscapeKey);
      
        return () => {
          document.removeEventListener('keydown', handleEscapeKey);
        };
      });

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!saveLoading && event.target.classList.contains('modal')) {
                onClose();
            }
        };
  
        document.addEventListener('mousedown', handleClickOutside);
  
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    });

    // Add after your other useEffect hooks
    useEffect(() => {
        // Debug logs to track ShowID changes
        console.log("ShowID changed:", ShowID);
        console.log("isEdit value:", isEdit);
        console.log("fetchType value:", fetchType);
    }, [ShowID, isEdit, fetchType]);

    const handleCloseForm = () => !saveLoading && onClose();

    const processShowData = data => data.map(movie => ({ value: movie.name, label: movie.name, movie }));

    const fetchShows = async (query = '') => {
        if (query) {
            try {
                setLoadingShows(true)
                const newQuery = decodeURIComponent(query)
                const res = await fetch(`${API_URL}/cdn/search?q=${encodeURIComponent(newQuery)}&max_results=10&media_type=tv`)
                const data = await res.json();
                setSuggestions(processShowData(data));
            } catch (error) {
                console.error('Error validating token:', error);
            } finally {
                setLoadingShows(false)
            }
        }
    }

    // Update the handleSearch function to map 'id' from API to 'show_id'
    const handleSearch = (value, option) => {
        const selectedShow = option.movie
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
        // validateForm(newShowData, true, ['backdrop_path', 'poster_path'])
    }
    
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setShowData({
            ...showData,
            [name]: value
        });
        console.log(showData);
    };

    const handleSeasonChange = (index, field, value) => {
        const seasons = [...showData.seasons];
        seasons[index][field] = value;
        setShowData({
            ...showData,
            seasons
        });
        console.log(showData);
    };

    const addSeason = () => {
        setShowData({ ...showData, seasons: [...showData.seasons, { seasonNumber: showData.seasons.length + 1, episodes: [] }] });
        setTimeout(() => {
            if (seasonRef.current) {
                seasonRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                seasonRef.current.focus();
            }
        }, 0);
    };
    const deleteSeason = (index) => {
        const seasons = [...showData.seasons];
        seasons.splice(index, 1);
        const reorderedSeasons = seasons.map((season, newIndex) => ({
            ...season,
            seasonNumber: newIndex + 1
        }));
        setShowData({
            ...showData,
            seasons: reorderedSeasons
        });
        console.log(showData);
    };

    const handleEpisodeChange = (seasonIndex, episodeIndex, field, event) => {
        const seasons = [...showData.seasons];
        
        // Handle file input differently
        if (field === 'videoFile' && event.target && event.target.files) {
            seasons[seasonIndex].episodes[episodeIndex][field] = event.target.files[0];
            
            // Clear error if file is selected
            if (event.target.files[0]) {
                const errorKey = `S${seasons[seasonIndex].seasonNumber}E${seasons[seasonIndex].episodes[episodeIndex].episodeNumber}-file`;
                setErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors[errorKey];
                    return newErrors;
                });
                
                setSuccess(prev => ({
                    ...prev,
                    [errorKey]: 'File selected successfully'
                }));
            }
        } else if (event.target) {
            // For regular input elements
            seasons[seasonIndex].episodes[episodeIndex][field] = event.target.value;
        } else {
            // For direct value updates (like checkboxes or direct string assignments)
            seasons[seasonIndex].episodes[episodeIndex][field] = event;
        }
        
        setShowData({
            ...showData,
            seasons
        });
    };

    const addEpisode = (seasonIndex) => {
        const newEpisodeNumber = showData.seasons[seasonIndex].episodes.length + 1;
        const seasons = [...showData.seasons];
        seasons[seasonIndex].episodes = [...seasons[seasonIndex].episodes, { 
            episodeNumber: newEpisodeNumber, 
            title: '', 
            overview: '', 
            has_subtitles: false, 
            force: false,  // Add force option
            videoFile: '' 
        }];
        setShowData({
            ...showData,
            seasons
        });
        setTimeout(() => {
            if (episodeRef.current) {
                episodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                episodeRef.current.focus();
            }
        }, 0);
    };

    const deleteEpisode = (seasonIndex, episodeIndex) => {
        const seasons = [...showData.seasons];
        seasons[seasonIndex].episodes.splice(episodeIndex, 1);
        const reorderedEpisodes = seasons[seasonIndex].episodes.map((episode, newIndex) => ({
            ...episode,
            episodeNumber: newIndex + 1
        }));
        seasons[seasonIndex].episodes = reorderedEpisodes;
        setShowData({
            ...showData,
            seasons
        });
    };

    const moveEpisodeUp = (seasonIndex, episodeIndex) => {
        if (episodeIndex > 0) {
            const seasons = [...showData.seasons];
            const episodes = [...seasons[seasonIndex].episodes];
            [episodes[episodeIndex], episodes[episodeIndex - 1]] = [episodes[episodeIndex - 1], episodes[episodeIndex]];
            seasons[seasonIndex].episodes = episodes;

            const reorderedEpisodes = seasons[seasonIndex].episodes.map((episode, newIndex) => ({
                ...episode,
                episodeNumber: newIndex + 1
            }));
            seasons[seasonIndex].episodes = reorderedEpisodes;
            setShowData({
                ...showData,
                seasons
            });
        }
    };
    
    const moveEpisodeDown = (seasonIndex, episodeIndex) => {
        if (episodeIndex < showData.seasons[seasonIndex].episodes.length - 1) {
            const seasons = [...showData.seasons];
            const episodes = [...seasons[seasonIndex].episodes];
            [episodes[episodeIndex], episodes[episodeIndex + 1]] = [episodes[episodeIndex + 1], episodes[episodeIndex]];
            seasons[seasonIndex].episodes = episodes;

            const reorderedEpisodes = seasons[seasonIndex].episodes.map((episode, newIndex) => ({
                ...episode,
                episodeNumber: newIndex + 1
            }));
            seasons[seasonIndex].episodes = reorderedEpisodes;
            setShowData({
                ...showData,
                seasons
            });
        }
    };

    // Update validation to check show_id instead of id
    const validateForm = () => {
        const newErrors = {};
        let isValid = true;
    
        // Validate main show fields
        const requiredFields = ['show_id', 'title', 'genres', 'created_by', 'overview', 'poster_path', 'first_air_date', 'last_air_date', 'status'];
        requiredFields.forEach(field => {
            if (!showData[field]) {
                newErrors[field] = `${field.charAt(0).toUpperCase() + field.slice(1).replace('_', ' ')} is required`;
                isValid = false;
            }
        });
    
        // Validate seasons and episodes
        if (showData.seasons.length === 0) {
            notification.error({
                message: 'Validation Error',
                description: 'At least one season is required',
            });
            isValid = false;
        } else {
            showData.seasons.forEach((season, seasonIndex) => {
                if (season.episodes.length === 0) {
                    notification.error({
                        message: 'Validation Error',
                        description: `Season ${season.seasonNumber} requires at least one episode`,
                    });
                    isValid = false;
                } else {
                    season.episodes.forEach((episode, episodeIndex) => {
                        if (!episode.title) {
                            newErrors[`S${season.seasonNumber}E${episode.episodeNumber}-title`] = `Episode title is required`;
                            isValid = false;
                        }
                        if (!episode.overview) {
                            newErrors[`S${season.seasonNumber}E${episode.episodeNumber}-overview`] = `Episode overview is required`;
                            isValid = false;
                        }
                        
                        // Fix: Rename the local variable to avoid shadowing
                        const episodeKey = `S${season.seasonNumber}E${episode.episodeNumber}`;
                        const episodeExistsOnServer = episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists;
                        
                        if (!episode.videoFile && !episodeExistsOnServer && !episodePreviews[episodeKey]) {
                            newErrors[`${episodeKey}-file`] = `Episode video file is required`;
                            isValid = false;
                        }
                    });
                }
            });
        }
    
        setErrors(newErrors);
        return isValid;
    };    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log('handle1', showData)
        
        if (!validateForm()) {
            return;
        }
        
        // Pre-upload validation
        if (showData.show_id) {
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
            
            const validationResult = await validateUpload('tv', showData.show_id, episodes);
            
            // Check validation result
            if (validationResult && !validationResult.can_upload) {
                const errorMessages = validationResult.errors.map(error => error.message).join('\n');
                notification.error({
                    message: 'Upload Blocked',
                    description: errorMessages,
                    duration: 8,
                });
                return;
            }

            // Show warnings if any
            if (validationResult && validationResult.warnings && validationResult.warnings.length > 0) {
                const warningMessages = validationResult.warnings.map(warning => warning.message).join('\n');
                notification.warning({
                    message: 'Upload Warnings',
                    description: warningMessages,
                    duration: 6,
                });
            }
        }
    
        setSaveLoading(true);
        const formData = new FormData();
        
        // Add main show data
        Object.keys(showData).forEach(key => {
            if (key !== 'seasons') {
                formData.append(key, showData[key]);
            }
        });
        
        // Add seasons data
        formData.append('seasons', JSON.stringify(showData.seasons.map(season => ({
            season_number: season.seasonNumber,
            episodes: season.episodes.map(episode => ({
                episode_number: episode.episodeNumber,
                title: episode.title,
                overview: episode.overview,
                has_subtitles: episode.has_subtitles || false,
                force: episode.force || false  // Add force flag
            }))
        }))));
        
        // Add episode video files
        showData.seasons.forEach((season) => {
            season.episodes.forEach((episode) => {
                if (episode.videoFile instanceof File) {
                    formData.append(
                        `video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`,
                        episode.videoFile
                    );
                }
            });
        });

        // Add this right after creating FormData
        console.log("Form data being prepared...");

        // Add this in the episodes loop
        showData.seasons.forEach((season) => {
            season.episodes.forEach((episode) => {
                console.log(`Checking episode file: S${season.seasonNumber}E${episode.episodeNumber}`, episode.videoFile);
                if (episode.videoFile instanceof File) {
                    console.log(`Appending file: ${episode.videoFile.name}, size: ${episode.videoFile.size}`);
                    formData.append(
                        `video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`,
                        episode.videoFile
                    );
                } else {
                    console.log(`No file object found for S${season.seasonNumber}E${episode.episodeNumber}`);
                }
            });
        });

        // Add this to log formData entries
        console.log("FormData contents:");
        for (let pair of formData.entries()) {
            if (pair[1] instanceof File) {
                console.log(pair[0], 'File:', pair[1].name, 'Size:', pair[1].size);
            } else {
                console.log(pair[0], pair[1]);
            }
        }
    
        try {
            const method = isEdit ? 'PUT' : 'POST';
            const url = isEdit ? 
                `${API_URL}/api/upload/show/${showData.show_id}` : 
                `${API_URL}/api/upload/show`;
                
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            
            xhr.onload = function() {
                const json = JSON.parse(xhr.responseText);
                if (xhr.status === 200) {
                    // Display success notification
                    notification.success({
                        message: 'Success',
                        description: json.message,
                        duration: 4,
                    });
                    
                    setSuccess({general: json.message});
                    refresh();
                    setTimeout(() => {
                        onClose();
                    }, 1500);
                } else {
                    console.log(json);
                    
                    notification.error({
                        message: 'Error',
                        description: json.message,
                    });
                }
                setSaveLoading(false);
            };
            
            xhr.onerror = function() {
                notification.error({
                    message: 'Error',
                    description: "An error occurred during upload",
                });
                setSaveLoading(false);
            };

            // Then update the xhr.upload.onprogress in handleSubmit
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const now = new Date().getTime();
                    const loaded = event.loaded;
                    const total = event.total;
                    const percentComplete = Math.round((loaded / total) * 100);
                    
                    setProgress(percentComplete);
                    
                    // Calculate upload speed (MB/s) and remaining time
                    if (timeStart && loaded > 0) {
                        const elapsedMs = now - timeStart;
                        const bytesPerMs = loaded / elapsedMs;
                        const mbps = (bytesPerMs * 1000) / (1024 * 1024);
                        setUploadSpeed(mbps.toFixed(2));
                        
                        // Calculate remaining time
                        const remainingBytes = total - loaded;
                        const remainingMs = remainingBytes / bytesPerMs;
                        
                        let remainingTimeString = "calculating...";
                        if (remainingMs > 0) {
                            if (remainingMs < 60000) {
                                remainingTimeString = `${Math.ceil(remainingMs / 1000)} seconds`;
                            } else if (remainingMs < 3600000) {
                                remainingTimeString = `${Math.ceil(remainingMs / 60000)} minutes`;
                            } else {
                                const hours = Math.floor(remainingMs / 3600000);
                                const minutes = Math.ceil((remainingMs % 3600000) / 60000);
                                remainingTimeString = `${hours} hours, ${minutes} minutes`;
                            }
                        }
                        
                        setRemainingTime(remainingTimeString);
                    }
                }
            };

            // Add this right before xhr.send(formData)
            setTimeStart(new Date().getTime());
            
            xhr.send(formData);
        } catch (error) {
            notification.error({
                message: 'Error',
                description: error.message,
            });
            setSaveLoading(false);
        }
    };

    // Add these state variables at the beginning of your component

    const [episodeExists, setEpisodeExists] = useState({});

    // Add this function to check if episodes exist
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

    // Add effect to check episodes when show_id changes
    useEffect(() => {
        if (showData.show_id) {
            checkEpisodesExist();
        }
    }, [showData.show_id]);

    // Add near the beginning of your component with other state variables
    const [episodePreviews, setEpisodePreviews] = useState({}); // Maps episode keys to preview URLs
    const [showPreviewEpisodes, setShowPreviewEpisodes] = useState({});

    // Add this useEffect to clean up object URLs when unmounting
    useEffect(() => {
        return () => {
            // Clean up any created object URLs when component unmounts
            Object.values(episodePreviews).forEach(url => {
                URL.revokeObjectURL(url);
            });
        };
    }, [episodePreviews]);

    // Add these state variables at the top of your component
    const [progress, setProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [remainingTime, setRemainingTime] = useState("calculating...");
    const [timeStart, setTimeStart] = useState(null);

    // Validation function for upload pre-check
    const validateUpload = async (contentType, contentId, episodes = null) => {
        try {
            const payload = {
                content_type: contentType,
                content_id: contentId
            };
            
            if (episodes) {
                payload.episodes = episodes;
            }
            
            const response = await fetch(`${API_URL}/api/upload/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Validation error:', error);
            return {
                success: false,
                can_upload: true, // Default to allowing upload if validation fails
                errors: [],
                warnings: []
            };
        }
    };
    
    return (
        <div className={`modal`} id="movieModal">
            <div className={`modal-content`}>
                <div className='header' style={{ width: '100%', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '50px', marginBottom: 10, marginTop: 10 }}>
                    <h1 style={{paddingBottom: 10, paddingLeft: 10}}>{isEdit ? "Edit" : "Upload"} Show</h1>
                    <span className="closeButton" onClick={handleCloseForm} style={{ position: 'absolute', top: '0', right: '0', margin: '10px' }}><CloseOutlined /></span>
                </div>
                <form className="upload__form">
                    {fetchType === 'new' && (
                        <AutoComplete
                            style={{
                                width: "80%",
                                placeholderColor: '#1890ff',
                                paddingLeft: 16,
                                marginBottom: 16
                            }}
                            options={suggestions}
                            loading={loadingShows}
                            onSearch={fetchShows}
                            onSelect={handleSearch}
                            placeholder="Search for movies"
                        />
                    )}
                    <FormGroup label="Show ID" name="show_id" type="number" value={showData.show_id} onChange={handleInputChange} error={errors} success={success} required disabled={ShowID !== undefined} />
                    <FormGroup label="Title" name="title" value={showData.title} onChange={handleInputChange} error={errors} success={success} required />
                    <FormGroup label="Genres" name="genres" value={showData.genres} onChange={handleInputChange} error={errors} success={success} required/>
                    <FormGroup label="Created By" name="created_by" value={showData.created_by} onChange={handleInputChange} error={errors} success={success} required/>
                    <TextareaFormGroup label="Overview" name="overview" value={showData.overview} onChange={handleInputChange} error={errors} success={success} required />
                    <FormGroup label="Poster Path" name="poster_path" value={showData.poster_path} onChange={handleInputChange} error={errors} success={success} required />
                    <FormGroup label="Backdrop Path" name="backdrop_path" value={showData.backdrop_path} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="Vote Average" name="vote_average" type="number" value={showData.vote_average} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="Tagline" name="tagline" value={showData.tagline} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="Spoken Languages" name="spoken_languages" value={showData.spoken_languages} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="First Air Date" name="first_air_date" type="date" value={showData.first_air_date} onChange={handleInputChange} error={errors} success={success} required />
                    <FormGroup label="Last Air Date" name="last_air_date" type="date" value={showData.last_air_date} onChange={handleInputChange} error={errors} success={success} required />
                    <FormGroup label="Production Companies" name="production_companies" value={showData.production_companies} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="Production Countries" name="production_countries" value={showData.production_countries} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="Networks" name="networks" value={showData.networks} onChange={handleInputChange} error={errors} success={success} />
                    <FormGroup label="Status" name="status" value={showData.status} onChange={handleInputChange} error={errors} success={success} required />
                    {showData.seasons.length !== 0 ? (<div className="divider"/>) : (
                        <Flex gap={5} align="center">
                            <div className="divider"/>
                            <Button type="dashed" onClick={addSeason}>
                                Add Season
                            </Button>
                            <div className="divider"/>
                        </Flex>
                    ) }
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
                                    <Popconfirm
                                        title="Are you sure to delete this Season?"
                                        onConfirm={() => deleteSeason(seasonIndex)}
                                    >
                                        <Button danger style={{height: 45}}>Delete Season</Button>
                                    </Popconfirm>
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
                                            {(<Button danger style={{height: 45}} onClick={() => deleteEpisode(seasonIndex, episodeIndex)}>
                                                Delete Episode
                                            </Button>)}
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
                                            {`Episode ${episode.episodeNumber} File`} <p style={{fontSize: "1.1rem", color: 'gold', marginLeft: 5, cursor: 'help', marginBottom: 0}}><Tooltip title="Required">*</Tooltip></p>
                                        </label>
                                        
                                        {/* Show existence message if we have data for this episode */}
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
                                        
                                        {/* Show upload component when needed */}
                                        {(episode.force === true || 
                                        !episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists) && (
                                            <Upload
                                                name={`video_season_${season.seasonNumber}_episode_${episode.episodeNumber}`}
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
                                                        [episodeKey]: false // Always hide preview initially when a new file is uploaded
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
                                                // accept="video/mp4"
                                            >
                                                <Icon type="upload" /> Upload video for Episode {episode.episodeNumber}
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
                                    {/* Add after the Upload component and error/success messages */}
                                    {/* Only show the preview button when there's a video file or an existing episode on the server */}
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

                                    {/* Video Preview */}
                                    {/* Only show preview when toggle is on AND (episode exists on server OR file is selected) */}
                                    {showPreviewEpisodes[`S${season.seasonNumber}E${episode.episodeNumber}`] && 
                                    (episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists || 
                                    (episode.videoFile && episodePreviews[`S${season.seasonNumber}E${episode.episodeNumber}`])) && (
                                        <div className="video-container" style={{ marginTop: '20px' }}>
                                            <div className="divider"/>
                                            <video
                                                controls
                                                autoPlay
                                                muted
                                                // width="420" height="340"
                                                src={episodeExists?.episodes?.[season.seasonNumber]?.[episode.episodeNumber]?.exists 
                                                    ? `${API_URL}/api/stream/${showData.show_id}${season.seasonNumber}${episode.episodeNumber}` 
                                                    : episodePreviews[`S${season.seasonNumber}E${episode.episodeNumber}`]}
                                                controlsList="nodownload nofullscreen"
                                            >
                                                Your browser does not support the video tag.
                                            </video>
                                        </div>
                                    )}
                                    {episodeIndex === season.episodes.length - 1 ? (
                                        <Flex align="center" gap={5}>
                                            <div className="divider" />
                                            <Button type="default" onClick={() => addEpisode(seasonIndex)}>
                                                Add Episode
                                            </Button>
                                            <div className="divider" />
                                        </Flex>
                                    ) : (<div className="divider" />)}
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
                </form>
                <div className="upload__form">
                    <div className="divider"/>
                        {/* Add a progress indicator in your render function, after the form */}
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
                        {isEdit && (<button className="profile_delete_btn" onClick={() => openDelForm(showData.show_id, showData.title)}>Delete Show</button>)}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TvShowEditModal