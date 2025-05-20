import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Space, notification, Card } from 'antd';
import { ReloadOutlined, UserOutlined, GlobalOutlined } from '@ant-design/icons';
import { API_URL } from '../../../../config';
import moment from 'moment';

const ActiveSessions = () => {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const token = localStorage.getItem('admin_token');
  
  useEffect(() => {
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchActiveSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/analytics/sessions/active?minutes=15`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      } else {
        notification.error({
          message: 'Error',
          description: 'Failed to fetch active sessions'
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
  
  const columns = [
    {
      title: 'User',
      dataIndex: 'user_id',
      key: 'user_id',
      render: (userId) => (
        userId ? <Tag color="blue"><UserOutlined /> User #{userId}</Tag> : <Tag color="gray">Anonymous</Tag>
      )
    },
    {
      title: 'Session ID',
      dataIndex: 'session_id',
      key: 'session_id',
      ellipsis: true,
    },
    {
      title: 'IP Address',
      dataIndex: 'ip_address',
      key: 'ip_address',
      render: (ip) => (
        <span><GlobalOutlined /> {ip}</span>
      )
    },
    {
      title: 'Started',
      dataIndex: 'started_at',
      key: 'started_at',
      render: (timestamp) => moment(timestamp).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => new Date(a.started_at) - new Date(b.started_at)
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_active_at',
      key: 'last_active_at',
      render: (timestamp) => {
        const time = moment(timestamp);
        return (
          <span>
            {time.format('YYYY-MM-DD HH:mm:ss')}
            {' '}
            <Tag color="green">{time.fromNow()}</Tag>
          </span>
        );
      },
      sorter: (a, b) => new Date(a.last_active_at) - new Date(b.last_active_at),
      defaultSortOrder: 'descend'
    },
    {
      title: 'Duration',
      key: 'duration',
      render: (text, record) => {
        const start = moment(record.started_at);
        const end = moment(record.last_active_at);
        const duration = moment.duration(end.diff(start));
        return (
          <span>
            {Math.floor(duration.asHours())}h {duration.minutes()}m {duration.seconds()}s
          </span>
        );
      }
    },
    {
      title: 'User Agent',
      dataIndex: 'user_agent',
      key: 'user_agent',
      ellipsis: true,
    }
  ];
  
  return (
    <div className="active-sessions">
      <Card 
        title="Active User Sessions (Last 15 Minutes)"
        extra={
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={fetchActiveSessions}
            loading={loading}
          >
            Refresh
          </Button>
        }
      >
        <Table 
          columns={columns} 
          dataSource={sessions} 
          rowKey="session_id" 
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default ActiveSessions;