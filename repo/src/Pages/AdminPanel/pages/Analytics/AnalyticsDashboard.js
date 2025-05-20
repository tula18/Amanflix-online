import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Spin, Table, Tabs, notification, Typography, Tag, Button, Dropdown, Space, Modal, Flex } from 'antd';
import { 
  UserOutlined, ClockCircleOutlined, ApiOutlined, 
  LineChartOutlined, WarningOutlined, DashboardOutlined,
  PlaySquareOutlined, FireOutlined, VideoCameraOutlined,
  CheckCircleOutlined, DesktopOutlined, PieChartOutlined,
  DownloadOutlined, FileExcelOutlined, FilePdfOutlined,
  FileTextOutlined, FileJpgOutlined
} from '@ant-design/icons';
import { API_URL } from '../../../../config';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import './AnalyticsDashboard.css';

const { TabPane } = Tabs;
const { Title } = Typography;

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p><span className="custom-tooltip-label">Date:</span> {label}</p>
        {payload.map((entry, index) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            <span className="custom-tooltip-label">{entry.name}:</span>
            {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [contentMetrics, setContentMetrics] = useState(null);
  const [timeRange, setTimeRange] = useState(1); // days
  const [refreshing, setRefreshing] = useState(false);
  const token = localStorage.getItem('admin_token');
  
  // Add fetch function for content metrics
  const fetchContentMetrics = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/content-metrics?days=${timeRange}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        console.log("Content metrics:", data);
        setContentMetrics(data);
      } else {
        console.error("Failed to fetch content metrics");
      }
    } catch (error) {
      console.error("Error fetching content metrics:", error);
    }
  };
  
  // Update useEffect to fetch both datasets
  useEffect(() => {
    const fetchData = async () => {
      // Only show full loading on initial load
      if (!dashboardData || !contentMetrics) {
        setLoading(true);
      } else {
        setRefreshing(true); // Use a lighter refresh indicator for tab changes
      }
      
      await Promise.all([fetchDashboardData(), fetchContentMetrics()]);
      
      setLoading(false);
      setRefreshing(false);
    };
    
    fetchData();
    const interval = setInterval(fetchData, 300000); // Refresh every 5 minutes
    
    return () => clearInterval(interval);
  }, [timeRange]);
  
  const fetchDashboardData = async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/dashboard?days=${timeRange}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      } else {
        notification.error({
          message: 'Error',
          description: 'Failed to fetch analytics data'
        });
      }
    } catch (error) {
      notification.error({
        message: 'Error',
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleTimeRangeChange = (key) => {
    setTimeRange(parseInt(key));
  };

  // Add this function to your component
  const prefetchNextTimeRange = (nextRange) => {
    if (nextRange === timeRange) return;
    
    // Silent prefetch without showing loading states
    fetch(`${API_URL}/api/analytics/dashboard?days=${nextRange}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetch(`${API_URL}/api/analytics/content-metrics?days=${nextRange}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
  };

  // Add these after other state declarations
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportSection, setExportSection] = useState('all');
  const [exportLoading, setExportLoading] = useState(false);

  // Add these functions before the return statement
  const prepareDataForExport = (section) => {
    switch(section) {
      case 'user':
        return {
          metrics: [
            { key: 'Active Users', value: dashboardData.user_metrics.daily_active_users.reduce((sum, day) => sum + day.count, 0) },
            { key: 'Total Sessions', value: dashboardData.user_metrics.total_sessions },
            { key: 'New Users', value: dashboardData.user_metrics.new_users },
            { key: 'Avg. Session Duration', value: dashboardData.user_metrics.avg_session_duration_seconds }
          ],
          dailyUsers: dashboardData.user_metrics.daily_active_users
        };
      case 'content':
        return {
          metrics: [
            { key: 'Total Views', value: (contentMetrics.content_type_distribution[0].value || 0) + (contentMetrics.content_type_distribution[1].value || 0) },
            { key: 'Movie Views', value: contentMetrics.content_type_distribution[0].value || 0 },
            { key: 'TV Show Views', value: contentMetrics.content_type_distribution[1].value || 0 },
            { key: 'Completion Rate', value: contentMetrics.completion_metrics.completion_rate + '%' }
          ],
          mostWatchedMovies: contentMetrics.most_watched.movies,
          mostWatchedShows: contentMetrics.most_watched.shows,
          genres: formatGenreData(),
          dailyViewing: contentMetrics.daily_viewing_trends
        };
      case 'performance':
        return {
          metrics: [
            { key: 'P50 Latency', value: dashboardData.performance.p50_latency_ms + 'ms' },
            { key: 'P90 Latency', value: dashboardData.performance.p90_latency_ms + 'ms' },
            { key: 'P99 Latency', value: dashboardData.performance.p99_latency_ms + 'ms' }
          ],
          systemHealth: [
            { key: 'CPU Usage', value: dashboardData.system_health.cpu_percent + '%' },
            { key: 'Memory Usage', value: dashboardData.system_health.memory_percent + '%' },
            { key: 'Disk Usage', value: dashboardData.system_health.disk_usage_percent + '%' }
          ]
        };
      case 'all':
      default:
        return {
          date: new Date().toISOString().split('T')[0],
          timeRange: `${timeRange} day${timeRange > 1 ? 's' : ''}`,
          userMetrics: prepareDataForExport('user'),
          contentMetrics: prepareDataForExport('content'),
          performanceMetrics: prepareDataForExport('performance')
        };
    }
  };

  const exportToCSV = (section) => {
    setExportLoading(true);
    try {
      const data = prepareDataForExport(section);
      let csvContent = 'data:text/csv;charset=utf-8,';
      
      // Add headers
      csvContent += `Amanflix Analytics Report - ${data.date} (${data.timeRange})\r\n\r\n`;
      
      // Add User Metrics
      csvContent += 'USER METRICS\r\n';
      csvContent += 'Metric,Value\r\n';
      data.userMetrics.metrics.forEach(item => {
        csvContent += `${item.key},${item.value}\r\n`;
      });
      
      // Add daily user data
      csvContent += '\r\nDAILY ACTIVE USERS\r\n';
      csvContent += 'Date,Users\r\n';
      data.userMetrics.dailyUsers.forEach(day => {
        csvContent += `${day.date},${day.count}\r\n`;
      });
      
      // Add Content Metrics
      csvContent += '\r\nCONTENT METRICS\r\n';
      csvContent += 'Metric,Value\r\n';
      data.contentMetrics.metrics.forEach(item => {
        csvContent += `${item.key},${item.value}\r\n`;
      });
      
      // Add performance metrics
      csvContent += '\r\nPERFORMANCE METRICS\r\n';
      csvContent += 'Metric,Value\r\n';
      data.performanceMetrics.metrics.forEach(item => {
        csvContent += `${item.key},${item.value}\r\n`;
      });
      
      // Add system health
      csvContent += '\r\nSYSTEM HEALTH\r\n';
      csvContent += 'Metric,Value\r\n';
      data.performanceMetrics.systemHealth.forEach(item => {
        csvContent += `${item.key},${item.value}\r\n`;
      });
      
      // Create download link
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `amanflix_analytics_${data.date}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      notification.success({
        message: 'Export Successful',
        description: 'Analytics data has been exported to CSV successfully.',
      });
    } catch (error) {
      notification.error({
        message: 'Export Failed',
        description: `Failed to export data: ${error.message}`,
      });
    } finally {
      setExportLoading(false);
      setExportModalVisible(false);
    }
  };

  const exportToJSON = (section) => {
    setExportLoading(true);
    try {
      const data = prepareDataForExport(section);
      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `amanflix_analytics_${data.date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      notification.success({
        message: 'Export Successful',
        description: 'Analytics data has been exported to JSON successfully.',
      });
    } catch (error) {
      notification.error({
        message: 'Export Failed',
        description: `Failed to export data: ${error.message}`,
      });
    } finally {
      setExportLoading(false);
      setExportModalVisible(false);
    }
  };

  const renderExportModal = () => {
    return (
      <Modal
        title="Export Analytics Data"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        className="analytics-export-modal"
      >
        <div className="export-options">
          <h3>Choose Export Format</h3>
          <div className="export-buttons">
            <Button 
              type="primary" 
              icon={<FileTextOutlined />} 
              onClick={() => exportToCSV('all')}
              loading={exportLoading}
              className="export-button"
            >
              Export as CSV
            </Button>
            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={() => exportToJSON('all')}
              loading={exportLoading}
              className="export-button"
            >
              Export as JSON
            </Button>
          </div>
          
          <div className="export-section-select">
            <h3>Choose Section to Export</h3>
            <div className="section-buttons">
              <Button 
                type={exportSection === 'all' ? 'primary' : 'default'} 
                onClick={() => setExportSection('all')}
                className="section-button"
              >
                All Data
              </Button>
              <Button 
                type={exportSection === 'user' ? 'primary' : 'default'} 
                onClick={() => setExportSection('user')}
                className="section-button"
              >
                User Metrics Only
              </Button>
              <Button 
                type={exportSection === 'content' ? 'primary' : 'default'} 
                onClick={() => setExportSection('content')}
                className="section-button"
              >
                Content Metrics Only
              </Button>
              <Button 
                type={exportSection === 'performance' ? 'primary' : 'default'} 
                onClick={() => setExportSection('performance')}
                className="section-button"
              >
                Performance Metrics Only
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    );
  };

  if (loading || !dashboardData || !contentMetrics) {
    return (
      <div style={{ textAlign: 'center', padding: '100px', borderRadius: '8px', height: '100%' }}>
        <Spin size="large" />
        <p style={{ marginTop: '20px', color: '#8c8c8c' }}>Loading analytics data...</p>
      </div>
    );
  }
  
  // Format data for charts
  const formatUserMetricsForChart = () => {
    return dashboardData.user_metrics.daily_active_users.map(day => ({
      date: day.date,
      users: day.count
    }));
  };
  
  const formatRequestsForChart = () => {
    return dashboardData.request_throughput.requests_per_minute.map(minute => ({
      time: minute.minute.split(' ')[1], // Just get the time portion
      requests: minute.count
    }));
  };
  
  const formatTopEndpointsForChart = () => {
    return dashboardData.request_throughput.top_endpoints;
  };

  // Update the average session duration display with a more robust formatter
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0m 0s';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    } else {
      return `${mins}m ${secs}s`;
    }
  };

  // Get system health status color
  const getSystemHealthColor = (percent) => {
    if (percent >= 80) return 'danger';
    if (percent >= 60) return 'warning';
    return '';
  };

  // Add helper functions for content metrics
  const formatGenreData = () => {
    if (!contentMetrics?.genre_popularity) return [];
    
    // Map backend data structure to what the chart expects
    return contentMetrics.genre_popularity.map(item => ({
      genre: item.genre,
      value: item.count // Convert "count" to "value" for the chart
    }));
  };
  
  const formatDailyViewingTrends = () => {
    return contentMetrics?.daily_viewing_trends || [];
  };
  
  const COLORS = ['#e50914', '#ff9800', '#4caf50', '#2196f3', '#9c27b0', '#607d8b', '#ff5722', '#795548'];
  
  // Verify in React DevTools or with console logs
  console.log("Content metrics data:", contentMetrics);
  console.log("Shows data:", contentMetrics.most_watched.shows);
  console.log("Genre data:", contentMetrics.genre_popularity);

  return (
    <div className="analytics-dashboard">
      <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "20px"}}>
          <h1>Admin Dashboard</h1>
          <Flex gap={"5px"}>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                onClick={() => setExportModalVisible(true)}
                className="export-button"
              >
                  Export Data
              </Button>
          </Flex>
      </Flex>
      {/* <Title level={2}>Analytics Dashboard</Title> */}
      
      <Tabs 
        defaultActiveKey="1" 
        onChange={handleTimeRangeChange}
        onTabClick={(key) => {
          // Prefetch data for the next tab
          if (key !== timeRange.toString()) {
            prefetchNextTimeRange(parseInt(key));
          }
        }}
        className="analytics-tabs"
        tabBarStyle={{ marginBottom: 24 }}
      >
        <TabPane tab="Last 24 Hours" key="1"></TabPane>
        <TabPane tab="Last 7 Days" key="7"></TabPane>
        <TabPane tab="Last 30 Days" key="30"></TabPane>
      </Tabs>
      
      {refreshing && (
        <div style={{
          padding: '8px 0',
          textAlign: 'center',
          marginBottom: '16px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '4px'
        }}>
          <Spin size="small" /> <span style={{ marginLeft: '8px', color: '#a3a3a3' }}>Refreshing data...</span>
        </div>
      )}
      
      {/* User Metrics Section */}
      <div className="section-header">
        <h2><UserOutlined /> User Metrics</h2>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic primary"
              title="Active Users" 
              value={dashboardData.user_metrics.daily_active_users.reduce((sum, day) => sum + day.count, 0)} 
              prefix={<UserOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="Total Sessions" 
              value={dashboardData.user_metrics.total_sessions} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="New Users" 
              value={dashboardData.user_metrics.new_users} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="Avg. Session Duration" 
              value={formatDuration(
                dashboardData.user_metrics && 
                dashboardData.user_metrics.avg_session_duration_seconds != null
                  ? dashboardData.user_metrics.avg_session_duration_seconds
                  : 0
              )} 
              prefix={<ClockCircleOutlined />} 
            />
          </Card>
        </Col>
      </Row>
      
      <div className="chart-container">
        <h3>Daily Active Users</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={formatUserMetricsForChart()} className="user-chart">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fill: '#8c8c8c' }} />
            <YAxis tick={{ fill: '#8c8c8c' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="users" 
              name="Active Users"
              stroke="#e50914" 
              strokeWidth={3}
              dot={{ stroke: '#e50914', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 7 }} 
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Request Throughput Section */}
      <div className="section-header">
        <h2><ApiOutlined /> Request Throughput</h2>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <h3>Requests Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={formatRequestsForChart()} className="requests-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fill: '#8c8c8c' }} />
                <YAxis tick={{ fill: '#8c8c8c' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="requests" 
                  name="Requests"
                  stroke="#1f2a40" 
                  strokeWidth={2}
                  dot={{ stroke: '#1f2a40', strokeWidth: 2, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <h3>Top Endpoints</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={formatTopEndpointsForChart()} className="endpoints-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="endpoint" tick={{ fill: '#8c8c8c' }} />
                <YAxis tick={{ fill: '#8c8c8c' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar 
                  dataKey="count" 
                  name="Count"
                  fill="#8884d8" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Col>
      </Row>
      
      {/* Performance Section */}
      <div className="section-header">
        <h2><LineChartOutlined /> Performance</h2>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="analytics-card performance-card">
            <Statistic 
              className="analytics-statistic"
              title="P50 Latency" 
              value={dashboardData.performance.p50_latency_ms} 
              suffix="ms" 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="analytics-card performance-card">
            <Statistic 
              className="analytics-statistic"
              title="P90 Latency" 
              value={dashboardData.performance.p90_latency_ms} 
              suffix="ms" 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="analytics-card performance-card">
            <Statistic 
              className="analytics-statistic"
              title="P99 Latency" 
              value={dashboardData.performance.p99_latency_ms} 
              suffix="ms" 
            />
          </Card>
        </Col>
      </Row>
      
      {/* System Health Section */}
      <div className="section-header">
        <h2><DashboardOutlined /> System Health</h2>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className={`analytics-card system-card ${getSystemHealthColor(dashboardData.system_health.cpu_percent)}`}>
            <Statistic 
              className="analytics-statistic"
              title="CPU Usage" 
              value={dashboardData.system_health.cpu_percent} 
              suffix="%" 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className={`analytics-card system-card ${getSystemHealthColor(dashboardData.system_health.memory_percent)}`}>
            <Statistic 
              className="analytics-statistic"
              title="Memory Usage" 
              value={dashboardData.system_health.memory_percent} 
              suffix="%" 
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className={`analytics-card system-card ${getSystemHealthColor(dashboardData.system_health.disk_usage_percent)}`}>
            <Statistic 
              className="analytics-statistic"
              title="Disk Usage" 
              value={dashboardData.system_health.disk_usage_percent} 
              suffix="%" 
            />
          </Card>
        </Col>
      </Row>
      
      {/* Real-Time Section */}
      <div className="section-header">
        <h2><WarningOutlined /> Real-Time</h2>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="analytics-card realtime-card">
            <Statistic 
              className="analytics-statistic primary"
              title="Active Sessions" 
              value={dashboardData.real_time.active_sessions} 
              prefix={<UserOutlined />} 
            />
          </Card>
        </Col>
      </Row>

      {/* Content Metrics Section */}
      <div className="section-header">
        <h2><PlaySquareOutlined /> Content Metrics</h2>
      </div>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="Total Views" 
              value={
                (contentMetrics.content_type_distribution[0].value || 0) + 
                (contentMetrics.content_type_distribution[1].value || 0)
              } 
              prefix={<VideoCameraOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="Movie Views" 
              value={contentMetrics.content_type_distribution[0].value || 0}
              prefix={<VideoCameraOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="TV Show Views" 
              value={contentMetrics.content_type_distribution[1].value || 0}
              prefix={<PlaySquareOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="analytics-card">
            <Statistic 
              className="analytics-statistic"
              title="Completion Rate" 
              value={contentMetrics.completion_metrics.completion_rate}
              suffix="%" 
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
      
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <h3>Most Watched Movies</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={contentMetrics.most_watched.movies} className="content-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis dataKey="title" tick={{ fill: '#a3a3a3' }} />
                <YAxis tick={{ fill: '#a3a3a3' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar 
                  dataKey="views" 
                  name="Views"
                  fill="#8884d8" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <h3>Most Watched TV Shows</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={contentMetrics.most_watched.shows} className="content-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis dataKey="title" tick={{ fill: '#a3a3a3' }} />
                <YAxis tick={{ fill: '#a3a3a3' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar 
                  dataKey="views" 
                  name="Views"
                  fill="#82ca9d" 
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Col>
      </Row>
      
      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <h3>Genre Popularity</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie 
                  data={formatGenreData()} 
                  dataKey="value"  // This expects a property named "value"
                  nameKey="genre"  // This expects a property named "genre"
                  cx="50%" 
                  cy="50%" 
                  outerRadius={100} 
                  fill="#8884d8" 
                  label
                >
                  {formatGenreData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div className="chart-container">
            <h3>Daily Viewing Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={formatDailyViewingTrends()} className="content-chart">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                <XAxis dataKey="date" tick={{ fill: '#a3a3a3' }} />
                <YAxis tick={{ fill: '#a3a3a3' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  name="Views"
                  stroke="#8884d8" 
                  strokeWidth={2}
                  dot={{ stroke: '#8884d8', strokeWidth: 2, r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Col>
      </Row>

      {renderExportModal()}
    </div>
  );
};

export default AnalyticsDashboard;