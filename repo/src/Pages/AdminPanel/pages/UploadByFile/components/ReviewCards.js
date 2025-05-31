import React, { useState, useEffect } from 'react';
import { Button, Tag, Typography, Card, Row, Col, Modal, Form, Input, Select, message, Alert, Spin } from 'antd';
import { EditOutlined, PlayCircleOutlined, DesktopOutlined, ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { API_URL } from '../../../../../config';

const { Text, Title } = Typography;
const { Option } = Select;

const ReviewCards = ({ parsedData, onReviewComplete, onBack }) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editingType, setEditingType] = useState(null);
    const [editForm] = Form.useForm();
    const [localData, setLocalData] = useState(parsedData);
    const [validationResults, setValidationResults] = useState({});
    const [isValidating, setIsValidating] = useState(false);
    console.log(parsedData);
    
    // Validate content on component mount and when data changes
    useEffect(() => {
        validateAllContent();
    }, [localData]);

    const validateContent = async (contentType, contentId, episodes = null) => {
        try {
            const token = localStorage.getItem('admin_token');
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
                can_upload: true,
                errors: [{ type: 'validation_error', message: 'Could not validate content' }],
                warnings: []
            };
        }
    };

    const validateAllContent = async () => {
        setIsValidating(true);
        const results = {};
        
        try {
            // Validate movies
            if (localData.movies && localData.movies.length > 0) {
                for (const movie of localData.movies) {
                    if (movie.cdn_data?.id) {
                        const result = await validateContent('movie', movie.cdn_data.id);
                        results[`movie_${movie.cdn_data.id}`] = result;
                    }
                }
            }
            
            // Validate TV shows
            if (localData.tv_shows && localData.tv_shows.length > 0) {
                for (const show of localData.tv_shows) {
                    if (show.cdn_data?.id) {
                        // Prepare episodes data for validation
                        const episodes = [];
                        if (show.episodes) {
                            Object.keys(show.episodes).forEach(seasonNum => {
                                show.episodes[seasonNum].forEach(episode => {
                                    episodes.push({
                                        season_number: parseInt(seasonNum),
                                        episode_number: episode.episode
                                    });
                                });
                            });
                        }
                        
                        const result = await validateContent('tv', show.cdn_data.id, episodes);
                        results[`tv_${show.cdn_data.id}`] = result;
                    }
                }
            }
        } catch (error) {
            console.error('Error validating content:', error);
            message.error('Failed to validate content');
        }
        
        setValidationResults(results);
        setIsValidating(false);
    };

    const getValidationKey = (item, type) => {
        return `${type}_${item.cdn_data?.id}`;
    };

    const renderValidationStatus = (item, type) => {
        const key = getValidationKey(item, type);
        const validation = validationResults[key];
        
        if (!validation || !item.cdn_data?.id) {
            return null;
        }
        
        if (validation.errors && validation.errors.length > 0) {
            return (
                <Alert
                    type="error"
                    showIcon
                    icon={<ExclamationCircleOutlined />}
                    message="Cannot Upload"
                    description={
                        <div>
                            {validation.errors.map((error, idx) => (
                                <div key={idx}>
                                    <strong>{error.message}</strong>
                                    {error.suggestion && <div style={{ fontSize: '12px', marginTop: '4px' }}>{error.suggestion}</div>}
                                </div>
                            ))}
                        </div>
                    }
                    style={{ marginTop: '8px', fontSize: '12px' }}
                />
            );
        }
        
        if (validation.warnings && validation.warnings.length > 0) {
            return (
                <Alert
                    type="warning"
                    showIcon
                    message="Upload Warnings"
                    description={
                        <div>
                            {validation.warnings.map((warning, idx) => (
                                <div key={idx}>
                                    <strong>{warning.message}</strong>
                                    {warning.suggestion && <div style={{ fontSize: '12px', marginTop: '4px' }}>{warning.suggestion}</div>}
                                </div>
                            ))}
                        </div>
                    }
                    style={{ marginTop: '8px', fontSize: '12px' }}
                />
            );
        }
        
        if (validation.can_upload) {
            return (
                <Alert
                    type="success"
                    showIcon
                    icon={<CheckCircleOutlined />}
                    message="Ready to Upload"
                    style={{ marginTop: '8px', fontSize: '12px' }}
                />
            );
        }
        
        return null;
    };
    

    const handleEdit = (item, type) => {
        setEditingItem(item);
        setEditingType(type);
        setEditModalVisible(true);
        
        if (type === 'movie') {
            const releaseYear = item.year || (item.cdn_data?.release_date ? new Date(item.cdn_data.release_date).getFullYear().toString() : '');
            editForm.setFieldsValue({
                title: item.title || item.name,
                year: releaseYear,
                genres: Array.isArray(item.cdn_data?.genres) ? item.cdn_data.genres.join(', ') : (item.cdn_data?.genres || ''),
            });
        } else {
            const airYear = item.year || (item.cdn_data?.first_air_date ? new Date(item.cdn_data.first_air_date).getFullYear().toString() : '');
            editForm.setFieldsValue({
                title: item.title || item.name ,
                year: airYear,
                genres: Array.isArray(item.cdn_data?.genres) ? item.cdn_data.genres.join(', ') : (item.cdn_data?.genres || ''),
            });
        }
    };

    const handleEditSave = () => {
        editForm.validateFields().then(values => {
            const updatedData = { ...localData };
            
            if (editingType === 'movie') {
                const movieIndex = updatedData.movies.findIndex(m => m === editingItem);
                if (movieIndex !== -1) {
                    updatedData.movies[movieIndex] = {
                        ...editingItem,
                        title: values.title,
                        year: values.year,
                        genres: values.genres ? values.genres.split(',').map(g => g.trim()) : [],
                    };
                }
            } else {
                const showIndex = updatedData.tv_shows.findIndex(s => s === editingItem);
                if (showIndex !== -1) {
                    updatedData.tv_shows[showIndex] = {
                        ...editingItem,
                        title: values.title,
                        year: values.year,
                        genres: values.genres ? values.genres.split(',').map(g => g.trim()) : [],
                    };
                }
            }
            
            setLocalData(updatedData);
            setEditModalVisible(false);
            setEditingItem(null);
            setEditingType(null);
            message.success('Item updated successfully');
        });
    };

    const renderMovieCard = (movie) => (
        <Card
            key={`movie-${movie.title}-${movie.year}`}
            className="content-card"
            actions={[
                <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(movie, 'movie')}
                >
                    Edit
                </Button>
            ]}
        >
            <div className="card-header">
                <div className="card-title">
                    <PlayCircleOutlined style={{ marginRight: 8, color: '#e50914' }} />
                    {movie.title}
                </div>
                <div className="card-type">Movie</div>
            </div>
            
            <div className="card-content">
                <div className="metadata-grid">
                    <div className="metadata-item">
                        <div className="metadata-label">Year</div>
                        <div className="metadata-value">
                            {movie.year || 
                             (movie.cdn_data?.release_date ? new Date(movie.cdn_data.release_date).getFullYear() : '') ||
                             movie.guessit_data?.year || 
                             'Unknown'}
                        </div>
                    </div>
                    <div className="metadata-item">
                        <div className="metadata-label">CDN Match</div>
                        <div className="metadata-value">
                            {movie.cdn_data ? 'Found' : 'Not Found'}
                        </div>
                    </div>
                    {movie.genres && movie.genres.length > 0 && (
                        <div className="metadata-item" style={{ gridColumn: 'span 2' }}>
                            <div className="metadata-label">Genres</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {movie.genres.map((genre, idx) => (
                                    <Tag key={idx} className="file-tag">{genre}</Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="files-list">
                    <div className="files-title">Files ({movie.files.length})</div>
                    {movie.files.map((file, idx) => (
                        <Tag key={idx} className="file-tag" style={{ marginBottom: '4px', display: 'block' }}>
                            {file}
                        </Tag>
                    ))}
                </div>
                
                {renderValidationStatus(movie, 'movie')}
            </div>
        </Card>
    );

    const renderTVShowCard = (show) => (
        <Card
            key={`show-${show.title}-${show.year}`}
            className="content-card"
            actions={[
                <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(show, 'tv')}
                >
                    Edit
                </Button>
            ]}
        >
            <div className="card-header">
                <div className="card-title">
                    <DesktopOutlined style={{ marginRight: 8, color: '#e50914' }} />
                    {show.title}
                </div>
                <div className="card-type">TV Show</div>
            </div>
            
            <div className="card-content">
                <div className="metadata-grid">
                    <div className="metadata-item">
                        <div className="metadata-label">Year</div>
                        <div className="metadata-value">
                            {show.year || 
                             (show.cdn_data?.first_air_date ? new Date(show.cdn_data.first_air_date).getFullYear() : '') ||
                             show.guessit_data?.year || 
                             'Unknown'}
                        </div>
                    </div>
                    <div className="metadata-item">
                        <div className="metadata-label">CDN Match</div>
                        <div className="metadata-value">
                            {show.cdn_data ? 'Found' : 'Not Found'}
                        </div>
                    </div>
                    <div className="metadata-item">
                        <div className="metadata-label">Seasons</div>
                        <div className="metadata-value">{Object.keys(show.episodes).length}</div>
                    </div>
                    <div className="metadata-item">
                        <div className="metadata-label">Episodes</div>
                        <div className="metadata-value">
                            {Object.values(show.episodes).reduce((total, season) => total + season.length, 0)}
                        </div>
                    </div>
                    {show.genres && show.genres.length > 0 && (
                        <div className="metadata-item" style={{ gridColumn: 'span 2' }}>
                            <div className="metadata-label">Genres</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                {show.genres.map((genre, idx) => (
                                    <Tag key={idx} className="file-tag">{genre}</Tag>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="files-list">
                    <div className="files-title">Episodes by Season</div>
                    {Object.entries(show.episodes).map(([season, episodes]) => (
                        <div key={season} style={{ marginBottom: '8px' }}>
                            <Text strong style={{ color: '#e0e0e0', fontSize: '12px' }}>
                                Season {season} ({episodes.length} episodes)
                            </Text>
                            <div style={{ marginTop: '4px' }}>
                                {episodes.map((episode, idx) => (
                                    <Tag key={idx} className="file-tag" style={{ marginBottom: '2px', display: 'block' }}>
                                        E{episode.episode}: {episode.filename}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                
                {renderValidationStatus(show, 'tv')}
            </div>
        </Card>
    );

    const totalFiles = localData ? 
        (localData.movies?.reduce((sum, movie) => sum + movie.files.length, 0) || 0) +
        (localData.tv_shows?.reduce((sum, show) => sum + Object.values(show.episodes).reduce((total, season) => total + season.length, 0), 0) || 0)
        : 0;

    const totalItems = (localData?.movies?.length || 0) + (localData?.tv_shows?.length || 0);
    
    // Calculate uploadable items (excluding those with validation errors)
    const getUploadableItems = () => {
        const uploadableMovies = localData?.movies?.filter(movie => {
            const key = getValidationKey(movie, 'movie');
            const validation = validationResults[key];
            return !validation || validation.can_upload;
        }) || [];
        
        const uploadableShows = localData?.tv_shows?.filter(show => {
            const key = getValidationKey(show, 'tv');
            const validation = validationResults[key];
            return !validation || validation.can_upload;
        }) || [];
        
        return {
            movies: uploadableMovies,
            tv_shows: uploadableShows
        };
    };
    
    const uploadableItems = getUploadableItems();
    const uploadableCount = uploadableItems.movies.length + uploadableItems.tv_shows.length;

    const handleContinueToUpload = () => {
        const filteredData = {
            ...localData,
            movies: uploadableItems.movies,
            tv_shows: uploadableItems.tv_shows
        };
        onReviewComplete(filteredData);
    };

    return (
        <div className="review-cards-container">
            <div className="review-header">
                <div>
                    <Title level={2} className="review-title">Review Detected Content</Title>
                    <Text className="review-summary">
                        Found {totalItems} content items from {totalFiles} files
                        {totalItems !== uploadableCount && (
                            <span style={{ color: '#faad14', marginLeft: '8px' }}>
                                ({uploadableCount} can be uploaded)
                            </span>
                        )}
                    </Text>
                </div>
                
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <Tag color="blue">{localData?.movies?.length || 0} Movies</Tag>
                    <Tag color="green">{localData?.tv_shows?.length || 0} TV Shows</Tag>
                </div>
            </div>

            <div className="content-cards">
                {localData?.movies?.map(renderMovieCard)}
                {localData?.tv_shows?.map(renderTVShowCard)}
            </div>

            <div className="action-buttons">
                <Button className="back-button" onClick={onBack}>
                    Back to File Selection
                </Button>
                
                <Button 
                    type="primary" 
                    className="continue-button"
                    onClick={handleContinueToUpload}
                    disabled={uploadableCount === 0}
                    loading={isValidating}
                >
                    {isValidating ? 'Validating...' : `Continue to Upload (${uploadableCount} items)`}
                </Button>
            </div>

            <Modal
                title={`Edit ${editingType === 'movie' ? 'Movie' : 'TV Show'}`}
                open={editModalVisible}
                onOk={handleEditSave}
                onCancel={() => {
                    setEditModalVisible(false);
                    setEditingItem(null);
                    setEditingType(null);
                }}
                width={600}
            >
                <Form
                    form={editForm}
                    layout="vertical"
                    style={{ marginTop: '20px' }}
                >
                    <Form.Item
                        name="title"
                        label="Title"
                        rules={[{ required: true, message: 'Please enter a title' }]}
                    >
                        <Input placeholder="Enter title" />
                    </Form.Item>
                    
                    <Form.Item
                        name="year"
                        label="Year"
                        rules={[{ pattern: /^\d{4}$/, message: 'Please enter a valid year' }]}
                    >
                        <Input placeholder="Enter year (YYYY)" />
                    </Form.Item>
                    
                    <Form.Item
                        name="genres"
                        label="Genres (comma separated)"
                    >
                        <Input placeholder="Action, Drama, Comedy" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default ReviewCards;
