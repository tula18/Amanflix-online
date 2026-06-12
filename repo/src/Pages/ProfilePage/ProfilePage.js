import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { MdExpandMore } from 'react-icons/md';
import { API_URL } from '../../config';
import './ProfilePage.css'
import PasswordFormGroup from "../AdminPanel/Components/FormGroup/PasswordFormGroup";
import MovieModal from "../../Components/Model/Model";

const DeleteAccount = ({onClose}) => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const toggle = () => {
        onClose();
    };

    const handleDeleteAccount = () => {
        setLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('password', password);
        fetch(`${API_URL}/api/auth/delete`, {
            method: 'DELETE',
            headers: {
                // 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        }).then((res) => {
            res.json().then((json) => {
              console.log(json);
              if (res.status === 200) {
                setMessage(json.message);
                navigate('/')
              } else {
                setMessage(json.message);
                setLoading(false);
              }
            }).catch(err => {
              console.log(String(err));
              setMessage(String(err));
              setLoading(false);
            })
          })
        // .catch(error => {
        //     console.error("Error updating profile:", error);
        //     setMessage('Error updating profile. Please try again later.');
        // });
        setLoading(false);

    };

    const handleToggle = () => {
        setPassword('');
        toggle();
    };

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Delete Account</h4>
                <p>Are you sure you want to delete your account? This action is irreversible.</p>
                <PasswordFormGroup label={'Current Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={handleToggle}>
                        Cancel
                    </button>
                    <button type="button" className="profile_delete_btn" onClick={handleDeleteAccount}>
                        {loading ? "Deleting..." : "Delete Account"}
                    </button>
                </div>
                <div className="profile-message">
                    {message}
                </div>
            </div>
        </div>
    )
}

const HISTORY_PAGE_SIZE = 12;

const getHistoryProgress = (item) => {
    if (!item.watch_history || item.watch_history.is_completed) return 0;
    return item.watch_history.progress_percentage || 0;
};

const getHistoryTypeLabel = (item) => {
    const mediaType = item.media_type || item.content_type;
    return mediaType === 'tv' ? 'TV Show' : 'Movie';
};

const isTvHistoryItem = (item) => {
    const mediaType = item.media_type || item.content_type;
    return mediaType === 'tv';
};

const getHistoryItemKey = (item) => {
    const mediaType = item.media_type || item.content_type || item.watch_history?.content_type;
    const contentId = item.id || item.show_id || item.movie_id || item.watch_history?.content_id;
    return `${mediaType}-${contentId}`;
};

const getWatchedEpisodes = (item) => {
    return Array.isArray(item.watched_episodes) ? item.watched_episodes : [];
};

const formatHistoryDate = (dateTime) => {
    const date = new Date(dateTime);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
};

const getHistoryStatus = (item) => {
    const progress = Math.round(item.watch_history?.progress_percentage || 0);

    if (item.watch_history?.is_completed) {
        return 'Watched';
    }

    if (progress > 0) {
        return `${progress}% watched`;
    }

    return 'Started';
};

const getHistoryDetail = (item) => {
    const mediaType = item.media_type || item.content_type;

    if (mediaType !== 'tv' || !item.watch_history) {
        return 'Movie';
    }

    return 'TV Show';
};

const getLastWatchedPoint = (item) => {
    const mediaType = item.media_type || item.content_type;

    if (mediaType !== 'tv' || !item.watch_history) {
        return null;
    }

    if (item.watch_history.season_number == null || item.watch_history.episode_number == null) {
        return null;
    }

    return `Last watched S${item.watch_history.season_number} E${item.watch_history.episode_number}`;
};

const formatEpisodeTitle = (episodeHistory) => {
    return episodeHistory.episode_details?.title || 'Episode';
};

const formatEpisodeBadge = (episodeHistory) => {
    return `S${episodeHistory.season_number} E${episodeHistory.episode_number}`;
};

const getHistoryImageSrc = (item) => {
    const path = item.backdrop_path || item.poster_path;

    if (!path) {
        return `${API_URL}/cdn/images/unkwon_image.jpg`;
    }

    return `${API_URL}/cdn/images${path.startsWith('/') ? path : `/${path}`}`;
};

const WatchHistorySection = ({ token }) => {
    const [historyItems, setHistoryItems] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [selectedMovie, setSelectedMovie] = useState(null);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [expandedShows, setExpandedShows] = useState({});

    const fetchHistory = useCallback(async (nextPage = 1) => {
        if (!token) {
            setIsLoading(false);
            return;
        }

        try {
            if (nextPage === 1) {
                setIsLoading(true);
            } else {
                setIsLoadingMore(true);
            }

            setError('');

            const response = await fetch(`${API_URL}/api/watch-history/history?page=${nextPage}&per_page=${HISTORY_PAGE_SIZE}`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load watch history');
            }

            setHistoryItems(prevItems => nextPage === 1 ? data.items : [...prevItems, ...data.items]);
            setHasMore(Boolean(data.has_more));
            setPage(data.page || nextPage);
        } catch (err) {
            setError(err.message || 'Failed to load watch history');
        } finally {
            setIsLoading(false);
            setIsLoadingMore(false);
        }
    }, [token]);

    useEffect(() => {
        fetchHistory(1);
    }, [fetchHistory]);

    const handleMovieClick = (movie, event) => {
        if (event) {
            event.stopPropagation();
        }

        setSelectedMovie(movie);
        setShowHistoryModal(true);

        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    };

    const handleModalClose = () => {
        setSelectedMovie(null);
        setShowHistoryModal(false);

        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.remove('navbar_hide');
        }
    };

    const handleHistoryImageError = (event) => {
        event.currentTarget.src = `${API_URL}/cdn/images/unkwon_image.jpg`;
    };

    const handleToggleEpisodes = (item, event) => {
        event.stopPropagation();
        const itemKey = getHistoryItemKey(item);

        setExpandedShows(prevState => ({
            ...prevState,
            [itemKey]: !prevState[itemKey]
        }));
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showHistoryModal && (event.target.classList.contains('modal') || event.key === 'Escape')) {
                handleModalClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleClickOutside);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleClickOutside);
        };
    }, [showHistoryModal]);

    useEffect(() => {
        if (showHistoryModal) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }

        return () => {
            document.body.classList.remove('no-scroll');
        };
    }, [showHistoryModal]);

    return (
        <section className="watch-history-section" aria-labelledby="watch-history-title">
            <div className="watch-history-header">
                <h2 id="watch-history-title">Watch History</h2>
                {!isLoading && historyItems.length > 0 && (
                    <span className="watch-history-count">{historyItems.length} shown</span>
                )}
            </div>

            {isLoading ? (
                <div className="watch-history-state">Loading...</div>
            ) : error ? (
                <div className="watch-history-state watch-history-error">{error}</div>
            ) : historyItems.length === 0 ? (
                <div className="watch-history-state">No watch history yet.</div>
            ) : (
                <>
                    <ul className="watch-history-list">
                        {historyItems.map((item) => {
                            const progress = getHistoryProgress(item);
                            const lastWatchedPoint = getLastWatchedPoint(item);
                            const itemKey = getHistoryItemKey(item);
                            const watchedEpisodes = getWatchedEpisodes(item);
                            const isTv = isTvHistoryItem(item);
                            const isExpanded = Boolean(expandedShows[itemKey]);

                            return (
                                <li className={`watch-history-item${isExpanded ? ' watch-history-item--expanded' : ''}`} key={itemKey}>
                                    <div className="watch-history-row">
                                        <button className="watch-history-main-button" onClick={(event) => handleMovieClick(item, event)}>
                                            <span className="watch-history-thumb">
                                                <img
                                                    src={getHistoryImageSrc(item)}
                                                    alt=""
                                                    loading="lazy"
                                                    draggable="false"
                                                    onError={handleHistoryImageError}
                                                />
                                            </span>
                                            <span className="watch-history-copy">
                                                <span className="watch-history-title">{item.title || item.name || 'Title not available'}</span>
                                                <span className="watch-history-detail">
                                                    {getHistoryDetail(item)}
                                                    {isTv && watchedEpisodes.length > 0 ? ` - ${watchedEpisodes.length} watched episode${watchedEpisodes.length === 1 ? '' : 's'}` : ''}
                                                    {lastWatchedPoint ? ` - ${lastWatchedPoint}` : ''}
                                                </span>
                                                <span className="watch-history-date">
                                                    {getHistoryStatus(item)} - {formatHistoryDate(item.watch_history.last_watched)}
                                                </span>
                                                {progress > 0 && (
                                                    <span className="watch-history-progress" aria-label={`${Math.round(progress)} percent watched`}>
                                                        <span style={{ width: `${progress}%` }} />
                                                    </span>
                                                )}
                                            </span>
                                        </button>
                                        <span className="watch-history-actions">
                                            <span className="watch-history-type">{getHistoryTypeLabel(item)}</span>
                                            {isTv && watchedEpisodes.length > 0 && (
                                                <button
                                                    className="watch-history-expand"
                                                    type="button"
                                                    onClick={(event) => handleToggleEpisodes(item, event)}
                                                    aria-expanded={isExpanded}
                                                    aria-label={`${isExpanded ? 'Hide' : 'Show'} watched episodes for ${item.title || item.name || 'this show'}`}
                                                >
                                                    <span>Episodes</span>
                                                    <MdExpandMore />
                                                </button>
                                            )}
                                        </span>
                                    </div>
                                    {isTv && isExpanded && (
                                        <ul className="watch-history-episodes">
                                            {watchedEpisodes.map((episodeHistory) => {
                                                const episodeProgress = episodeHistory.is_completed ? 0 : episodeHistory.progress_percentage || 0;

                                                return (
                                                    <li className="watch-history-episode" key={episodeHistory.id}>
                                                        <span className="watch-history-episode-copy">
                                                            <span className="watch-history-episode-badge">{formatEpisodeBadge(episodeHistory)}</span>
                                                            <span className="watch-history-episode-title">{formatEpisodeTitle(episodeHistory)}</span>
                                                        </span>
                                                        <span className="watch-history-episode-meta">
                                                            {getHistoryStatus({ watch_history: episodeHistory })} - {formatHistoryDate(episodeHistory.last_watched)}
                                                        </span>
                                                        {episodeProgress > 0 && (
                                                            <span className="watch-history-progress watch-history-episode-progress" aria-label={`${Math.round(episodeProgress)} percent watched`}>
                                                                <span style={{ width: `${episodeProgress}%` }} />
                                                            </span>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>

                    {hasMore && (
                        <button
                            className="watch-history-load-more"
                            onClick={() => fetchHistory(page + 1)}
                            disabled={isLoadingMore}
                        >
                            {isLoadingMore ? 'Loading...' : 'Load More'}
                        </button>
                    )}
                </>
            )}

            {showHistoryModal && selectedMovie && (
                <MovieModal
                    movie={selectedMovie}
                    onClose={handleModalClose}
                    handleMovieClick={handleMovieClick}
                />
            )}
        </section>
    );
};

const ProfilePage = () => {
    const token = localStorage.getItem('token')
    const [user, setUser] = useState({});
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [message, setMessage] = useState('');
    const [saveLoading, setSaveLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        if (token) {
          const customHeaders = {
            Authorization: `Bearer ${token}`,
          };
          fetch(`${API_URL}/api/auth/profile`, {
              method: 'GET',
              headers: customHeaders,
          }).then(res => {
            res.json().then(json => {
              console.log(json);
              if (res.status === 200) {
                setUser(json);
                setUsername(json.username)
                setEmail(json.email)
              }
            })
          })
        }
        
      }, [setUser, token])

    const handleUpdate = () => {
        setSaveLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('username', username);
        formData.append('email', email);

        if (password && newPassword) {
            formData.append('newPassword', newPassword)
            formData.append('password', password);
        }

        fetch(`${API_URL}/api/auth/update`, {
            method: 'POST',
            headers: {
                // 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            setMessage('Profile updated successfully!');
            setUsername(data.username || user.username);
            setEmail(data.email || user.email);
            setMessage(data.message);
            setNewPassword('');
            setPassword('')
        })
        .catch(error => {
            console.error("Error updating profile:", error);
            setMessage('Error updating profile. Please try again later.');
        });
        setSaveLoading(false);
    }

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

    const handleModalOpen = (e) => {
        e.stopPropagation();
        setShowModal(true)
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    }

    const handleModalClose = () => {
        let timeoutId;
        clearTimeout(timeoutId);
         timeoutId = setTimeout(() => console.log('hello'), 1000); // 2000ms = 2s
        setShowModal(false);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.remove('navbar_hide');
        }
    };

    function formatDateTime(dateTime) {
        const date = new Date(dateTime);

        if (Number.isNaN(date.getTime())) {
            return '';
        }
    
        const dayOfWeek = date.toLocaleString('en-US', { weekday: 'long' });
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const day = date.getDate();
    
        return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()}`;
    }

    return (
        <div className="ProfilePage">
            <div className="profile__form__wrapper">
                <h2>Manage Your Account</h2>
                <div className="divider"/>
                <div className="profile__form">
                    <div className="form_content">
                        <div className="first-sec">
                            <img alt="Profile Avatar" loading={'lazy'} draggable="false" className='profile-image-big' src={`${API_URL}/cdn/images/profile.png`} />
                            <div className="first-sec__inputs">
                                <div className="form-group">
                                    <label htmlFor="username">Username</label>
                                    <input 
                                        type={"text"}
                                        id="username"
                                        name="username"
                                        placeholder="Username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="email">Email</label>
                                    <input 
                                        type={"email"}
                                        id="email"
                                        placeholder='Email'
                                        name="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div  className="password-sec">
                            <div className="password-sec_inputs">
                                <div className="divider"/>
                                <h2>Change Password</h2>
                                <PasswordFormGroup className="sidebar_form-group" label={'Current Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
                                <PasswordFormGroup className="sidebar_form-group" label={'New Password'} name="newpassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{width: 'auto'}} required />
                            </div>
                        </div>
                        <div  className="password-sec">
                            <div className="password-sec_inputs">
                                <div className="divider"/>
                                <h2>Info</h2>
                                <div className="form-group">
                                    <label htmlFor="created">Created at</label>
                                    <input 
                                        type={"text"}
                                        id="created"
                                        name="created"
                                        placeholder="created"
                                        value={formatDateTime(user.created_at)}
                                        disabled
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="updated">Updated at</label>
                                    <input 
                                        type={"text"}
                                        id="updated"
                                        name="updated"
                                        placeholder="updated"
                                        value={formatDateTime(user.updated_at)}
                                        disabled
                                    />
                                </div>
                                
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="divider"/>
                        <div className="profile-form_buttons">
                            <button className="profile_save_btn" onClick={handleUpdate} disabled={saveLoading}>{saveLoading ? 'Saving' : "Save"}</button>
                            <button className="profile_delete_btn" onClick={handleModalOpen} >Delete Account</button>
                        </div>
                    </div>
                </div>
                <div className="profile-message">
                    {message}
                </div>
            </div>
            {showModal && (
                <DeleteAccount
                onClose={handleModalClose}
                />
            )}
            <WatchHistorySection token={token} />
        </div>
    )
}

export default ProfilePage
