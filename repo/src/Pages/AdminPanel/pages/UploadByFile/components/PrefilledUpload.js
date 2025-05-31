import React, { useState } from 'react';
import { Button, Typography, Card, Tag, message, Modal } from 'antd';
import { PlayCircleOutlined, DesktopOutlined, EditOutlined, UploadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import UnifiedUploadModal from './UnifiedUploadModal';
import '../AddByFile.css';

const { Text, Title } = Typography;

const PrefilledUpload = ({ parsedData, onUploadComplete, onBack }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [currentUploadData, setCurrentUploadData] = useState(null);
    const [currentUploadType, setCurrentUploadType] = useState(null); // 'movie' or 'tv_show'
    const navigate = useNavigate();

    const handleMovieUpload = (movie) => {
        const transformedMovieData = transformMovieDataForModal(movie);
        setCurrentUploadData(transformedMovieData);
        setCurrentUploadType('movie');
        setShowUploadModal(true);
    };

    const handleTVShowUpload = (show) => {
        const transformedShowData = transformShowDataForModal(show);
        setCurrentUploadData(transformedShowData);
        setCurrentUploadType('tv_show');
        setShowUploadModal(true);
    };

    // Transform parsed movie data to MovieEditModal format
    const transformMovieDataForModal = (movie) => {
        return {
            id: movie.cdn_data?.id || '',
            title: movie.title || '',
            overview: movie.cdn_data?.overview || '',
            tagline: movie.cdn_data?.tagline || '',
            release_date: movie.cdn_data?.release_date || movie.year ? `${movie.year}-01-01` : '',
            vote_average: movie.cdn_data?.vote_average || '',
            genres: movie.cdn_data?.genres || '',
            keywords: movie.cdn_data?.keywords || '',
            poster_path: movie.cdn_data?.poster_path || '',
            backdrop_path: movie.cdn_data?.backdrop_path || '',
            runtime: movie.cdn_data?.runtime || '',
            production_companies: movie.cdn_data?.production_companies || '',
            production_countries: movie.cdn_data?.production_countries || '',
            spoken_languages: movie.cdn_data?.spoken_languages || '',
            budget: movie.cdn_data?.budget || '',
            revenue: movie.cdn_data?.revenue || '',
            status: movie.cdn_data?.status || '',
            has_subtitles: false,
            in_production: false,
            force: false,
            vid_movie: null,
            // Add file data for reference
            files: movie.files || []
        };
    };

    // Transform parsed show data to TvShowEditModal format
    const transformShowDataForModal = (show) => {
        // Transform episodes data to the expected format
        console.log("transforming", show);
        
        let transformedSeasons;
        
        // Prioritize CDN seasons data if available
        if (show.cdn_data?.seasons && Array.isArray(show.cdn_data.seasons)) {
            console.log("Using CDN seasons data for", show.title);
            transformedSeasons = show.cdn_data.seasons.map(season => ({
                seasonNumber: season.season_number,
                episodes: season.episodes?.map(episode => {
                    // Find corresponding filename from GuessIt data
                    const guessItEpisode = show.episodes?.[season.season_number]?.find(
                        ep => ep.episode === episode.episode_number
                    );
                    
                    return {
                        episodeNumber: episode.episode_number,
                        title: episode.name || `Episode ${episode.episode_number}`,
                        overview: episode.overview || '',
                        has_subtitles: false,
                        videoFile: null,
                        filename: guessItEpisode?.filename || '',
                        // Additional CDN episode data
                        air_date: episode.air_date,
                        runtime: episode.runtime,
                        still_path: episode.still_path,
                        vote_average: episode.vote_average,
                        episode_type: episode.episode_type,
                        production_code: episode.production_code
                    };
                }) || []
            }));
        } else {
            // Fallback to GuessIt data if CDN seasons are not available
            console.log("Using GuessIt episodes data for", show.title, "- CDN seasons not available");
            transformedSeasons = Object.entries(show.episodes || {}).map(([seasonNumber, episodes]) => ({
                seasonNumber: parseInt(seasonNumber),
                episodes: episodes.map(episode => ({
                    episodeNumber: episode.episode,
                    title: episode.title || `Episode ${episode.episode}`,
                    overview: episode.overview || '',
                    has_subtitles: false,
                    videoFile: null,
                    filename: episode.filename
                }))
            }));
        }

        return {
            show_id: show.cdn_data?.id || '',
            title: show.title || '',
            genres: show.cdn_data?.genres || '',
            created_by: show.cdn_data?.created_by || '',
            overview: show.cdn_data?.overview || '',
            poster_path: show.cdn_data?.poster_path || '',
            backdrop_path: show.cdn_data?.backdrop_path || '',
            vote_average: show.cdn_data?.vote_average || '',
            tagline: show.cdn_data?.tagline || '',
            spoken_languages: show.cdn_data?.spoken_languages || '',
            first_air_date: show.cdn_data?.first_air_date || (show.year ? `${show.year}-01-01` : ''),
            last_air_date: show.cdn_data?.last_air_date || '',
            production_companies: show.cdn_data?.production_companies || '',
            production_countries: show.cdn_data?.production_countries || '',
            networks: show.cdn_data?.networks || '',
            status: show.cdn_data?.status || '',
            seasons: transformedSeasons,
            // Add episode files for reference
            episodeFiles: show.episodes || {}
        };
    };

    const handleModalClose = () => {
        setShowUploadModal(false);
        setCurrentUploadData(null);
        setCurrentUploadType(null);
    };

    const handleUploadSuccess = () => {
        message.success('Upload completed successfully!');
        // Optionally refresh the parent component or update state
    };

    const handleBulkUpload = () => {
        Modal.confirm({
            title: 'Bulk Upload Confirmation',
            content: `This will redirect you to upload ${parsedData.movies?.length || 0} movies and ${parsedData.tv_shows?.length || 0} TV shows individually. Continue?`,
            onOk: () => {
                if (parsedData.movies?.length > 0) {
                    handleMovieUpload(parsedData.movies[0]);
                } else if (parsedData.tv_shows?.length > 0) {
                    handleTVShowUpload(parsedData.tv_shows[0]);
                }
            }
        });
    };

    const renderMovieItem = (movie) => (
        <div key={`movie-${movie.title}-${movie.year}`} className="upload-item">
            <div className="item-header">
                <div className="item-title">
                    <PlayCircleOutlined style={{ marginRight: 8 }} />
                    {movie.title}
                </div>
                <div className="item-type">Movie</div>
            </div>
            
            <div className="item-summary">
                Year: {movie.year || 'Unknown'} • Files: {movie.files.length} • 
                CDN Match: {movie.cdn_data ? 'Found' : 'Not Found'}
            </div>
            
            <div style={{ marginBottom: '16px' }}>
                <Text style={{ color: '#a0a0a0', fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                    FILES:
                </Text>
                {movie.files.map((file, idx) => (
                    <Tag key={idx} style={{ marginBottom: '4px', display: 'block' }}>
                        {file}
                    </Tag>
                ))}
            </div>
            
            <div className="upload-actions">
                <Button 
                    type="primary" 
                    icon={<UploadOutlined />}
                    className="upload-btn"
                    onClick={() => handleMovieUpload(movie)}
                >
                    Upload Movie
                </Button>
                <Button 
                    icon={<EditOutlined />}
                    className="edit-btn"
                    onClick={() => handleMovieUpload(movie)}
                >
                    Edit & Upload
                </Button>
            </div>
        </div>
    );

    const renderTVShowItem = (show) => (
        <div key={`show-${show.title}-${show.year}`} className="upload-item">
            <div className="item-header">
                <div className="item-title">
                    <DesktopOutlined style={{ marginRight: 8 }} />
                    {show.title}
                </div>
                <div className="item-type">TV Show</div>
            </div>
            
            <div className="item-summary">
                Year: {show.year || 'Unknown'} • 
                Seasons: {Object.keys(show.episodes).length} • 
                Episodes: {Object.values(show.episodes).reduce((total, season) => total + season.length, 0)} • 
                CDN Match: {show.cdn_data ? 'Found' : 'Not Found'}
            </div>
            
            <div style={{ marginBottom: '16px' }}>
                <Text style={{ color: '#a0a0a0', fontSize: '12px', display: 'block', marginBottom: '8px' }}>
                    EPISODES BY SEASON:
                </Text>
                {Object.entries(show.episodes).map(([season, episodes]) => (
                    <div key={season} style={{ marginBottom: '8px' }}>
                        <Text strong style={{ color: '#e0e0e0', fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                            Season {season} ({episodes.length} episodes):
                        </Text>
                        {episodes.slice(0, 3).map((episode, idx) => (
                            <Tag key={idx} style={{ marginBottom: '2px', marginRight: '4px' }}>
                                E{episode.episode}: {episode.filename.length > 30 ? 
                                    episode.filename.substring(0, 30) + '...' : 
                                    episode.filename
                                }
                            </Tag>
                        ))}
                        {episodes.length > 3 && (
                            <Tag style={{ backgroundColor: '#3a4966', color: '#a0a0a0' }}>
                                +{episodes.length - 3} more
                            </Tag>
                        )}
                    </div>
                ))}
            </div>
            
            <div className="upload-actions">
                <Button 
                    type="primary" 
                    icon={<UploadOutlined />}
                    className="upload-btn"
                    onClick={() => handleTVShowUpload(show)}
                >
                    Upload Show
                </Button>
                <Button 
                    icon={<EditOutlined />}
                    className="edit-btn"
                    onClick={() => handleTVShowUpload(show)}
                >
                    Edit & Upload
                </Button>
            </div>
        </div>
    );

    const totalItems = (parsedData?.movies?.length || 0) + (parsedData?.tv_shows?.length || 0);

    return (
        <div className="prefilled-upload-container">
            <div className="upload-header">
                <Title level={2} className="upload-title">Ready to Upload</Title>
                <Text className="upload-description">
                    Click on individual items to upload them with pre-filled forms, or use bulk upload to process all items.
                </Text>
            </div>

            <div className="upload-items">
                {parsedData?.movies?.map(renderMovieItem)}
                {parsedData?.tv_shows?.map(renderTVShowItem)}
            </div>

            <div className="action-buttons">
                <Button className="back-button" onClick={onBack}>
                    Back to Review
                </Button>
                
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button 
                        type="primary" 
                        size="large"
                        onClick={handleBulkUpload}
                        disabled={totalItems === 0}
                    >
                        Start Bulk Upload ({totalItems} items)
                    </Button>
                    
                    <Button 
                        size="large"
                        onClick={onUploadComplete}
                    >
                        Finish & Reset
                    </Button>
                </div>
            </div>

            <div style={{ 
                marginTop: '24px', 
                padding: '16px', 
                backgroundColor: '#2a304d', 
                borderRadius: '8px',
                border: '1px solid #3a4966'
            }}>
                <Text style={{ color: '#a0a0a0', fontSize: '14px' }}>
                    <strong>Instructions:</strong><br />
                    • Each item will open in the standard upload form with pre-filled metadata<br />
                    • Files are not automatically uploaded - you'll need to select and upload them manually<br />
                    • CDN matches (if found) will pre-populate most fields automatically<br />
                    • You can edit any pre-filled information before uploading
                </Text>
            </div>

            {/* Unified Upload Modal */}
            {showUploadModal && currentUploadData && currentUploadType && (
                <UnifiedUploadModal
                    isVisible={showUploadModal}
                    onClose={handleModalClose}
                    onSuccess={handleUploadSuccess}
                    type={currentUploadType}
                    prefilledData={currentUploadData}
                />
            )}
        </div>
    );
};

export default PrefilledUpload;
