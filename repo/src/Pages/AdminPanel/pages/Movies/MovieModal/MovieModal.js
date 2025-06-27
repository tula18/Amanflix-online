import { CloseOutlined } from "@ant-design/icons";
import React, { useState, useEffect, useRef } from "react";
import { Alert, AutoComplete, Progress, Upload, message, notification } from "antd";
import { API_URL } from "../../../../../config";
import Icon from "@ant-design/icons/lib/components/Icon";
import './MovieModal.css'
import { FaPlay } from "react-icons/fa6";
import { useLocation, useNavigate } from "react-router-dom";
import FormGroup from "../../../Components/FormGroup/FormGroup";
import TextareaFormGroup from "../../../Components/FormGroup/TextareaFormGroup";

const debounce = (func, wait) => {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
};

const MovieEditModal = ({ onClose, movieID, openDelForm, refresh, fetchType="api" }) => {
    const navigate = useNavigate()
    const location = useLocation()
    const isEdit = movieID !== undefined && fetchType !== 'cdn'
    const token = localStorage.getItem('admin_token')
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
    const [vidExist, setVidExist] = useState({
        message: "",
        exist: false,
        return_reason: ""
    })
    const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
    const [inputErrors, setInputErrors] = useState({});
    const [inputSuccess, setInputSuccess] = useState({});
    const [saveLoading, setSaveLoading] = useState(false);
    const [fetchLoading, setFetchLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [uploadedSize, setUploadedSize] = useState(0);    const [showBackdrop, setShowBackdrop] = useState(false);
    const [showPoster, setShowPoster] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [loadingMovies, setLoadingMovies] = useState(false);

    const modalContentRef = useRef(null);

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


    useEffect(() => {
        if (isEdit || fetchType === "cdn") {
            fetchMovieDetails();
        }
    }, []);

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

    const checkVideoExist = async () => {
        if (fetchType !== 'new' && movieData.id)
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    console.log("No authentication token found");
                    setFetchLoading(false);
                    return;
                }

                const res = await fetch(`${API_URL}/api/movies/${movieData.id}/check`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                })
                const json = await res.json()
                setVidExist(json)
            } catch (error) {
                message.error(`Couldnt get fetch! ${String(error)}`)
            };
    }

    useEffect(() => {
        checkVideoExist()
        console.log(movieData);
    }, [movieData.id])

    const handleCloseForm = () => {
        if (!saveLoading) {
            onClose()
        }
    }

    const fixReleaseDateFormat = (date) => {
        if (!date) return "";
        const time_split = date.split('T')
        const [year, month, day] = time_split[0].split('-');
        return `${year}-${month}-${day}`;
    };

    const fetchMovieDetails = async () => {
        try {
            setFetchLoading(true)
            const token = localStorage.getItem('token');
            if (!token) {
                console.log("No authentication token found");
                setFetchLoading(false);
                return;
            }

            const response = await fetch(`${API_URL}/${isEdit ? "api" : fetchType}/movies/${movieID}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await response.json();
            console.log(data);
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
            validateForm(newMovieData, true)

        } catch (error) {
            console.error('Error fetching movie details:', error);
        } finally {
            setFetchLoading(false)
        }
    };

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

    const validateInputs = async (name, value, only_valid=false, check_always=[], check_only=[]) => {
        let errorMessage = '';
        let successMessage = '';
        setInputSuccess((prevSuccess) => ({
            ...prevSuccess,
            [name]: successMessage
        }));
        setInputErrors((prevSuccess) => ({
            ...prevSuccess,
            [name]: errorMessage
        }));
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
                if (!value) errorMessage = 'ID cannot be empty';
                break;
            case "title":
                if (!value || value.length < 3) errorMessage = 'Title should be at least 3 characters';
                break;
            case "overview":
                if (!value || value.length < 3) errorMessage = 'Overview should be at least 3 characters';
                break;
            case "release_date":
                if (!value) errorMessage = 'Release Date cannot be empty';
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
                    const url = `${API_URL}/cdn/images${value}/check`;
                    const res = await fetch(url);
                    const json = await res.json();
                    if (json.exist) {
                        successMessage = `${name} Image Exist`;
                    } else {
                        errorMessage = `${name} Image not Exist`;
                    }
                }
                break;
            default:
                break;
        }
        setInputSuccess((prevSuccess) => ({
            ...prevSuccess,
            [name]: successMessage
        }));
        setInputErrors((prevSuccess) => ({
            ...prevSuccess,
            [name]: errorMessage
        }));
        if (only_valid === false) {
            return { isValid: errorMessage === '', error: errorMessage, success: successMessage };
        } else {
            return { isValid: errorMessage === '', success: successMessage}
        }
    }
    useEffect(() => {
        console.log(movieData);
    })

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const validationResult = validateInputs(name, value, true);
        if (validationResult.isValid) {
            setInputSuccess({ ...inputSuccess, [name]: validationResult.success });
        }
        setMovieData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }))
    };
    
    const validateForm = async (data, only_valid=false, check_always=[], check_only=[]) => {
        const newInputErrors = { ...inputErrors };
        let FormisValid = true;
        for (const key in data) {
            const validationResult = await validateInputs(key, data[key], only_valid, check_always);
            if (!validationResult.isValid) {
                newInputErrors[key] = validationResult.error
                FormisValid = false;
            }
        }
        setInputErrors(newInputErrors);
        return FormisValid
    };

    const formatEstimatedTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        const minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;
        return `${hours ? `${hours} hour${hours > 1 ? 's' : ''} `: ''} ${minutes ? `${minutes} minute${minutes > 1 ? 's' : ''} and` : ''} ${Math.round(seconds)} second${seconds === 1 ? '' : 's'}`;
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        setInputErrors({});
        setProgress(0);

        const method = isEdit ? 'PUT' : 'POST'
        const url = isEdit ? `${API_URL}/api/upload/movie/${movieData.id}` : `${API_URL}/api/upload/movie`
        const formData = new FormData();
        const isValid = await validateForm(movieData)
        if (isValid) {
            for (const key in movieData) {
                formData.append(key, movieData[key]);
            }

            // Pre-upload validation
            let validationResult = null;
            validationResult = await validateUpload('movie', movieData.id, null, movieData);

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

            try {
                setSaveLoading(true);
                const xhr = new XMLHttpRequest();
                xhr.open(method, url, true)
                xhr.setRequestHeader('Authorization', `Bearer ${token}`)

                await new Promise((resolve, reject) => {
                    xhr.upload.onprogress = (event) => {
                        setSaveLoading(true)
                        if (event.lengthComputable) {
                            setProgress(Math.round((event.loaded / event.total) * 100))
                        }
                    }
        
                    xhr.onload = async function() {
                        const json = JSON.parse(xhr.responseText)
                        if (xhr.status === 200) {
                            notification.success({message: json.message, duration: 0})
                            onClose()
                        } else {
                            notification.error({message: json.message, duration: 0})
                        }
                        setSaveLoading(false)
                    }
        
                    xhr.onloadend = async function() {
                        setSaveLoading(false)
                    }
        
                    xhr.onerror = async function() {
                        setSaveLoading(false)
                        const json = JSON.parse(xhr.responseText)
                        notification.error({message: json.message, duration: 0})
                    }

                    let startTime;

                    xhr.upload.addEventListener('loadstart', (e) => {
                        startTime = Date.now();
                    });

                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const progress = Math.round((e.loaded / e.total) * 100);
                            setProgress(progress)
                            const elapsedTime = (Date.now() - startTime) / 1000;
                            const uploadSpeed = e.loaded / elapsedTime;
                            setUploadSpeed((uploadSpeed / 1024 / 1024).toFixed(2));
                            const remainingSize = e.total - e.loaded;
                            const estimatedTime = remainingSize / uploadSpeed;
                            setRemainingTime(formatEstimatedTime(estimatedTime.toFixed(2)))
                            setUploadedSize(e.loaded);
                        }
                    });
        
                    xhr.onabort = () => {
                        notification.info({message: 'Upload canceled.'})
                        setSaveLoading(false)
                    };
                    
                    xhr.send(formData)
        
                }).then(() => {
                    setSaveLoading(false)
                    refresh()
                });

            } catch (error) {
                notification.error({message: String(error), duration: 0})
            } finally {
                setSaveLoading(false)
                refresh()
            }
        } else {
            console.log(inputErrors);
            notification.error({message: "Please fill in all the fields!"})
        }
        refresh()
    };

    const processMovieData = data => {
        return data.map(movie => ({
            value: `${movie.title} | ${new Date(movie.release_date).getFullYear() || 'Unknown'}`,
            label: `${movie.title} | ${new Date(movie.release_date).getFullYear() || 'Unknown'}`,
            movie: movie
        }))
    }

    const fetchMovies = async (query = '') => {
        console.log(query);
        if (query) {
            try {
                setLoadingMovies(true)
                const res = await fetch(`${API_URL}/cdn/search?q=${encodeURIComponent(decodeURIComponent(query))}&max_results=10&media_type=movies`)
                const data = await res.json();
                console.log("sugs", data);
                setSuggestions(processMovieData(data));
            } catch (error) {
                console.error('Error validating token:', error);
            } finally {
                setLoadingMovies(false)
            }
        }
    }

    const handleSearch = (value, option) => {
        const selectedMovie = option.movie
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
        validateForm(newMovieData, true, ['backdrop_path', 'poster_path'])
    }

    

    useEffect(() => {
        const handleResize = debounce(() => {
            console.log('Resized');
            // Ensure no actions here cause the element to resize again
        }, 100);

        const resizeObserver = new ResizeObserver(handleResize);

        if (modalContentRef.current) {
            resizeObserver.observe(modalContentRef.current);
        }

        return () => {
            if (modalContentRef.current) {
                resizeObserver.unobserve(modalContentRef.current);
            }
            resizeObserver.disconnect(); // Disconnect the observer to ensure it's cleaned up
        };
    }, []);

    const navigateTitle = () => {
        if (location.pathname !== `/watch/${movieData.id}`) {
            navigate(`/watch/m-${movieData.id}`)
        }
    }


    if (fetchLoading) {
        return (
            <div className={`modal`} id="movieModal">
              <div className={`modal-content`}>
                <div className="spinner-container" style={{display:"flex"}}>
                  <div className="spinner-border"></div>
                </div>
              </div>
            </div>
        )
    }

    return (
        <div className={`modal`} id="movieModal">
            <div className={`modal-content`} id="modal-content"  ref={modalContentRef}>
                <div className='header' style={{ width: '100%', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: '50px', marginBottom: 10, marginTop: 10 }}>
                    <h1 style={{paddingBottom: 10, paddingLeft: 10}}>{isEdit ? "Edit" : "Upload"} Movie</h1>
                    {vidExist.exist && isEdit && (<button className='banner_play_button' style={{marginBottom: 12, marginLeft: 10}} onClick={navigateTitle}>
                        <FaPlay style={{fontSize:20, paddingRight:'0px'}}/>Play
                    </button>)}
                    <span className="closeButton" onClick={handleCloseForm} style={{ position: 'absolute', top: '0', right: '0', margin: '10px' }}><CloseOutlined /></span>
                </div>
                <form required className="upload__form">
                    {fetchType === 'new' && (
                        <AutoComplete
                            style={{
                                width: "80%",
                                placeholderColor: '#1890ff',
                                paddingLeft: 16,
                                marginBottom: 16
                            }}
                            options={suggestions}
                            loading={loadingMovies}
                            onSearch={fetchMovies}
                            onSelect={handleSearch}
                            placeholder="Search for movies"
                        />
                    )}
                    <FormGroup label="Movie ID" name="id" type="number" value={movieData.id} onChange={handleChange} error={inputErrors} success={inputSuccess} required disabled={movieID !== undefined} />
                    <FormGroup label="Movie Title" name="title" value={movieData.title} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                    <TextareaFormGroup label="Movie Overview" name="overview" value={movieData.overview} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                    <FormGroup label="Movie Tagline" name="tagline" value={movieData.tagline} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                    <FormGroup label="Movie Release Date" type="date" name="release_date" value={movieData.release_date} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                    <FormGroup label="Movie Vote average" type="number" step={0.1} name="vote_average" value={movieData.vote_average} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                    <FormGroup label="Movie Genres (separated by ', ')" name="genres" value={movieData.genres} onChange={handleChange} error={inputErrors} success={inputSuccess} required />
                    <FormGroup label="Movie Keywords (separated by ', ')" name="keywords" value={movieData.keywords} onChange={handleChange} error={inputErrors} success={inputSuccess} />
                    <FormGroup label="Movie poster path" name="poster_path" value={movieData.poster_path} onChange={handleChange} error={inputErrors} success={inputSuccess} required btnText={showPoster ? "Hide Image" : "Show Image"} btnOnClick={(e) => setShowPoster(!showPoster)} showBtn={inputSuccess.poster_path}/>
                    {showPoster && (<img src={`${API_URL}/cdn/images${movieData.poster_path}`} style={{marginBottom: 10, borderRadius: 10, height:400}} />)}
                    <FormGroup label="Movie backdrop path" name="backdrop_path" value={movieData.backdrop_path} onChange={handleChange} error={inputErrors} success={inputSuccess} required btnText={showBackdrop ? "Hide Image" : "Show Image"} btnOnClick={(e) => setShowBackdrop(!showBackdrop)} showBtn={inputSuccess.backdrop_path} />
                    {showBackdrop && (<img src={`${API_URL}/cdn/images${movieData.backdrop_path}`} style={{marginBottom: 10, borderRadius: 10}} />)}
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
                        <label htmlFor="force">Upload File:</label>
                        {(movieData.force === true || fetchType === 'new' || !vidExist.exist) && (<Upload
                            name="vid_movie"
                            beforeUpload={(file, fileList) => {
                                console.log(file)
                                setMovieData({
                                    ...movieData,
                                    vid_movie: file
                                })
                                const url = URL.createObjectURL(file);
                                setVideoPreviewUrl(url);

                                return false;
                            }}
                            onRemove={(file) => {
                                setVideoPreviewUrl(null)
                            }}
                            // accept="video/mp4"
                        >
                            <Icon type="upload" /> Upload a video
                        </Upload>)}
                        {(vidExist.message && (movieData.force !== true || !vidExist.exist)) && (
                            <Alert
                            closable={true}
                            message={vidExist.message}
                            type={vidExist.exist ? 'success' : 'error'}
                            />
                        )}
                    </div>
                </form>
                {(videoPreviewUrl || vidExist.exist === true) && (
                    <div className="video-container" style={{ marginTop: '20px' }}>
                        <div className="divider"/>
                        <video
                            controls
                            autoPlay
                            muted
                            width="420" height="340"
                            src={vidExist.exist ? `${API_URL}/api/stream/m-${movieData.id}` : videoPreviewUrl}
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
                        {isEdit && (<button className="profile_delete_btn" onClick={() => openDelForm(movieData.id, movieData.title)}>Delete Movie</button>)}
                    </div>
                </div>
            </div>
        </div>
    )
}


export default MovieEditModal