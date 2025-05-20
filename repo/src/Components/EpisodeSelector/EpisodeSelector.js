import React, { useState, useEffect } from 'react';
import { Dropdown, Menu, Skeleton } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom'; // Add this import
import { API_URL } from '../../config';
import './EpisodeSelector.css';

const EpisodeSelector = ({ showId, onEpisodeSelect }) => {
    const navigate = useNavigate(); // Initialize navigate
    const [seasons, setSeasons] = useState([]);
    const [selectedSeason, setSelectedSeason] = useState(1);
    const [episodes, setEpisodes] = useState([]);
    const [show, setShow] = useState(null);
    const [loading, setLoading] = useState(true);
    const [hoveredEpisode, setHoveredEpisode] = useState(null);
    const [watchProgress, setWatchProgress] = useState({});

    useEffect(() => {
        const fetchShowDetails = async () => {
            try {
                setLoading(true);
                const response = await fetch(`${API_URL}/api/shows/${showId}`);
                const data = await response.json();
                
                if (data.seasons && Array.isArray(data.seasons)) {
                    setSeasons(data.seasons);
                    setShow(data);
                    if (data.seasons.length > 0) {
                        setSelectedSeason(data.seasons[0].season_number);
                        setEpisodes(data.seasons[0].episodes || []);
                        
                        // Fetch watch progress for this show's episodes
                        await fetchWatchProgress(showId);
                    }
                }
            } catch (error) {
                console.error('Error fetching show details:', error);
            } finally {
                setLoading(false);
            }
        };

        const fetchWatchProgress = async (showId) => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;
                
                const response = await fetch(`${API_URL}/api/watch-history/show/${showId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const progressMap = {};
                    
                    // Convert the array to a map where keys are episodeIds
                    data.forEach(item => {
                        progressMap[item.episodeId] = item.progress;
                    });
                    
                    setWatchProgress(progressMap);
                }
            } catch (error) {
                console.error('Error fetching watch progress:', error);
            }
        };

        if (showId) {
            fetchShowDetails();
        }
    }, [showId]);

    const handleSeasonChange = (season) => {
        setSelectedSeason(season);
        const seasonData = seasons.find(s => s.season_number === season);
        setEpisodes(seasonData?.episodes || []);
    };

    const handleEpisodeSelect = (seasonNumber, episodeNumber) => {
        const episodeId = `t-${showId}-${seasonNumber}-${episodeNumber}`;
        if (onEpisodeSelect) {
            // Use the callback if provided
            onEpisodeSelect(episodeId);
        } else {
            // Otherwise navigate directly
            navigate(`/watch/${episodeId}`);
        }
    };

    const menu = (
        <Menu className="netflix-dropdown-menu">
            {seasons.map(season => (
                <Menu.Item key={season.season_number} onClick={() => handleSeasonChange(season.season_number)}>
                    Season {season.season_number}
                </Menu.Item>
            ))}
        </Menu>
    );

    if (loading) {
        return (
            <div className="netflix-episodes-container">
                <div className="netflix-season-selector netflix-skeleton">
                    <Skeleton.Button active size="default" style={{ width: 120 }} />
                </div>
                {[1, 2, 3].map(i => (
                    <div className="netflix-episode-skeleton" key={i}>
                        <Skeleton.Image className="netflix-thumbnail-skeleton" active />
                        <div className="netflix-details-skeleton">
                            <Skeleton active paragraph={{ rows: 2 }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="netflix-episodes-container">
            <div className='netflix-episode-header'>
                <h1 className='more-like-this_title'>Episodes</h1>
                <div className="netflix-season-selector">
                    <Dropdown overlay={menu} trigger={['click']} overlayClassName="netflix-season-dropdown-overlay">
                        <button className="netflix-season-dropdown">
                            Season {selectedSeason} <DownOutlined />
                        </button>
                    </Dropdown>
                </div>
            </div>
            
            
            <div className="netflix-episodes-list">
                {episodes.length > 0 ? (
                    episodes.map(episode => {
                        const episodeId = `${showId}${selectedSeason}${episode.episode_number}`;
                        const progress = watchProgress[episodeId] || 0;
                        
                        return (
                            <div 
                                key={episode.episode_number} 
                                className="netflix-episode" 
                                onClick={() => handleEpisodeSelect(selectedSeason, episode.episode_number)}
                                onMouseEnter={() => setHoveredEpisode(episode.episode_number)}
                                onMouseLeave={() => setHoveredEpisode(null)}
                            >
                                <div className="netflix-episode-number">
                                    {episode.episode_number}
                                </div>
                                
                                <div className="netflix-episode-thumbnail">
                                    <img 
                                        src={show?.backdrop_path ? `${API_URL}/cdn/images/${show.backdrop_path}` : `${API_URL}/cdn/images/thumbnail_placeholder.jpg`}
                                        alt={episode.title}
                                        onError={(e) => {e.target.src = `${API_URL}/cdn/images/thumbnail_placeholder.jpg`}}
                                    />
                                    {hoveredEpisode === episode.episode_number && (
                                        <div className="netflix-episode-play-overlay">
                                            <div className="netflix-play-button">
                                                <svg viewBox="0 0 24 24">
                                                    <path d="M4 2.69127C4 1.93067 4.81547 1.44851 5.48192 1.81506L22.4069 11.1238C23.0977 11.5037 23.0977 12.4963 22.4069 12.8762L5.48192 22.1849C4.81546 22.5515 4 22.0693 4 21.3087V2.69127Z" fill="currentColor"></path>
                                                </svg>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {progress > 0 && (
                                        <div className="netflix-episode-progress-container">
                                            <div 
                                                className="netflix-episode-progress-bar" 
                                                style={{ width: `${progress}%` }}
                                            ></div>
                                        </div>
                                    )}
                                </div>
                                
                                <div className="netflix-episode-details">
                                    <div className="netflix-episode-header">
                                        <h3 className="netflix-episode-title">{episode.title}</h3>
                                        <span className="netflix-episode-runtime">{episode.runtime || '45'}m</span>
                                    </div>
                                    <p className="netflix-episode-description">{episode.overview}</p>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="netflix-no-episodes">No episodes available for this season.</div>
                )}
            </div>
        </div>
    );
};

export default EpisodeSelector;