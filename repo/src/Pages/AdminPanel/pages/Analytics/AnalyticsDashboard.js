import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Spin, Table, Tabs, notification } from 'antd';
import { 
  UserOutlined, ClockCircleOutlined, ApiOutlined, 
  LineChartOutlined, WarningOutlined, DashboardOutlined 
} from '@ant-design/icons';
import { API_URL } from '../../../../config';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const { TabPane } = Tabs;

const AnalyticsDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState(null);
  const [timeRange, setTimeRange] = useState(1); // days
  const token = localStorage.getItem('admin_token');
  
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 60000); // Refresh every minute
    
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
  
  if (loading || !dashboardData) {
    return (
      <div style={{ textAlign: 'center', padding: '100px' }}>
        <Spin size="large" />
        <p>Loading analytics data...</p>
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
  
  return (
    <div className="analytics-dashboard">
      <h1>Analytics Dashboard</h1>
      
      <Tabs defaultActiveKey="1" onChange={handleTimeRangeChange}>
        <TabPane tab="Last 24 Hours" key="1"></TabPane>
        <TabPane tab="Last 7 Days" key="7"></TabPane>
        <TabPane tab="Last 30 Days" key="30"></TabPane>
      </Tabs>
      
      {/* User Metrics Section */}
      <h2><UserOutlined /> User Metrics</h2>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Active Users" 
              value={dashboardData.user_metrics.daily_active_users.reduce((sum, day) => sum + day.count, 0)} 
              prefix={<UserOutlined />} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Total Sessions" 
              value={dashboardData.user_metrics.total_sessions} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="New Users" 
              value={dashboardData.user_metrics.new_users} 
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic 
              title="Avg. Session Duration" 
              value={`${Math.floor(dashboardData.user_metrics.avg_session_duration_seconds / 60)}m ${Math.floor(dashboardData.user_metrics.avg_session_duration_seconds % 60)}s`} 
              prefix={<ClockCircleOutlined />} 
            />
          </Card>
        </Col>
      </Row>
      
      <Card title="Daily Active Users" style={{ marginTop: 16 }}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={formatUserMetricsForChart()}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="users" stroke="#8884d8" activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      
      {/* Request Throughput Section */}
      <h2 style={{ marginTop: 32 }}><ApiOutlined /> Request Throughput</h2>
      <Row gutter={16}>
        <Col span={12}>
          <Card title="Requests Over Time">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={formatRequestsForChart()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="requests" stroke="#82ca9d" />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Top Endpoints">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={formatTopEndpointsForChart()}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="endpoint" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>
      
      {/* Performance Section */}
      <h2 style={{ marginTop: 32 }}><LineChartOutlined /> Performance</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic 
              title="P50 Latency" 
              value={dashboardData.performance.p50_latency_ms} 
              suffix="ms" 
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="P90 Latency" 
              value={dashboardData.performance.p90_latency_ms} 
              suffix="ms" 
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="P99 Latency" 
              value={dashboardData.performance.p99_latency_ms} 
              suffix="ms" 
            />
          </Card>
        </Col>
      </Row>
      
      {/* System Health Section */}
      <h2 style={{ marginTop: 32 }}><DashboardOutlined /> System Health</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic 
              title="CPU Usage" 
              value={dashboardData.system_health.cpu_percent} 
              suffix="%" 
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Memory Usage" 
              value={dashboardData.system_health.memory_percent} 
              suffix="%" 
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Disk Usage" 
              value={dashboardData.system_health.disk_usage_percent} 
              suffix="%" 
            />
          </Card>
        </Col>
      </Row>
      
      {/* Real-Time Section */}
      <h2 style={{ marginTop: 32 }}><WarningOutlined /> Real-Time</h2>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Active Sessions" 
              value={dashboardData.real_time.active_sessions} 
              prefix={<UserOutlined />} 
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AnalyticsDashboard;