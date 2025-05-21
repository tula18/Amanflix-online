import React, { useState, useEffect, useRef } from "react";
import { 
  Flex, 
  Tooltip, 
  Button, 
  Modal, 
  Form, 
  Upload, 
  message, 
  Radio, 
  Switch, 
  Progress, 
  Divider, 
  Table, 
  Space,
  Input,
  Tag,
  Image,
  Select,
  DatePicker
} from "antd";
import { 
  InboxOutlined, 
  ReloadOutlined, 
  SearchOutlined, 
  EyeOutlined, 
  EditOutlined,
  DeleteOutlined,
  StarFilled,
  FilterOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { API_URL } from "../../../../config";
import './CDNManagementPage.css';
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import TextArea from "antd/es/input/TextArea";
import dayjs from 'dayjs';

const { Dragger } = Upload;

const CdnManagementPage = () => {
  const [loading, setLoading] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importType, setImportType] = useState('json');
  const [mergeContent, setMergeContent] = useState(true);
  const [jsonFileList, setJsonFileList] = useState([]);
  const [imagesFileList, setImagesFileList] = useState([]);
  const [contentItems, setContentItems] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const searchInput = useRef(null);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 15,
    total: 0,
    showSizeChanger: true,
    pageSizeOptions: ['15', '30', '50', '100']
  });
  const [filters, setFilters] = useState({
    contentType: null,
    searchText: '',
    searchColumn: ''
  });
  const [filteredCount, setFilteredCount] = useState(0);
  const tableRef = useRef();
  const [tableKey, setTableKey] = useState(Date.now());
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [editFormLoading, setEditFormLoading] = useState(false);

  // Create a form instance for the edit modal
  const [editForm] = Form.useForm();

  const showImportModal = () => {
    setImportModalVisible(true);
    form.resetFields();
    setJsonFileList([]);
    setImagesFileList([]);
    setUploadProgress(0);
  };

  const handleImportCancel = () => {
    setImportModalVisible(false);
  };

  const handleImportTypeChange = (e) => {
    setImportType(e.target.value);
  };

  const handleMergeChange = (checked) => {
    setMergeContent(checked);
  };

  const fetchCdnContent = async () => {
    setLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('admin_token')}`
      };

      // Fetch movies and TV shows with all items (no pagination parameters)
      const moviesResponse = await fetch(`${API_URL}/cdn/movies?with_images=true&per_page=1000000`, {
        headers: headers
      });
      
      const showsResponse = await fetch(`${API_URL}/cdn/tv?with_images=true&per_page=1000000`, {
        headers: headers
      });
      
      if (moviesResponse.ok && showsResponse.ok) {
        const movies = await moviesResponse.json();
        const shows = await showsResponse.json();
        
        // Combine and format the data for display with enhanced fields
        const combinedContent = [
          ...movies.map(movie => ({ 
            ...movie, 
            content_type: 'movie',
            genres: formatGenres(movie.genres),
            rating: movie.vote_average ? (parseFloat(movie.vote_average) / 2).toFixed(1) : 'N/A',
            has_image: Boolean(movie.poster_path || movie.backdrop_path),
            year: movie.release_date ? movie.release_date.substring(0, 4) : 'N/A'
          })),
          ...shows.map(show => ({ 
            ...show, 
            content_type: 'tv',
            genres: formatGenres(show.genres),
            rating: show.vote_average ? (parseFloat(show.vote_average) / 2).toFixed(1) : 'N/A',
            has_image: Boolean(show.poster_path || show.backdrop_path),
            year: show.first_air_date ? show.first_air_date.substring(0, 4) : 'N/A'
          }))
        ];
        
        setContentItems(combinedContent);
        setFilteredCount(combinedContent.length);  // Initialize with full count
        
        // Update pagination to show total count
        setPagination(prev => ({
          ...prev,
          total: combinedContent.length
        }));
        
        message.success(`Loaded ${movies.length} movies and ${shows.length} TV shows`);
      } else {
        // Handle error responses
        if (!moviesResponse.ok) {
          console.error("Movies fetch error:", await moviesResponse.text());
        }
        if (!showsResponse.ok) {
          console.error("TV Shows fetch error:", await showsResponse.text());
        }
        message.error('Failed to load some content');
      }
    } catch (error) {
      console.error("Error fetching CDN content:", error);
      message.error("Failed to load CDN content");
    } finally {
      setLoading(false);
    }
  };

  // Format genres from different possible formats to an array
  const formatGenres = (genres) => {
    if (!genres) return [];
    if (typeof genres === 'string') {
      return genres.split(',').map(g => g.trim());
    }
    if (Array.isArray(genres)) {
      return genres.map(g => typeof g === 'object' ? g.name : g);
    }
    return [];
  };

  // Add search functionality
  const getColumnSearchProps = dataIndex => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} className="cdn-table-filter-dropdown">
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block', backgroundColor: '#1a2035', color: '#e0e0e0', borderColor: '#283555' }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys, confirm, dataIndex)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            Search
          </Button>
          <Button
            onClick={() => handleReset(clearFilters, confirm)}
            size="small"
            style={{ width: 90, color: '#e0e0e0', borderColor: '#283555' }}
          >
            Reset
          </Button>
        </Space>
      </div>
    ),
    filterIcon: filtered => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
    onFilter: (value, record) => {
      const text = dataIndex === 'title' ? (record.title || record.name || '') : record[dataIndex];
      return text ? text.toString().toLowerCase().includes(value.toLowerCase()) : false;
    },
    onFilterDropdownVisibleChange: visible => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
    render: (text, record) => {
      if (searchedColumn === dataIndex) {
        const searchTerm = searchText.toLowerCase();
        const content = dataIndex === 'title' ? (record.title || record.name || '') : text;
        
        if (content && typeof content === 'string' && content.toLowerCase().includes(searchTerm)) {
          const index = content.toLowerCase().indexOf(searchTerm);
          const beforeStr = content.substring(0, index);
          const matchStr = content.substring(index, index + searchTerm.length);
          const afterStr = content.substring(index + searchTerm.length);
          
          return (
            <span>
              {beforeStr}
              <span style={{ color: '#f50', fontWeight: 'bold' }}>{matchStr}</span>
              {afterStr}
            </span>
          );
        }
        
        return dataIndex === 'title' ? (record.title || record.name || text) : text;
      }
      
      return dataIndex === 'title' ? (record.title || record.name || text) : text;
    }
  });

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters, confirm) => {
    clearFilters();
    setSearchText('');
    confirm();
  };

  const jsonUploadProps = {
    name: 'file',
    multiple: false,
    fileList: jsonFileList,
    beforeUpload: (file) => {
      // Check if file is JSON or CSV
      const isJSONorCSV = file.type === 'application/json' || file.name.endsWith('.json') || 
                          file.type === 'text/csv' || file.name.endsWith('.csv');
      
      if (!isJSONorCSV) {
        message.error(`${file.name} is not a JSON or CSV file`);
        return Upload.LIST_IGNORE;
      }
      
      setJsonFileList([file]);
      return false; // Prevent automatic upload
    },
    onRemove: () => {
      setJsonFileList([]);
    },
  };

  const imagesUploadProps = {
    name: 'images',
    multiple: true,
    fileList: imagesFileList,
    beforeUpload: (file) => {
      // Only accept image files
      const isJPG = file.type === 'image/jpeg' || file.name.endsWith('.jpg') || file.name.endsWith('.jpeg');
      
      if (!isJPG) {
        message.error(`${file.name} is not a JPG file`);
        return Upload.LIST_IGNORE;
      }
      
      // Add file to the list
      setImagesFileList(prev => [...prev, file]);
      return false; // Prevent automatic upload
    },
    onRemove: (file) => {
      setImagesFileList(prev => prev.filter(item => item.uid !== file.uid));
    },
  };

  const handleFormSubmit = async () => {
    try {
      await form.validateFields();
      
      if (jsonFileList.length === 0 && importType !== 'images') {
        message.error('Please select a JSON or CSV file to import');
        return;
      }
      
      if (imagesFileList.length === 0 && importType !== 'json') {
        message.error('Please select image files to import');
        return;
      }
      
      setUploading(true);
      
      // Create FormData to send files
      const formData = new FormData();
      
      if (jsonFileList.length > 0) {
        formData.append('data_file', jsonFileList[0]);
      }
      
      formData.append('merge', mergeContent);
      
      // Append all image files
      imagesFileList.forEach((file, index) => {
        formData.append(`image_${index}`, file);
      });
      
      // Use XMLHttpRequest for progress tracking
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_URL}/api/admin/import/cdn_data`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('admin_token')}`);
      
      // Track upload progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 50); // First 50% is upload
          setUploadProgress(progress);
        }
      };
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          if (xhr.status === 200) {
            // Handle processing progress (server-side processing)
            let processProgress = 50;
            const progressInterval = setInterval(() => {
              processProgress += 2;
              setUploadProgress(processProgress);
              
              if (processProgress >= 100) {
                clearInterval(progressInterval);
                setUploading(false);
                setImportModalVisible(false);
                message.success('Content imported successfully!');
                // Refresh the content list
                fetchCdnContent();
              }
            }, 200);
            
          } else {
            setUploading(false);
            try {
              const response = JSON.parse(xhr.responseText);
              message.error(response.message || 'Upload failed');
            } catch (e) {
              message.error('Upload failed');
            }
          }
        }
      };
      
      xhr.onerror = function() {
        setUploading(false);
        message.error('Upload failed due to network error');
      };
      
      xhr.send(formData);
      
    } catch (error) {
      console.error("Form validation error:", error);
    }
  };

  // Enhanced columns configuration
  const columns = [
    {
      title: 'Poster',
      dataIndex: 'poster_path',
      key: 'poster',
      width: 70,
      render: (posterPath, record) => (
        posterPath ? (
          <div style={{ position: 'relative' }}>
            <Image 
              className="cdn-table-poster"
              src={`${API_URL}/cdn/images${posterPath}`}
              alt={record.title || record.name}
              width={50}
              height={75}
              style={{ objectFit: 'cover', borderRadius: '4px' }}
              fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAA3CAMAAAB4odg1AAAATlBMVEUAAADr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+v////8/Pzv7+/t7e339/f19fXx8fHz8/Pq6urp6en7+/ukIGb9AAAAEnRSTlMA9eDIl0UdCO/QvpmARjoS6KVym9GAAAAC10lEQVRIx6WW25arIAyGBQQBT3jWfv9n3ZC4dqZKW+diJtP8/QghgZA/fyy9V1r7/peWXuvcGhPsRpbb9XYMxrTrXNIvWRvT9UVZXCqDKYuirHvTrRn6lmmqaOJSETSlKWmRwVRxCN4XKUgeu3DTJGWdl+tXT+iLTC7rPEndaHQOXSlBv9FfiNoSk/KCMmi4zgfcI4z3RUUCwpEz5t5b0CrCZJWPMFN4FIgHLcjLVCWiggJ8bkkgGX24LqolozBoYSxRRCXRxypJNMnFRR9lplrCAFJHhJkUEBsBKxFFJBuAmIjQEpBSIeXmDjISUVpAvMJ8T0lA2olgCLC0qeZDQKqVIMwm3Qgbi3BQdRsHmW/JQQnC2pYE6JG/7CbAAdZnyXCEPIF4gqSfONgwH9NL7bGPCSe1C1aH3H2WgvHPPk9heDzOC+E1JU1Pw/gz4UuE70LQVSRr5s8VrE8jrHWxthu+TkFoOZyHCOudKr9MwHoGsdoL+JqCBLdRxU8JTCtyJcrfEa77DiQwzupvBIRz7/yI67xLwHVeAiSYHmGQYPqJ4XvCDxIQUwLiVsIPEhAXezz34o+EeQJisocgmLYiDRJQQ1uRAQmtGiA4g1wg+qsCCND4RQISde8XCYg3hCAoToFwCgRB7BItCj4QvCAFcYlbJCR/QBRwi/wZQfBRRtgj4SMllF5GOJ8uECO8vgJU81XDGuET4fUVSOKrRkqAr5rhCKR81W5HQPGqiXAElK/ablIe0b5qB09A+6rpfZaWPyQfSLvvxji78wPeBe33cB1JZ5zoE/q2QweU7F0i4u4LdIKx91YR8tYi24jCoXWE6K0VpJl6o4OXcOglIXpYLuE+LJfYRoXxsR85jAqLHjPiOSNkGTU+50xTnltGXeoCB+knAcljnMgkQ1nidCopS/og1Wbnk6BZ9mdZ6dzTRJ47TejcM1Su7Kty+Y3Ktbcp1+1dylUb+/8/VsCtX5HMj+MAAAAASUVORK5CYII="
            />
          </div>
        ) : (
          <div style={{ width: 50, height: 75, background: '#1a2035', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
            No Image
          </div>
        )
      ),
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      sorter: (a, b) => a.id - b.id,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      ...getColumnSearchProps('title'),
      render: (text, record) => (
        <span>
          {record.title || record.name || 'Untitled'}
        </span>
      ),
      sorter: (a, b) => {
        const titleA = a.title || a.name || '';
        const titleB = b.title || b.name || '';
        return titleA.localeCompare(titleB);
      },
    },
    {
      title: 'Type',
      dataIndex: 'content_type',
      key: 'content_type',
      render: (text) => (
        <Tag color={text === 'movie' ? 'blue' : 'purple'}>
          {text === 'movie' ? 'Movie' : 'TV Show'}
        </Tag>
      ),
      filters: [
        { text: 'Movies', value: 'movie' },
        { text: 'TV Shows', value: 'tv' },
      ],
      onFilter: (value, record) => record.content_type === value,
    },
    {
      title: 'Year',
      dataIndex: 'year',
      key: 'year',
      sorter: (a, b) => {
        const yearA = a.year || '';
        const yearB = b.year || '';
        return yearA.localeCompare(yearB);
      },
      width: 80,
    },
    {
      title: 'Genres',
      dataIndex: 'genres',
      key: 'genres',
      render: (genres) => (
        <>
          {genres.slice(0, 2).map((genre, index) => (
            <Tag key={index} style={{ marginBottom: 3 }}>
              {genre}
            </Tag>
          ))}
          {genres.length > 2 && <Tag>+{genres.length - 2}</Tag>}
        </>
      ),
      filters: [
        { text: 'Action', value: 'action' },
        { text: 'Drama', value: 'drama' },
        { text: 'Comedy', value: 'comedy' },
        { text: 'Horror', value: 'horror' },
        { text: 'Thriller', value: 'thriller' },
        { text: 'Science Fiction', value: 'science fiction' },
      ],
      onFilter: (value, record) => {
        const genres = record.genres || [];
        return genres.some(genre => 
          typeof genre === 'string' && genre.toLowerCase().includes(value.toLowerCase())
        );
      },
    },
    {
      title: 'Rating',
      dataIndex: 'rating',
      key: 'rating',
      render: (rating) => (
        <span>
          {rating !== 'N/A' ? (
            <>
              {rating} <StarFilled style={{ color: '#fadb14' }} />
            </>
          ) : (
            'N/A'
          )}
        </span>
      ),
      sorter: (a, b) => {
        const ratingA = a.rating === 'N/A' ? 0 : parseFloat(a.rating);
        const ratingB = b.rating === 'N/A' ? 0 : parseFloat(b.rating);
        return ratingA - ratingB;
      },
      width: 100,
    },
    {
      title: 'Image Status',
      dataIndex: 'has_image',
      key: 'has_image',
      render: (hasImage) => (
        hasImage ? 
          <Tag color="green">Has Images</Tag> : 
          <Tag color="red">No Images</Tag>
      ),
      filters: [
        { text: 'With Images', value: true },
        { text: 'Without Images', value: false }
      ],
      onFilter: (value, record) => record.has_image === value,
      width: 120,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View details">
            <Button 
              size="small" 
              type="text" 
              icon={<EyeOutlined />} 
              onClick={() => handleViewItem(record)}
            />
          </Tooltip>
          <Tooltip title="Delete content">
            <Button 
              size="small" 
              type="text" 
              danger
              icon={<DeleteOutlined />} 
              onClick={() => handleDeleteItem(record)}
            />
          </Tooltip>
        </Space>
      ),
      width: 100,
    },
  ];

  const handleTableChange = (pagination, filters, sorter) => {
    // Extract content type filter
    const contentTypeFilter = filters.content_type ? filters.content_type[0] : null;
    
    // Update filters state
    setFilters({
      contentType: contentTypeFilter,
      searchText,
      searchColumn: searchedColumn
    });
    
    // Fetch data with new pagination and filters
    fetchCdnContent(
      pagination.current, 
      pagination.pageSize, 
      {
        contentType: contentTypeFilter,
        searchText,
        searchColumn: searchedColumn
      }
    );
  };

  const handleResetAllFilters = () => {
    // Reset all filters and search states
    setSearchText('');
    setSearchedColumn('');
    setFilters({
      contentType: null,
      searchText: '',
      searchColumn: ''
    });
    
    // Reset pagination to first page but keep page size
    setPagination(prev => ({
      ...prev,
      current: 1,
      total: contentItems.length
    }));
    
    // Reset filtered count to show all items
    setFilteredCount(contentItems.length);
    
    // Add a key prop to force table re-render with cleared filters
    setTableKey(Date.now());
  };

  useEffect(() => {
    fetchCdnContent();
  }, []);

  // Add these handler functions before the return statement

  // Open view/edit modal
  const handleViewItem = (record) => {
    setSelectedItem(record);
    setViewModalVisible(true);
  };

  // Close view/edit modal
  const handleViewModalClose = () => {
    setViewModalVisible(false);
    setSelectedItem(null);
  };

  // Open delete confirmation modal
  const handleDeleteItem = (record) => {
    setSelectedItem(record);
    setDeleteModalVisible(true);
  };

  // Close delete confirmation modal
  const handleDeleteModalClose = () => {
    setDeleteModalVisible(false);
    setSelectedItem(null);
    setPassword('');
    setPasswordVisible(false);
  };

  // Delete confirmation handler
  const handleConfirmDelete = async () => {
    if (!password) {
      message.error('Please enter your admin password');
      return;
    }
    
    setEditFormLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('password', password);
      
      // Determine API endpoint based on content type
      const endpoint = selectedItem.content_type === 'movie' 
        ? `${API_URL}/api/upload/movie/delete/${selectedItem.id}`
        : `${API_URL}/api/upload/show/delete/${selectedItem.id}`;
        
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`
        },
        body: formData
      });
      
      const data = await response.json();
      
      if (response.ok) {
        message.success(data.message || 'Content deleted successfully');
        handleDeleteModalClose();
        fetchCdnContent(); // Refresh the list
      } else {
        message.error(data.message || 'Failed to delete content');
      }
    } catch (error) {
      console.error('Error deleting content:', error);
      message.error('An error occurred while deleting the content');
    } finally {
      setEditFormLoading(false);
    }
  };

  // Function to convert item to form values with dynamic properties
  const convertItemToFormValues = (item) => {
    if (!item) return {};
    
    // Extract core fields that need special handling
    const { id, title, name, content_type } = item;
    
    // Create properties array from remaining key-value pairs
    
    const properties = [];
    
    for (const [key, value] of Object.entries(item)) {
      // Skip the core fields we handled separately
      if (['id', 'title', 'name', 'content_type'].includes(key)) {
        continue;
      }
      
      // Determine value type
      let type = 'string';
      if (typeof value === 'number') type = 'number';
      else if (typeof value === 'boolean') type = 'boolean';
      else if (Array.isArray(value)) type = 'array';
      else if (value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)) && 
               (value.includes('-') || value.includes('/')))) type = 'date';
      
      properties.push({
        key,
        type,
        value
      });
    }
    
    return {
      id,
      title: title || name,
      content_type,
      properties
    };
  };

  // Component to render different input types based on the data type
  const DynamicValueInput = ({ type, value, onChange }) => {
    switch (type) {
      case 'number':
        return <InputNumber style={{ width: '100%' }} />;
        
      case 'boolean':
        return <Switch />;
        
      case 'array':
        return <Select
          mode="tags"
          style={{ width: '100%' }}
          tokenSeparators={[',']}
          placeholder="Enter values and press enter or comma"
        />;
        
      case 'date':
        return <DatePicker style={{ width: '100%' }} />;
        
      case 'string':
      default:
        return <Input />;
    }
  };

  // Handle form submission for editing content
  const handleUpdateContent = async (formValues) => {
    if (!selectedItem) return;
    
    setEditFormLoading(true);
    try {
      // Convert form values back to API format
      const apiData = {
        title: formValues.title,
      };
      
      // Add all properties from the properties array
      formValues.properties.forEach(prop => {
        let value = prop.value;
        
        // Handle special data types
        if (prop.type === 'date' && dayjs.isDayjs(value)) {
          value = value.format('YYYY-MM-DD');
        } else if (prop.type === 'boolean' && typeof value !== 'boolean') {
          value = value === 'true' || value === true;
        } else if (prop.type === 'number' && typeof value !== 'number') {
          value = Number(value);
        }
        
        apiData[prop.key] = value;
      });
      
      // API call
      const endpoint = selectedItem.content_type === 'movie' 
        ? `${API_URL}/api/upload/movie/${selectedItem.id}`
        : `${API_URL}/api/upload/show/${selectedItem.id}`;
      
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('admin_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        message.success(data.message || 'Content updated successfully');
        handleViewModalClose();
        fetchCdnContent(); // Refresh the list
      } else {
        message.error(data.message || 'Failed to update content');
      }
    } catch (error) {
      console.error('Error updating content:', error);
      message.error('An error occurred while updating the content');
    } finally {
      setEditFormLoading(false);
    }
  };

  return (
    <Flex vertical>
      <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "20px"}}>
        <Flex align="baseline" gap="small">
          <h1>CDN Management</h1>
          <h2 style={{ color: '#a0a0a0', fontWeight: 'normal' }}>
            {filteredCount > 0 ? filteredCount : contentItems.length} Titles
          </h2>
        </Flex>
        <Flex gap={"5px"}>
          <Tooltip title="Clear all filters">
            <Button
              icon={<FilterOutlined />}
              onClick={handleResetAllFilters}
              disabled={filteredCount === contentItems.length}
              style={{
                width: 130,
              }}
            >
              Reset Filters
            </Button>
          </Tooltip>
          <Tooltip title="Import data from amanflix-data-downloader">
            <Button
              type="primary"
              onClick={showImportModal}
              style={{
                width: 120,
              }}
            >
              Import Data
            </Button>
          </Tooltip>
          <Tooltip title="Reload list">
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={loading}
              onClick={fetchCdnContent}
              style={{
                width: 90,
              }}
            >
              Reload
            </Button>
          </Tooltip>
        </Flex>
      </Flex>

      {/* Enhanced Table of existing content */}
      <div className="cdn-table-container">
        <Table 
          key={tableKey}
          className="cdn-table"
          columns={columns}
          dataSource={contentItems}
          rowKey="id"
          loading={loading}
          ref={tableRef}
          pagination={{
            ...pagination,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
          onChange={(pagination, filters, sorter) => {
            // Update filtered count based on the current dataSource
            const filteredData = contentItems.filter(item => {
              // Apply content type filter
              if (filters.content_type && filters.content_type.length > 0 && !filters.content_type.includes(item.content_type)) {
                return false;
              }
              
              // Apply has_image filter
              if (filters.has_image && filters.has_image.length > 0) {
                const hasImageValue = filters.has_image[0] === true;
                if (item.has_image !== hasImageValue) {
                  return false;
                }
              }
              
              // Apply genre filters if present
              if (filters.genres && filters.genres.length > 0) {
                const hasMatchingGenre = item.genres.some(genre => 
                  filters.genres.some(filter => 
                    genre.toLowerCase().includes(filter.toLowerCase())
                  )
                );
                if (!hasMatchingGenre) return false;
              }
              
              return true;
            });
            
            // Update both filteredCount and pagination.total
            setFilteredCount(filteredData.length);
            setPagination(prev => ({
              ...prev,
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: filteredData.length // This is the important change
            }));
          }}
          size="middle"
          scroll={{ x: 1100 }}
          bordered={false}
          rowClassName={(record, index) => index % 2 === 0 ? 'even-row' : 'odd-row'}
        />
      </div>

      {/* Import Modal Form */}
      <Modal
        title="Import CDN Content"
        open={importModalVisible}
        onCancel={handleImportCancel}
        footer={null}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Import Type">
            <Radio.Group value={importType} onChange={handleImportTypeChange}>
              <Radio.Button value="json">JSON/CSV Data</Radio.Button>
              <Radio.Button value="images">Images</Radio.Button>
              <Radio.Button value="both">Both</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="Content Import Options">
            <Flex align="center">
              <Switch checked={mergeContent} onChange={handleMergeChange} />
              <span style={{ marginLeft: 8 }}>
                Merge with existing content (if unchecked, will replace existing content)
              </span>
            </Flex>
          </Form.Item>

          {(importType === 'json' || importType === 'both') && (
            <>
              <Form.Item 
                label="Upload JSON/CSV Data" 
                name="jsonFile"
                rules={[{ required: importType !== 'images', message: 'Please upload the data file' }]}
              >
                <Dragger {...jsonUploadProps}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">Click or drag file to this area to upload</p>
                  <p className="ant-upload-hint">
                    Support for JSON or CSV file exported from amanflix-data-downloader
                  </p>
                </Dragger>
              </Form.Item>
            </>
          )}

          {(importType === 'images' || importType === 'both') && (
            <>
              <Form.Item 
                label="Upload Image Files (JPG)" 
                name="imageFiles"
                rules={[{ required: importType !== 'json', message: 'Please upload image files' }]}
              >
                <Dragger {...imagesUploadProps}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">Click or drag JPG files to this area to upload</p>
                  <p className="ant-upload-hint">
                    Bulk select JPG images for movie/TV show posters and backdrops
                  </p>
                </Dragger>
              </Form.Item>
            </>
          )}

          {uploading && (
            <div style={{ marginBottom: 16 }}>
              <Divider>Upload Progress</Divider>
              <Progress percent={uploadProgress} status="active" />
              {uploadProgress <= 50 ? (
                <p style={{ textAlign: 'center' }}>Uploading files...</p>
              ) : (
                <p style={{ textAlign: 'center' }}>Processing content...</p>
              )}
            </div>
          )}

          <Form.Item>
            <Flex justify="end" gap="small">
              <Button onClick={handleImportCancel}>Cancel</Button>
              <Button type="primary" onClick={handleFormSubmit} loading={uploading}>
                {uploading ? 'Importing...' : 'Start Import'}
              </Button>
            </Flex>
          </Form.Item>
        </Form>
      </Modal>

      {/* Dynamic View/Edit Modal */}
      <Modal
        title={selectedItem ? `${selectedItem.content_type === 'movie' ? 'Movie' : 'TV Show'} Details` : 'Content Details'}
        open={viewModalVisible}
        onCancel={handleViewModalClose}
        width={1000}
        footer={null}
      >
        {selectedItem && (
          <Form
            layout="vertical"
            initialValues={convertItemToFormValues(selectedItem)}
            onFinish={handleUpdateContent}
            form={editForm}
          >
            {/* Media preview section */}
            <Flex gap={16} style={{ marginBottom: 24 }}>
              <div style={{ width: 200, flexShrink: 0 }}>
                {selectedItem.poster_path ? (
                  <Image
                    src={`${API_URL}/cdn/images${selectedItem.poster_path}`}
                    alt={selectedItem.title || selectedItem.name}
                    style={{ width: '100%', borderRadius: 8 }}
                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAA3CAMAAAB4odg1AAAATlBMVEUAAADr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+v////8/Pzv7+/t7e339/f19fXx8fHz8/Pq6urp6en7+/ukIGb9AAAAEnRSTlMA9eDIl0UdCO/QvpmARjoS6KVym9GAAAAC10lEQVRIx6WW25arIAyGBQQBT3jWfv9n3ZC4dqZKW+diJtP8/QghgZA/fyy9V1r7/peWXuvcGhPsRpbb9XYMxrTrXNIvWRvT9UVZXCqDKYuirHvTrRn6lmmqaOJSETSlKWmRwVRxCN4XKUgeu3DTJGWdl+tXT+iLTC7rPEndaHQOXSlBv9FfiNoSk/KCMmi4zgfcI4z3RUUCwpEz5t5b0CrCZJWPMFN4FIgHLcjLVCWiggJ8bkkgGX24LqolozBoYSxRRCXRxypJNMnFRR9lplrCAFJHhJkUEBsBKxFFJBuAmIjQEpBSIeXmDjISUVpAvMJ8T0lA2olgCLC0qeZDQKqVIMwm3Qgbi3BQdRsHmW/JQQnC2pYE6JG/7CbAAdZnyXCEPIF4gqSfONgwH9NL7bGPCSe1C1aH3H2WgvHPPk9heDzOC+E1JU1Pw/gz4UuE70LQVSRr5s8VrE8jrHWxthu+TkFoOZyHCOudKr9MwHoGsdoL+JqCBLdRxU8JTCtyJcrfEa77DiQwzupvBIRz7/yI67xLwHVeAiSYHmGQYPqJ4XvCDxIQUwLiVsIPEhAXezz34o+EeQJisocgmLYiDRJQQ1uRAQmtGiA4g1wg+qsCCND4RQISde8XCYg3hCAoToFwCgRB7BItCj4QvCAFcYlbJCR/QBRwi/wZQfBRRtgj4SMllF5GOJ8uECO8vgJU81XDGuET4fUVSOKrRkqAr5rhCKR81W5HQPGqiXAElK/ablIe0b5qB09A+6rpfZaWPyQfSLvvxji78wPeBe33cB1JZ5zoE/q2QweU7F0i4u4LdIKx91YR8tYi24jCoXWE6K0VpJl6o4OXcOglIXpYLuE+LJfYRoXxsR85jAqLHjPiOSNkGTU+50xTnltGXeoCB+knAcljnMgkQ1nidCopS/og1Wbnk6BZ9mdZ6dzTRJ47TejcM1Su7Kty+Y3Ktbcp1+1dylUb+/8/VsCtX5HMj+MAAAAASUVORK5CYII="
                  />
                ) : (
                  <div style={{ width: '100%', height: 300, background: '#1a2035', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                    No Poster
                  </div>
                )}
              </div>
              
              <div style={{ flex: 1 }}>
                <Form.Item
                  name="title"
                  label="Title"
                  rules={[{ required: true, message: 'Please enter a title' }]}
                >
                  <Input />
                </Form.Item>

                <Form.Item
                  name="id"
                  label="ID"
                >
                  <Input disabled />
                </Form.Item>
                
                <Form.Item
                  name="content_type"
                  label="Content Type"
                >
                  <Input disabled />
                </Form.Item>
              </div>
            </Flex>

            <Divider orientation="left">Properties</Divider>

            {/* Dynamic properties list */}
            <div className="key-value-form-container">
              {/* Header */}
              <Flex className="key-value-header" align="center">
                <div className="key-column">Property Key</div>
                <div className="type-column">Type</div>
                <div className="value-column">Value</div>
                <div className="action-column">Actions</div>
              </Flex>

              {/* Dynamic form items */}
              <Form.List name="properties">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(({ key, name, ...restField }) => (
                      <Flex key={key} className="key-value-row" align="center">
                        <Form.Item
                          {...restField}
                          name={[name, 'key']}
                          className="key-column"
                          rules={[{ required: true, message: 'Key is required' }]}
                        >
                          <Input placeholder="Key name" />
                        </Form.Item>
                        
                        <Form.Item
                          {...restField}
                          name={[name, 'type']}
                          className="type-column"
                        >
                          <Select defaultValue="string">
                            <Select.Option value="string">String</Select.Option>
                            <Select.Option value="number">Number</Select.Option>
                            <Select.Option value="boolean">Boolean</Select.Option>
                            <Select.Option value="array">Array</Select.Option>
                            <Select.Option value="date">Date</Select.Option>
                          </Select>
                        </Form.Item>
                        
                        <Form.Item
                          {...restField}
                          name={[name, 'value']}
                          className="value-column"
                          rules={[{ required: true, message: 'Value is required' }]}
                        >
                          <DynamicValueInput type={Form.useWatch([name, 'type'], editForm) || 'string'} />
                        </Form.Item>
                        
                        <Form.Item className="action-column">
                          <Button 
                            type="text" 
                            danger 
                            icon={<DeleteOutlined />} 
                            onClick={() => remove(name)}
                          />
                        </Form.Item>
                      </Flex>
                    ))}
                    
                    <Form.Item>
                      <Button 
                        type="dashed" 
                        onClick={() => add({ key: '', type: 'string', value: '' })} 
                        block
                        icon={<PlusOutlined />}
                      >
                        Add Property
                      </Button>
                    </Form.Item>
                  </>
                )}
              </Form.List>
            </div>
            
            <Divider />
            
            <Flex justify="end" gap="small">
              <Button onClick={handleViewModalClose}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={editFormLoading}>
                Save Changes
              </Button>
            </Flex>
          </Form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title={`Delete ${selectedItem?.content_type === 'movie' ? 'Movie' : 'TV Show'}`}
        open={deleteModalVisible}
        onCancel={handleDeleteModalClose}
        footer={null}
      >
        {selectedItem && (
          <div>
            <p>Are you sure you want to delete "{selectedItem.title || selectedItem.name}"?</p>
            <p>This action is irreversible.</p>
            
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="admin-password" style={{ display: 'block', marginBottom: 8 }}>
                Enter your admin password to confirm deletion:
              </label>
              <Input.Password
                id="admin-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your admin password"
                iconRender={visible => (visible ? <FaEyeSlash /> : <FaEye />)}
                style={{ marginBottom: 16 }}
              />
            </div>
            
            <Flex justify="end" gap="small">
              <Button onClick={handleDeleteModalClose}>Cancel</Button>
              <Button type="primary" danger loading={editFormLoading} onClick={handleConfirmDelete}>
                Delete
              </Button>
            </Flex>
          </div>
        )}
      </Modal>
    </Flex>
  );
};

export default CdnManagementPage;