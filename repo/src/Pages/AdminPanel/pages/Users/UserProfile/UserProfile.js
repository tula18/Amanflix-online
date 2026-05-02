import React, { useEffect, useState, useCallback } from "react";
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate, useParams } from "react-router";
import { API_URL } from "../../../../../config";
import {
    Button, FloatButton, Tooltip, Row, Col, Card, Spin, Empty,
    Segmented, Table, Progress, Tag, Collapse
} from 'antd';
import {
    ArrowLeftOutlined, EyeOutlined, ClockCircleOutlined, CheckCircleOutlined,
    DesktopOutlined, PlaySquareOutlined, UploadOutlined, BugOutlined,
    FireOutlined, StarOutlined, BarChartOutlined, ThunderboltOutlined,
    TrophyOutlined, LineChartOutlined, TeamOutlined
} from "@ant-design/icons";
import PasswordFormGroup from "../../../Components/FormGroup/PasswordFormGroup";
import {
    PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend,
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import './UserAnalytics.css';


const DeleteAccount = ({onClose, user}) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    let has_id = true

    const toggle = () => {
        onClose();
    };
    if (typeof user === 'object' && user !== null) {
        if (!user.hasOwnProperty('id')) {
            has_id = false
        }
    } else {
        has_id = false
    }

    if (!has_id) {
        return (
            <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Delete Account</h4>
                <p>User ID not valid.</p>
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
        )
    }

    const handleDeleteAccount = () => {
        setLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('user_id', user.id);
        formData.append('password', password);
        fetch(`${API_URL}/api/admin/user/delete`, {
            method: 'DELETE',
            headers: {
                // 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
            },
            body: formData
        }).then((res) => {
            res.json().then((json) => {
              console.log(json);
              if (res.status === 200) {
                setMessage(json.message);
                onClose()
                window.history.back();
              } else {
                setMessage(json.message);
                setLoading(false);
              }
            }).catch(err => {
              console.log(String(err));
              setMessage(String(err));
              setLoading(false);
            })
          })
        // .catch(error => {
        //     console.error("Error updating profile:", error);
        //     setMessage('Error updating profile. Please try again later.');
        // });
        setLoading(false);

    };

    const handleToggle = () => {
        setPassword('');
        toggle();
    };

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Delete {user.username} Account</h4>
                <p>Are you sure you want to delete your account? This action is irreversible.</p>
                <div className="form-group">
                    <input 
                        type={passwordVisible ? 'text' : 'password'}
                        id="password"
                        placeholder="Please Enter your admin's Password"
                        onChange={(e) => setPassword(e.target.value)}
                    />
                    <span className="profile_eye-icon-wrapper">
                        {passwordVisible ? <FaEyeSlash className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} /> : <FaEye className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} />}
                    </span>
                </div>
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={handleToggle}>
                        Cancel
                    </button>
                    <button type="button" className="profile_delete_btn" onClick={handleDeleteAccount}>
                        {loading ? "Deleting..." : "Delete Account"}
                    </button>
                </div>
                <div className="profile-message">
                    {message}
                </div>
            </div>
        </div>
    )
}

const CHART_COLORS = ['#e50914', '#ff6b6b', '#ffa940', '#52c41a', '#1890ff', '#722ed1', '#eb2f96', '#13c2c2'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const UserProfile = () => {
    const token = localStorage.getItem('admin_token')
    const [user, setUser] = useState({});
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newPasswordVisible, setNewPasswordVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [saveLoading, setSaveLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [analytics, setAnalytics] = useState(null);
    const [analyticsLoading, setAnalyticsLoading] = useState(true);
    const [analyticsTimeRange, setAnalyticsTimeRange] = useState('30');
    const { user_id } = useParams();

    useEffect(() => {
        if (token) {
            const formdata = new FormData();
            formdata.append('user_id', user_id)
            const customHeaders = {
                Authorization: `Bearer ${token}`,
            };
            fetch(`${API_URL}/api/admin/user`, {
                method: 'POST',
                headers: customHeaders,
                body: formdata,
            }).then(res => {
                res.json().then(json => {
                console.log(json);
                if (res.status === 200) {
                    setUser(json);
                    setUsername(json.username)
                    setEmail(json.email)
                }
            })
          })
        }
        
      }, [setUser, token, user_id])

    const handleUpdate = () => {
        setSaveLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('user_id', user_id)
        formData.append('username', username);
        formData.append('email', email);

        if (newPassword) {
            formData.append('newPassword', newPassword)
        }

        fetch(`${API_URL}/api/admin/user/update`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            setUsername(data.username || user.username);
            setEmail(data.email || user.email);
            setMessage(data.message);
            setNewPassword('');
        })
        .catch(error => {
            console.error("Error updating profile:", error);
            setMessage('Error updating profile. Please try again later.');
        });
        setSaveLoading(false);
    }

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showModal && event.target.classList.contains('modal')) {
                handleModalClose();
            }
        };
  
        document.addEventListener('mousedown', handleClickOutside);
  
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
      }, [showModal]);

      useEffect(() => {
        const handleEscapeKey = (event) => {
          if (showModal && event.key === 'Escape') {
            handleModalClose();
          }
        };
      
        document.addEventListener('keydown', handleEscapeKey);
      
        return () => {
          document.removeEventListener('keydown', handleEscapeKey);
        };
      }, [showModal]);

    const fetchAnalytics = useCallback(async () => {
        if (!token) return;
        setAnalyticsLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/analytics/users/${user_id}?days=${analyticsTimeRange}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setAnalytics(await res.json());
            }
        } catch (e) {
            console.error('Error fetching user analytics:', e);
        } finally {
            setAnalyticsLoading(false);
        }
    }, [token, user_id, analyticsTimeRange]);

    useEffect(() => { fetchAnalytics(); }, [fetchAnalytics]);

    const formatDuration = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const handleModalOpen = (e) => {
        e.stopPropagation();
        setShowModal(true)
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    }

    const handleModalClose = (deleted) => {
        console.log(deleted);
        setShowModal(false);
        if (deleted === true) {
            window.history.back();
        }
    };

    function formatDateTime(dateTime) {
        const date = new Date(dateTime);
    
    const dayOfWeek = date.toLocaleString('en-US', { weekday: 'long' });
    const monthName = date.toLocaleString('en-US', { month: 'long' });
    const day = date.getDate();
    
    return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()}`;
    }

    return (
        <div className="ProfilePage" style={{ flexDirection: 'column', height: 'auto', minHeight: '100vh', justifyContent: 'flex-start', alignItems: 'center' }}>
            <div style={{position:""}}>
                <Tooltip title="Go Back">
                    <FloatButton
                        style={{
                            position: 'fixed',
                            top: 20,
                            left: 300,
                        }}
                        icon={<ArrowLeftOutlined/>}
                        shape="circle"
                        size="large"
                        onClick={() => window.history.back()}
                    >
                        <Button type="primary" icon="left" />
                    </FloatButton>
                </Tooltip>
            </div>
            <div className="profile__form__wrapper sidebar_profile__form__wrapper">
                <h2>Manage {user.username}'s' Account</h2>
                <div className="divider"/>
                <div className="profile__form">
                    <div className="form_content">
                        <div className="first-sec">
                            <img alt="Profile Avatar" loading={'lazy'} draggable="false" className='profile-image-big' src={`${API_URL}/cdn/images/profile.png`} />
                            <div className="first-sec__inputs sidebar_first-sec__inputs">
                                <div className="form-group sidebar_form-group">
                                    <label htmlFor="username">Username</label>
                                    <input 
                                        type={"text"}
                                        id="username"
                                        name="username"
                                        placeholder="Username"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                    />
                                </div>
                                <div className="form-group sidebar_form-group">
                                    <label htmlFor="email">Email</label>
                                    <input 
                                        type={"email"}
                                        id="email"
                                        placeholder='Email'
                                        name="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div  className="password-sec">
                            <div className="password-sec_inputs sidebar_password-sec_inputs">
                                <div className="divider"/>
                                <h2>Change Password</h2>
                                <PasswordFormGroup label={'New Password'} name="newpassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{width: 'auto'}} required />
                            </div>
                        </div>
                        <div  className="password-sec">
                            <div className="password-sec_inputs sidebar_password-sec_inputs">
                                <div className="divider"/>
                                <h2>Info</h2>
                                <div className="form-group sidebar_form-group">
                                    <label htmlFor="created">Created at</label>
                                    <input 
                                        type={"text"}
                                        id="created"
                                        name="created"
                                        placeholder="created"
                                        value={formatDateTime(user.created_at)}
                                        disabled
                                    />
                                </div>
                                <div className="form-group sidebar_form-group">
                                    <label htmlFor="updated">Updated at</label>
                                    <input 
                                        type={"text"}
                                        id="updated"
                                        name="updated"
                                        placeholder="updated"
                                        value={formatDateTime(user.updated_at)}
                                        disabled
                                    />
                                </div>
                                
                            </div>
                        </div>
                    </div>
                    <div>
                        <div className="divider"/>
                        <div className="profile-form_buttons">
                            <button className="profile_save_btn" onClick={handleUpdate} disabled={saveLoading}>{saveLoading ? 'Saving' : "Save"}</button>
                            <button className="profile_delete_btn" onClick={handleModalOpen} >Delete Account</button>
                        </div>
                    </div>
                </div>
                <div className="profile-message">
                    {message}
                </div>
            </div>
            {showModal && (
                <DeleteAccount
                onClose={() => handleModalClose(setShowModal)}
                user={user}
                />
            )}

            {/* ── Analytics Section ───────────────────────────────────── */}
            <div className="ua-page">

                {/* Header */}
                <div className="ua-header">
                    <h2 className="ua-title"><BarChartOutlined /> Analytics</h2>
                    <Segmented
                        className="ua-segmented"
                        options={[
                            { label: 'All Time', value: '0' },
                            { label: '30 Days',  value: '30' },
                            { label: '7 Days',   value: '7' },
                        ]}
                        value={analyticsTimeRange}
                        onChange={setAnalyticsTimeRange}
                    />
                </div>

                {analyticsLoading ? (
                    <div style={{display:'flex', justifyContent:'center', padding:'48px 0'}}>
                        <Spin size="large" />
                    </div>
                ) : !analytics ? (
                    <Empty description="Failed to load analytics" style={{padding:'40px 0'}} />
                ) : (
                    <>
                        {/* ── Viewing Activity ── */}
                        <div className="ua-sub-label"><EyeOutlined /> Viewing Activity</div>
                        <Row gutter={[14, 14]}>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon"><EyeOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Items Watched</span>
                                            <div className="ua-stat-value">{analytics.watch_stats.total_items_watched}</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon blue"><ClockCircleOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Total Watch Time</span>
                                            <div className="ua-stat-value">{formatDuration(analytics.watch_stats.total_watch_time_seconds)}</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon green"><CheckCircleOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Completion Rate</span>
                                            <div className="ua-stat-value green">{analytics.watch_stats.completion_rate}%</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        </Row>

                        {/* ── Session Activity ── */}
                        <div className="ua-sub-label"><DesktopOutlined /> Session Activity</div>
                        <Row gutter={[14, 14]}>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon purple"><DesktopOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Total Sessions</span>
                                            <div className="ua-stat-value">{analytics.session_stats.total_sessions}</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon blue"><ClockCircleOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Avg Session</span>
                                            <div className="ua-stat-value">{formatDuration(analytics.session_stats.avg_session_duration_seconds)}</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon orange"><ClockCircleOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Last Seen</span>
                                            <div className="ua-stat-value" style={{fontSize:14}}>
                                                {analytics.session_stats.last_seen
                                                    ? new Date(analytics.session_stats.last_seen).toLocaleDateString()
                                                    : 'Never'}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        </Row>

                        {/* ── Behavior Insights ── */}
                        <div className="ua-sub-label"><FireOutlined /> Behavior Insights</div>
                        <Row gutter={[14, 14]}>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon"><FireOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Binge Days</span>
                                            <div className={`ua-stat-value${analytics.binge_score > 0 ? ' red' : ''}`}>{analytics.binge_score}</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon orange"><PlaySquareOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Rewatch Rate ~</span>
                                            <div className="ua-stat-value">{analytics.rewatch_rate}%</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={12} sm={8}>
                                <Card className="ua-stat-card">
                                    <div className="ua-stat-inner">
                                        <div className="ua-stat-icon"><StarOutlined /></div>
                                        <div className="ua-stat-info">
                                            <span className="ua-stat-label">Diversity Score</span>
                                            <div className="ua-stat-value">{analytics.diversity_score}%</div>
                                        </div>
                                    </div>
                                    <Progress
                                        percent={analytics.diversity_score}
                                        strokeColor="#e50914"
                                        showInfo={false}
                                        size="small"
                                        style={{marginTop: 8}}
                                        trailColor="rgba(255,255,255,0.08)"
                                    />
                                </Card>
                            </Col>
                        </Row>

                        {/* ── Genre & Content ── */}
                        <div className="ua-sub-label"><PlaySquareOutlined /> Genre &amp; Content</div>
                        <Row gutter={[14, 14]}>
                            <Col xs={24} md={12}>
                                <Card className="ua-chart-card" title="Favorite Genres">
                                    {analytics.favorite_genres.length === 0 ? (
                                        <Empty description="No watch data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    ) : (
                                        <ResponsiveContainer width="100%" height={240}>
                                            <PieChart>
                                                <Pie
                                                    data={analytics.favorite_genres.map(g => ({ name: g.genre, value: g.count }))}
                                                    dataKey="value" nameKey="name"
                                                    cx="50%" cy="45%" outerRadius={75}
                                                >
                                                    {analytics.favorite_genres.map((_, i) => (
                                                        <Cell key={i} fill={['#e50914','#ff6b6b','#ffa940','#52c41a','#1890ff','#722ed1','#eb2f96','#13c2c2'][i % 8]} />
                                                    ))}
                                                </Pie>
                                                <Legend wrapperStyle={{color:'#999', fontSize:12}} />
                                                <RechartsTooltip contentStyle={{background:'#1f2a40', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    )}
                                </Card>
                            </Col>
                            <Col xs={24} md={12}>
                                <Card className="ua-chart-card" title="Avg Drop-off Point">
                                    {Object.keys(analytics.drop_off_points).length === 0 ? (
                                        <Empty description="No incomplete content" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    ) : (
                                        <ResponsiveContainer width="100%" height={240}>
                                            <BarChart
                                                data={Object.entries(analytics.drop_off_points).map(([type, pct]) => ({
                                                    name: type === 'movie' ? 'Movies' : 'TV Shows',
                                                    avgProgress: pct
                                                }))}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                                                <XAxis dataKey="name" tick={{ fill: '#999', fontSize: 12 }} />
                                                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fill: '#999', fontSize: 12 }} />
                                                <RechartsTooltip
                                                    formatter={v => [`${v}%`, 'Avg Progress']}
                                                    contentStyle={{background:'#1f2a40', border:'1px solid rgba(255,255,255,0.1)', color:'#fff'}}
                                                />
                                                <Bar dataKey="avgProgress" fill="#e50914" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    )}
                                </Card>
                            </Col>
                        </Row>

                        {/* ── Viewing Schedule ── */}
                        <div className="ua-sub-label"><ClockCircleOutlined /> Viewing Schedule</div>
                        <Card className="ua-chart-card" title="When Does This User Watch?">
                            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:12}}>
                                <span style={{fontSize:12, color:'#8c8c8c'}}>
                                    Rows = days of the week &nbsp;·&nbsp; Columns = hour of the day (0–23) &nbsp;·&nbsp; Darker red = more views
                                </span>
                                <div style={{display:'flex', alignItems:'center', gap:4, fontSize:11, color:'#8c8c8c'}}>
                                    <span>Less</span>
                                    {[0.08, 0.25, 0.45, 0.65, 0.85].map((a, i) => (
                                        <div key={i} style={{width:13, height:13, borderRadius:2, background:`rgba(229,9,20,${a})`}} />
                                    ))}
                                    <span>More</span>
                                </div>
                            </div>
                            {analytics.viewing_heatmap.length === 0 ? (
                                <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            ) : (() => {
                                const maxCount = Math.max(...analytics.viewing_heatmap.map(r => r.count), 1);
                                const heatMap = {};
                                analytics.viewing_heatmap.forEach(r => { heatMap[`${r.day}-${r.hour}`] = r.count; });
                                return (
                                    <div className="ua-heatmap-wrap">
                                        <table className="ua-heatmap-table">
                                            <thead>
                                                <tr>
                                                    <th className="row-label">Day</th>
                                                    {Array.from({ length: 24 }, (_, h) => (
                                                        <th key={h}>{h % 6 === 0 ? h : ''}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {DAY_LABELS.map((day, d) => (
                                                    <tr key={d}>
                                                        <td className="row-label">{day}</td>
                                                        {Array.from({ length: 24 }, (_, h) => {
                                                            const cnt = heatMap[`${d}-${h}`] || 0;
                                                            const alpha = cnt > 0 ? 0.12 + (cnt / maxCount) * 0.88 : 0;
                                                            return (
                                                                <td key={h} title={cnt > 0 ? `${cnt} views` : undefined}>
                                                                    <div
                                                                        className="ua-heatmap-cell"
                                                                        style={{ background: `rgba(229,9,20,${alpha})` }}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                );
                            })()}
                        </Card>

                        {/* ── Top Content ── */}
                        <div className="ua-sub-label"><TrophyOutlined /> Top Content</div>
                        <Card className="ua-chart-card">
                            {analytics.most_watched.length === 0 ? (
                                <Empty description="No watch history" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            ) : (
                                <Table
                                    className="ua-table"
                                    size="small"
                                    pagination={false}
                                    dataSource={analytics.most_watched.map((r, i) => ({ ...r, key: i }))}
                                    columns={[
                                        { title: '#', render: (_, __, i) => i + 1, width: 36 },
                                        { title: 'Title', dataIndex: 'title' },
                                        {
                                            title: 'Type', dataIndex: 'type', width: 76,
                                            render: t => <Tag color={t === 'movie' ? 'geekblue' : 'green'} style={{margin:0}}>{t}</Tag>
                                        },
                                        { title: 'Views', dataIndex: 'view_count', width: 70 },
                                    ]}
                                />
                            )}
                        </Card>

                        {/* ── Engagement ── */}
                        <div className="ua-sub-label"><UploadOutlined /> Engagement</div>
                        <Row gutter={[14, 14]}>
                            <Col xs={24} md={12}>
                                <Card
                                    className="ua-chart-card"
                                    title={<><UploadOutlined style={{marginRight:6, color:'#faad14'}}/>Upload Requests</>}
                                    extra={<Tag color="default">{analytics.upload_requests.total}</Tag>}
                                >
                                    {analytics.upload_requests.total === 0 ? (
                                        <Empty description="No requests" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                    ) : (
                                        <Collapse
                                            className="ua-collapse"
                                            ghost
                                            items={[{
                                                key: '1',
                                                label: `View ${analytics.upload_requests.items.length} request(s)`,
                                                children: (
                                                    <Table
                                                        className="ua-table"
                                                        size="small"
                                                        pagination={{ pageSize: 5, size: 'small' }}
                                                        dataSource={analytics.upload_requests.items.map((r, i) => ({ ...r, key: i }))}
                                                        columns={[
                                                            {
                                                                title: 'Type', dataIndex: 'content_type', width: 70,
                                                                render: t => <Tag color={t === 'movie' ? 'geekblue' : 'green'} style={{margin:0}}>{t}</Tag>
                                                            },
                                                            { title: 'ID', dataIndex: 'content_id', width: 60 },
                                                            {
                                                                title: 'Requested', dataIndex: 'added_at',
                                                                render: d => d ? new Date(d).toLocaleDateString() : '—'
                                                            },
                                                        ]}
                                                    />
                                                )
                                            }]}
                                        />
                                    )}
                                </Card>
                            </Col>
                            <Col xs={24} md={12}>
                                <Card
                                    className="ua-chart-card"
                                    title={<><BugOutlined style={{marginRight:6, color:'#ff4d4f'}}/>Bug Reports</>}
                                >
                                    <div className="ua-bug-row">
                                        <div className="ua-bug-item">
                                            <div className="ua-bug-num">{analytics.bug_reports.total}</div>
                                            <div className="ua-bug-label">Total</div>
                                        </div>
                                        <div className="ua-bug-item">
                                            <div className="ua-bug-num" style={{color:'#52c41a'}}>{analytics.bug_reports.resolved}</div>
                                            <div className="ua-bug-label">Resolved</div>
                                        </div>
                                        <div className="ua-bug-item">
                                            <div className="ua-bug-num" style={{color: analytics.bug_reports.unresolved > 0 ? '#e50914' : '#fff'}}>
                                                {analytics.bug_reports.unresolved}
                                            </div>
                                            <div className="ua-bug-label">Open</div>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        </Row>
                    </>
                )}
            </div>
        </div>
    )
}

export default UserProfile