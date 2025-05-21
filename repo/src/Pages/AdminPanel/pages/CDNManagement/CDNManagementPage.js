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
  Image
} from "antd";
import { 
  InboxOutlined, 
  ReloadOutlined, 
  SearchOutlined, 
  EyeOutlined, 
  EditOutlined,
  StarFilled
} from '@ant-design/icons';
import { API_URL } from "../../../../config";

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
      <div style={{ padding: 8 }}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={e => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys, confirm, dataIndex)}
          style={{ marginBottom: 8, display: 'block' }}
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
            style={{ width: 90 }}
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
          <Image 
            src={`${API_URL}/cdn/images${posterPath}`}
            alt={record.title || record.name}
            width={50}
            height={75}
            style={{ objectFit: 'cover', borderRadius: '4px' }}
            fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAA3CAMAAAB4odg1AAAATlBMVEUAAADr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+vr6+v////8/Pzv7+/t7e339/f19fXx8fHz8/Pq6urp6en7+/ukIGb9AAAAEnRSTlMA9eDIl0UdCO/QvpmARjoS6KVym9GAAAAC10lEQVRIx6WW25arIAyGBQQBT3jWfv9n3ZC4dqZKW+diJtP8/QghgZA/fyy9V1r7/peWXuvcGhPsRpbb9XYMxrTrXNIvWRvT9UVZXCqDKYuirHvTrRn6lmmqaOJSETSlKWmRwVRxCN4XKUgeu3DTJGWdl+tXT+iLTC7rPEndaHQOXSlBv9FfiNoSk/KCMmi4zgfcI4z3RUUCwpEz5t5b0CrCZJWPMFN4FIgHLcjLVCWiggJ8bkkgGX24LqolozBoYSxRRCXRxypJNMnFRR9lplrCAFJHhJkUEBsBKxFFJBuAmIjQEpBSIeXmDjISUVpAvMJ8T0lA2olgCLC0qeZDQKqVIMwm3Qgbi3BQdRsHmW/JQQnC2pYE6JG/7CbAAdZnyXCEPIF4gqSfONgwH9NL7bGPCSe1C1aH3H2WgvHPPk9heDzOC+E1JU1Pw/gz4UuE70LQVSRr5s8VrE8jrHWxthu+TkFoOZyHCOudKr9MwHoGsdoL+JqCBLdRxU8JTCtyJcrfEa77DiQwzupvBIRz7/yI67xLwHVeAiSYHmGQYPqJ4XvCDxIQUwLiVsIPEhAXezz34o+EeQJisocgmLYiDRJQQ1uRAQmtGiA4g1wg+qsCCND4RQISde8XCYg3hCAoToFwCgRB7BItCj4QvCAFcYlbJCR/QBRwi/wZQfBRRtgj4SMllF5GOJ8uECO8vgJU81XDGuET4fUVSOKrRkqAr5rhCKR81W5HQPGqiXAElK/ablIe0b5qB09A+6rpfZaWPyQfSLvvxji78wPeBe33cB1JZ5zoE/q2QweU7F0i4u4LdIKx91YR8tYi24jCoXWE6K0VpJl6o4OXcOglIXpYLuE+LJfYRoXxsR85jAqLHjPiOSNkGTU+50xTnltGXeoCB+knAcljnMgkQ1nidCopS/og1Wbnk6BZ9mdZ6dzTRJ47TejcM1Su7Kty+Y3Ktbcp1+1dylUb+/8/VsCtX5HMj+MAAAAASUVORK5CYII="
          />
        ) : (
          <div style={{ width: 50, height: 75, background: '#555', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          {record.title || record.name}
          {record.has_image && (
            <Tag color="green" style={{ marginLeft: 8 }}>
              Has Images
            </Tag>
          )}
        </span>
      ),
      sorter: (a, b) => (a.title || a.name).localeCompare(b.title || b.name),
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
      sorter: (a, b) => a.year.localeCompare(b.year),
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
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="View details">
            <Button size="small" type="text" icon={<EyeOutlined />} />
          </Tooltip>
          <Tooltip title="Edit content">
            <Button size="small" type="text" icon={<EditOutlined />} />
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

  useEffect(() => {
    fetchCdnContent();
  }, []);

  return (
    <Flex vertical>
      <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "10px"}}>
        <h1>CDN Management</h1>
        <Flex gap={"5px"}>
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
      <Table 
        columns={columns}
        dataSource={contentItems}
        rowKey="id"
        loading={loading}
        pagination={pagination}
        onChange={(pagination, filters, sorter) => {
          setPagination(prev => ({
            ...prev,
            current: pagination.current,
            pageSize: pagination.pageSize,
          }));
        }}
        size="middle"
        scroll={{ x: 1100 }}
        bordered
      />

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
    </Flex>
  );
};

export default CdnManagementPage;