import { Flex, Tooltip, Button, Input, message, notification, Select, Alert } from "antd";
import React, { useState, useEffect, useCallback } from "react";
import './ManageMoviesPage.css'
import Card from "../../../../Components/Card/Card";
import { API_URL } from "../../../../config";
import { CloseOutlined, PlusCircleOutlined } from "@ant-design/icons";
import MovieEditModal from "./MovieModal/MovieModal";
import { FaEye, FaEyeSlash } from "react-icons/fa6";

function NewCard() {
    return (
        <div className='newCard'>
            {/* <img ref={imgRef} onError={handleError} loading={"lazy"} onLoadStart={() => setIsLoading(true)} onLoad={() => setIsLoading(false)} className='card__image' draggable="false" src={imgSrc} alt='' srcSet=''/> */}
            <Flex justify="center" align="center" style={{position: "relative", height: "100%"}}>
                <PlusCircleOutlined style={{fontSize: "44px"}}/>
            </Flex>
            <h2>Add new Movie</h2>
        </div>
    )
}

const DeleteMovie = ({onClose, movie_id, movie_name, refresh}) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    // const [message, setMessage] = useState('');

    const toggle = () => {
        onClose();
    };

    async function handleDeleteMovie() {
        setLoading(true);
        // setMessage('');
    
        try {
            const formData = new FormData();
            formData.append('password', password);
    
            const response = await fetch(`${API_URL}/api/upload/movie/delete/${movie_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                },
                body: formData
            });
    
            const json = await response.json();
    
            if (response.status === 200) {
                // setMessage(json.message);
                // message.success(json.message)
                notification.success({message:json.message, duration: 0})
                onClose()
            } else {
                // setMessage(json.message);
                // message.error(json.message)
                notification.error({message:json.message, duration: 0})
                setLoading(false);
            }
        } catch (error) {
            console.error("Error deleting movie:", error);
            // message.error('Error deleting movie. Please try again later.');
            notification.error({message: 'Error deleting movie. Please try again later.', duration: 0})
            setLoading(false);
        } finally {
            setLoading(false)
            refresh()
            // onClose()
        }
    }

    console.log(movie_id);

    const handleToggle = () => {
        setPassword('');
        toggle();
    };

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Delete Movie: {movie_name} ({movie_id})</h4>
                <p>Are you sure you want to delete this movie? This action is irreversible.</p>
                <div className="form-group">
                    <input 
                        type={passwordVisible ? 'text' : 'password'}
                        id="password"
                        placeholder="Write your Admin Password"
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <span className="profile_eye-icon-wrapper">
                        {passwordVisible ? <FaEyeSlash className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} /> : <FaEye className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} />}
                    </span>
                </div>
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={handleToggle}>
                        Cancel
                    </button>
                    <button type="button" className="profile_delete_btn" onClick={handleDeleteMovie}>
                        {loading ? "Deleting..." : "Delete Movie"}
                    </button>
                </div>
                {/* <div className="profile-message">
                    {message}
                </div> */}
            </div>
        </div>
    )
}


const ManageMovies = () => {
    const [movies, setMovies] = useState([]);
    const [selectedMovie, setSelectedMovie] = useState(undefined);
    const [MovieName, setMovieName] = useState(undefined);
    const [query, setQuery] = useState('');
    const [fetchType, setFetchType] = useState('cdn');
    const [movieType, setMovieType] = useState('api');
    const [loadingMovies, setLoadingMovies] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [showDeleteModal, setShowDeleteModal] = useState(false)

    const { Option } = Select;

    const fetchMovies = async () => {
        if (query) {
            try {
                setMovieType(fetchType)
                setLoadingMovies(true)
                const newQuery = decodeURIComponent(query)
                console.log(fetchType);
                const res = await fetch(`${API_URL}/${fetchType}/search?q=${encodeURIComponent(newQuery)}&max_results=49&media_type=movies`)
                const data = await res.json();
                if (!res.ok) {
                    console.error({message: data.error})
                    return
                }
                setMovies(data)
            } catch (error) {
                console.error('Error validating token:', error);
            } finally {
                setLoadingMovies(false)
            }
        } else {
            try {
                // setMovies([])
                setMovieType('api')
                setLoadingMovies(true)
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/api/movies?per_page=10000`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                const data = await res.json();
                if (!res.ok) {
                    console.error({message: data.error})
                    return
                }
                setMovies(data)
            } catch (error) {
                console.error('Error validating token:', error);
            } finally {
                setLoadingMovies(false)
            }
        }
    }

    const fetchMoviesMemoized = useCallback(fetchMovies, [query])

    useEffect(() => {
        fetchMoviesMemoized();
    }, [query, fetchType, fetchMoviesMemoized])

    const handleMovieClick = (event, movie) => {
        // event.stopPropagation();
        console.log("type: ", typeof(movie));
        console.log("fetch type: ", fetchType);
        if (typeof(movie) === "object") {

            setSelectedMovie(movie.id);
        }
        setShowEditModal(true);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
      };

    const handleModalClose = () => {
        setSelectedMovie(undefined);
        setShowEditModal(false);
        // if (loadingUpload === false) {
        //     setSelectedMovie(undefined);
        //     setShowEditModal(false);
        // }
        fetchMovies();
    };

    const handleDelOpen = (movie_id, movie_name) => {
        setShowEditModal(false);
        setSelectedMovie(movie_id);
        setMovieName(movie_name);
        setShowDeleteModal(true);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
        fetchMovies();
    }

    const handleDelClose = () => {
        setShowDeleteModal(false);
        setSelectedMovie(undefined);
        fetchMovies();
    }

    useEffect(() => {
        if (showEditModal) {
          document.body.classList.add('no-scroll');
        } else {
          document.body.classList.remove('no-scroll');
        }
  
      }, [showEditModal])

    const fetchTypeOpt = [
        {value: 'cdn', label: 'CDN', title: "See all the Titles"},
        {value: 'api', label: 'API', title: "See only uploaded Titles"},
    ]

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "20px"}}>
                <h1>Manage Movies</h1>
                <h2>{movies.length} Movies</h2>
                <Flex gap={"5px"}>
                    <Select className="Movies_search_select" defaultValue={"cdn"} onChange={(val) => {
                        setFetchType(val)
                        setQuery('')
                        }}>
                        {fetchTypeOpt.map((item) => (
                                <Option key={item.value} value={item.value}><Tooltip title={item.title}>{item.label}</Tooltip></Option>
                        ))}
                    </Select>
                    <Input
                        placeholder={`Search Movies from ${fetchType.toUpperCase()}`}
                        className="Movies_search_input"
                        style={{
                            width: 300,
                        }}
                        autoComplete="none"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            e.stopPropagation()
                        }}
                    />
                    {query && query.trim() !== '' && (<Tooltip title="Clear the Input"><Button onClick={(e) => {
                                    setQuery('');
                                    e.preventDefault();
                                }}>
                        <CloseOutlined/>
                    </Button></Tooltip>)}
                    <Tooltip title={`Reload List from ${fetchType.toUpperCase()}`}>
                        <Button
                        type="primary"
                        loading={loadingMovies}
                        onClick={fetchMovies}
                        style={{
                            width: 90,
                        }}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Flex>
            </Flex>
            <div className="grid">
                <span>
                    <button className="button3" onClick={(e) => {
                        handleMovieClick(e)
                        setMovieType('new')
                        }}>
                        <NewCard/>
                    </button>
                </span>
                {movies.map((movie, idx) => (
                    <span key={idx}>
                        <button className="button3" onClick={(e) => handleMovieClick(e, movie)}>
                            <Card movie={movie}></Card>
                        </button>
                    </span>
                ))}
            </div>
            {showEditModal && (
                <MovieEditModal
                    onClose={handleModalClose}
                    movieID={selectedMovie}
                    openDelForm={handleDelOpen}
                    refresh={fetchMovies}
                    fetchType={movieType}
                />
            )}
            {showDeleteModal && (
                <DeleteMovie
                    onClose={handleDelClose}
                    movie_id={selectedMovie}
                    movie_name={MovieName}
                    refresh={fetchMovies}
                />
            )}
        </Flex>
    )
}

export default ManageMovies