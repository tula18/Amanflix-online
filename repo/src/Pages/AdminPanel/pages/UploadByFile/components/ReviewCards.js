import React, { useState, useEffect } from 'react';
import { 
    Button, Tag, Typography, Card, Modal, Form, Input, message, 
    Alert, Spin, Progress, Tooltip, Divider 
} from 'antd';
import { 
    EditOutlined, PlayCircleOutlined, DesktopOutlined, ExclamationCircleOutlined, 
    CheckCircleOutlined, WarningOutlined, InfoCircleOutlined, ClockCircleOutlined,
    DatabaseOutlined, FileTextOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons';
import { API_URL } from '../../../../../config';

const { Text, Title } = Typography;

const ReviewCards = ({ parsedData, onReviewComplete, onBack }) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editingType, setEditingType] = useState(null);
    const [editForm] = Form.useForm();
    const [localData, setLocalData] = useState(parsedData);
    const [validationResults, setValidationResults] = useState({});
    const [isValidating, setIsValidating] = useState(false);
    const [expandedValidation, setExpandedValidation] = useState({});
    const [validationProgress, setValidationProgress] = useState(0);
    
    // Validation Details Modal
    const [validationDetailsVisible, setValidationDetailsVisible] = useState(false);
    const [selectedValidationData, setSelectedValidationData] = useState(null);
    const [selectedContentInfo, setSelectedContentInfo] = useState(null);
    console.log(parsedData);
    
    // Validate content on component mount and when data changes
    useEffect(() => {
        validateAllContent();
    }, [localData]);

    const validateContent = async (contentType, contentId, episodes = null, contentData = null) => {
        try {
            const token = localStorage.getItem('admin_token');
            const payload = {
                content_type: contentType,
                content_id: contentId
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

    const validateAllContent = async () => {
        console.log('🚀 Starting validation for all content...');
        setIsValidating(true);
        setValidationProgress(0);
        const results = {};
        
        const totalItems = (localData.movies?.length || 0) + (localData.tv_shows?.length || 0);
        let completedItems = 0;
        
        console.log(`📊 Total items to validate: ${totalItems}`, {
            movies: localData.movies?.length || 0,
            tv_shows: localData.tv_shows?.length || 0
        });
        
        try {
            // Validate movies
            if (localData.movies && localData.movies.length > 0) {
                console.log('🎬 Validating movies...');
                for (const movie of localData.movies) {
                    if (movie.cdn_data?.id) {
                        console.log(`🎬 Validating movie: "${movie.title}" (ID: ${movie.cdn_data.id})`);
                        const result = await validateContent('movie', movie.cdn_data.id, null, movie.cdn_data);
                        results[`movie_${movie.cdn_data.id}`] = result;
                        completedItems++;
                        setValidationProgress((completedItems / totalItems) * 100);
                        console.log(`✓ Movie validation complete: ${completedItems}/${totalItems}`);
                    } else {
                        console.warn(`⚠️ Movie "${movie.title}" has no CDN data or ID, skipping validation`);
                    }
                }
            }
            
            // Validate TV shows
            if (localData.tv_shows && localData.tv_shows.length > 0) {
                console.log('📺 Validating TV shows...');
                for (const show of localData.tv_shows) {
                    if (show.cdn_data?.id) {
                        console.log(`📺 Validating TV show: "${show.title}" (ID: ${show.cdn_data.id})`);
                        
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
                        console.log(`📺 Show has ${episodes.length} episodes to validate`);
                        
                        const result = await validateContent('tv', show.cdn_data.id, episodes, show.cdn_data);
                        results[`tv_${show.cdn_data.id}`] = result;
                        completedItems++;
                        setValidationProgress((completedItems / totalItems) * 100);
                        console.log(`✓ TV show validation complete: ${completedItems}/${totalItems}`);
                    } else {
                        console.warn(`⚠️ TV show "${show.title}" has no CDN data or ID, skipping validation`);
                    }
                }
            }
            
            console.log('🎉 All validations complete!', {
                totalValidated: Object.keys(results).length,
                results: results
            });
            
        } catch (error) {
            console.error('💥 Error during validation process:', error);
            message.error(`Validation process failed: ${error.message}`);
        }
        
        setValidationResults(results);
        setIsValidating(false);
        setValidationProgress(100);
        
        // Log final summary
        const totalErrors = Object.values(results).reduce((sum, v) => sum + (v.errors?.length || 0), 0);
        const totalWarnings = Object.values(results).reduce((sum, v) => sum + (v.warnings?.length || 0), 0);
        
        console.log('📋 Validation Summary:', {
            totalItems: Object.keys(results).length,
            totalErrors,
            totalWarnings,
            canUpload: Object.values(results).filter(v => v.can_upload).length
        });
        
        if (totalErrors > 0) {
            message.warning(`Validation completed with ${totalErrors} error(s) and ${totalWarnings} warning(s)`);
        } else if (totalWarnings > 0) {
            message.info(`Validation completed with ${totalWarnings} warning(s)`);
        } else {
            message.success('All content validated successfully!');
        }
    };

    const getValidationKey = (item, type) => {
        return `${type}_${item.cdn_data?.id}`;
    };

    const getValidationSummary = (validation) => {
        if (!validation) return { status: 'unknown', count: 0, color: '#d9d9d9' };
        
        const errorCount = validation.errors?.length || 0;
        const warningCount = validation.warnings?.length || 0;
        const infoCount = validation.info?.length || 0;
        
        if (errorCount > 0) {
            return { 
                status: 'error', 
                count: errorCount, 
                color: '#ff4d4f',
                icon: <ExclamationCircleOutlined />,
                text: `${errorCount} error${errorCount > 1 ? 's' : ''}`
            };
        }
        
        if (warningCount > 0) {
            return { 
                status: 'warning', 
                count: warningCount, 
                color: '#faad14',
                icon: <WarningOutlined />,
                text: `${warningCount} warning${warningCount > 1 ? 's' : ''}`
            };
        }
        
        if (validation.can_upload) {
            return { 
                status: 'success', 
                count: 0, 
                color: '#52c41a',
                icon: <CheckCircleOutlined />,
                text: 'Ready to upload'
            };
        }
        
        return { status: 'unknown', count: 0, color: '#d9d9d9' };
    };

    const renderValidationStatus = (item, type) => {
        const key = getValidationKey(item, type);
        const validation = validationResults[key];
        
        if (!validation || !item.cdn_data?.id) {
            return (
                <div style={{ marginTop: '12px' }}>
                    <Alert
                        type="info"
                        showIcon
                        icon={<ClockCircleOutlined />}
                        message="Validation Pending"
                        description={
                            !item.cdn_data?.id ? 
                                "No CDN data available - content needs to be matched with database first" :
                                "Content validation will be performed before upload"
                        }
                        style={{ fontSize: '12px' }}
                    />
                </div>
            );
        }
        
        const summary = getValidationSummary(validation);
        
        return (
            <div style={{ marginTop: '12px' }}>
                {/* Main status indicator */}
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '8px 12px', 
                    backgroundColor: summary.color + '10',
                    border: `1px solid ${summary.color}30`,
                    borderRadius: '6px',
                    marginBottom: '8px'
                }}>
                    <span style={{ color: summary.color, fontSize: '16px' }}>
                        {summary.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: summary.color }}>
                            {summary.text}
                        </div>
                        {!validation.can_upload && (
                            <div style={{ fontSize: '12px', color: '#ff4d4f', fontWeight: 500, marginTop: '4px' }}>
                                ⚠️ Upload blocked - Issues must be resolved
                            </div>
                        )}
                        {/* Debug info */}
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '2px' }}>
                            Validation ID: {key} | Success: {validation.success?.toString()} | Can Upload: {validation.can_upload?.toString()}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {/* View Details Button for errors/warnings */}
                        {(validation.errors?.length > 0 || validation.warnings?.length > 0) && (
                            <Tooltip title="View detailed validation report">
                                <Button
                                    type="primary"
                                    size="small"
                                    icon={<FileTextOutlined />}
                                    onClick={() => {
                                        const itemData = type === 'movie' ? 
                                            localData.movies?.find(m => getValidationKey(m, 'movie') === key) :
                                            localData.tv_shows?.find(s => getValidationKey(s, 'tv') === key);
                                        if (itemData) {
                                            openValidationDetails(itemData, type);
                                        }
                                    }}
                                    style={{
                                        backgroundColor: validation.errors?.length > 0 ? '#ff4d4f' : '#faad14',
                                        borderColor: validation.errors?.length > 0 ? '#ff4d4f' : '#faad14'
                                    }}
                                >
                                    Details
                                </Button>
                            </Tooltip>
                        )}
                    </div>
                </div>
            </div>
        );
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

    const openValidationDetails = (item, type) => {
        const key = getValidationKey(item, type);
        const validation = validationResults[key];
        
        if (!validation) return;
        
        setSelectedValidationData(validation);
        setSelectedContentInfo({
            title: item.title,
            type: type,
            id: item.cdn_data?.id,
            year: item.release_date || item.first_air_date,
            poster: item.poster_path,
            overview: item.overview
        });
        setValidationDetailsVisible(true);
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
                    
                    {/* Validation Progress */}
                    {isValidating && (
                        <div style={{ marginTop: '12px', maxWidth: '400px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <Spin size="small" />
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                    Validating content... ({Math.round(validationProgress)}%)
                                </Text>
                            </div>
                            <Progress 
                                percent={validationProgress} 
                                showInfo={false} 
                                size="small"
                                strokeColor="#1890ff"
                            />
                        </div>
                    )}
                </div>
                
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Tag color="blue" style={{ fontSize: '12px' }}>
                        <PlayCircleOutlined style={{ marginRight: '4px' }} />
                        {localData?.movies?.length || 0} Movies
                    </Tag>
                    <Tag color="green" style={{ fontSize: '12px' }}>
                        <DesktopOutlined style={{ marginRight: '4px' }} />
                        {localData?.tv_shows?.length || 0} TV Shows
                    </Tag>
                    
                    {/* Validation Summary */}
                    {Object.keys(validationResults).length > 0 && !isValidating && (
                        <>
                            <Divider type="vertical" />
                            {(() => {
                                const totalErrors = Object.values(validationResults).reduce((sum, v) => sum + (v.errors?.length || 0), 0);
                                const totalWarnings = Object.values(validationResults).reduce((sum, v) => sum + (v.warnings?.length || 0), 0);
                                
                                return (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        {totalErrors > 0 && (
                                            <Tag color="red" style={{ fontSize: '11px' }}>
                                                <ExclamationCircleOutlined style={{ marginRight: '2px' }} />
                                                {totalErrors} Error{totalErrors > 1 ? 's' : ''}
                                            </Tag>
                                        )}
                                        {totalWarnings > 0 && (
                                            <Tag color="orange" style={{ fontSize: '11px' }}>
                                                <WarningOutlined style={{ marginRight: '2px' }} />
                                                {totalWarnings} Warning{totalWarnings > 1 ? 's' : ''}
                                            </Tag>
                                        )}
                                        {totalErrors === 0 && totalWarnings === 0 && (
                                            <Tag color="green" style={{ fontSize: '11px' }}>
                                                <CheckCircleOutlined style={{ marginRight: '2px' }} />
                                                All Clear
                                            </Tag>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            </div>

            {/* Validation Summary Alert */}
            {Object.keys(validationResults).length > 0 && !isValidating && (() => {
                const totalErrors = Object.values(validationResults).reduce((sum, v) => sum + (v.errors?.length || 0), 0);
                const totalWarnings = Object.values(validationResults).reduce((sum, v) => sum + (v.warnings?.length || 0), 0);
                const blockedItems = Object.values(validationResults).filter(v => !v.can_upload).length;
                const readyItems = Object.values(validationResults).filter(v => v.can_upload).length;
                
                if (totalErrors > 0 || totalWarnings > 0) {
                    return (
                        <Alert
                            type={totalErrors > 0 ? "error" : "warning"}
                            showIcon
                            message={
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>
                                        {totalErrors > 0 ? 
                                            `${blockedItems} item${blockedItems > 1 ? 's' : ''} blocked by validation errors` :
                                            `${totalWarnings} validation warning${totalWarnings > 1 ? 's' : ''} found`
                                        }
                                    </span>
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                                        {totalErrors > 0 && (
                                            <span style={{ color: '#ff4d4f' }}>
                                                🚫 {totalErrors} error{totalErrors > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        {totalWarnings > 0 && (
                                            <span style={{ color: '#faad14' }}>
                                                ⚠️ {totalWarnings} warning{totalWarnings > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        <span style={{ color: '#52c41a' }}>
                                            ✅ {readyItems} ready
                                        </span>
                                    </div>
                                </div>
                            }
                            description={
                                totalErrors > 0 ? 
                                    "Items with errors cannot be uploaded. Click the 'Details' button on any item to see specific issues and solutions." :
                                    "Items with warnings can still be uploaded, but you may want to review the issues first."
                            }
                            style={{ marginBottom: '20px' }}
                        />
                    );
                }
                
                if (readyItems > 0) {
                    return (
                        <Alert
                            type="success"
                            showIcon
                            message={`All ${readyItems} item${readyItems > 1 ? 's' : ''} validated successfully!`}
                            description="No issues found. All content is ready for upload."
                            style={{ marginBottom: '20px' }}
                        />
                    );
                }
                
                return null;
            })()}

            <div className="content-cards">
                {localData?.movies?.map(renderMovieCard)}
                {localData?.tv_shows?.map(renderTVShowCard)}
            </div>

            <div className="action-buttons">
                <Button className="back-button" onClick={onBack}>
                    Back to File Selection
                </Button>
                
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {/* Validation Status Indicator */}
                    {isValidating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666' }}>
                            <Spin size="small" />
                            <span>Validating content...</span>
                        </div>
                    ) : Object.keys(validationResults).length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                            <span style={{ color: '#666' }}>Validation complete</span>
                        </div>
                    ) : null}
                    
                    <Button 
                        type="primary" 
                        className="continue-button"
                        onClick={handleContinueToUpload}
                        disabled={uploadableCount === 0 || isValidating}
                        loading={isValidating}
                        style={{
                            backgroundColor: uploadableCount === 0 ? undefined : '#52c41a',
                            borderColor: uploadableCount === 0 ? undefined : '#52c41a'
                        }}
                    >
                        {isValidating ? 'Validating...' : 
                         uploadableCount === 0 ? 'No Items Ready' :
                         `Continue to Upload (${uploadableCount} item${uploadableCount > 1 ? 's' : ''})`}
                    </Button>
                </div>
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
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ fontSize: '18px' }}>⚠️</div>
                        <div>
                            <div style={{ fontSize: '16px', fontWeight: 600 }}>Validation Report</div>
                            <div style={{ fontSize: '12px', fontWeight: 400, color: '#666' }}>
                                {selectedContentInfo?.title}
                            </div>
                        </div>
                    </div>
                }
                open={validationDetailsVisible}
                onCancel={() => setValidationDetailsVisible(false)}
                footer={[
                    <Button key="close" onClick={() => setValidationDetailsVisible(false)}>
                        Close
                    </Button>
                ]}
                width={800}
            >
                {selectedValidationData && selectedContentInfo && (
                    <div>
                        {/* Content Info */}
                        <div style={{ 
                            padding: '16px', 
                            backgroundColor: '#fafafa', 
                            borderRadius: '8px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                                {selectedContentInfo.title}
                            </div>
                            <div style={{ fontSize: '14px', color: '#666' }}>
                                {selectedContentInfo.type === 'movie' ? 'Movie' : 'TV Show'} • 
                                ID: {selectedContentInfo.id} • 
                                Year: {selectedContentInfo.year || 'Unknown'}
                            </div>
                        </div>

                        {/* Upload Status */}
                        <div style={{ 
                            padding: '16px', 
                            backgroundColor: selectedValidationData.can_upload ? '#f6ffed' : '#fff2f0',
                            border: `2px solid ${selectedValidationData.can_upload ? '#b7eb8f' : '#ffccc7'}`,
                            borderRadius: '8px',
                            marginBottom: '20px'
                        }}>
                            <div style={{ 
                                fontSize: '18px', 
                                fontWeight: 600, 
                                color: selectedValidationData.can_upload ? '#52c41a' : '#ff4d4f',
                                marginBottom: '8px'
                            }}>
                                {selectedValidationData.can_upload ? '✅ Ready to Upload' : '❌ Upload Blocked'}
                            </div>
                            <div style={{ fontSize: '14px', color: '#666' }}>
                                {selectedValidationData.can_upload ? 
                                    'No critical issues found. Content can be uploaded.' : 
                                    'Issues must be resolved before upload can proceed.'
                                }
                            </div>
                        </div>

                        {/* Critical Errors */}
                        {selectedValidationData.errors && selectedValidationData.errors.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ 
                                    fontSize: '16px', 
                                    fontWeight: 600, 
                                    color: '#ff4d4f',
                                    marginBottom: '12px'
                                }}>
                                    🚫 Critical Issues ({selectedValidationData.errors.length})
                                </div>
                                {selectedValidationData.errors.map((error, idx) => (
                                    <div key={idx} style={{ 
                                        padding: '16px', 
                                        backgroundColor: '#fff2f0',
                                        border: '1px solid #ffccc7',
                                        borderRadius: '8px',
                                        marginBottom: '12px'
                                    }}>
                                        <div style={{ fontWeight: 600, color: '#ff4d4f', marginBottom: '8px' }}>
                                            {error.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </div>
                                        <div style={{ marginBottom: '8px', color: '#333' }}>
                                            {error.message}
                                        </div>
                                        {error.suggestion && (
                                            <div style={{ 
                                                padding: '12px',
                                                backgroundColor: '#fff',
                                                border: '1px solid #d9d9d9',
                                                borderRadius: '4px',
                                                fontSize: '13px',
                                                color: '#666'
                                            }}>
                                                <strong>💡 Solution:</strong> {error.suggestion}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Warnings */}
                        {selectedValidationData.warnings && selectedValidationData.warnings.length > 0 && (
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ 
                                    fontSize: '14px', 
                                    fontWeight: 600, 
                                    color: '#faad14',
                                    marginBottom: '8px'
                                }}>
                                    ⚠️ Warnings ({selectedValidationData.warnings.length})
                                </div>
                                {selectedValidationData.warnings.map((warning, idx) => (
                                    <div key={idx} style={{ 
                                        padding: '12px', 
                                        backgroundColor: '#fffbe6',
                                        border: '1px solid #ffe58f',
                                        borderRadius: '6px',
                                        marginBottom: '8px'
                                    }}>
                                        <div style={{ fontWeight: 500, color: '#333', marginBottom: '4px' }}>
                                            {warning.message}
                                        </div>
                                        {warning.suggestion && (
                                            <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                                                💡 {warning.suggestion}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* System Info */}
                        {selectedValidationData.system_checks && (
                            <div style={{ 
                                padding: '12px',
                                backgroundColor: '#fafafa',
                                borderRadius: '6px',
                                marginBottom: '16px'
                            }}>
                                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                                    System Status
                                </div>
                                <div style={{ fontSize: '12px', color: '#666' }}>
                                    Storage: {selectedValidationData.system_checks.disk_space || 'Unknown'} | 
                                    Content: {selectedValidationData.system_checks.existing_content || 'Unknown'} |
                                    Files: {selectedValidationData.system_checks.file_validation || 'Unknown'}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ReviewCards;
