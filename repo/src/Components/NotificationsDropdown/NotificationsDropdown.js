import React, { useState, useEffect } from 'react';
import { CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import { Badge, Button, List, Popover, Empty } from 'antd';
import { API_URL } from '../../config';
import './NotificationsDropdown.css';
import { useNavigate } from 'react-router-dom';
import { FaBell } from 'react-icons/fa6';

const NotificationsDropdown = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      fetchUnreadCount();
      const interval = setInterval(fetchUnreadCount, 60000); // Check every minute
      
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchUnreadCount = async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/unread/count`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setUnreadCount(data.unread_count);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const fetchNotifications = async () => {
    if (loading) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/notifications`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = async (notification) => {
    // Mark as read if unread
    if (!notification.is_read) {
      try {
        await fetch(`${API_URL}/api/notifications/${notification.id}/read`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // Update the notification locally
        setNotifications(prevNotifications => 
          prevNotifications.map(n => 
            n.id === notification.id ? { ...n, is_read: true } : n
          )
        );
        
        fetchUnreadCount();
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    
    // Navigate to link if provided
    if (notification.link) {
      setOpen(false);
      navigate(notification.link);
    }
  };

  const markAllAsRead = async () => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setNotifications(prevNotifications => 
          prevNotifications.map(n => ({ ...n, is_read: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    
    if (diffMinutes < 5) {
      return 'Just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    } else if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const getNotificationTypeIcon = (type) => {
    switch(type) {
      case 'account': return '👤';
      case 'system': return '⚙️';
      case 'content': return '📺';
      case 'prompt': return '💬';
      case 'warning': return '⚠️';
      default: return '🔔';
    }
  };

  const handleOpenChange = (newOpen) => {
    setOpen(newOpen);
    if (newOpen) {
      // Refresh data when popover opens
      fetchUnreadCount();
      fetchNotifications();
    }
  };

  const content = (
    <div className="notifications-content">
      <div className="notifications-header">
        <h3>Notifications</h3>
        {unreadCount > 0 && (
          <Button type="link" onClick={markAllAsRead} className="mark-all-read-btn">
            <CheckOutlined /> Mark all as read
          </Button>
        )}
      </div>
      
      {loading ? (
        <div className="notifications-loading">
          <LoadingOutlined spin style={{ fontSize: 24 }} />
          <span>Loading notifications...</span>
        </div>
      ) : (
        <div className="notifications-list-container">
          {notifications && notifications.length > 0 ? (
            <List
              className="notifications-list"
              dataSource={notifications}
              renderItem={item => (
                <List.Item 
                  className={`notification-item ${!item.is_read ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(item)}
                >
                  <div className="notification-icon">
                    {getNotificationTypeIcon(item.type)}
                  </div>
                  <div className="notification-content">
                    <div className="notification-title">{item.title}</div>
                    <div className="notification-message">{item.message}</div>
                  </div>
                  <div className="notification-time">{formatDate(item.created_at)}</div>
                </List.Item>
              )}
            />
          ) : (
            <Empty 
              image={Empty.PRESENTED_IMAGE_SIMPLE} 
              description="No notifications yet" 
              className="empty-notifications"
            />
          )}
        </div>
      )}
    </div>
  );

  return (
    <Popover 
      content={content} 
      trigger="hover" // Changed from "click" to "hover"
      placement="bottomRight"
      overlayClassName="notifications-popover"
      open={open}
      arrow={true}
      onOpenChange={handleOpenChange}
    //   mouseEnterDelay={0}
    //   mouseLeaveDelay={0}
    >
      <div className="notification-trigger">
        <Badge count={unreadCount} overflowCount={99}>
            <FaBell 
                style={{
                fontSize: 25, 
                cursor: 'pointer', 
                fontWeight: 100, 
                color: '#fff',
                paddingRight: '5px', 
                display: 'flex', 
                alignItems: 'center',
                marginTop: '8px'
                }}
            />
        </Badge>
      </div>
    </Popover>
  );
};

export default NotificationsDropdown;