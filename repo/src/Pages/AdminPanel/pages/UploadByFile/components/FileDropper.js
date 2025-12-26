import React, { useState, useRef } from 'react';
import { Button, message, Typography } from 'antd';
import { InboxOutlined, LoadingOutlined } from '@ant-design/icons';
import { API_URL } from '../../../../../config';

const { Text } = Typography;

const VALID_VIDEO_EXTENSIONS = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];

const FileDropper = ({ onFilesSelected, onParseComplete, selectedFiles, isLoading, setIsLoading }) => {
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const isVideoFile = (fileName) => {
        const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        return VALID_VIDEO_EXTENSIONS.includes(extension);
    };

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        // Check for duplicate files
        const existingFileNames = new Set(selectedFiles.map(file => file.name));
        const newFiles = Array.from(e.dataTransfer.files).filter(file => {
            if (existingFileNames.has(file.name)) {
                message.error(`File "${file.name}" is already selected`);
                return false;
            }
            return true;
        });

        if (newFiles.length === 0) {
            return;
        }
        const combinedFiles = [...selectedFiles, ...newFiles];
        handleFiles(combinedFiles);
    };

    const handleFileSelect = (e) => {
        // Check for duplicate files
        const existingFileNames = new Set(selectedFiles.map(file => file.name));
        const newFiles = Array.from(e.target.files).filter(file => {
            if (existingFileNames.has(file.name)) {
                message.error(`File "${file.name}" is already selected`);
                return false;
            }
            return true;
        });

        if (newFiles.length === 0) {
            return;
        }

        const files = Array.from(e.target.files);
        const combinedFiles = [...selectedFiles, ...newFiles];
        handleFiles(combinedFiles);
    };

    const handleFiles = (files) => {
        const videoFiles = files.filter(file => isVideoFile(file.name));
        
        if (videoFiles.length === 0) {
            message.error('Please select valid video files');
            return;
        }

        if (videoFiles.length !== files.length) {
            message.warning(`Only video files were selected (${videoFiles.length} out of ${files.length})`);
        }

        onFilesSelected(videoFiles);
    };

    const removeFile = (indexToRemove) => {
        const updatedFiles = selectedFiles.filter((_, index) => index !== indexToRemove);
        onFilesSelected(updatedFiles);
    };

    const parseFiles = async () => {
        if (selectedFiles.length === 0) {
            message.error('Please select files first');
            return;
        }

        setIsLoading(true);
        
        try {
            const fileNames = selectedFiles.map(file => file.name);
            
            const response = await fetch(`${API_URL}/api/uploads/parse-files`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
                },
                body: JSON.stringify({ filenames: fileNames })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to parse files');
            }

            const result = await response.json();
            console.log(result);
            
            
            // Transform backend response to match frontend expectations
            const movies = [];
            const tv_shows = [];
            
            if (result.results) {
                result.results.forEach(item => {
                    if (item.error) {
                        // Skip error items for now, could add error handling later
                        console.warn('Parse error for item:', item);
                        return;
                    }
                    
                    if (item.content_type === 'movie') {
                        movies.push({
                            ...item,
                            files: [item.filename] // Convert single filename to files array
                        });
                    } else if (item.content_type === 'tv') {
                        // Handle episodes - the API returns episodes as an object grouped by season
                        let episodesBySeason = {};
                        
                        if (item.episodes && typeof item.episodes === 'object') {
                            // Episodes are already grouped by season from the API
                            episodesBySeason = item.episodes;
                        } else if (Array.isArray(item.episodes)) {
                            // Fallback: convert episodes array to episodes object grouped by season
                            item.episodes.forEach(episode => {
                                const season = episode.season_number || episode.season || 1;
                                if (!episodesBySeason[season]) {
                                    episodesBySeason[season] = [];
                                }
                                episodesBySeason[season].push({
                                    episode: episode.episode_number || episode.episode,
                                    filename: episode.filename
                                });
                            });
                        }
                        
                        tv_shows.push({
                            ...item,
                            episodes: episodesBySeason
                        });
                    }
                });
            }
            
            const transformedData = { movies, tv_shows };
            message.success(`Successfully parsed ${fileNames.length} files`);
            onParseComplete(transformedData);
            
        } catch (error) {
            console.error('Error parsing files:', error);
            message.error(`Error parsing files: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="file-dropper-container">
            <div
                className={`file-drop-zone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <div className="drop-icon">
                    {isLoading ? <LoadingOutlined /> : <InboxOutlined />}
                </div>
                <div className="drop-text">
                    {isLoading ? 'Parsing files...' : 'Drop video files here'}
                </div>
                <div className="drop-hint">
                    or click to browse files
                </div>
                <Button 
                    type="primary" 
                    className="browse-button"
                    disabled={isLoading}
                >
                    Browse Files
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="video/*"
                    className="file-input"
                    onChange={handleFileSelect}
                />
            </div>

            {selectedFiles.length > 0 && (
                <div className="selected-files">
                    <Text strong style={{ color: '#e0e0e0', fontSize: '16px' }}>
                        Selected Files ({selectedFiles.length})
                    </Text>
                    <ul className="file-list">
                        {selectedFiles.map((file, index) => (
                            <li key={index} className="file-item">
                                <div className='file-item-text'>
                                    <div className="file-name">{file.name}</div>
                                    <div className="file-size">{formatFileSize(file.size)}</div>
                                </div>
                                <button
                                    className="remove-file-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeFile(index);
                                    }}
                                    disabled={isLoading}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                    
                    <Button
                        type="primary"
                        className="parse-button"
                        onClick={parseFiles}
                        disabled={selectedFiles.length === 0 || isLoading}
                        loading={isLoading}
                    >
                        {isLoading ? 'Parsing Files...' : `Parse ${selectedFiles.length} Files`}
                    </Button>
                </div>
            )}

            <div style={{ marginTop: '24px', color: '#a0a0a0', fontSize: '14px' }}>
                <p><strong>Supported formats:</strong> MP4, AVI, MKV, MOV, WMV, FLV, WEBM, M4V, 3GP</p>
                <p><strong>GuessIt will analyze:</strong> Movie titles, TV show names, seasons, episodes, years, and more from filenames</p>
            </div>
        </div>
    );
};

export default FileDropper;
