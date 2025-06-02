import React, { useState, useEffect } from 'react';
import './App.css';
import { Modal, Form, Select, Input, Button, Checkbox, Switch, Divider, Spin, message, Progress, Space, Typography, Slider } from 'antd';
import { DownloadOutlined, SettingOutlined, StarFilled, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import InfiniteScroll from 'react-infinite-scroll-component';
import 'antd/dist/reset.css';
import JSZip from 'jszip';

// TMDB API constants
const TMDB_API_KEY = '7c6ef63641693'+'5d76b34de12d8680ca5'; // Split to avoid key scraping
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';

const { Option } = Select;
const { Title } = Typography;

function App() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [movies, setMovies] = useState([]);
  const [selectedMovies, setSelectedMovies] = useState([]);
  const [dataType, setDataType] = useState('movie'); // 'movie' or 'tv'
  
  // Export form state
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportForm] = Form.useForm();
  const [customKeysToExclude, setCustomKeysToExclude] = useState(['video', 'homepage', 'adult']);
  const [exportFormat, setExportFormat] = useState('json');
  const [customFileName, setCustomFileName] = useState('');
  const [compactMode, setCompactMode] = useState(false);

  // Add these new state variables for preview
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewData, setPreviewData] = useState('');
  const [previewFormat, setPreviewFormat] = useState('json');

  // Add this with your other state variables
  const [previewAll, setPreviewAll] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Add to your App component
  const [apiKeyModalVisible, setApiKeyModalVisible] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(localStorage.getItem('tmdb_api_key') || '');

  // Add this state variable with your other state variables
  const [includeImages, setIncludeImages] = useState(false);

  // Add this after line 37 with your other state variables
  const [includeEpisodes, setIncludeEpisodes] = useState(true);

  // Add these with your other state variables at the top of the App component
  const [fetchAllModalVisible, setFetchAllModalVisible] = useState(false);
  const [fetchForm] = Form.useForm();
  const [isFetching, setIsFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);
  const [fetchStats, setFetchStats] = useState({
    totalItems: 0,
    currentPage: 0,
    totalPages: 0,
    successCount: 0,
    errorCount: 0
  });

  // Add these state variables
  const [fetchMethod, setFetchMethod] = useState('popular'); // 'popular', 'id_range', 'date_range'
  const [idStart, setIdStart] = useState(1);
  const [idEnd, setIdEnd] = useState(10000);
  const [maxConcurrentRequests, setMaxConcurrentRequests] = useState(30);
  const [consecutive404Limit, setConsecutive404Limit] = useState(100);
  const [fetchedIds, setFetchedIds] = useState(new Set());
  const [failedIds, setFailedIds] = useState([]);

  // Add these with your other state variables
  const [includeHebrew, setIncludeHebrew] = useState(false);
  const [includeKeywords, setIncludeKeywords] = useState(false);

  // Add this state variable with your other state variables
  const [filterAdult, setFilterAdult] = useState(true); // Default to filtering adult content

  // Add these state variables after your other useState declarations
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [genreFilter, setGenreFilter] = useState(null);
  const [minRatingFilter, setMinRatingFilter] = useState(0);
  const [yearRangeFilter, setYearRangeFilter] = useState([1900, new Date().getFullYear()]);
  const [runtimeFilter, setRuntimeFilter] = useState([0, 400]);
  const [languageFilter, setLanguageFilter] = useState(null);
  const [genres, setGenres] = useState([]);
  const [languages, setLanguages] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Default keys that can be excluded
  const availableKeysToExclude = [
    { label: 'Adult Content', value: 'adult' },
    { label: 'Homepage', value: 'homepage' },
    { label: 'Video', value: 'video' },
    { label: 'Vote Count', value: 'vote_count' },
    { label: 'Backdrop Path', value: 'backdrop_path' },
    { label: 'Poster Path', value: 'poster_path' },
    { label: 'Seasons', value: 'seasons'}
  ];

  // Format the data similar to parse_dataset.py
  const formatData = (items, keysToExclude = customKeysToExclude) => {
    // Helper function for dynamic parsing
    const dynamicParse = (obj) => {
      if (obj === null || obj === undefined) {
        return obj;
      }
      
      // Handle arrays that haven't been processed yet
      if (Array.isArray(obj)) {
        // Empty array
        if (obj.length === 0) return '';
        
        // Array of objects with name properties
        if (typeof obj[0] === 'object' && obj[0] !== null) {
          // Try to extract name, english_name, or iso_639_1 properties
          const nameKeys = ['name', 'english_name', 'iso_639_1', 'title'];
          for (const key of nameKeys) {
            if (obj[0][key] !== undefined) {
              return obj.map(item => item[key]).join(', ');
            }
          }
          
          // If no common property found, recursively process each item
          return obj.map(item => dynamicParse(item));
        }
        
        // Array of primitives
        return obj.join(', ');
      }
      
      // Handle objects
      if (typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = dynamicParse(value);
        }
        return result;
      }
      
      // Return primitives as-is
      return obj;
    };

    return items.map(item => {
      let formattedItem = { ...item };
      
      // Apply existing specific parsing logic first
      
      // Parse belongs_to_collection if available
      if (formattedItem.belongs_to_collection && 
          typeof formattedItem.belongs_to_collection === 'object') {
        formattedItem.belongs_to_collection = 
          formattedItem.belongs_to_collection.name || '';
      }
      
      // Parse production countries if available
      if (formattedItem.production_countries) {
        formattedItem.production_countries = formattedItem.production_countries
          .map(country => country.name)
          .join(', ');
      }
      
      // Parse genres if available
      if (formattedItem.genres) {
        formattedItem.genres = formattedItem.genres
          .map(genre => genre.name)
          .join(', ');
      }
      
      // Parse spoken languages if available
      if (formattedItem.spoken_languages) {
        formattedItem.spoken_languages = formattedItem.spoken_languages
          .map(lang => lang.english_name || lang.name)
          .join(', ');
      }
      
      // Parse production companies if available
      if (formattedItem.production_companies) {
        formattedItem.production_companies = formattedItem.production_companies
          .map(company => company.name)
          .join(', ');
      }
      
      // Handle TV show specific fields - CHECK ITEM'S MEDIA_TYPE, NOT GLOBAL DATATYPE
      if (formattedItem.media_type === 'tv') {
        if (formattedItem.created_by) {
          formattedItem.created_by = formattedItem.created_by
            .map(creator => creator.name)
            .join(', ');
        }
        
        if (formattedItem.networks) {
          formattedItem.networks = formattedItem.networks
            .map(network => network.name)
            .join(', ');
        }
        
        if (formattedItem.origin_country) {
          formattedItem.origin_country = formattedItem.origin_country.join(', ');
        }
        
        if (formattedItem.episode_run_time && formattedItem.episode_run_time.length > 0) {
          formattedItem.episode_run_time = formattedItem.episode_run_time[0];
        }
        
        // IMPORTANT: Preserve seasons structure
        if (formattedItem.seasons) {
          // Store the seasons before dynamic parsing
          const originalSeasons = [...formattedItem.seasons];
          
          // Apply dynamic parsing to other fields excluding seasons
          const { seasons, ...otherFields } = formattedItem;
          const parsedFields = dynamicParse(otherFields);
          
          // Restore the original seasons array
          return {
            ...parsedFields,
            seasons: originalSeasons
          };
        }
      }
      
      // Apply dynamic parsing to catch any remaining nested structures
      // that weren't handled by the specific parsing above
      formattedItem = dynamicParse(formattedItem);
      
      // Remove excluded keys from the final output
      keysToExclude.forEach(key => {
        delete formattedItem[key];
      });
      
      return formattedItem;
    });
  };

  // Fetch details for a single item (movie or TV show)
  const fetchItemDetails = async (id, itemType, shouldIncludeEpisodes = true) => {
    try {
      const headers = {
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3YzZlZjYzNjQxNjkzNWQ3NmIzNGRlMTJkODY4MGNhNSIsIm5iZiI6MTcxNzQ1MTIwMS44MDE5OTk4LCJzdWIiOiI2NjVlMzljMWQxMGFmOGJhNzkyZjI4YmEiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kBohOkqrHkyEVugoqCMwO-DjxbcfUwM2Vjxmja7yZ8o`,
        'Content-Type': 'application/json'
      };
      
      // Use the item's specific type rather than global dataType
      const type = itemType || dataType;
      const response = await fetch(`${TMDB_API_BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}`, {
        headers
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Add media_type to the data
      data.media_type = type;
      
      // For TV shows, conditionally fetch seasons and episodes
      if (type === 'tv' && data.seasons && shouldIncludeEpisodes) {
        const seasonsWithEpisodes = await Promise.all(
          data.seasons.map(async (season) => {
            try {
              const seasonResponse = await fetch(
                `${TMDB_API_BASE_URL}/tv/${id}/season/${season.season_number}?api_key=${TMDB_API_KEY}`,
                { headers }
              );
              
              if (!seasonResponse.ok) {
                return season;
              }
              
              const seasonData = await seasonResponse.json();
              
              // Clean up episode data
              if (seasonData.episodes) {
                seasonData.episodes = seasonData.episodes.map(episode => {
                  const { vote_count, crew, guest_stars, ...cleanEpisode } = episode;
                  if (cleanEpisode.vote_average) {
                    cleanEpisode.vote_average = Math.round(cleanEpisode.vote_average * 10) / 10;
                  }
                  return cleanEpisode;
                });
                
                return {
                  ...season,
                  episodes: seasonData.episodes
                };
              }
              
              return season;
            } catch (error) {
              console.error(`Error fetching season ${season.season_number}:`, error);
              return season;
            }
          })
        );
        
        data.seasons = seasonsWithEpisodes;
      } else if (type === 'tv' && !shouldIncludeEpisodes) {
        // If episodes are not requested, ensure we don't include them
        // but keep basic season info for TV shows
        data.seasons = data.seasons.map(season => {
          // Remove episodes key if present
          const { episodes, ...cleanSeason } = season;
          return cleanSeason;
        });
      }
      
      return data;
    } catch (error) {
      console.error(`Error fetching details for ${itemType || dataType} ${id}:`, error);
      throw error;
    }
  };
  
  // Update the showExportModal function
  const showExportModal = () => {
    setExportModalVisible(true);
    
    // Set initial values in the form
    exportForm.setFieldsValue({
      format: exportFormat,
      keysToExclude: customKeysToExclude,
      fileName: customFileName || `tmdb_${dataType}_data`,
      compactMode: compactMode,
      includeImages: includeImages,
      includeEpisodes: includeEpisodes,
      includeHebrew: includeHebrew,       // Add this line
      includeKeywords: includeKeywords    // Add this line
    });
  };
  
  // Replace your handleExportSubmit function with this improved version:
const handleExportSubmit = async (values) => {
  const { 
    format, keysToExclude, fileName, compactMode, 
    includeImages, includeEpisodes, 
    includeHebrew, includeKeywords   // Add these parameters
  } = values;
  
  setExportFormat(format);
  setCustomKeysToExclude(keysToExclude || []);
  setCustomFileName(fileName);
  setCompactMode(compactMode);
  setIncludeImages(includeImages);
  setIncludeEpisodes(includeEpisodes);
  setIncludeHebrew(includeHebrew);       // Add this line
  setIncludeKeywords(includeKeywords);   // Add this line
  
  try {
    setIsDownloading(true);
    setDownloadProgress(5); // Start progress
    
    // Fetch full details for each selected movie/show
    const totalItems = selectedMovies.length;
    const detailedItems = [];
    
    // Fetch items one by one to track progress
    for (let i = 0; i < totalItems; i++) {
      const item = selectedMovies[i];
      // Determine item type for mixed selections
      const itemType = item.media_type || (item.title ? 'movie' : 'tv');
      let detailedItem = await fetchItemDetails(item.id, itemType, includeEpisodes);
      
      // Calculate progress percentage per item - adjust for additional fetches
      const baseProgress = 30 / totalItems;
      let currentItemProgress = 0;
      
      // Add Hebrew translations for both movies and TV shows
      if (includeHebrew) {
        const hebrewTranslation = await fetchHebrewTranslation(item.id, item.name || item.title || '', itemType);
        if (hebrewTranslation) {
          detailedItem.hebrew_name = hebrewTranslation.name;
          detailedItem.hebrew_overview = hebrewTranslation.overview;
          detailedItem.hebrew_tagline = hebrewTranslation.tagline;
        }
        currentItemProgress += baseProgress / 3;
        setDownloadProgress(5 + Math.round(((i / totalItems) + (currentItemProgress / totalItems)) * 35));
      }
      
      // Add keywords for all media types
      if (includeKeywords) {
        const keywords = await fetchKeywords(item.id, item.name || item.title || '', itemType);
        if (keywords) {
          detailedItem.keywords = keywords;
        }
        currentItemProgress += baseProgress / 3;
        setDownloadProgress(5 + Math.round(((i / totalItems) + (currentItemProgress / totalItems)) * 35));
      }
      
      detailedItems.push(detailedItem);
      setDownloadProgress(5 + Math.round(((i + 1) / totalItems) * 35)); // Progress from 5%-40%
    }
    
    setDownloadProgress(40); // Formatting data
    
    // Format the data
    const formattedData = formatData(detailedItems, keysToExclude || []);
    
    // Create formatted data content
    let dataContent;
    let fileExtension;
    let mimeType;
    
    switch (format) {
      case 'csv':
        dataContent = convertToCSV(formattedData);
        fileExtension = 'csv';
        mimeType = 'text/csv';
        break;
      case 'txt':
        dataContent = JSON.stringify(formattedData, null, compactMode ? 0 : 2);
        fileExtension = 'txt';
        mimeType = 'text/plain';
        break;
      case 'json':
      default:
        dataContent = JSON.stringify(formattedData, null, compactMode ? 0 : 2);
        fileExtension = 'json';
        mimeType = 'application/json';
        break;
    }
    
    setDownloadProgress(45); // Data formatted
    
    // Log to help debug
    console.log("Include images:", includeImages);

    // If images are not included, just download the data file directly
    if (!includeImages) {
      const dataBlob = new Blob([dataContent], { type: mimeType });
      const url = URL.createObjectURL(dataBlob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName || `tmdb_${dataType}_data`}.${fileExtension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setDownloadProgress(100);
      message.success(`${totalItems} items exported successfully!`);
      setTimeout(() => setSelectedMovies([]), 1000); // Clear selections after 1 second
    } else {
      // Create a zip file with data and images
      console.log("Creating zip with images...");
      const zip = new JSZip();
      
      // Add the data file to the zip
      zip.file(`${fileName || `tmdb_${dataType}_data`}.${fileExtension}`, dataContent);
      
      // Track total images and successful downloads
      let totalImages = 0;
      let downloadedImages = 0;
      const imagesToDownload = [];
      
      // Collect image paths
      formattedData.forEach(item => {
        if (item.poster_path) {
          // Extract original filename from poster_path (removing the leading slash)
          const posterFilename = item.poster_path.replace(/^\//, '');
          
          imagesToDownload.push({
            url: `https://image.tmdb.org/t/p/w500${item.poster_path}`,
            type: 'poster',
            filename: posterFilename // Use original filename
          });
          totalImages++;
        }
        
        if (item.backdrop_path) {
          // Extract original filename from backdrop_path (removing the leading slash)
          const backdropFilename = item.backdrop_path.replace(/^\//, '');
          
          imagesToDownload.push({
            url: `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`,
            type: 'backdrop',
            filename: backdropFilename // Use original filename
          });
          totalImages++;
        }
      });
      
      setDownloadProgress(50); // Start downloading images
      console.log(`Downloading ${totalImages} images...`);
      
      // Download images and add them to the zip
      try {
        for (let i = 0; i < imagesToDownload.length; i++) {
          const image = imagesToDownload[i];
          try {
            console.log(`Downloading image ${i+1}/${imagesToDownload.length}: ${image.url}`);
            const response = await fetch(image.url);
            
            if (!response.ok) {
              throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
            }
            
            const blob = await response.blob();

            zip.file(image.filename, blob)
            
            downloadedImages++;
            // Update progress (from 50% to 90%)
            const imageProgress = Math.round(50 + ((downloadedImages / totalImages) * 40));
            setDownloadProgress(imageProgress);
          } catch (error) {
            console.error(`Error downloading image ${image.url}:`, error);
          }
        }
      } catch (error) {
        console.error("Error in image download loop:", error);
      }
      
      // Generate the zip file
      setDownloadProgress(90); // Generating zip
      console.log("Generating zip file...");
      
      try {
        const zipBlob = await zip.generateAsync({ 
          type: 'blob',
          compression: "DEFLATE",
          compressionOptions: { level: 6 }
        });
        
        // Create download link
        const zipUrl = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = zipUrl;
        link.download = `${fileName || `tmdb_${dataType}_package`}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(zipUrl);
        
        setDownloadProgress(100); // Complete
        const successMsg = `${totalItems} items and ${downloadedImages}/${totalImages} images exported successfully!`;
        message.success(successMsg);
        setTimeout(() => setSelectedMovies([]), 1000); // Clear selections after 1 second
      } catch (error) {
        console.error("Error generating ZIP:", error);
        message.error("Error creating ZIP file. See console for details.");
      }
    }
    
    setExportModalVisible(false);
  } catch (error) {
    console.error('Error downloading data:', error);
    message.error('An error occurred while exporting the data.');
  } finally {
    setIsDownloading(false);
    setDownloadProgress(0);
  }
};
  
  // Cancel export modal
  const handleExportCancel = () => {
    setExportModalVisible(false);
  };
  
  // Convert JSON to CSV
  const convertToCSV = (jsonData) => {
    if (!jsonData || !jsonData.length) return '';
    
    // Get all unique keys from all objects
    const allKeys = new Set();
    jsonData.forEach(item => {
      Object.keys(item).forEach(key => allKeys.add(key));
    });
    
    const headerRow = Array.from(allKeys).join(',');
    
    // Create CSV rows
    const rows = jsonData.map(item => {
      return Array.from(allKeys).map(key => {
        // Handle values that might contain commas or quotes
        const value = item[key] !== undefined ? String(item[key]) : '';
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',');
    });
    
    return [headerRow, ...rows].join('\n');
  };

  // Add this function after handleExportCancel
  const generatePreview = async (viewAll = false) => {
    try {
      setPreviewLoading(true);
      // Get current form values
      const values = await exportForm.validateFields();
      const { 
        format, keysToExclude, compactMode, includeEpisodes,
        includeHebrew, includeKeywords // Add these to the destructuring
      } = values;
      
      setPreviewFormat(format);
      setPreviewAll(viewAll);
      
      // Use all items or just the first depending on viewAll parameter
      const previewItems = viewAll ? selectedMovies : selectedMovies.slice(0, 1);
      
      // Get detailed data for the preview items
      const detailedItems = [];
      
      for (const item of previewItems) {
        // Determine item type for mixed selections
        const itemType = item.media_type || (item.title ? 'movie' : 'tv');
        let detailedItem = await fetchItemDetails(item.id, itemType, includeEpisodes);
        
        // Add Hebrew translations for both movies and TV shows
        if (includeHebrew) {
          const hebrewTranslation = await fetchHebrewTranslation(item.id, item.name || item.title || '', itemType);
          if (hebrewTranslation) {
            detailedItem.hebrew_name = hebrewTranslation.name;
            detailedItem.hebrew_overview = hebrewTranslation.overview;
            detailedItem.hebrew_tagline = hebrewTranslation.tagline;
          }
        }
        
        // Add keywords for all media types
        if (includeKeywords) {
          const keywords = await fetchKeywords(item.id, item.name || item.title || '', itemType);
          if (keywords) {
            detailedItem.keywords = keywords;
          }
        }
        
        detailedItems.push(detailedItem);
      }
      
      // Format the data
      const formattedData = formatData(detailedItems, keysToExclude);
      
      // Generate preview based on format
      let preview;
      switch (format) {
        case 'csv':
          preview = convertToCSV(formattedData);
          break;
        case 'txt':
        case 'json':
        default:
          preview = JSON.stringify(formattedData, null, compactMode ? 0 : 2);
          break;
      }
      
      setPreviewData(preview);
      setPreviewVisible(true);
    } catch (error) {
      console.error('Error generating preview:', error);
      message.error('Failed to generate preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Add this function to save the API key
  const saveApiKey = (key) => {
    setCustomApiKey(key);
    localStorage.setItem('tmdb_api_key', key);
    setApiKeyModalVisible(false);
    message.success('API key saved successfully!');
  };

  // Replace your current fetchMovies function with this client-side filtering version
const fetchMovies = async (page = 1, isLoadingMore = false) => {
  // Allow filtering without a search query, but require either a query or active filters
  if (!query.trim() && !hasActiveFilters()) return;
  
  try {
    if (!isLoadingMore) {
      setIsLoading(true);
      setCurrentPage(1);
    } else {
      setIsLoadingMore(true);
    }
    
    const activeApiKey = customApiKey || TMDB_API_KEY;
    let endpoint;
    let params = new URLSearchParams();
    params.append('api_key', activeApiKey);
    params.append('page', page);
    
    // Move this line outside of any conditional blocks
    const needsRuntimeData = runtimeFilter[0] > 0 || runtimeFilter[1] < 400;
    console.log("Runtime filtering needs additional data:", needsRuntimeData);
    
    // Determine which strategy to use based on whether there's a search query
    if (query.trim()) {
      // STRATEGY 1: When we have a text query, use search endpoint
      endpoint = `${TMDB_API_BASE_URL}/search/${dataType}`;
      params.append('query', query);
      
      // Only the include_adult parameter works with search endpoint
      params.append('include_adult', filterAdult ? 'false' : 'true');
      
      console.log("Using search endpoint with client-side filtering");
    } else {
      // STRATEGY 2: When we only have filters, use discover endpoint
      // with server-side filtering
      endpoint = `${TMDB_API_BASE_URL}/discover/${dataType}`;
      params.append('include_adult', filterAdult ? 'false' : 'true');
      
      // Apply all filters to the API request since discover endpoint supports them
      if (genreFilter) {
        params.append('with_genres', genreFilter);
      }
      
      if (minRatingFilter > 0) {
        params.append('vote_average.gte', minRatingFilter);
      }
      
      if (yearRangeFilter[0] !== 1900 || yearRangeFilter[1] !== new Date().getFullYear()) {
        if (dataType === 'movie') {
          params.append('primary_release_date.gte', `${yearRangeFilter[0]}-01-01`);
          params.append('primary_release_date.lte', `${yearRangeFilter[1]}-12-31`);
        } else {
          params.append('first_air_date.gte', `${yearRangeFilter[0]}-01-01`);
          params.append('first_air_date.lte', `${yearRangeFilter[1]}-12-31`);
        }
      }
      
      if (runtimeFilter[0] > 0 || runtimeFilter[1] < 400) {
        params.append('with_runtime.gte', runtimeFilter[0]);
        params.append('with_runtime.lte', runtimeFilter[1]);
      }
      
      if (languageFilter) {
        params.append('with_original_language', languageFilter);
      }
      
      params.append('sort_by', 'popularity.desc');
      console.log("Using discover endpoint with server-side filtering");
    }
    
    console.log("API request:", `${endpoint}?${params.toString()}`);
    const response = await fetch(`${endpoint}?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Search failed with status ${response.status}`);
    }
    
    const data = await response.json();
    let results = data.results;
    console.log("Raw results count:", results.length);
    
    // Update total pages
    setTotalPages(data.total_pages || 0);
    setHasMore(page < data.total_pages);
    
    // For search endpoint, apply filters client-side
    if (query.trim() && hasActiveFilters()) {
      const beforeCount = results.length;
      results = results.filter(item => {
        // Your existing filter code...
        // ...
        return true; // Keep this logic intact
      });
      
      console.log(`Client-side filtering applied: ${beforeCount} → ${results.length} results`);
      
      if (beforeCount > results.length) {
        message.info(`Filtered ${beforeCount - results.length} items client-side`);
      }
    }
    
    // Runtime filtering logic
    if (needsRuntimeData && results.length > 0) {
      // Keep your existing runtime filtering code
      // ...
    }
    
    // Filter out already selected movies
    const filteredResults = results.filter(
      (movie) => !selectedMovies.some((selected) => selected.id === movie.id)
    );
    
    // Update state based on whether this is an initial load or "load more"
    if (isLoadingMore) {
      setMovies(prevMovies => [...prevMovies, ...filteredResults]);
    } else {
      setMovies(filteredResults);
    }
    
    setCurrentPage(page);
    
  } catch (error) {
    console.error('Search error:', error);
    message.error('Failed to search. Please try again.');
  } finally {
    if (isLoadingMore) {
      setIsLoadingMore(false);
    } else {
      setIsLoading(false);
    }
  }
};

// Helper function to check if any filters are active
function hasActiveFilters() {
  return genreFilter || 
         minRatingFilter > 0 || 
         yearRangeFilter[0] !== 1900 || 
         yearRangeFilter[1] !== new Date().getFullYear() ||
         runtimeFilter[0] > 0 ||
         runtimeFilter[1] < 400 ||
         languageFilter;
}

  // Handle search input change
  const handleInputChange = (e) => {
    setQuery(e.target.value);
    // Reset pagination state when query changes
    setCurrentPage(1);
    setHasMore(false);
    setMovies([]); // Clear results when changing query
  };

  // Handle data type change (movie/tv)
  const handleDataTypeChange = (e) => {
    setDataType(e.target.value);
    
    // Add this for the animation
    const container = document.querySelector('.data-type-selector');
    if (e.target.value === 'tv') {
      container.classList.add('tv-selected');
      container.classList.remove('movie-selected');
    } else {
      container.classList.add('movie-selected');
      container.classList.remove('tv-selected');
    }
  };

  // Handle movie selection
  const handleSelectMovie = (movie) => {
    // Add media_type if not already present
    const movieWithType = {
      ...movie,
      media_type: movie.media_type || dataType
    };
    setSelectedMovies((prevSelectedMovies) => [movieWithType, ...prevSelectedMovies]);
    setMovies(movies.filter((m) => m.id !== movie.id));
  };

  // Handle image load error
  const handleImageError = (movie, selected) => {
    if (selected) {
      // Remove from selectedMovies
      setSelectedMovies((prevSelectedMovies) =>
        prevSelectedMovies.filter((m) => m.id !== movie.id)
      );
    } else {
      // Remove from movies
      setMovies((prevMovies) => prevMovies.filter((m) => m.id !== movie.id));
    }
  };

  // Handle movie deselection
  const handleDeselectMovie = (movie) => {
    setMovies([movie, ...movies]);
    setSelectedMovies(selectedMovies.filter((m) => m.id !== movie.id));
  };

  // Update the MovieCard component to show media_type
  const MovieCard = ({ movie, onSelect, onDeselect, selected, onImageError, size }) => {
    const imageUrl = `https://image.tmdb.org/t/p/${size}${movie.backdrop_path || movie.poster_path}`;
    const title = movie.title || movie.name;
    const year = movie.release_date || movie.first_air_date 
      ? new Date(movie.release_date || movie.first_air_date).getFullYear() 
      : '—';
    const rating = movie.vote_average ? movie.vote_average.toFixed(1) : '—';
    const type = movie.media_type || (movie.title ? 'movie' : 'tv');
  
    return (
      <div
        className={`movie-card ${selected ? 'selected' : ''}`}
        onClick={selected ? () => onDeselect(movie) : () => onSelect(movie)}
      >
        <div className="movie-card-inner">
          <div className="image-container">
            <img 
              src={imageUrl}
              alt={title}
              onError={() => onImageError(movie, selected)}
            />
            {selected && <div className="selected-badge"><CheckOutlined /></div>}
            <div className="media-type-badge">{type === 'movie' ? 'MOVIE' : 'TV'}</div>
          </div>
          <div className="movie-info">
            <h3 className="movie-title">{title}</h3>
            <div className="movie-meta">
              <span className="movie-year">{year}</span>
              {rating !== '—' && (
                <span className="movie-rating">
                  <StarFilled /> {rating}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      fetchMovies();
    }
  };

  // Add this function to generate statistics for selected movies
  const generateStats = () => {
    if (selectedMovies.length === 0) return null;
    
    // Calculate average rating
    const ratings = selectedMovies.filter(m => m.vote_average).map(m => m.vote_average);
    const avgRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 0;
    
    // Count genres
    const genreCounts = {};
    selectedMovies.forEach(movie => {
      if (movie.genre_ids) {
        movie.genre_ids.forEach(id => {
          genreCounts[id] = (genreCounts[id] || 0) + 1;
        });
      }
    });
    
    // Get years
    const years = selectedMovies
      .map(m => new Date(m.release_date || m.first_air_date).getFullYear())
      .filter(year => !isNaN(year));
    
    const oldestYear = Math.min(...years);
    const newestYear = Math.max(...years);
    
    return {
      count: selectedMovies.length,
      avgRating: avgRating.toFixed(1),
      oldestYear,
      newestYear,
      yearSpan: newestYear - oldestYear + 1,
    };
  };

  // Add this function to your App component
  const showFetchAllModal = () => {
    setFetchAllModalVisible(true);
    fetchForm.setFieldsValue({
      fetchMethod: 'popular', // Changed from 'mode' to 'fetchMethod'
      maxItems: 100,
      startYear: 2000,
      endYear: new Date().getFullYear(),
      idStart: 1,
      idEnd: 10000,
      maxConcurrentRequests: 30,
      consecutive404Limit: 100,
      includeImages: includeImages,
      includeEpisodes: includeEpisodes
    });
  };

  // Add this function to your App component
  const handleFetchAll = async (values) => {
    const { 
      fetchMethod, maxItems, startYear, endYear, 
      idStart, idEnd, maxConcurrentRequests, consecutive404Limit,
      includeImages, includeEpisodes 
    } = values;
    
    setIsFetching(true);
    setFetchProgress(0);
    setIncludeImages(includeImages);
    setIncludeEpisodes(includeEpisodes);
    
    const headers = {
      'Authorization': `Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3YzZlZjYzNjQxNjkzNWQ3NmIzNGRlMTJkODY4MGNhNSIsIm5iZiI6MTcxNzQ1MTIwMS44MDE5OTk4LCJzdWIiOiI2NjVlMzljMWQxMGFmOGJhNzkyZjI4YmEiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kBohOkqrHkyEVugoqCMwO-DjxbcfUwM2Vjxmja7yZ8o`,
      'Content-Type': 'application/json'
    };
    
    try {
      let addedItemCount = 0;
      
      // Method-specific fetch operations
      if (fetchMethod === 'id_range') {
        // ID Range / Brute Force Mode - Similar to mix_dataset.py brute_force_tv_shows_concurrent
        addedItemCount = await fetchByIdRange(
          idStart, 
          idEnd, 
          maxItems, 
          maxConcurrentRequests, 
          consecutive404Limit, 
          headers
        );
      } else {
        // API-based fetching (popular, top_rated, date_range)
        addedItemCount = await fetchByApiEndpoint(
          fetchMethod,
          maxItems,
          startYear,
          endYear,
          headers
        );
      }
      
      // Use the returned count directly
      if (addedItemCount > 0) {
        setTimeout(() => showExportModal(), 1000);
      }
    } catch (error) {
      console.error('Error during bulk fetch:', error);
      message.error('Failed to fetch items. Please try again.');
    } finally {
      // Create a direct reference to the current items
      const currentItems = [...selectedMovies]; // Capture before closing modal
      const hasItems = currentItems.length > 0;
      
      // First close the fetch modal
      setFetchAllModalVisible(false);
      setIsFetching(false);
      setFetchProgress(0);
      
      // Use a direct check rather than depending on potentially stale state
      console.log("Items in selection:", currentItems.length);
      
      setTimeout(() => {
        console.log("Opening export modal, items:", currentItems.length);
        // Use the captured value instead of potentially stale state reference
        if (hasItems) {
          showExportModal();
        }
      }, 1000);
    }
  };

  // Helper function for ID-based brute force fetching
  const fetchByIdRange = async (startId, endId, maxItems, maxConcurrent, consecutive404Limit, headers) => {
    // Initialize stats and counters
    let successCount = 0;
    let errorCount = 0;
    let consecutive404Count = 0;
    let shouldContinue = true;
    const newItems = [];
    const existingIds = new Set(selectedMovies.map(m => m.id));
    const startTime = Date.now();
    
    // Initialize stats object
    setFetchStats({
      fetchMethod: 'id_range',
      totalIds: endId - startId + 1,
      currentId: startId,
      successCount: 0,
      errorCount: 0,
      consecutive404Count: 0,
      remainingTime: 'calculating...'
    });
    
    // Create an array of IDs to process
    const allIds = Array.from({ length: endId - startId + 1 }, (_, i) => startId + i);
    let processedCount = 0;
    
    // Process IDs in batches of maxConcurrent
    for (let i = 0; i < allIds.length && shouldContinue && successCount < maxItems; i += maxConcurrent) {
      const batchIds = allIds.slice(i, i + maxConcurrent);
      const fetchPromises = batchIds.map(id => {
        return fetchItemById(id, headers)
          .then(item => {
            if (item) {
              // Check if we should filter adult content
              if (filterAdult && item.adult) {
                console.log(`Skipping adult content: ${item.title || item.name} (ID: ${item.id})`);
                return { success: false, id, error: 'Adult content' }; // Skip this item
              }
              
              // Item found and passes filter
              consecutive404Count = 0; // Reset consecutive 404 counter
              successCount++;
              
              // Add media_type to the item
              const itemWithType = {
                ...item,
                media_type: dataType
              };
              
              // Check if we already have this item
              if (!existingIds.has(item.id)) {
                newItems.push(itemWithType);
              }
              
              return { success: true, id };
            } else {
              // 404 Not Found
              consecutive404Count++;
              errorCount++;
              return { success: false, id, error: '404 Not Found' };
            }
          })
          .catch(error => {
            // Handle other errors
            errorCount++;
            
            // Check for rate limiting
            if (error.status === 429) {
              console.warn(`Rate limited at ID ${id}. Waiting and retrying...`);
              // Wait for 5 seconds and retry
              return new Promise(resolve => {
                setTimeout(() => {
                  fetchItemById(id, headers)
                    .then(item => {
                      if (item) {
                        consecutive404Count = 0;
                        successCount++;
                        
                        const itemWithType = {
                          ...item,
                          media_type: dataType
                        };
                        
                        if (!existingIds.has(item.id)) {
                          newItems.push(itemWithType);
                        }
                        
                        resolve({ success: true, id, retried: true });
                      } else {
                        consecutive404Count++;
                        resolve({ success: false, id, error: '404 Not Found (after retry)' });
                      }
                    })
                    .catch(error => {
                      console.error(`Error on retry for ID ${id}:`, error);
                      resolve({ success: false, id, error: error.message });
                    });
                }, 5000);
              });
            }
            
            return { success: false, id, error: error.message };
          });
      });
      
      // Wait for all promises in this batch to resolve
      const results = await Promise.all(fetchPromises);
      
      // Update progress
      processedCount += results.length;
      setFetchProgress(Math.round((processedCount / (endId - startId + 1)) * 100));
      
      // Calculate estimated remaining time
      const elapsedMs = Date.now() - startTime;
      const itemsPerMs = processedCount / elapsedMs;
      const remainingItems = endId - startId + 1 - processedCount;
      const remainingMs = itemsPerMs > 0 ? remainingItems / itemsPerMs : 0;
      const remainingMinutes = Math.round(remainingMs / 60000);
      const remainingTime = remainingMinutes > 0 
        ? `~${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`
        : '< 1 minute';
      
      // Update stats
      setFetchStats({
        fetchMethod: 'id_range',
        totalIds: endId - startId + 1,
        currentId: startId + processedCount,
        successCount,
        errorCount,
        consecutive404Count,
        remainingTime
      });
      
      // Check if we hit the consecutive 404 limit
      if (consecutive404Count >= consecutive404Limit) {
        console.warn(`Reached ${consecutive404Limit} consecutive 404s. Stopping fetch.`);
        shouldContinue = false;
        message.warning(`Stopped after ${consecutive404Limit} consecutive 404s.`);
      }
      
      // Avoid overwhelming the browser with too many objects in memory
      if (newItems.length >= 1000) {
        // Add the batch to selected movies
        setSelectedMovies(prev => [...prev, ...newItems.splice(0, newItems.length)]);
      }
    }
    
    // Add any remaining items to selected movies
    if (newItems.length > 0) {
      setSelectedMovies(prev => [...prev, ...newItems]);
    }
    
    message.success(`Successfully found ${successCount} ${dataType}s by ID (${newItems.length} new items added)`);
    
    // Return the number of items added
    return newItems.length;
  };

  // Helper function to fetch a single item by ID
  const fetchItemById = async (id, headers) => {
    try {
      const response = await fetch(
        `${TMDB_API_BASE_URL}/${dataType}/${id}?api_key=${TMDB_API_KEY}`,
        { headers }
      );
      
      if (response.status === 404) {
        return null; // Item not found
      }
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error fetching ${dataType} with ID ${id}:`, error);
      throw error;
    }
  };

  // Helper function for API-based fetching
  const fetchByApiEndpoint = async (method, maxItems, startYear, endYear, headers) => {
    let allItems = [];
    let page = 1;
    let totalPages = 1;
    let shouldContinue = true;
    let successCount = 0;
    let errorCount = 0;
    
    // Choose endpoint based on method
    let endpoint;
    let params = {};
    
    if (method === 'popular') {
      endpoint = `${TMDB_API_BASE_URL}/${dataType}/popular`;
    } else if (method === 'top_rated') {
      endpoint = `${TMDB_API_BASE_URL}/${dataType}/top_rated`;
    } else if (method === 'date_range') {
      endpoint = `${TMDB_API_BASE_URL}/discover/${dataType}`;
      if (dataType === 'movie') {
        params = {
          'primary_release_date.gte': `${startYear}-01-01`,
          'primary_release_date.lte': `${endYear}-12-31`,
          'sort_by': 'vote_count.desc',
          'include_adult': filterAdult ? 'false' : 'true' // FIXED: Use string format
        };
      } else {
        params = {
          'first_air_date.gte': `${startYear}-01-01`,
          'first_air_date.lte': `${endYear}-12-31`,
          'sort_by': 'vote_count.desc',
          'include_adult': filterAdult ? 'false' : 'true' // FIXED: Use string format
        };
      }
    } else {
      // For popular and top_rated, add the parameter
      endpoint = `${TMDB_API_BASE_URL}/${dataType}/${method}`;
      params = {
        'include_adult': filterAdult ? 'false' : 'true' // FIXED: Use string format
      };
    }
    
    // Initial request to get total pages
    const paramsString = Object.entries(params)
      .map(([key, value]) => `&${key}=${value}`)
      .join('');
      
    const initialResponse = await fetch(
      `${endpoint}?api_key=${TMDB_API_KEY}&page=1${paramsString}`,
      { headers }
    );
    
    if (!initialResponse.ok) {
      throw new Error(`Failed to fetch data: ${initialResponse.status}`);
    }
    
    const initialData = await initialResponse.json();
    totalPages = initialData.total_pages;
    
    // Limit total pages based on maxItems
    const itemsPerPage = 20; // TMDB standard
    const maxPages = Math.min(totalPages, Math.ceil(maxItems / itemsPerPage), 500); // 500 page limit like in mix_dataset.py
    
    // Initialize fetch stats
    setFetchStats({
      fetchMethod: method,
      totalItems: Math.min(maxItems, itemsPerPage * totalPages),
      currentPage: 1,
      totalPages: maxPages,
      successCount: 0,
      errorCount: 0
    });
    
    // Add items from first page
    const firstPageItems = initialData.results.map(item => ({
      ...item,
      media_type: dataType
    }));
    allItems = [...allItems, ...firstPageItems];
    successCount += firstPageItems.length;
    
    // Update stats
    setFetchStats(prev => ({
      ...prev,
      successCount
    }));
    
    const startTime = Date.now();
    
    // Fetch remaining pages
    while (page < maxPages && allItems.length < maxItems && shouldContinue) {
      page++;
      setFetchProgress(Math.round((page / maxPages) * 100));
      
      // Calculate estimated remaining time
      const elapsedMs = Date.now() - startTime;
      const pagesPerMs = (page - 1) / elapsedMs;
      const remainingPages = maxPages - page;
      const remainingMs = pagesPerMs > 0 ? remainingPages / pagesPerMs : 0;
      const remainingMinutes = Math.round(remainingMs / 60000);
      const remainingTime = remainingMinutes > 0 
        ? `~${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`
        : '< 1 minute';
      
      setFetchStats(prev => ({ 
        ...prev, 
        currentPage: page,
        remainingTime
      }));
      
      try {
        const response = await fetch(
          `${endpoint}?api_key=${TMDB_API_KEY}&page=${page}${paramsString}`, 
          { headers }
        );
        
        if (!response.ok) {
          errorCount++;
          setFetchStats(prev => ({ ...prev, errorCount }));
          console.error(`Failed to fetch page ${page}: ${response.status}`);
          continue;
        }
        
        const data = await response.json();
        const pageItems = data.results.map(item => ({
          ...item,
          media_type: dataType
        }));
        
        allItems = [...allItems, ...pageItems];
        successCount += pageItems.length;
        
        // Update stats
        setFetchStats(prev => ({
          ...prev,
          successCount
        }));
        
        // Limit to maxItems
        if (allItems.length >= maxItems) {
          allItems = allItems.slice(0, maxItems);
          shouldContinue = false;
        }
        
        // Avoid rate limiting - similar to SLEEP_BETWEEN_REQUESTS in mix_dataset.py
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        setFetchStats(prev => ({ ...prev, errorCount }));
        console.error(`Error fetching page ${page}:`, error);
      }
    }
    
    // Filter out items already selected
    const existingIds = selectedMovies.map(m => m.id);
    const newItems = allItems.filter(item => !existingIds.includes(item.id));
    
    // Add to selected movies
    setSelectedMovies(prev => [...prev, ...newItems]);
    message.success(`Successfully added ${newItems.length} ${dataType === 'movie' ? 'movies' : 'TV shows'}`);
    
    // Return the number of items added
    return newItems.length;
  };

  // Add this function with your other handler functions
  const clearAllSelections = () => {
    if (selectedMovies.length === 0) return;
    
    // If we have selected items, show confirmation
    Modal.confirm({
      title: 'Clear all selections?',
      content: `Are you sure you want to remove all ${selectedMovies.length} selected items?`,
      okText: 'Yes, Clear All',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk() {
        setSelectedMovies([]);
        message.success('All selections cleared');
      },
    });
  };

  // Add these functions with your other API functions

const fetchHebrewTranslation = async (id, name, type = 'tv') => {
  const headers = {
    'Authorization': `Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3YzZlZjYzNjQxNjkzNWQ3NmIzNGRlMTJkODY4MGNhNSIsIm5iZiI6MTcxNzQ1MTIwMS44MDE5OTk4LCJzdWIiOiI2NjVlMzljMWQxMGFmOGJhNzkyZjI4YmEiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kBohOkqrHkyEVugoqCMwO-DjxbcfUwM2Vjxmja7yZ8o`,
    'Content-Type': 'application/json'
  };

  // Get the active API key (custom or default)
  const activeApiKey = customApiKey || TMDB_API_KEY;
  
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      // Use the appropriate endpoint based on media type
      const response = await fetch(`${TMDB_API_BASE_URL}/${type}/${id}/translations?api_key=${activeApiKey}`, { headers });
      
      if (response.status === 200) {
        const data = await response.json();
        console.log(`Hebrew translations response for ${type} ${id}:`, data); // Debug logging
        const translations = data.translations || [];
        const hebrewTranslation = translations.find(t => t.iso_639_1 === 'he');
        
        if (hebrewTranslation) {
          return {
            name: hebrewTranslation.data?.name || hebrewTranslation.data?.title || null,
            overview: hebrewTranslation.data?.overview || null,
            tagline: hebrewTranslation.data?.tagline || null
          };
        }
        return null; // No Hebrew translation found
      } else if (response.status === 429) {
        // Rate limited, retry after specified time
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        console.warn(`Rate limited when fetching Hebrew for ${type} ${id} (${name}). Retrying after ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        retryCount++;
      } else {
        console.error(`Error fetching Hebrew for ${type} ${id} (${name}): ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error(`Exception fetching Hebrew for ${type} ${id} (${name}):`, error);
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return null; // Failed after all retries
};

const fetchKeywords = async (id, name, type = 'tv') => {
  const headers = {
    'Authorization': `Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI3YzZlZjYzNjQxNjkzNWQ3NmIzNGRlMTJkODY4MGNhNSIsIm5iZiI6MTcxNzQ1MTIwMS44MDE5OTk4LCJzdWIiOiI2NjVlMzljMWQxMGFmOGJhNzkyZjI4YmEiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.kBohOkqrHkyEVugoqCMwO-DjxbcfUwM2Vjxmja7yZ8o`,
    'Content-Type': 'application/json'
  };

  // Get the active API key (custom or default)
  const activeApiKey = customApiKey || TMDB_API_KEY;
  
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      // Use the active API key in the URL
      const response = await fetch(`${TMDB_API_BASE_URL}/${type}/${id}/keywords?api_key=${activeApiKey}`, { headers });
      console.log(`Keywords request for ${type} ${id}: ${response.status}`); // Debug logging
      
      if (response.status === 200) {
        const data = await response.json();
        console.log("Keywords response:", data); // Debug logging
        // TV shows use 'results', movies use 'keywords' in the response
        const keywords = type === 'tv' ? data.results || [] : data.keywords || [];
        return keywords.map(keyword => keyword.name).join(', ');
      } else if (response.status === 429) {
        // Rest of the code remains the same...
        const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
        console.warn(`Rate limited when fetching keywords for ${id} (${name}). Retrying after ${retryAfter}s...`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        retryCount++;
      } else {
        console.error(`Error fetching keywords for ${id} (${name}): ${response.status}`);
        return null;
      }
    } catch (error) {
      console.error(`Exception fetching keywords for ${id} (${name}):`, error);
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  return null; // Failed after all retries
};

// Add this function to fetch genre options after component declaration
const fetchFilterOptions = async () => {
  try {
    const activeApiKey = customApiKey || TMDB_API_KEY;
    
    // Fetch genres
    const genreResponse = await fetch(
      `${TMDB_API_BASE_URL}/genre/${dataType}/list?api_key=${activeApiKey}`
    );
    
    if (genreResponse.ok) {
      const genreData = await genreResponse.json();
      setGenres(genreData.genres || []);
    }
    
    // Fetch languages
    const languageResponse = await fetch(
      `${TMDB_API_BASE_URL}/configuration/languages?api_key=${activeApiKey}`
    );
    
    if (languageResponse.ok) {
      const languageData = await languageResponse.json();
      setLanguages(languageData || []);
    }
  } catch (error) {
    console.error("Error fetching filter options:", error);
  }
};

// Add this effect to fetch options when dataType changes
useEffect(() => {
  fetchFilterOptions();
}, [dataType]);

  // Update your loadMoreMovies function to be simpler
const loadMoreMovies = () => {
  if (!isLoadingMore && hasMore) {
    fetchMovies(currentPage + 1, true);
  }
};

  return (
    <div className="App">
      <header className="app-header">
        <h1>TMDB {dataType === 'movie' ? 'Movie' : 'TV Show'} Search</h1>
        <Button 
          icon={<SettingOutlined />} 
          onClick={() => setApiKeyModalVisible(true)}
          className="settings-button"
        >
          API Settings
        </Button>
      </header>
      
      <div className="search-container">
        <div className='submit-form' onKeyDown={handleKeyDown}>
          <div className="form-row">
            <div className="data-type-selector">
              <label>
                <input
                  type="radio"
                  value="movie"
                  checked={dataType === 'movie'}
                  onChange={handleDataTypeChange}
                />
                <span>Movies</span>
              </label>
              <label>
                <input
                  type="radio"
                  value="tv"
                  checked={dataType === 'tv'}
                  onChange={handleDataTypeChange}
                />
                <span>TV Shows</span>
              </label>
            </div>
            
            <div className="filter-options">
              <label>
                <input
                  type="checkbox"
                  checked={filterAdult}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setFilterAdult(newValue);
                    // If we have an active search query, re-run the search
                    if (query.trim() || showAdvancedFilters) {
                      setTimeout(() => fetchMovies(), 100);
                    }
                  }}
                />
                Filter Adult Content
              </label>
            </div>
          </div>
          
          <div className="form-row">
            <input
              type="text"
              placeholder={`Search for ${dataType === 'movie' ? 'movies' : 'TV shows'}...`}
              value={query}
              onChange={handleInputChange}
            />
            <button onClick={() => fetchMovies()} disabled={isLoading}>
              {isLoading ? <><Spin size="small" /> Searching...</> : "Search"}
            </button>
          </div>
          
          <div className="form-row">
            <button 
              type="button" 
              className="filter-toggle-button"
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            >
              {showAdvancedFilters ? "Hide Filters" : "Advanced Filters"}
            </button>
          </div>

          <div className={`advanced-filters ${showAdvancedFilters ? 'visible' : ''}`}>
            <div className="filter-row">
              <div>
                <label>Genre</label>
                <Select 
                  placeholder="Select genre" 
                  onChange={value => setGenreFilter(value)}
                  allowClear
                  style={{ width: '100%' }}
                  value={genreFilter}
                >
                  {genres.map(genre => (
                    <Option key={genre.id} value={genre.id}>{genre.name}</Option>
                  ))}
                </Select>
              </div>
              
              <div>
                <label>Min Rating</label>
                <div className="slider-container">
                  <Slider 
                    min={0} 
                    max={10} 
                    step={0.5}
                    value={minRatingFilter}
                    onChange={value => setMinRatingFilter(value)}
                    marks={{
                      0: '0',
                      5: '5',
                      10: '10'
                    }}
                  />
                </div>
              </div>
            </div>
            
            <div className="filter-row">
              <div>
                <label>Year Range</label>
                <div className="slider-container">
                  <Slider 
                    range 
                    min={1900} 
                    max={new Date().getFullYear()} 
                    value={yearRangeFilter}
                    onChange={value => setYearRangeFilter(value)}
                    marks={{
                      1900: '1900',
                      1950: '1950',
                      2000: '2000',
                      [new Date().getFullYear()]: `${new Date().getFullYear()}`
                    }}
                  />
                </div>
              </div>
              
              <div>
                <label>Runtime (minutes)</label>
                <div className="slider-container">
                  <Slider 
                    range 
                    min={0} 
                    max={400} 
                    value={runtimeFilter}
                    onChange={value => setRuntimeFilter(value)}
                    marks={{
                      0: '0',
                      120: '120',
                      240: '240',
                      400: '400'
                    }}
                  />
                </div>
              </div>
            </div>
            
            <div className="filter-row">
              <div>
                <label>Language</label>
                <Select 
                  placeholder="Select language" 
                  onChange={value => setLanguageFilter(value)}
                  allowClear
                  style={{ width: '100%' }}
                  value={languageFilter}
                  showSearch
                  optionFilterProp="children"
                >
                  {languages.map(lang => (
                    <Option key={lang.iso_639_1} value={lang.iso_639_1}>
                      {lang.english_name}
                    </Option>
                  ))}
                </Select>
              </div>
              
              <div className="filter-actions">
                <Button onClick={() => {
                  setGenreFilter(null);
                  setMinRatingFilter(0);
                  setYearRangeFilter([1900, new Date().getFullYear()]);
                  setRuntimeFilter([0, 400]);
                  setLanguageFilter(null);
                }}>
                  Reset Filters
                </Button>
                
                <Button type="primary" onClick={() => fetchMovies()}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
          
          {/* Add this below the advanced filters section */}
          {showAdvancedFilters && query.trim() && (
            <div className="filter-notice">
              <InfoCircleOutlined /> When combining text search with filters, filtering is applied after search results are retrieved.
            </div>
          )}
          
          <div className="form-row actions">
            <button 
              onClick={showFetchAllModal} 
              disabled={isFetching}
              className="fetch-all-button"
            >
              {isFetching ? <><Spin size="small" /> Fetching...</> : "Fetch All"}
            </button>
            <button 
              onClick={showExportModal} 
              disabled={selectedMovies.length === 0}
            >
              <DownloadOutlined /> Export
            </button>
            <button 
              onClick={clearAllSelections} 
              disabled={selectedMovies.length === 0}
              className="clear-button"
            >
              Clear Selected
            </button>
          </div>
        </div>
        
        <div className="selected-count">
          {selectedMovies.length > 0 ? (
            <p>{selectedMovies.length} item{selectedMovies.length !== 1 ? 's' : ''} selected</p>
          ) : movies.length == 0 ? (
            <p>No Titles to Show</p>
          ) : (
            <p>No Titles Selected</p>
          )}
        </div>
      </div>
      
      {/* MOVED: Stats panel from bottom to here */}
      {selectedMovies.length > 0 && (
        <div className="stats-panel">
          <h3>Selection Summary</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{selectedMovies.length}</div>
              <div className="stat-label">Selected</div>
            </div>
            
            {generateStats() && (
              <>
                <div className="stat-item">
                  <div className="stat-value">{generateStats().avgRating}</div>
                  <div className="stat-label">Avg Rating</div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-value">{generateStats().yearSpan}</div>
                  <div className="stat-label">Year Span</div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-value">{generateStats().oldestYear}</div>
                  <div className="stat-label">Oldest</div>
                </div>
                
                <div className="stat-item">
                  <div className="stat-value">{generateStats().newestYear}</div>
                  <div className="stat-label">Newest</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Movie Grid Container */}
      <div className="movie-grid-container">
        {/* Search Results with Infinite Scroll */}
        {movies.length > 0 && (
          <InfiniteScroll
            dataLength={movies.length}
            next={loadMoreMovies}
            hasMore={hasMore}
            loader={<div style={{ textAlign: 'center', padding: '20px' }}><Spin size="small" /></div>}
            endMessage={
              <p style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                No more results to load
              </p>
            }
          >
            <div className="movie-grid">
              {selectedMovies.map((movie) => (
                <MovieCard
                  key={`selected-${movie.id}`}
                  movie={movie}
                  selected
                  onDeselect={handleDeselectMovie}
                  onImageError={handleImageError}
                  size={"w300"}
                />
              ))}
              {movies.map((movie) => (
                <MovieCard
                  key={`movie-${movie.id}`}
                  movie={movie}
                  onSelect={handleSelectMovie}
                  onImageError={handleImageError}
                  size={"w300"}
                />
              ))}
            </div>
          </InfiniteScroll>
        )}
      </div>

      {/* Export Modal */}
      <Modal
        title={<Title level={4}>Export Options</Title>}
        open={exportModalVisible}
        onCancel={handleExportCancel}
        footer={null}
        width={600}
      >
        <Form
          form={exportForm}
          layout="vertical"
          onFinish={handleExportSubmit}
        >
          {isDownloading && (
            <div style={{ marginBottom: 20 }}>
              <Progress 
                percent={downloadProgress} 
                status={downloadProgress < 100 ? "active" : "success"} 
                showInfo={true}
              />
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                {downloadProgress < 100 ? (
                  <span>
                    <Spin size="small" /> {' '}
                    {downloadProgress < 40 ? "Fetching details..." : 
                     downloadProgress < 50 ? "Formatting data..." : 
                     downloadProgress < 90 ? "Downloading images..." : 
                     "Creating zip file..."}
                  </span>
                ) : (
                  <span style={{ color: 'green' }}>Complete!</span>
                )}
              </div>
            </div>
          )}

          <Form.Item
            name="fileName"
            label="File Name"
            rules={[{ required: true, message: 'Please enter a file name' }]}
          >
            <Input placeholder="Enter file name (without extension)" />
          </Form.Item>

          <Form.Item
            name="format"
            label="Export Format"
            rules={[{ required: true, message: 'Please select a format' }]}
          >
            <Select placeholder="Select a format">
              <Option value="json">JSON</Option>
              <Option value="csv">CSV</Option>
              <Option value="txt">Text</Option>
            </Select>
          </Form.Item>

          <Divider orientation="left">Options</Divider>

          <Form.Item name="compactMode" valuePropName="checked">
            <Checkbox>Compact Mode (No indentation)</Checkbox>
          </Form.Item>

          <Form.Item name="includeImages" valuePropName="checked">
            <Checkbox>Include Images (Download as ZIP)</Checkbox>
          </Form.Item>

          <Form.Item dependencies={['includeImages']} noStyle>
            {({ getFieldValue }) => 
              getFieldValue('includeImages') && (
                <div className="download-warning">
                  <span>⚠️ Downloading images may be slow and create large files.</span>
                  <br />
                  <span>Selected {selectedMovies.length} items = up to {selectedMovies.length * 2} images.</span>
                </div>
              )
            }
          </Form.Item>

          <Form.Item name="includeEpisodes" valuePropName="checked">
            <Checkbox>Include Seasons & Episodes Data (TV Shows)</Checkbox>
          </Form.Item>

          {/* Add these two new checkboxes */}
          <Form.Item name="includeHebrew" valuePropName="checked">
            <Checkbox>Include Hebrew Translations (TV Shows)</Checkbox>
          </Form.Item>

          <Form.Item dependencies={['includeHebrew']} noStyle>
            {({ getFieldValue }) => 
              getFieldValue('includeHebrew') && (
                <div className="info-note">
                  <span>ℹ️ Fetches Hebrew names, overviews, and taglines when available. May increase export time.</span>
                </div>
              )
            }
          </Form.Item>

          <Form.Item name="includeKeywords" valuePropName="checked">
            <Checkbox>Include Keywords</Checkbox>
          </Form.Item>

          <Divider />

          <Form.Item name="keysToExclude" label="Fields to Exclude">
            <Checkbox.Group options={availableKeysToExclude} />
          </Form.Item>

          <Divider />

          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button 
                onClick={() => generatePreview(false)} 
                disabled={selectedMovies.length === 0}
              >
                Preview
              </Button>
              
              <div style={{ display: 'flex', gap: 12 }}>
                <Button onClick={handleExportCancel}>Cancel</Button>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  icon={<DownloadOutlined />}  // This is where the export icon appears
                  loading={isDownloading}
                  disabled={selectedMovies.length === 0}
                >
                  {isDownloading ? 'Exporting...' : 'Export Now'}
                </Button>
              </div>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={<Title level={4}>Data Preview</Title>}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          selectedMovies.length > 1 && (
            <Button 
              key="viewAll" 
              type={previewAll ? "primary" : "default"}
              onClick={() => generatePreview(!previewAll)}
              loading={previewLoading}
            >
              {previewAll ? "View First Item Only" : "View All Items"}
            </Button>
          ),
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            Close
          </Button>
        ]}
        width={800}
      >
        <div style={{ marginBottom: 10 }}>
          <span style={{ color: '#333' }}>
            {previewLoading ? (
              <><Spin size="small" /> Generating preview...</>
            ) : (
              selectedMovies.length > 1 && !previewAll ? 
                'Preview showing first item only. Click "View All Items" to see all selected items.' : 
                `Preview showing how your exported data will look for ${selectedMovies.length} item(s):`
            )}
          </span>
        </div>
        <div 
          className="preview-container"
          style={{
            maxHeight: '400px',
            overflowY: 'auto',
            padding: '12px',
            backgroundColor: '#121212',
            borderRadius: '4px',
            border: '1px solid #444',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            fontSize: '14px',
            color: '#f8f8f8'
          }}
        >
          {previewLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <Spin size="large" />
            </div>
          ) : (
            previewData
          )}
        </div>
      </Modal>

      {/* Add this modal to your render function */}
      <Modal
        title="API Configuration"
        visible={apiKeyModalVisible}
        onCancel={() => setApiKeyModalVisible(false)}
        footer={null}
        width={500}
      >
        <Form onFinish={({ apiKey }) => saveApiKey(apiKey)}>
          <Form.Item
            name="apiKey"
            label="TMDB API Key"
            initialValue={customApiKey}
            rules={[{ required: true, message: 'Please enter your TMDB API key' }]}
          >
            <Input.Password placeholder="Enter your TMDB API key" />
          </Form.Item>
          
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">
              Don't have an API key? <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer">Get one here</a>
            </Typography.Text>
          </div>
          
          <Form.Item>
            <Button type="primary" htmlType="submit">Save API Key</Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Fetch All Modal - Enhanced like mix_dataset.py */}
      <Modal
        title={<Title level={4}>Fetch {dataType === 'movie' ? 'Movies' : 'TV Shows'} - Advanced</Title>}
        open={fetchAllModalVisible}
        onCancel={() => setFetchAllModalVisible(false)}
        footer={null}
        width={800}
      >
        <Form
          form={fetchForm}
          layout="vertical"
          onFinish={handleFetchAll}
        >
          {isFetching && (
            <div style={{ marginBottom: 20 }}>
              <Progress 
                percent={fetchProgress} 
                status="active" 
                showInfo={true} 
              />
              <div style={{ textAlign: 'center', marginTop: 10 }}>
                <Spin size="small" /> {' '}
                {fetchStats.fetchMethod === 'id_range' ? (
                  <>Processing IDs: {fetchStats.currentId} of {fetchStats.totalIds} ({fetchStats.successCount} added)</>
                ) : (
                  <>Fetching page {fetchStats.currentPage} of {fetchStats.totalPages} ({fetchStats.successCount} items added)</>
                )}
              </div>
              <div style={{ textAlign: 'center', marginTop: 10, fontSize: '12px', color: '#999' }}>
                Est. remaining: {fetchStats.remainingTime || 'calculating...'} | 
                Errors: {fetchStats.errorCount} | 
                Consecutive 404s: {fetchStats.consecutive404Count || 0}
              </div>
            </div>
          )}

          <Form.Item
            name="fetchMethod"
            label="Fetch Method"
            rules={[{ required: true, message: 'Please select a fetch method' }]}
          >
            <Select placeholder="Select how to fetch items">
              <Option value="popular">Most Popular</Option>
              <Option value="top_rated">Top Rated</Option>
              <Option value="date_range">By Year Range</Option>
              <Option value="id_range">By ID Range (Brute Force)</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => 
              prevValues.fetchMethod !== currentValues.fetchMethod || 
              prevValues.idStart !== currentValues.idStart || 
              prevValues.idEnd !== currentValues.idEnd
            }
          >
            {({ getFieldValue, setFieldsValue }) => {
              const method = getFieldValue('fetchMethod');
              // If method changes to id_range, set maxItems based on ID range
              if (method === 'id_range') {
                const idStart = getFieldValue('idStart') || 1;
                const idEnd = getFieldValue('idEnd') || 10000;
                // Calculate ID range size
                const idRangeSize = idEnd - idStart + 1;
                
                // Update maxItems immediately without using useEffect
                // This runs whenever the render function is called due to field changes
                setFieldsValue({ maxItems: Math.min(idRangeSize, 5000) });
                
                return (
                  <>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <Form.Item
                        name="idStart"
                        label="Start ID"
                        rules={[{ required: true, message: 'Please enter start ID' }]}
                        style={{ width: '50%' }}
                      >
                        <Input 
                          type="number" 
                          placeholder="e.g. 1" 
                          onChange={() => {
                            const start = getFieldValue('idStart') || 1;
                            const end = getFieldValue('idEnd') || 10000;
                            setFieldsValue({ maxItems: Math.min(end - start + 1, 5000) });
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        name="idEnd"
                        label="End ID"
                        rules={[{ required: true, message: 'Please enter end ID' }]}
                        style={{ width: '50%' }}
                      >
                        <Input 
                          type="number" 
                          placeholder="e.g. 10000" 
                          onChange={() => {
                            const start = getFieldValue('idStart') || 1;
                            const end = getFieldValue('idEnd') || 10000;
                            setFieldsValue({ maxItems: Math.min(end - start + 1, 5000) });
                          }}
                        />
                      </Form.Item>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {/* Rest of the form items for bruteforce */}
                      {/* ... */}
                      <Form.Item
                        name="maxConcurrentRequests"
                        label="Concurrent Requests"
                        rules={[{ required: true, message: 'Please enter max concurrent requests' }]}
                        style={{ width: '50%' }}
                      >
                        <Input type="number" placeholder="e.g. 30" min="1" max="50" />
                      </Form.Item>
                      <Form.Item
                        name="consecutive404Limit"
                        label="Consecutive 404 Limit"
                        rules={[{ required: true, message: 'Please enter consecutive 404 limit' }]}
                        style={{ width: '50%' }}
                      >
                        <Input type="number" placeholder="e.g. 100" min="10" max="1000" />
                      </Form.Item>
                    </div>
                    <div className="info-note" style={{ marginBottom: '16px' }}>
                      <span>ℹ️ Brute force mode will try to fetch items by ID. This can find hidden content but may result in many 404s.</span>
                    </div>
                  </>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item
            name="maxItems"
            label="Maximum Items to Fetch"
            rules={[{ required: true, message: 'Please enter maximum number of items' }]}
          >
            <Input type="number" placeholder="e.g. 100" min="1" max="1000000" />
          </Form.Item>

          <Form.Item name="includeEpisodes" valuePropName="checked">
            <Checkbox>Include Seasons & Episodes Data (TV Shows)</Checkbox>
          </Form.Item>

          <Form.Item name="includeImages" valuePropName="checked">
            <Checkbox>Include Images on Export</Checkbox>
          </Form.Item>

          <Form.Item>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <Typography.Text type="secondary">
                  Fetching many items might take a while. Results will be added to your selection.
                </Typography.Text>
              </div>
              
              <div style={{ display: 'flex', gap: 12 }}>
                <Button onClick={() => setFetchAllModalVisible(false)}>Cancel</Button>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={isFetching}
                  disabled={isFetching}
                >
                  {isFetching ? 'Fetching...' : 'Start Fetch'}
                </Button>
              </div>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default App;
