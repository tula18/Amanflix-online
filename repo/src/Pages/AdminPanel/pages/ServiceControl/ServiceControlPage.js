import React, { useEffect, useState } from "react";
import { 
  Card, 
  Switch, 
  Button, 
  Input, 
  Form, 
  notification, 
  Spin, 
  Alert,
  Space,
  Typography,
  Divider,
  Tag,
  Modal,
  Tooltip,
  Select
} from "antd";
import { 
  PoweroffOutlined, 
  ToolOutlined,
  SaveOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined
} from "@ant-design/icons";
import { API_URL } from "../../../../config";
import './ServiceControlPage.css';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { confirm } = Modal;
const { Option, OptGroup } = Select;

// Message Templates
const MESSAGE_TEMPLATES = {
  maintenance: [
    {
      id: 'scheduled_maintenance',
      name: 'Scheduled Maintenance',
      title: 'Scheduled Maintenance',
      message: 'We are currently performing scheduled maintenance to improve your experience. We\'ll be back shortly!',
      estimatedDowntime: '30 minutes'
    },
    {
      id: 'system_upgrade',
      name: 'System Upgrade',
      title: 'System Upgrade in Progress',
      message: 'We\'re upgrading our systems to bring you new features and improvements. Thank you for your patience!',
      estimatedDowntime: '1-2 hours'
    },
    {
      id: 'database_maintenance',
      name: 'Database Maintenance',
      title: 'Database Maintenance',
      message: 'We\'re performing database maintenance to ensure optimal performance. Service will resume shortly.',
      estimatedDowntime: '15-30 minutes'
    },
    {
      id: 'security_update',
      name: 'Security Update',
      title: 'Security Update',
      message: 'We\'re applying important security updates to keep your data safe. We\'ll be back online soon!',
      estimatedDowntime: '20 minutes'
    },
  ],
  emergency: [
    {
      id: 'unexpected_outage',
      name: 'Unexpected Outage',
      title: 'Service Temporarily Unavailable',
      message: 'We\'re experiencing an unexpected outage and our team is working hard to restore service. We apologize for the inconvenience.',
      estimatedDowntime: 'Unknown'
    },
    {
      id: 'technical_difficulties',
      name: 'Technical Difficulties',
      title: 'Technical Difficulties',
      message: 'We\'re experiencing some technical difficulties. Our team is on it and working to resolve the issue as quickly as possible.',
      estimatedDowntime: null
    },
    {
      id: 'high_traffic',
      name: 'High Traffic',
      title: 'High Traffic Volume',
      message: 'We\'re experiencing unusually high traffic. Please try again in a few minutes. Thank you for your understanding!',
      estimatedDowntime: '5-10 minutes'
    },
  ],
  planned: [
    {
      id: 'new_features',
      name: 'New Features Deployment',
      title: 'Exciting Updates Coming!',
      message: 'We\'re deploying new features to make your streaming experience even better. Check back soon to see what\'s new!',
      estimatedDowntime: '45 minutes'
    },
    {
      id: 'content_update',
      name: 'Content Library Update',
      title: 'Content Library Update',
      message: 'We\'re updating our content library with fresh titles for you to enjoy. The service will be back shortly!',
      estimatedDowntime: '30 minutes'
    },
    {
      id: 'performance_optimization',
      name: 'Performance Optimization',
      title: 'Performance Optimization',
      message: 'We\'re optimizing our servers to deliver faster streaming speeds and better quality. Thanks for waiting!',
      estimatedDowntime: '1 hour'
    },
  ],
  custom: [
    {
      id: 'brief_interruption',
      name: 'Brief Interruption',
      title: 'Brief Service Interruption',
      message: 'We\'ll be right back! Just a quick service interruption.',
      estimatedDowntime: '5 minutes'
    },
    {
      id: 'back_soon',
      name: 'Back Soon',
      title: 'We\'ll Be Back Soon',
      message: 'Amanflix is taking a short break. Grab some popcorn and we\'ll be back before you know it! 🍿',
      estimatedDowntime: null
    },
  ]
};

const ServiceControlPage = () => {
  const token = localStorage.getItem('admin_token');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [form] = Form.useForm();
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  useEffect(() => {
    fetchServiceConfig();
  }, []);

  const fetchServiceConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/service/config`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        form.setFieldsValue({
          maintenance_title: data.maintenance_title,
          maintenance_message: data.maintenance_message,
          estimated_downtime: data.estimated_downtime,
          allow_admin_access: data.allow_admin_access,
        });
      } else {
        const data = await res.json();
        notification.error({ 
          message: "Error loading service configuration",
          description: data.message || "Failed to load configuration",
          placement: "topRight" 
        });
      }
    } catch (error) {
      notification.error({ 
        message: "Error loading service configuration",
        description: error.message,
        placement: "topRight" 
      });
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (updates) => {
    try {
      setSaving(true);
      const formData = new FormData();
      
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          formData.append(key, value.toString());
        }
      });

      const res = await fetch(`${API_URL}/api/service/config`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        notification.success({ 
          message: "Configuration Updated",
          description: "Service configuration has been updated successfully.",
          placement: "topRight" 
        });
        return true;
      } else {
        const data = await res.json();
        notification.error({ 
          message: "Error updating configuration",
          description: data.message || "Failed to update configuration",
          placement: "topRight" 
        });
        return false;
      }
    } catch (error) {
      notification.error({ 
        message: "Error updating configuration",
        description: error.message,
        placement: "topRight" 
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleEnableService = () => {
    confirm({
      title: 'Enable Service',
      icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
      content: 'Are you sure you want to enable the service? All users will be able to access the platform.',
      okText: 'Enable',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: async () => {
        const formData = new FormData();
        
        const res = await fetch(`${API_URL}/api/service/enable`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
          notification.success({ 
            message: "Service Enabled",
            description: "The service has been enabled successfully.",
            placement: "topRight" 
          });
        } else {
          const data = await res.json();
          notification.error({ 
            message: "Error enabling service",
            description: data.message,
            placement: "topRight" 
          });
        }
      },
    });
  };

  const handleDisableService = () => {
    const values = form.getFieldsValue();
    
    confirm({
      title: 'Disable Service',
      icon: <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />,
      content: (
        <div>
          <p>Are you sure you want to disable the service?</p>
          <p><strong>This will prevent all users from accessing the platform.</strong></p>
          <p>Admin panel will remain accessible.</p>
        </div>
      ),
      okText: 'Disable Service',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        const formData = new FormData();
        if (values.maintenance_title) formData.append('title', values.maintenance_title);
        if (values.maintenance_message) formData.append('message', values.maintenance_message);
        if (values.estimated_downtime) formData.append('estimated_downtime', values.estimated_downtime);
        
        const res = await fetch(`${API_URL}/api/service/disable`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
          notification.success({ 
            message: "Service Disabled",
            description: "The service has been disabled.",
            placement: "topRight" 
          });
        } else {
          const data = await res.json();
          notification.error({ 
            message: "Error disabling service",
            description: data.message,
            placement: "topRight" 
          });
        }
      },
    });
  };

  const handleEnableMaintenance = () => {
    const values = form.getFieldsValue();
    
    confirm({
      title: 'Enable Maintenance Mode',
      icon: <ToolOutlined style={{ color: '#faad14' }} />,
      content: (
        <div>
          <p>Are you sure you want to enable maintenance mode?</p>
          <p>Users will see a maintenance message when trying to access the platform.</p>
        </div>
      ),
      okText: 'Enable Maintenance',
      okType: 'primary',
      cancelText: 'Cancel',
      onOk: async () => {
        const formData = new FormData();
        if (values.maintenance_title) formData.append('title', values.maintenance_title);
        if (values.maintenance_message) formData.append('message', values.maintenance_message);
        if (values.estimated_downtime) formData.append('estimated_downtime', values.estimated_downtime);
        
        const res = await fetch(`${API_URL}/api/service/maintenance/enable`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setConfig(data.config);
          notification.success({ 
            message: "Maintenance Mode Enabled",
            description: "Maintenance mode has been enabled.",
            placement: "topRight" 
          });
        } else {
          const data = await res.json();
          notification.error({ 
            message: "Error enabling maintenance mode",
            description: data.message,
            placement: "topRight" 
          });
        }
      },
    });
  };

  const handleDisableMaintenance = async () => {
    const formData = new FormData();
    
    const res = await fetch(`${API_URL}/api/service/maintenance/disable`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      setConfig(data.config);
      notification.success({ 
        message: "Maintenance Mode Disabled",
        description: "Maintenance mode has been disabled.",
        placement: "topRight" 
      });
    } else {
      const data = await res.json();
      notification.error({ 
        message: "Error disabling maintenance mode",
        description: data.message,
        placement: "topRight" 
      });
    }
  };

  const handleSaveSettings = async () => {
    const values = form.getFieldsValue();
    await updateConfig({
      maintenance_title: values.maintenance_title,
      maintenance_message: values.maintenance_message,
      estimated_downtime: values.estimated_downtime,
      allow_admin_access: values.allow_admin_access,
    });
  };

  const handleTemplateSelect = (templateId) => {
    if (!templateId) {
      setSelectedTemplate(null);
      return;
    }

    // Find the template across all categories
    let template = null;
    for (const category of Object.values(MESSAGE_TEMPLATES)) {
      template = category.find(t => t.id === templateId);
      if (template) break;
    }

    if (template) {
      setSelectedTemplate(templateId);
      form.setFieldsValue({
        maintenance_title: template.title,
        maintenance_message: template.message,
        estimated_downtime: template.estimatedDowntime || '',
      });
      notification.info({
        message: 'Template Applied',
        description: `"${template.name}" template has been applied. Don't forget to save!`,
        placement: 'topRight',
      });
    }
  };

  const getStatusTag = () => {
    if (!config) return null;
    
    if (!config.service_enabled) {
      return <Tag color="error" icon={<CloseCircleOutlined />} className="status-tag">SERVICE DISABLED</Tag>;
    }
    if (config.maintenance_mode) {
      return <Tag color="warning" icon={<ToolOutlined />} className="status-tag">MAINTENANCE MODE</Tag>;
    }
    return <Tag color="success" icon={<CheckCircleOutlined />} className="status-tag">SERVICE ACTIVE</Tag>;
  };

  if (loading) {
    return (
      <div className="service-control-loading">
        <Spin size="large" tip="Loading service configuration..." />
      </div>
    );
  }

  return (
    <div className="service-control-page">
      <div className="service-control-header">
        <div className="header-left">
          <Title level={2}>
            <PoweroffOutlined /> Service Control
          </Title>
          <Text type="secondary">Manage the service status and maintenance mode</Text>
        </div>
        <div className="header-right">
          {getStatusTag()}
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchServiceConfig}
            loading={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      {config && (
        <>
          {/* Status Overview */}
          <Card className="status-overview-card" title="Service Status Overview">
            <div className="status-grid">
              <div className={`status-item ${config.service_enabled ? 'active' : 'inactive'}`}>
                <div className="status-icon">
                  {config.service_enabled ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                </div>
                <div className="status-info">
                  <Text strong>Service Status</Text>
                  <Text>{config.service_enabled ? 'Enabled' : 'Disabled'}</Text>
                </div>
              </div>
              
              <div className={`status-item ${config.maintenance_mode ? 'maintenance' : 'normal'}`}>
                <div className="status-icon">
                  <ToolOutlined />
                </div>
                <div className="status-info">
                  <Text strong>Maintenance Mode</Text>
                  <Text>{config.maintenance_mode ? 'Active' : 'Inactive'}</Text>
                </div>
              </div>
              
              <div className="status-item info">
                <div className="status-icon">
                  <ExclamationCircleOutlined />
                </div>
                <div className="status-info">
                  <Text strong>Last Updated</Text>
                  <Text>{config.last_updated ? new Date(config.last_updated).toLocaleString() : 'Never'}</Text>
                </div>
              </div>
              
              <div className="status-item info">
                <div className="status-icon">
                  <ExclamationCircleOutlined />
                </div>
                <div className="status-info">
                  <Text strong>Updated By</Text>
                  <Text>{config.updated_by || 'N/A'}</Text>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="quick-actions-card" title="Quick Actions">
            <Space size="large" wrap>
              {config.service_enabled ? (
                <Button 
                  type="primary" 
                  danger 
                  size="large"
                  icon={<PoweroffOutlined />}
                  onClick={handleDisableService}
                  loading={saving}
                >
                  Disable Service
                </Button>
              ) : (
                <Button 
                  type="primary" 
                  size="large"
                  icon={<PoweroffOutlined />}
                  onClick={handleEnableService}
                  loading={saving}
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                >
                  Enable Service
                </Button>
              )}
              
              {config.maintenance_mode ? (
                <Button 
                  size="large"
                  icon={<ToolOutlined />}
                  onClick={handleDisableMaintenance}
                  loading={saving}
                >
                  Disable Maintenance Mode
                </Button>
              ) : (
                <Tooltip title={!config.service_enabled ? "Service must be enabled to activate maintenance mode" : ""}>
                  <Button 
                    size="large"
                    type="default"
                    icon={<ToolOutlined />}
                    onClick={handleEnableMaintenance}
                    loading={saving}
                    disabled={!config.service_enabled}
                    style={{ borderColor: '#faad14', color: '#faad14' }}
                  >
                    Enable Maintenance Mode
                  </Button>
                </Tooltip>
              )}
            </Space>
            
            {!config.service_enabled && (
              <Alert
                message="Service is Currently Disabled"
                description="Users cannot access the platform. Only admin panel and service status endpoints are accessible."
                type="error"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
            
            {config.service_enabled && config.maintenance_mode && (
              <Alert
                message="Maintenance Mode is Active"
                description="Users will see a maintenance message when trying to access the platform."
                type="warning"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </Card>

          {/* Maintenance Settings */}
          <Card className="settings-card" title="Maintenance Message Settings">
            <Form form={form} layout="vertical">
              {/* Template Selector */}
              <Form.Item
                label={<><FileTextOutlined /> Message Template</>}
                tooltip="Select a predefined template to quickly fill in the maintenance message"
              >
                <Select
                  placeholder="Select a message template..."
                  allowClear
                  value={selectedTemplate}
                  onChange={handleTemplateSelect}
                  style={{ width: '100%' }}
                  className="template-selector"
                >
                  <OptGroup label="🔧 Maintenance">
                    {MESSAGE_TEMPLATES.maintenance.map(template => (
                      <Option key={template.id} value={template.id}>
                        {template.name}
                      </Option>
                    ))}
                  </OptGroup>
                  <OptGroup label="🚨 Emergency">
                    {MESSAGE_TEMPLATES.emergency.map(template => (
                      <Option key={template.id} value={template.id}>
                        {template.name}
                      </Option>
                    ))}
                  </OptGroup>
                  <OptGroup label="📅 Planned">
                    {MESSAGE_TEMPLATES.planned.map(template => (
                      <Option key={template.id} value={template.id}>
                        {template.name}
                      </Option>
                    ))}
                  </OptGroup>
                  <OptGroup label="✨ Custom">
                    {MESSAGE_TEMPLATES.custom.map(template => (
                      <Option key={template.id} value={template.id}>
                        {template.name}
                      </Option>
                    ))}
                  </OptGroup>
                </Select>
              </Form.Item>

              <Divider style={{ margin: '16px 0' }} />

              <Form.Item
                name="maintenance_title"
                label="Maintenance Title"
                tooltip="The title shown to users when the service is down"
              >
                <Input 
                  placeholder="e.g., Service Temporarily Unavailable" 
                  maxLength={100}
                />
              </Form.Item>

              <Form.Item
                name="maintenance_message"
                label="Maintenance Message"
                tooltip="The message shown to users when the service is down"
              >
                <TextArea 
                  placeholder="e.g., We are currently performing scheduled maintenance. Please check back soon!" 
                  rows={4}
                  maxLength={500}
                  showCount
                />
              </Form.Item>

              <Form.Item
                name="estimated_downtime"
                label="Estimated Downtime"
                tooltip="Optional estimated time until service is restored"
              >
                <Input 
                  placeholder="e.g., 30 minutes, 2 hours, Until 6:00 PM EST" 
                  maxLength={100}
                />
              </Form.Item>

              <Form.Item
                name="allow_admin_access"
                label="Allow Admin Access"
                tooltip="If enabled, admin endpoints will remain accessible even when service is down"
                valuePropName="checked"
              >
                <Switch 
                  checkedChildren="Allowed" 
                  unCheckedChildren="Blocked"
                  defaultChecked={config.allow_admin_access}
                />
              </Form.Item>

              <Divider />

              <Form.Item>
                <Button 
                  type="primary" 
                  icon={<SaveOutlined />} 
                  onClick={handleSaveSettings}
                  loading={saving}
                >
                  Save Settings
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </>
      )}
    </div>
  );
};

export default ServiceControlPage;
