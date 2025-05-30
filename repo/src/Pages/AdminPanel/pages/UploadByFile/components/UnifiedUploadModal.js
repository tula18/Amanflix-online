import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, InputNumber, Select, Button, Upload, Switch, Progress, message, Tabs, Card, Tag, Alert } from 'antd';
import { UploadOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { API_URL } from '../../../../../config';

const { TextArea } = Input;
const { Option } = Select;
const { TabPane } = Tabs;

const UnifiedUploadModal = ({ 
    isVisible, 
    onClose, 
    onSuccess, 
    type, // 'movie' or 'tv_show'
    prefilledData 
}) => {
    const [form] = Form.useForm();
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadSpeed, setUploadSpeed] = useState(0);
    const [remainingTime, setRemainingTime] = useState(0);
    
    // Movie-specific state
    const [movieFile, setMovieFile] = useState(null);
    
    // TV Show-specific state
    const [episodeFiles, setEpisodeFiles] = useState({});
    const [seasons, setSeasons] = useState([]);

    useEffect(() => {
        if (isVisible && prefilledData) {
            if (type === 'movie') {
                initializeMovieForm();
            } else if (type === 'tv_show') {
                initializeTVShowForm();
            }
        }
    }, [isVisible, prefilledData, type]);

    const initializeMovieForm = () => {
        form.setFieldsValue({
            id: prefilledData.id || '',
            title: prefilledData.title || '',
            overview: prefilledData.overview || '',
            tagline: prefilledData.tagline || '',
            release_date: prefilledData.release_date || '',
            vote_average: prefilledData.vote_average || '',
            genres: prefilledData.genres || '',
            keywords: prefilledData.keywords || '',
            poster_path: prefilledData.poster_path || '',
            backdrop_path: prefilledData.backdrop_path || '',
            runtime: prefilledData.runtime || '',
            production_companies: prefilledData.production_companies || '',
            production_countries: prefilledData.production_countries || '',
            spoken_languages: prefilledData.spoken_languages || '',
            budget: prefilledData.budget || '',
            revenue: prefilledData.revenue || '',
            status: prefilledData.status || '',
            has_subtitles: prefilledData.has_subtitles || false,
            in_production: prefilledData.in_production || false,
            force: prefilledData.force || false
        });
    };

    const initializeTVShowForm = () => {
        form.setFieldsValue({
            show_id: prefilledData.show_id || '',
            title: prefilledData.title || '',
            genres: prefilledData.genres || '',
            created_by: prefilledData.created_by || '',
            overview: prefilledData.overview || '',
            poster_path: prefilledData.poster_path || '',
            backdrop_path: prefilledData.backdrop_path || '',
            vote_average: prefilledData.vote_average || '',
            tagline: prefilledData.tagline || '',
            spoken_languages: prefilledData.spoken_languages || '',
            first_air_date: prefilledData.first_air_date || '',
            last_air_date: prefilledData.last_air_date || '',
            production_companies: prefilledData.production_companies || '',
            production_countries: prefilledData.production_countries || '',
            networks: prefilledData.networks || '',
            status: prefilledData.status || ''
        });

        // Initialize seasons from prefilled data
        if (prefilledData.seasons && prefilledData.seasons.length > 0) {
            setSeasons(prefilledData.seasons);
        }
    };

    const handleMovieUpload = async (values) => {
        if (!movieFile) {
            message.error('Please select a video file to upload');
            return;
        }

        const formData = new FormData();
        
        // Add movie data
        Object.keys(values).forEach(key => {
            if (values[key] !== undefined && values[key] !== null) {
                formData.append(key, values[key]);
            }
        });
        
        // Add video file
        formData.append('vid_movie', movieFile);

        try {
            setUploading(true);
            setUploadProgress(0);

            const token = localStorage.getItem('admin_token');
            const xhr = new XMLHttpRequest();

            // Track upload progress
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    setUploadProgress(percentComplete);
                    
                    // Calculate speed and remaining time
                    const elapsed = Date.now() - uploadStartTime;
                    const speed = (e.loaded / elapsed) * 1000; // bytes per second
                    const remaining = (e.total - e.loaded) / speed;
                    
                    setUploadSpeed((speed / (1024 * 1024)).toFixed(2)); // MB/s
                    setRemainingTime(Math.round(remaining));
                }
            });

            const uploadStartTime = Date.now();

            xhr.onload = () => {
                if (xhr.status === 200) {
                    message.success('Movie uploaded successfully!');
                    onSuccess();
                    handleClose();
                } else {
                    const response = JSON.parse(xhr.responseText);
                    message.error(response.message || 'Upload failed');
                }
                setUploading(false);
            };

            xhr.onerror = () => {
                message.error('Upload failed');
                setUploading(false);
            };

            xhr.open('POST', `${API_URL}/api/upload-movie`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.send(formData);

        } catch (error) {
            console.error('Upload error:', error);
            message.error('Upload failed: ' + error.message);
            setUploading(false);
        }
    };

    const handleTVShowUpload = async (values) => {
        if (seasons.length === 0) {
            message.error('Please add at least one season with episodes');
            return;
        }

        // Check if all episodes have files
        const missingFiles = [];
        seasons.forEach(season => {
            season.episodes.forEach(episode => {
                const fileKey = `${season.seasonNumber}-${episode.episodeNumber}`;
                if (!episodeFiles[fileKey]) {
                    missingFiles.push(`Season ${season.seasonNumber} Episode ${episode.episodeNumber}`);
                }
            });
        });

        if (missingFiles.length > 0) {
            message.error(`Missing files for: ${missingFiles.join(', ')}`);
            return;
        }

        try {
            setUploading(true);
            const token = localStorage.getItem('admin_token');

            // Upload show metadata first
            const showResponse = await fetch(`${API_URL}/api/upload-show`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(values)
            });

            if (!showResponse.ok) {
                throw new Error('Failed to create show');
            }

            // Upload episodes
            let completedEpisodes = 0;
            const totalEpisodes = seasons.reduce((total, season) => total + season.episodes.length, 0);

            for (const season of seasons) {
                for (const episode of season.episodes) {
                    const fileKey = `${season.seasonNumber}-${episode.episodeNumber}`;
                    const file = episodeFiles[fileKey];
                    
                    if (file) {
                        const episodeFormData = new FormData();
                        episodeFormData.append('show_id', values.show_id);
                        episodeFormData.append('season_number', season.seasonNumber);
                        episodeFormData.append('episode_number', episode.episodeNumber);
                        episodeFormData.append('title', episode.title);
                        episodeFormData.append('overview', episode.overview || '');
                        episodeFormData.append('has_subtitles', episode.has_subtitles || false);
                        episodeFormData.append('vid_episode', file);

                        const episodeResponse = await fetch(`${API_URL}/api/upload-episode`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            },
                            body: episodeFormData
                        });

                        if (!episodeResponse.ok) {
                            throw new Error(`Failed to upload Season ${season.seasonNumber} Episode ${episode.episodeNumber}`);
                        }

                        completedEpisodes++;
                        setUploadProgress(Math.round((completedEpisodes / totalEpisodes) * 100));
                    }
                }
            }

            message.success('TV Show uploaded successfully!');
            onSuccess();
            handleClose();

        } catch (error) {
            console.error('Upload error:', error);
            message.error('Upload failed: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();
            
            if (type === 'movie') {
                await handleMovieUpload(values);
            } else if (type === 'tv_show') {
                await handleTVShowUpload(values);
            }
        } catch (error) {
            console.error('Form validation failed:', error);
        }
    };

    const handleClose = () => {
        form.resetFields();
        setMovieFile(null);
        setEpisodeFiles({});
        setSeasons([]);
        setUploading(false);
        setUploadProgress(0);
        onClose();
    };

    const addSeason = () => {
        const newSeason = {
            seasonNumber: seasons.length + 1,
            episodes: []
        };
        setSeasons([...seasons, newSeason]);
    };

    const addEpisode = (seasonIndex) => {
        const newSeasons = [...seasons];
        const newEpisode = {
            episodeNumber: newSeasons[seasonIndex].episodes.length + 1,
            title: '',
            overview: '',
            has_subtitles: false
        };
        newSeasons[seasonIndex].episodes.push(newEpisode);
        setSeasons(newSeasons);
    };

    const updateEpisode = (seasonIndex, episodeIndex, field, value) => {
        const newSeasons = [...seasons];
        newSeasons[seasonIndex].episodes[episodeIndex][field] = value;
        setSeasons(newSeasons);
    };

    const removeEpisode = (seasonIndex, episodeIndex) => {
        const newSeasons = [...seasons];
        newSeasons[seasonIndex].episodes.splice(episodeIndex, 1);
        setSeasons(newSeasons);
    };

    const removeSeason = (seasonIndex) => {
        const newSeasons = [...seasons];
        newSeasons.splice(seasonIndex, 1);
        setSeasons(newSeasons);
    };

    const handleEpisodeFileUpload = (seasonNumber, episodeNumber, file) => {
        const fileKey = `${seasonNumber}-${episodeNumber}`;
        setEpisodeFiles(prev => ({
            ...prev,
            [fileKey]: file
        }));
    };

    const formatTime = (seconds) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    };

    const renderMovieForm = () => (
        <Form form={form} layout="vertical">
            <Form.Item name="id" label="Movie ID" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="overview" label="Overview" rules={[{ required: true }]}>
                <TextArea rows={4} />
            </Form.Item>
            
            <Form.Item name="tagline" label="Tagline">
                <Input />
            </Form.Item>
            
            <Form.Item name="release_date" label="Release Date" rules={[{ required: true }]}>
                <Input type="date" />
            </Form.Item>
            
            <Form.Item name="vote_average" label="Vote Average" rules={[{ required: true }]}>
                <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="genres" label="Genres (separated by ', ')" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="keywords" label="Keywords (separated by ', ')">
                <Input />
            </Form.Item>
            
            <Form.Item name="poster_path" label="Poster Path" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="backdrop_path" label="Backdrop Path" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="runtime" label="Runtime (minutes)" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="production_companies" label="Production Companies">
                <Input />
            </Form.Item>
            
            <Form.Item name="production_countries" label="Production Countries">
                <Input />
            </Form.Item>
            
            <Form.Item name="spoken_languages" label="Spoken Languages">
                <Input />
            </Form.Item>
            
            <Form.Item name="budget" label="Budget">
                <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="revenue" label="Revenue">
                <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="status" label="Status">
                <Input />
            </Form.Item>
            
            <Form.Item name="has_subtitles" valuePropName="checked">
                <Switch checkedChildren="Has Subtitles" unCheckedChildren="No Subtitles" />
            </Form.Item>
            
            <Form.Item name="in_production" valuePropName="checked">
                <Switch checkedChildren="In Production" unCheckedChildren="Released" />
            </Form.Item>
            
            <Form.Item name="force" valuePropName="checked">
                <Switch checkedChildren="Force Overwrite" unCheckedChildren="Normal Upload" />
            </Form.Item>
            
            <Form.Item label="Video File" required>
                <Upload
                    beforeUpload={(file) => {
                        setMovieFile(file);
                        return false;
                    }}
                    fileList={movieFile ? [movieFile] : []}
                    onRemove={() => setMovieFile(null)}
                >
                    <Button icon={<UploadOutlined />}>Select Video File</Button>
                </Upload>
                {movieFile && (
                    <div style={{ marginTop: 8 }}>
                        <Tag color="green">{movieFile.name}</Tag>
                    </div>
                )}
            </Form.Item>
        </Form>
    );

    const renderTVShowForm = () => (
        <Form form={form} layout="vertical">
            <Form.Item name="show_id" label="Show ID" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="overview" label="Overview" rules={[{ required: true }]}>
                <TextArea rows={4} />
            </Form.Item>
            
            <Form.Item name="genres" label="Genres" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="created_by" label="Created By">
                <Input />
            </Form.Item>
            
            <Form.Item name="poster_path" label="Poster Path" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="backdrop_path" label="Backdrop Path" rules={[{ required: true }]}>
                <Input />
            </Form.Item>
            
            <Form.Item name="vote_average" label="Vote Average" rules={[{ required: true }]}>
                <InputNumber min={0} max={10} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            
            <Form.Item name="tagline" label="Tagline">
                <Input />
            </Form.Item>
            
            <Form.Item name="spoken_languages" label="Spoken Languages">
                <Input />
            </Form.Item>
            
            <Form.Item name="first_air_date" label="First Air Date" rules={[{ required: true }]}>
                <Input type="date" />
            </Form.Item>
            
            <Form.Item name="last_air_date" label="Last Air Date">
                <Input type="date" />
            </Form.Item>
            
            <Form.Item name="production_companies" label="Production Companies">
                <Input />
            </Form.Item>
            
            <Form.Item name="production_countries" label="Production Countries">
                <Input />
            </Form.Item>
            
            <Form.Item name="networks" label="Networks">
                <Input />
            </Form.Item>
            
            <Form.Item name="status" label="Status">
                <Input />
            </Form.Item>

            {/* Seasons and Episodes */}
            <div style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3>Seasons and Episodes</h3>
                    <Button type="dashed" onClick={addSeason} icon={<PlusOutlined />}>
                        Add Season
                    </Button>
                </div>

                {seasons.map((season, seasonIndex) => (
                    <Card 
                        key={seasonIndex}
                        title={`Season ${season.seasonNumber}`}
                        extra={
                            <Button 
                                type="text" 
                                danger 
                                icon={<DeleteOutlined />}
                                onClick={() => removeSeason(seasonIndex)}
                            />
                        }
                        style={{ marginBottom: 16 }}
                    >
                        <div style={{ marginBottom: 16 }}>
                            <Button 
                                type="dashed" 
                                onClick={() => addEpisode(seasonIndex)}
                                icon={<PlusOutlined />}
                                size="small"
                            >
                                Add Episode
                            </Button>
                        </div>

                        {season.episodes.map((episode, episodeIndex) => (
                            <Card 
                                key={episodeIndex}
                                size="small"
                                title={`Episode ${episode.episodeNumber}`}
                                extra={
                                    <Button 
                                        type="text" 
                                        danger 
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        onClick={() => removeEpisode(seasonIndex, episodeIndex)}
                                    />
                                }
                                style={{ marginBottom: 8 }}
                            >
                                <Input
                                    placeholder="Episode Title"
                                    value={episode.title}
                                    onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'title', e.target.value)}
                                    style={{ marginBottom: 8 }}
                                />
                                
                                <TextArea
                                    placeholder="Episode Overview"
                                    value={episode.overview}
                                    onChange={(e) => updateEpisode(seasonIndex, episodeIndex, 'overview', e.target.value)}
                                    rows={2}
                                    style={{ marginBottom: 8 }}
                                />
                                
                                <div style={{ marginBottom: 8 }}>
                                    <Switch
                                        checked={episode.has_subtitles}
                                        onChange={(checked) => updateEpisode(seasonIndex, episodeIndex, 'has_subtitles', checked)}
                                        checkedChildren="Has Subtitles"
                                        unCheckedChildren="No Subtitles"
                                    />
                                </div>
                                
                                <Upload
                                    beforeUpload={(file) => {
                                        handleEpisodeFileUpload(season.seasonNumber, episode.episodeNumber, file);
                                        return false;
                                    }}
                                    fileList={episodeFiles[`${season.seasonNumber}-${episode.episodeNumber}`] ? 
                                        [episodeFiles[`${season.seasonNumber}-${episode.episodeNumber}`]] : []}
                                    onRemove={() => {
                                        const fileKey = `${season.seasonNumber}-${episode.episodeNumber}`;
                                        setEpisodeFiles(prev => {
                                            const newFiles = { ...prev };
                                            delete newFiles[fileKey];
                                            return newFiles;
                                        });
                                    }}
                                >
                                    <Button icon={<UploadOutlined />} size="small">
                                        Select Episode File
                                    </Button>
                                </Upload>
                                
                                {episodeFiles[`${season.seasonNumber}-${episode.episodeNumber}`] && (
                                    <div style={{ marginTop: 4 }}>
                                        <Tag color="green" size="small">
                                            {episodeFiles[`${season.seasonNumber}-${episode.episodeNumber}`].name}
                                        </Tag>
                                    </div>
                                )}
                            </Card>
                        ))}
                    </Card>
                ))}
            </div>
        </Form>
    );

    return (
        <Modal
            title={`Upload ${type === 'movie' ? 'Movie' : 'TV Show'}`}
            open={isVisible}
            onCancel={handleClose}
            width={800}
            footer={[
                <Button key="cancel" onClick={handleClose} disabled={uploading}>
                    Cancel
                </Button>,
                <Button key="upload" type="primary" onClick={handleSubmit} loading={uploading}>
                    {uploading ? 'Uploading...' : 'Upload'}
                </Button>
            ]}
            maskClosable={!uploading}
            closable={!uploading}
        >
            {uploading && (
                <div style={{ marginBottom: 16 }}>
                    <Progress percent={uploadProgress} status={uploadProgress === 100 ? 'success' : 'active'} />
                    {uploadSpeed > 0 && (
                        <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                            Upload Speed: {uploadSpeed} MB/s • Remaining Time: {formatTime(remainingTime)}
                        </div>
                    )}
                </div>
            )}

            {type === 'movie' ? renderMovieForm() : renderTVShowForm()}
        </Modal>
    );
};

export default UnifiedUploadModal;
