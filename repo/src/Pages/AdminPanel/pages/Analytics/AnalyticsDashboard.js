import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Row, Col, Card, Statistic, Spin, notification, Typography, Tag, 
  Button, Modal, Progress, Tooltip as AntTooltip, Badge, Space, Segmented,
  Empty
} from 'antd';
import { 
  UserOutlined, ClockCircleOutlined, ApiOutlined, 
  WarningOutlined, DashboardOutlined,
  PlaySquareOutlined, VideoCameraOutlined,
  CheckCircleOutlined, DesktopOutlined,
  DownloadOutlined, FileTextOutlined, DatabaseOutlined, SyncOutlined, 
  ThunderboltOutlined, RiseOutlined, FallOutlined,
  CloudServerOutlined, HddOutlined, ReloadOutlined,
  EyeOutlined, TeamOutlined, TrophyOutlined
} from '@ant-design/icons';
import { API_URL } from '../../../../config';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import './AnalyticsDashboard.css';

const { Title, Text } = Typography;

// Modern color palette
const COLORS = {
  primary: '#e50914',
  secondary: '#141414',
  accent: '#564d4d',
  success: '#52c41a',
  warning: '#faad14',
  error: '#ff4d4f',
  info: '#1890ff',
  purple: '#722ed1',
  cyan: '#13c2c2',
  magenta: '#eb2f96',
  chart: ['#e50914', '#ff6b6b', '#ffa940', '#52c41a', '#1890ff', '#722ed1', '#eb2f96', '#13c2c2']
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    // For pie charts, get the name from payload
    const displayLabel = label || payload[0]?.name || payload[0]?.payload?.name;
    return (
      <div className="analytics-custom-tooltip">
        {displayLabel && <p className="tooltip-label">{displayLabel}</p>}
        {payload.map((entry, index) => (
          <p key={`item-${index}`} className="tooltip-value" style={{ color: entry.color || entry.payload?.fill }}>
            <span className="tooltip-name">{entry.name || 'Value'}:</span>
            <span className="tooltip-data">{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Stat card with trend indicator
const StatCard = ({ title, value, prefix, suffix, trend, trendValue, color, icon, loading }) => {
  const getTrendIcon = () => {
    if (!trend) return null;
    return trend === 'up' ? <RiseOutlined style={{ color: COLORS.success }} /> : <FallOutlined style={{ color: COLORS.error }} />;
  };

  return (
    <Card className={`stat-card ${color ? `stat-card-${color}` : ''}`} loading={loading}>
      <div className="stat-card-content">
        <div className="stat-card-icon">{icon}</div>
        <div className="stat-card-info">
          <Text className="stat-card-title">{title}</Text>
          <div className="stat-card-value">
            {prefix && <span className="stat-prefix">{prefix}</span>}
            <span className="stat-number">{typeof value === 'number' ? value.toLocaleString() : value}</span>
            {suffix && <span className="stat-suffix">{suffix}</span>}
          </div>
          {trend && (
            <div className="stat-card-trend">
              {getTrendIcon()}
              <span className={`trend-value ${trend}`}>{trendValue}</span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

// Section header component
const SectionHeader = ({ icon, title, action }) => (
  <div className="section-header">
    <div className="section-header-left">
      {icon}
      <Title level={4} className="section-title">{title}</Title>
    </div>
    {action && <div className="section-header-right">{action}</div>}
  </div>
);

// Chart card wrapper
const ChartCard = ({ title, children, extra, loading }) => (
  <Card className="chart-card" loading={loading}>
    <div className="chart-card-header">
      <Title level={5} className="chart-title">{title}</Title>
      {extra && <div className="chart-extra">{extra}</div>}
    </div>
    <div className="chart-content">{children}</div>
  </Card>
);

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [contentMetrics, setContentMetrics] = useState(null);
  const [dataIntegrity, setDataIntegrity] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [timeRange, setTimeRange] = useState('1');
  const [refreshing, setRefreshing] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const token = localStorage.getItem('admin_token');

  // Fetch admin profile
  const fetchAdminProfile = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAdminRole(data.role);
      }
    } catch (error) {
      console.error("Error fetching admin profile:", error);
    }
  }, [token]);

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/dashboard?days=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    }
  }, [token, timeRange]);

  // Fetch content metrics
  const fetchContentMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/content-metrics?days=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setContentMetrics(data);
      }
    } catch (error) {
      console.error("Error fetching content metrics:", error);
    }
  }, [token, timeRange]);

  // Fetch data integrity
  const fetchDataIntegrity = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/analytics/data-integrity?fields=watch_history&include_files=true`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDataIntegrity(data);
      }
    } catch (error) {
      console.error("Error fetching data integrity:", error);
    }
  }, [token]);

  // Fetch cache stats
  const fetchCacheStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/cache/stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCacheStats(data.caches);
      }
    } catch (error) {
      console.error("Error fetching cache stats:", error);
    }
  }, [token]);

  // Clear cache
  const handleClearCache = async () => {
    setCacheLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/cache/clear`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        notification.success({
          message: 'Cache Cleared',
          description: 'All caches have been cleared successfully.'
        });
        await fetchCacheStats();
      } else {
        notification.error({
          message: 'Failed to Clear Cache',
          description: 'An error occurred while clearing cache.'
        });
      }
    } catch (error) {
      notification.error({ message: 'Error', description: error.message });
    } finally {
      setCacheLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchAdminProfile();
  }, [fetchAdminProfile]);

  // Fetch all data
  useEffect(() => {
    const fetchAllData = async () => {
      const isInitialLoad = !dashboardData || !contentMetrics || !dataIntegrity;
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      await Promise.all([
        fetchDashboardData(),
        fetchContentMetrics(),
        fetchDataIntegrity(),
        fetchCacheStats()
      ]);

      setLoading(false);
      setRefreshing(false);
    };

    fetchAllData();
    const interval = setInterval(fetchAllData, 300000);
    return () => clearInterval(interval);
  }, [timeRange, fetchDashboardData, fetchContentMetrics, fetchDataIntegrity, fetchCacheStats]);

  // Manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchDashboardData(),
      fetchContentMetrics(),
      fetchDataIntegrity(),
      fetchCacheStats()
    ]);
    setRefreshing(false);
    notification.success({ message: 'Data Refreshed', duration: 2 });
  };

  // Format helpers
  const formatDuration = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0m 0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m ${secs}s`;
  };

  const getHealthColor = (percent) => {
    if (percent >= 80) return 'error';
    if (percent >= 60) return 'warning';
    return 'success';
  };

  const getHealthStatus = (status) => {
    const statusMap = {
      excellent: { color: 'success', icon: <CheckCircleOutlined /> },
      good: { color: 'processing', icon: <CheckCircleOutlined /> },
      warning: { color: 'warning', icon: <WarningOutlined /> },
      critical: { color: 'error', icon: <WarningOutlined /> },
      error: { color: 'error', icon: <WarningOutlined /> }
    };
    return statusMap[status] || { color: 'default', icon: <DashboardOutlined /> };
  };

  // Chart data formatters
  const userChartData = useMemo(() => {
    if (!dashboardData?.user_metrics?.daily_active_users) return [];
    return dashboardData.user_metrics.daily_active_users.map(day => ({
      date: day.date,
      users: day.count
    }));
  }, [dashboardData]);

  const requestChartData = useMemo(() => {
    if (!dashboardData?.request_throughput?.requests_per_minute) return [];
    return dashboardData.request_throughput.requests_per_minute.map(min => ({
      time: min.minute.split(' ')[1]?.substring(0, 5) || min.minute,
      requests: min.count
    }));
  }, [dashboardData]);

  const genreChartData = useMemo(() => {
    if (!contentMetrics?.genre_popularity) return [];
    return contentMetrics.genre_popularity.map(item => ({
      name: item.genre,
      value: item.count
    }));
  }, [contentMetrics]);

  // Export functions
  const exportToCSV = () => {
    setExportLoading(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      let csvContent = 'data:text/csv;charset=utf-8,';
      csvContent += `Amanflix Analytics Report - ${date}\r\n\r\n`;
      
      // User metrics
      csvContent += 'USER METRICS\r\n';
      csvContent += `Active Users,${dashboardData.user_metrics.daily_active_users.reduce((sum, d) => sum + d.count, 0)}\r\n`;
      csvContent += `Total Sessions,${dashboardData.user_metrics.total_sessions}\r\n`;
      csvContent += `New Users,${dashboardData.user_metrics.new_users}\r\n`;
      csvContent += `Avg Session Duration,${formatDuration(dashboardData.user_metrics.avg_session_duration_seconds)}\r\n\r\n`;
      
      // Performance
      csvContent += 'PERFORMANCE\r\n';
      csvContent += `P50 Latency,${dashboardData.performance.p50_latency_ms}ms\r\n`;
      csvContent += `P90 Latency,${dashboardData.performance.p90_latency_ms}ms\r\n`;
      csvContent += `P99 Latency,${dashboardData.performance.p99_latency_ms}ms\r\n`;

      const link = document.createElement('a');
      link.href = encodeURI(csvContent);
      link.download = `amanflix_analytics_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      notification.success({ message: 'Export Successful', description: 'Data exported to CSV' });
    } catch (error) {
      notification.error({ message: 'Export Failed', description: error.message });
    } finally {
      setExportLoading(false);
      setExportModalVisible(false);
    }
  };

  const exportToJSON = () => {
    setExportLoading(true);
    try {
      const date = new Date().toISOString().split('T')[0];
      const data = {
        exportDate: date,
        timeRange: `${timeRange} day(s)`,
        userMetrics: dashboardData.user_metrics,
        contentMetrics: contentMetrics,
        performance: dashboardData.performance,
        systemHealth: dashboardData.system_health
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `amanflix_analytics_${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      notification.success({ message: 'Export Successful', description: 'Data exported to JSON' });
    } catch (error) {
      notification.error({ message: 'Export Failed', description: error.message });
    } finally {
      setExportLoading(false);
      setExportModalVisible(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="analytics-loading">
        <Spin size="large" />
        <Text className="loading-text">Loading analytics data...</Text>
      </div>
    );
  }

  // Error state
  if (!dashboardData || !contentMetrics || !dataIntegrity) {
    return (
      <div className="analytics-error">
        <Empty description="Failed to load analytics data" />
        <Button type="primary" onClick={handleRefresh} icon={<ReloadOutlined />}>
          Retry
        </Button>
      </div>
    );
  }

  const totalViews = (contentMetrics.content_type_distribution?.[0]?.value || 0) + 
                     (contentMetrics.content_type_distribution?.[1]?.value || 0);

  return (
    <div className="analytics-dashboard-v2">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-left">
          <Title level={2} className="page-title">Analytics Dashboard</Title>
          <Text type="secondary" className="page-subtitle">Monitor your platform performance</Text>
        </div>
        <div className="header-right">
          <Space size="middle">
            <Segmented
              options={[
                { label: '24 Hours', value: '1' },
                { label: '7 Days', value: '7' },
                { label: '30 Days', value: '30' }
              ]}
              value={timeRange}
              onChange={setTimeRange}
              className="time-range-selector"
            />
            <AntTooltip title="Refresh Data">
              <Button 
                icon={<ReloadOutlined spin={refreshing} />} 
                onClick={handleRefresh}
                loading={refreshing}
              />
            </AntTooltip>
            <Button 
              type="primary" 
              icon={<DownloadOutlined />}
              onClick={() => setExportModalVisible(true)}
            >
              Export
            </Button>
          </Space>
        </div>
      </div>

      {/* Quick Stats Overview */}
      <Row gutter={[16, 16]} className="overview-section">
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active Users"
            value={dashboardData.user_metrics.daily_active_users.reduce((sum, d) => sum + d.count, 0)}
            icon={<TeamOutlined />}
            color="primary"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Sessions"
            value={dashboardData.user_metrics.total_sessions}
            icon={<DesktopOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Total Views"
            value={totalViews}
            icon={<EyeOutlined />}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title="Active Now"
            value={dashboardData.real_time.active_sessions}
            icon={<Badge status="processing" />}
            color="success"
          />
        </Col>
      </Row>

      {/* User Metrics Section */}
      <SectionHeader 
        icon={<UserOutlined />} 
        title="User Metrics"
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <ChartCard title="Daily Active Users">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={userChartData}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tick={{ fill: '#999', fontSize: 12 }} />
                <YAxis tick={{ fill: '#999', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="users" 
                  name="Users"
                  stroke={COLORS.primary} 
                  strokeWidth={2}
                  fill="url(#colorUsers)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="metrics-card">
            <div className="metric-item">
              <div className="metric-label">
                <UserOutlined /> New Users
              </div>
              <div className="metric-value">{dashboardData.user_metrics.new_users}</div>
            </div>
            <div className="metric-item">
              <div className="metric-label">
                <SyncOutlined /> Returning Users
              </div>
              <div className="metric-value">{dashboardData.user_metrics.returning_users || 0}</div>
            </div>
            <div className="metric-item">
              <div className="metric-label">
                <ClockCircleOutlined /> Avg. Session
              </div>
              <div className="metric-value">
                {formatDuration(dashboardData.user_metrics.avg_session_duration_seconds)}
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Content Metrics Section */}
      <SectionHeader 
        icon={<PlaySquareOutlined />} 
        title="Content Performance"
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card className="content-stat-card">
            <div className="content-stat-icon movie">
              <VideoCameraOutlined />
            </div>
            <Statistic 
              title="Movie Views" 
              value={contentMetrics.content_type_distribution?.[0]?.value || 0}
              className="content-statistic"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="content-stat-card">
            <div className="content-stat-icon tv">
              <PlaySquareOutlined />
            </div>
            <Statistic 
              title="TV Show Views" 
              value={contentMetrics.content_type_distribution?.[1]?.value || 0}
              className="content-statistic"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="content-stat-card">
            <div className="content-stat-icon completion">
              <CheckCircleOutlined />
            </div>
            <Statistic 
              title="Completion Rate" 
              value={contentMetrics.completion_metrics?.completion_rate || 0}
              suffix="%"
              className="content-statistic"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="content-stat-card">
            <div className="content-stat-icon total">
              <TrophyOutlined />
            </div>
            <Statistic 
              title="Total Content Views" 
              value={totalViews}
              className="content-statistic"
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title="Most Watched Movies">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={contentMetrics.most_watched?.movies || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" tick={{ fill: '#999', fontSize: 11 }} />
                <YAxis 
                  dataKey="title" 
                  type="category" 
                  width={120} 
                  tick={{ fill: '#999', fontSize: 11 }}
                  tickFormatter={(value) => value?.length > 15 ? `${value.substring(0, 15)}...` : value}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="views" name="Views" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="Most Watched TV Shows">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={contentMetrics.most_watched?.shows || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis type="number" tick={{ fill: '#999', fontSize: 11 }} />
                <YAxis 
                  dataKey="title" 
                  type="category" 
                  width={120} 
                  tick={{ fill: '#999', fontSize: 11 }}
                  tickFormatter={(value) => value?.length > 15 ? `${value.substring(0, 15)}...` : value}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="views" name="Views" fill={COLORS.success} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <ChartCard title="Genre Popularity">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={genreChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#666' }}
                >
                  {genreChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS.chart[index % COLORS.chart.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title="Daily Viewing Trends">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={contentMetrics.daily_viewing_trends || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" tick={{ fill: '#999', fontSize: 12 }} />
                <YAxis tick={{ fill: '#999', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="views" 
                  name="Views"
                  stroke={COLORS.info} 
                  strokeWidth={2}
                  dot={{ fill: COLORS.info, strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
      </Row>

      {/* Request Throughput Section */}
      <SectionHeader 
        icon={<ApiOutlined />} 
        title="API Performance"
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <ChartCard title="Request Throughput">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={requestChartData}>
                <defs>
                  <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS.info} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={COLORS.info} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="time" tick={{ fill: '#999', fontSize: 11 }} />
                <YAxis tick={{ fill: '#999', fontSize: 12 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="requests" 
                  name="Requests"
                  stroke={COLORS.info}
                  strokeWidth={2}
                  fill="url(#colorRequests)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="latency-card">
            <Title level={5} className="latency-title">Response Latency</Title>
            <div className="latency-item">
              <div className="latency-label">P50</div>
              <Progress 
                percent={Math.min((dashboardData.performance.p50_latency_ms / 1000) * 100, 100)} 
                strokeColor={COLORS.success}
                showInfo={false}
              />
              <div className="latency-value">{dashboardData.performance.p50_latency_ms}ms</div>
            </div>
            <div className="latency-item">
              <div className="latency-label">P90</div>
              <Progress 
                percent={Math.min((dashboardData.performance.p90_latency_ms / 1000) * 100, 100)} 
                strokeColor={COLORS.warning}
                showInfo={false}
              />
              <div className="latency-value">{dashboardData.performance.p90_latency_ms}ms</div>
            </div>
            <div className="latency-item">
              <div className="latency-label">P99</div>
              <Progress 
                percent={Math.min((dashboardData.performance.p99_latency_ms / 1000) * 100, 100)} 
                strokeColor={COLORS.error}
                showInfo={false}
              />
              <div className="latency-value">{dashboardData.performance.p99_latency_ms}ms</div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* System Health Section */}
      <SectionHeader 
        icon={<CloudServerOutlined />} 
        title="System Health"
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card className="health-card">
            <div className="health-icon cpu">
              <ThunderboltOutlined />
            </div>
            <div className="health-info">
              <Text className="health-label">CPU Usage</Text>
              <Progress 
                type="dashboard" 
                percent={dashboardData.system_health.cpu_percent}
                strokeColor={getHealthColor(dashboardData.system_health.cpu_percent) === 'error' ? COLORS.error : 
                            getHealthColor(dashboardData.system_health.cpu_percent) === 'warning' ? COLORS.warning : COLORS.success}
                size={100}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="health-card">
            <div className="health-icon memory">
              <DatabaseOutlined />
            </div>
            <div className="health-info">
              <Text className="health-label">Memory Usage</Text>
              <Progress 
                type="dashboard" 
                percent={dashboardData.system_health.memory_percent}
                strokeColor={getHealthColor(dashboardData.system_health.memory_percent) === 'error' ? COLORS.error : 
                            getHealthColor(dashboardData.system_health.memory_percent) === 'warning' ? COLORS.warning : COLORS.success}
                size={100}
              />
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="health-card">
            <div className="health-icon disk">
              <HddOutlined />
            </div>
            <div className="health-info">
              <Text className="health-label">Disk Usage</Text>
              <Progress 
                type="dashboard" 
                percent={dashboardData.system_health.disk_usage_percent}
                strokeColor={getHealthColor(dashboardData.system_health.disk_usage_percent) === 'error' ? COLORS.error : 
                            getHealthColor(dashboardData.system_health.disk_usage_percent) === 'warning' ? COLORS.warning : COLORS.success}
                size={100}
              />
            </div>
          </Card>
        </Col>
      </Row>

      {/* Cache Statistics Section */}
      {cacheStats && (
        <>
          <SectionHeader 
            icon={<ThunderboltOutlined />} 
            title="Cache Statistics"
            action={
              adminRole === 'superadmin' && (
                <Button 
                  danger
                  icon={<SyncOutlined spin={cacheLoading} />}
                  onClick={handleClearCache}
                  loading={cacheLoading}
                >
                  Clear All Caches
                </Button>
              )
            }
          />
          
          <Row gutter={[16, 16]}>
            {Object.entries(cacheStats).map(([key, cache]) => {
              const hitRate = parseFloat(cache.hit_rate);
              return (
                <Col xs={24} sm={12} lg={6} key={key}>
                  <Card className="cache-stat-card">
                    <div className="cache-header">
                      <Text className="cache-name">{cache.name}</Text>
                      <Tag color={hitRate >= 90 ? 'green' : hitRate >= 70 ? 'blue' : hitRate >= 50 ? 'orange' : 'red'}>
                        {cache.hit_rate}
                      </Tag>
                    </div>
                    <Progress 
                      percent={(cache.size / cache.max_size) * 100} 
                      strokeColor={COLORS.info}
                      showInfo={false}
                      size="small"
                    />
                    <div className="cache-stats">
                      <span>Size: {cache.size}/{cache.max_size}</span>
                      <span>TTL: {cache.ttl_seconds}s</span>
                    </div>
                    <div className="cache-hits">
                      <span className="hits">Hits: {cache.hits}</span>
                      <span className="misses">Misses: {cache.misses}</span>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </>
      )}

      {/* Data Integrity Section */}
      <SectionHeader 
        icon={<WarningOutlined />} 
        title="Data Integrity"
      />
      
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card className="integrity-overview-card">
            <div className="integrity-status">
              {getHealthStatus(dataIntegrity.health_status).icon}
              <div className="status-info">
                <Text className="status-label">Health Status</Text>
                <Tag color={getHealthStatus(dataIntegrity.health_status).color}>
                  {dataIntegrity.health_status?.toUpperCase()}
                </Tag>
              </div>
            </div>
            <div className="integrity-stats">
              <div className="integrity-stat">
                <span className="stat-label">Total Items</span>
                <span className="stat-value">{dataIntegrity.total_items?.toLocaleString()}</span>
              </div>
              <div className="integrity-stat">
                <span className="stat-label">Contaminated</span>
                <span className="stat-value error">{dataIntegrity.total_contaminated?.toLocaleString()}</span>
              </div>
              <div className="integrity-stat">
                <span className="stat-label">Rate</span>
                <span className="stat-value">{dataIntegrity.contamination_percentage?.toFixed(2)}%</span>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card className="integrity-sources-card">
            <Title level={5}>Data Sources Breakdown</Title>
            <Row gutter={[12, 12]}>
              {Object.entries(dataIntegrity.data_sources || {}).map(([source, data]) => (
                <Col xs={12} sm={8} md={6} key={source}>
                  <div className="source-item">
                    <Text className="source-name">{source.replace(/_/g, ' ')}</Text>
                    <div className="source-stats">
                      <span className={data.contaminated > 0 ? 'error' : 'success'}>
                        {data.contaminated}/{data.total}
                      </span>
                      <span className="source-percent">
                        {data.total > 0 ? ((data.contaminated / data.total) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      {/* Export Modal */}
      <Modal
        title="Export Analytics Data"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={null}
        className="export-modal"
        centered
      >
        <div className="export-options">
          <Text className="export-description">
            Choose your preferred export format. The report will include data from the selected time range ({timeRange} day{timeRange > 1 ? 's' : ''}).
          </Text>
          <div className="export-buttons">
            <Button 
              size="large"
              icon={<FileTextOutlined />} 
              onClick={exportToCSV}
              loading={exportLoading}
              className="export-btn csv"
            >
              Export as CSV
            </Button>
            <Button 
              size="large"
              icon={<DownloadOutlined />} 
              onClick={exportToJSON}
              loading={exportLoading}
              className="export-btn json"
            >
              Export as JSON
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AnalyticsDashboard;