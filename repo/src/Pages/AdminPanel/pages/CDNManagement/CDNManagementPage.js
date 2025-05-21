import React, { useState, useEffect } from "react";
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
  Space
} from "antd";
import { InboxOutlined, ReloadOutlined } from '@ant-design/icons';
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
      // This would fetch the current content from both movies and TV shows CDN
      const moviesResponse = await fetch(`${API_URL}/cdn/movies?page=1&per_page=100`);
      const showsResponse = await fetch(`${API_URL}/cdn/tv?page=1&per_page=100`);
      
      if (moviesResponse.ok && showsResponse.ok) {
        const movies = await moviesResponse.json();
        const shows = await showsResponse.json();
        
        // Combine and format the data for display
        const combinedContent = [
          ...movies.map(movie => ({ ...movie, content_type: 'movie' })),
          ...shows.map(show => ({ ...show, content_type: 'tv' }))
        ];
        
        setContentItems(combinedContent);
      }
    } catch (error) {
      console.error("Error fetching CDN content:", error);
      message.error("Failed to load CDN content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCdnContent();
  }, []);

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

  // Table columns configuration
  const columns = [
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
      render: (text, record) => record.title || record.name,
      sorter: (a, b) => (a.title || a.name).localeCompare(b.title || b.name),
    },
    {
      title: 'Type',
      dataIndex: 'content_type',
      key: 'content_type',
      render: (text) => text === 'movie' ? 'Movie' : 'TV Show',
      filters: [
        { text: 'Movies', value: 'movie' },
        { text: 'TV Shows', value: 'tv' },
      ],
      onFilter: (value, record) => record.content_type === value,
    },
    {
      title: 'Year',
      key: 'year',
      render: (_, record) => {
        const date = record.release_date || record.first_air_date;
        return date ? date.substring(0, 4) : 'N/A';
      },
      sorter: (a, b) => {
        const dateA = a.release_date || a.first_air_date || '';
        const dateB = b.release_date || b.first_air_date || '';
        return dateA.localeCompare(dateB);
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button size="small" type="text">View</Button>
          <Button size="small" type="primary">Edit</Button>
        </Space>
      ),
    },
  ];

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

      {/* Table of existing content */}
      <Table 
        columns={columns}
        dataSource={contentItems}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
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