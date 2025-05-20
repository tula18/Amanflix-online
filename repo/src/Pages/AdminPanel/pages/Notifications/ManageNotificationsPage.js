import React, { useEffect, useState, useRef } from "react";
import { Table, Input, Button, Tag, Space, Tooltip, Flex, notification, Select, Modal, Form, Radio, Tabs, AutoComplete, Spin } from "antd";
import { API_URL } from "../../../../config";
import { 
  BellOutlined, 
  DeleteOutlined, 
  EditOutlined, 
  PlusOutlined, 
  ReloadOutlined, 
  SearchOutlined,
  GlobalOutlined,
  UserOutlined 
} from "@ant-design/icons";
import TextArea from "antd/lib/input/TextArea";
import './ManageNotificationsPage.css';
import { templates } from './notificationTemplates';

const { Option } = Select;
const { TabPane } = Tabs;

const ManageNotifications = () => {
  const token = localStorage.getItem('admin_token');
  const [data, setData] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedNotifications, setSelectedNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editingNotification, setEditingNotification] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchedColumn, setSearchedColumn] = useState('');
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [linkType, setLinkType] = useState('manual');
  const [contentSearchResults, setContentSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedContent, setSelectedContent] = useState(null);
  
  const searchInput = useRef(null);

  useEffect(() => {
    getNotifications();
    getUsers();
    getStats();
  }, []);

  const getNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/notifications`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setData(data);
      }
    } catch (error) {
      notification.error({ message: "Error fetching notifications", placement: "topLeft" });
    } finally {
      setLoading(false);
    }
  };

  const getUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/user/list`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      notification.error({ message: "Error fetching users", placement: "topLeft" });
    }
  };

  const getStats = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/notifications/stats`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      notification.error({ message: "Error fetching stats", placement: "topLeft" });
    }
  };

  const deleteNotification = async (id) => {
    Modal.confirm({
      title: 'Confirm Deletion',
      content: 'Are you sure you want to delete this notification? This action cannot be undone.',
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await fetch(`${API_URL}/api/admin/notifications/${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.ok) {
            notification.success({ message: "Notification deleted", placement: "topLeft" });
            getNotifications();
            getStats();
          }
        } catch (error) {
          notification.error({ message: "Error deleting notification", placement: "topLeft" });
        }
      }
    });
  };

  const bulkDeleteNotifications = async () => {
    if (selectedNotifications.length === 0) {
      notification.warning({ message: "No notifications selected", placement: "topLeft" });
      return;
    }

    Modal.confirm({
      title: 'Confirm Bulk Deletion',
      content: `Are you sure you want to delete ${selectedNotifications.length} notification${selectedNotifications.length > 1 ? 's' : ''}? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await fetch(`${API_URL}/api/admin/notifications/bulk-delete`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ notification_ids: selectedNotifications })
          });

          if (res.ok) {
            const data = await res.json();
            notification.success({ message: data.message, placement: "topLeft" });
            setSelectedNotifications([]);
            getNotifications();
            getStats();
          }
        } catch (error) {
          notification.error({ message: "Error deleting notifications", placement: "topLeft" });
        }
      }
    });
  };

  const createNotification = async (values) => {
    try {
      const payload = {
        title: values.title,
        message: values.message,
        type: values.type,
        link: values.link || null
      };

      if (values.recipient === 'specific' && values.user_id) {
        payload.user_id = values.user_id;
      } else if (values.recipient === 'multiple' && values.user_ids && values.user_ids.length > 0) {
        payload.user_ids = values.user_ids;
      }

      const res = await fetch(`${API_URL}/api/admin/notifications`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        notification.success({ message: "Notification created", placement: "topLeft" });
        form.resetFields();
        setIsModalVisible(false);
        getNotifications();
        getStats();
      }
    } catch (error) {
      notification.error({ message: "Error creating notification", placement: "topLeft" });
    }
  };

  const broadcastNotification = async (values) => {
    try {
      const payload = {
        title: values.title,
        message: values.message,
        type: values.type,
        link: values.link || null
      };

      const res = await fetch(`${API_URL}/api/admin/notifications/broadcast`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        notification.success({ message: "Broadcast notification sent", placement: "topLeft" });
        form.resetFields();
        setIsModalVisible(false);
        getNotifications();
        getStats();
      }
    } catch (error) {
      notification.error({ message: "Error broadcasting notification", placement: "topLeft" });
    }
  };

  const updateNotification = async (values) => {
    try {
      const payload = {
        title: values.title,
        message: values.message,
        type: values.type,
        link: values.link || null
      };

      const res = await fetch(`${API_URL}/api/admin/notifications/${editingNotification.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        notification.success({ message: "Notification updated", placement: "topLeft" });
        setIsEditModalVisible(false);
        getNotifications();
      }
    } catch (error) {
      notification.error({ message: "Error updating notification", placement: "topLeft" });
    }
  };

  const handleSearch = (selectedKeys, confirm, dataIndex) => {
    confirm();
    setSearchTerm(selectedKeys[0]);
    setSearchedColumn(dataIndex);
  };

  const handleReset = (clearFilters) => {
    clearFilters();
    setSearchTerm('');
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return date.toLocaleString();
  };

  const getColumnSearchProps = (dataIndex) => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`Search ${dataIndex}`}
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
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
            onClick={() => clearFilters && handleReset(clearFilters)}
            size="small"
            style={{ width: 90 }}
          >
            Reset
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => {
              close();
            }}
          >
            Close
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? '#1890ff' : undefined }} />,
    onFilter: (value, record) => 
      record[dataIndex]?.toString().toLowerCase().includes(value.toLowerCase()) || false,
    onFilterDropdownOpenChange: (visible) => {
      if (visible) {
        setTimeout(() => searchInput.current?.select(), 100);
      }
    },
  });

  const searchContent = async (query) => {
    if (!query || query.length < 2) {
      setContentSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    try {
      const response = await fetch(`${API_URL}/cdn/search?q=${encodeURIComponent(query)}&max_results=10&with_images=true`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Format data for autocomplete
        const formattedResults = data.map(item => {
          const title = item.title || item.name;
          const type = item.media_type || (item.title ? 'movie' : 'tv');
          const year = item.release_date ? new Date(item.release_date).getFullYear() : 
                     item.first_air_date ? new Date(item.first_air_date).getFullYear() : '';
          
          return {
            value: `${title} (${type}, ${year})`,
            label: (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div>
                  <div>{title}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    {type === 'movie' ? 'Movie' : 'TV Show'}{year ? `, ${year}` : ''}
                  </div>
                </div>
              </div>
            ),
            id: item.id,
            type: type,
            title: title
          };
        });
        
        setContentSearchResults(formattedResults);
      }
    } catch (error) {
      console.error('Error searching content:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleContentSelect = (value, option) => {
    setSelectedContent(option);
    form.setFieldsValue({ 
      link: `/${option.id}` 
    });
  };

  const applyTemplate = (templateId) => {
    const template = templates.find(t => t.id === parseInt(templateId));
    if (template) {
      form.setFieldsValue({
        title: template.title,
        message: template.message,
        type: template.type
      });
    }
  };

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
      ...getColumnSearchProps('title'),
    },
    {
      title: 'Message',
      dataIndex: 'message',
      key: 'message',
      ...getColumnSearchProps('message'),
      ellipsis: true,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      filters: [
        { text: 'Account', value: 'account' },
        { text: 'System', value: 'system' },
        { text: 'Content', value: 'content' },
        { text: 'Prompt', value: 'prompt' },
        { text: 'Warning', value: 'warning' },
      ],
      onFilter: (value, record) => record.type === value,
      render: (type) => {
        let color;
        switch (type) {
          case 'account': color = 'blue'; break;
          case 'system': color = 'green'; break;
          case 'content': color = 'purple'; break;
          case 'prompt': color = 'cyan'; break;
          case 'warning': color = 'red'; break;
          default: color = 'default';
        }
        return <Tag color={color}>{type.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Recipient',
      dataIndex: 'user_id',
      key: 'user_id',
      filters: [
        { text: 'Global', value: null },
        { text: 'User Specific', value: 'specific' },
      ],
      onFilter: (value, record) => {
        if (value === null) return record.user_id === null;
        return record.user_id !== null;
      },
      render: (userId) => {
        if (userId === null) {
          return <Tag icon={<GlobalOutlined />} color="green">GLOBAL</Tag>;
        }
        const user = users.find(u => u.id === userId);
        return <Tag icon={<UserOutlined />} color="blue">{user ? user.username : userId}</Tag>;
      },
    },
    {
      title: 'Read',
      dataIndex: 'is_read',
      key: 'is_read',
      filters: [
        { text: 'Read', value: true },
        { text: 'Unread', value: false },
      ],
      onFilter: (value, record) => record.is_read === value,
      render: (isRead) => isRead ? 
        <Tag color="green">READ</Tag> : 
        <Tag color="red">UNREAD</Tag>,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Tooltip title="Edit">
            <Button 
              icon={<EditOutlined />} 
              onClick={() => {
                setEditingNotification(record);
                editForm.setFieldsValue({
                  title: record.title,
                  message: record.message,
                  type: record.type,
                  link: record.link || '',
                });
                setIsEditModalVisible(true);
              }} 
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button 
              danger 
              icon={<DeleteOutlined />} 
              onClick={() => deleteNotification(record.id)} 
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys: selectedNotifications,
    onChange: (selectedRowKeys) => {
      setSelectedNotifications(selectedRowKeys);
    },
  };

  return (
    <Flex vertical>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <h1>Manage Notifications</h1>
        <Flex gap="small">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsModalVisible(true)}
          >
            Create Notification
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              getNotifications();
              getStats();
            }}
            loading={loading}
          >
            Reload
          </Button>
          <Button
            icon={<DeleteOutlined />}
            onClick={bulkDeleteNotifications}
            disabled={selectedNotifications.length === 0}
            danger
          >
            Delete Selected
          </Button>
        </Flex>
      </Flex>

      <Tabs defaultActiveKey="1">
        <TabPane tab="Notifications" key="1">
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={data}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            loading={loading}
          />
        </TabPane>
        <TabPane tab="Statistics" key="2">
          <Flex wrap="wrap" gap="medium" justify="center">
            <Flex wrap="wrap" gap="large" flex="space-evenly" justify="center" style={{ padding: 16 }}>
                <div className="stat-card">
                <h3>Total Notifications</h3>
                <div className="stat-value">{stats.total || 0}</div>
                </div>
                <div className="stat-card">
                <h3>Read Notifications</h3>
                <div className="stat-value">{stats.read || 0}</div>
                </div>
                <div className="stat-card">
                <h3>Unread Notifications</h3>
                <div className="stat-value">{stats.unread || 0}</div>
                </div>
                <div className="stat-card">
                <h3>Recent (7 days)</h3>
                <div className="stat-value">{stats.recent || 0}</div>
                </div>
            </Flex>
            
            {stats.by_type && (
              <div className="stat-card" style={{ width: '100%' }}>
                <h3>By Type</h3>
                <Flex gap="middle" wrap="wrap">
                  {Object.entries(stats.by_type).map(([type, count]) => (
                    <div key={type} className="type-stat">
                      <Tag color={
                        type === 'account' ? 'blue' :
                        type === 'system' ? 'green' :
                        type === 'content' ? 'purple' :
                        type === 'prompt' ? 'cyan' :
                        type === 'warning' ? 'red' : 'default'
                      }>
                        {type.toUpperCase()}
                      </Tag>
                      <span>{count}</span>
                    </div>
                  ))}
                </Flex>
              </div>
            )}
          </Flex>
        </TabPane>
      </Tabs>

      {/* Create Notification Modal */}
      <Modal
        title="Create Notification"
        visible={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={(values) => {
          if (values.recipient === 'broadcast') {
            broadcastNotification(values);
          } else {
            createNotification(values);
          }
        }}>
          <Form.Item
            name="recipient"
            label="Recipient"
            initialValue="broadcast"
            rules={[{ required: true, message: 'Please select recipient type' }]}
          >
            <Radio.Group>
              <Radio value="broadcast">All Users (Broadcast)</Radio>
              <Radio value="specific">Specific User</Radio>
              <Radio value="multiple">Multiple Users</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => 
              prevValues.recipient !== currentValues.recipient
            }
          >
            {({ getFieldValue }) => {
              const recipientType = getFieldValue('recipient');
              
              if (recipientType === 'specific') {
                return (
                  <Form.Item
                    name="user_id"
                    label="User"
                    rules={[{ required: true, message: 'Please select a user' }]}
                  >
                    <Select
                      showSearch
                      placeholder="Select a user"
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                      }
                    >
                      {users.map(user => (
                        <Option key={user.id} value={user.id}>{user.username}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              } 
              
              if (recipientType === 'multiple') {
                return (
                  <Form.Item
                    name="user_ids"
                    label="Users"
                    rules={[{ required: true, message: 'Please select at least one user' }]}
                  >
                    <Select
                      mode="multiple"
                      showSearch
                      placeholder="Select users"
                      optionFilterProp="children"
                      filterOption={(input, option) =>
                        option.children.toLowerCase().indexOf(input.toLowerCase()) >= 0
                      }
                      style={{ width: '100%' }}
                    >
                      {users.map(user => (
                        <Option key={user.id} value={user.id}>{user.username}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              }
              
              return null;
            }}
          </Form.Item>

          <Form.Item
            name="template"
            label="Use Template"
          >
            <Select 
              placeholder="Select a template" 
              onChange={applyTemplate}
              allowClear
            >
              {templates.map(template => (
                <Option key={template.id} value={template.id}>{template.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please enter a title' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="message"
            label="Message"
            rules={[{ required: true, message: 'Please enter a message' }]}
          >
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item
            name="type"
            label="Type"
            initialValue="system"
            rules={[{ required: true, message: 'Please select a type' }]}
          >
            <Select>
              <Option value="account">Account</Option>
              <Option value="system">System</Option>
              <Option value="content">Content</Option>
              <Option value="prompt">Prompt</Option>
              <Option value="warning">Warning</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="link_type"
            label="Link Type"
            initialValue="manual"
          >
            <Radio.Group onChange={(e) => setLinkType(e.target.value)}>
              <Radio value="manual">Manual Entry</Radio>
              <Radio value="content">Search Content</Radio>
            </Radio.Group>
          </Form.Item>

          {linkType === 'manual' ? (
            <Form.Item
              name="link"
              label="Link (Optional)"
            >
              <Input placeholder="e.g., /movies/123" />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                label="Search Movie or TV Show"
              >
                <AutoComplete
                  options={contentSearchResults}
                  onSearch={searchContent}
                  onSelect={handleContentSelect}
                  style={{ width: '100%' }}
                  placeholder="Type to search for content..."
                  notFoundContent={searchLoading ? <Spin size="small" /> : "No content found"}
                >
                  <Input prefix={<SearchOutlined />} />
                </AutoComplete>
              </Form.Item>
              <Form.Item
                name="link"
                label="Generated Link"
              >
                <Input disabled={selectedContent !== null} />
              </Form.Item>
            </>
          )}

          <Form.Item>
            <Flex justify="end" gap="small">
              <Button onClick={() => setIsModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">
                {form.getFieldValue('recipient') === 'broadcast' ? 'Broadcast' : 'Create'}
              </Button>
            </Flex>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Notification Modal */}
      <Modal
        title="Edit Notification"
        visible={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        footer={null}
      >
        <Form form={editForm} onFinish={updateNotification}>
          <Form.Item
            name="title"
            label="Title"
            rules={[{ required: true, message: 'Please enter a title' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="message"
            label="Message"
            rules={[{ required: true, message: 'Please enter a message' }]}
          >
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item
            name="type"
            label="Type"
            rules={[{ required: true, message: 'Please select a type' }]}
          >
            <Select>
              <Option value="account">Account</Option>
              <Option value="system">System</Option>
              <Option value="content">Content</Option>
              <Option value="prompt">Prompt</Option>
              <Option value="warning">Warning</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="link"
            label="Link (Optional)"
          >
            <Input placeholder="e.g., /movies/123" />
          </Form.Item>

          <Form.Item>
            <Flex justify="end" gap="small">
              <Button onClick={() => setIsEditModalVisible(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit">Update</Button>
            </Flex>
          </Form.Item>
        </Form>
      </Modal>

      <style jsx>{`
        .stat-card {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 16px;
          min-width: 200px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .stat-value {
          font-size: 24px;
          font-weight: bold;
          margin-top: 8px;
        }
        .type-stat {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </Flex>
  );
};

export default ManageNotifications;