import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Table, Input, Button, Tag, Space, Tooltip, Flex } from "antd";
import { API_URL } from "../../../../config";
import {  FaEye, FaEyeSlash } from "react-icons/fa6";
import { CrownOutlined, DeleteOutlined, SearchOutlined, TeamOutlined, UserOutlined, LockOutlined, UnlockOutlined } from "@ant-design/icons";
import './ManageAdminsPage.css'
import PasswordFormGroup from "../../Components/FormGroup/PasswordFormGroup";


const DeleteAccount = ({onClose, user, getUsers}) => {
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

    const handleDeleteAccount = async () => {
        setLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('password', password);
        fetch(`${API_URL}/api/admin/delete/${user.id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
            },
            body: formData
        }).then((res) => {
            res.json().then((json) => {
              console.log(json);
              if (res.status === 200) {
                setMessage(json.message);
                onClose();
                getUsers();
              } else {
                setMessage(json.message);
                setLoading(false);
                getUsers();
              }
            }).catch(err => {
              console.log(String(err));
              setMessage(String(err));
              console.error("Error updating profile:", err);
            setMessage('Error updating profile. Please try again later.');
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
                <PasswordFormGroup label={"Please Enter your admin's Password"} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
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

const CreateAccount = ({onClose, getUsers}) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('moderator');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const currentUserRole = window.currentUserRole

    const toggle = () => {
        onClose();
    };

    const handleDeleteAccount = async () => {
        setLoading(true);
        setMessage('')
        console.log(username);
        console.log(email);
        console.log(role);
        console.log(password);
        const formData = new FormData();
        formData.append('username', username);
        formData.append('email', email);
        formData.append('role', role);
        formData.append('password', password);

        try {
                const res = await fetch(`${API_URL}/api/admin/create`, {
                    method: "POST",
                    body: formData,
                    headers: {
                        'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                    },
                });
        
                if (res.ok) {
                    const data = await res.json();
                    setMessage(data.message);
                    onClose();
                    getUsers();
                } else {
                    const data = await res.json();
                    setMessage(data.message);
                    setLoading(false);
                    getUsers();
                }
        } catch (error) {
            console.error("Error creating profile:", error);
            setMessage('Error creating profile. Please try again later.');
            setLoading(false);
        }
        setLoading(false);
    };

    const handleToggle = () => {
        setPassword('');
        toggle();
    };

    const allRoles = ['moderator', 'admin', 'superadmin'];
    const roleLevels = {
        moderator: 1,
        admin: 2,
        superadmin: 3,
    };

    const filteredRoles = allRoles.filter(role => {
        // if (currentUserRole === 'superadmin') return true;
        // if (currentUserRole === roleLevels[role]) return false;
        return roleLevels[role] < roleLevels[currentUserRole];
    });

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Create Admin</h4>
                <div className="form-group">
                    <input 
                        type={"text"}
                        id="username"
                        placeholder="Username"
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <input 
                        type={"email"}
                        id="email"
                        placeholder="Email"
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>
                <div className="form-group sidebar_form-group">
                    <select
                        id="role"
                        name="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                    >
                        {filteredRoles.map((item, index) => (
                            <option key={index} value={item}>{item.charAt(0).toUpperCase() + item.slice(1)}</option>
                        ))}
                    </select>
                </div>
                <PasswordFormGroup className="sidebar_form-group" label={'Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)}  required />
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={handleToggle}>
                        Cancel
                    </button>
                    <button type="button" className="profile_delete_btn" onClick={handleDeleteAccount}>
                        {loading ? "Creating..." : "Create Account"}
                    </button>
                </div>
                <div className="profile-message">
                    {message}
                </div>
            </div>
        </div>
    )
}

const ManageAdmins = () => {
    const token = localStorage.getItem('admin_token');
    const [data, setData] = useState([]);
    const [sortedData, setSortedData] = useState([]);
    // eslint-disable-next-line no-unused-vars
    const [searchTerm, setSearchTerm] = useState('');
    // eslint-disable-next-line no-unused-vars
    const [searchedColumn, setSearchedColumn] = useState('');    const [showModal, setShowModal] = useState(false);
    const [showCreateModal, setCreateShowModal] = useState(false);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [selectedUser, setSelectedUser] = useState('');
    const navigate = useNavigate();

    const searchInput = useRef(null);

    // Get current admin ID from token or state (you may need to adjust this based on your app structure)
    const getCurrentAdminId = () => {
        // This should return the current admin's ID to prevent self-disable
        // You may need to implement this based on how you store current admin info
        return JSON.parse(localStorage.getItem('admin_info'))?.id || null;
    };

    const toggleAdminStatus = async (admin) => {
        try {
            const action = admin.disabled ? 'enable' : 'disable';
            const endpoint = `${API_URL}/api/admin/${action}/${admin.id}`;
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });

            const data = await response.json();

            if (response.ok) {
                // Refresh the admin list
                getUsers();
                alert(data.message);
            } else {
                alert(data.message || 'An error occurred');
            }
        } catch (error) {
            console.error('Error toggling admin status:', error);
            alert('Error toggling admin status. Please try again.');
        }
    };

    function formatDateTime(dateTime, showTime = false) {
        const date = new Date(dateTime);
    
        const dayOfWeek = date.toLocaleString('en-US', { weekday: 'short' });
        const monthName = date.toLocaleString('en-US', { month: 'short' });
        const day = date.getDate();
    
        if (showTime) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()} ${hours}:${minutes}`;
        } else {
            return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()}`;
        }
    }

    const handleSearch = (selectedKeys, confirm, dataIndex) => {
        confirm();
        setSearchTerm(selectedKeys[0]);
        setSearchedColumn(dataIndex);
    }

    const handleReset = (clearFilters) => {
        clearFilters();
        setSearchTerm('');
    }

    const getColumnSearchProps = (dataIndex) => ({
        filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }) => (
            <div style={{
                padding: 8,
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
                <Input
                  ref={searchInput}
                  placeholder={`Search ${dataIndex}`}
                  value={selectedKeys[0]}
                  onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
                  onPressEnter={(e) => handleSearch(selectedKeys, confirm, dataIndex)}
                  style={{
                    marginBottom: 8,
                    display: "block",
                  }}
                />
                <Space>
                    <Button
                      type="primary"
                      onClick={(e) => handleSearch(selectedKeys, confirm, dataIndex)}
                      icon={<SearchOutlined/>}
                      size={"small"}
                      style={{
                        width: 90,
                      }}
                    >
                        Search
                    </Button>
                    <Button
                      onClick={() => clearFilters && handleReset(clearFilters)}
                      size={"small"}
                      style={{
                        width: 90,
                      }}
                    >
                        Reset
                    </Button>
                    <Button
                      type="link"
                      size={"small"}
                      onClick={() => {
                        confirm({
                            closeDropdown: false,
                        });
                        setSearchTerm(selectedKeys[0]);
                        setSearchedColumn(dataIndex)
                      }}
                    >
                        Filter
                    </Button>
                    <Button
                      type="link"
                      size={"small"}
                      onClick={() => {
                        close();
                      }}
                    >
                        close
                    </Button>
                </Space>
            </div>
        ),
        filterIcon: (filtered) => (
            <SearchOutlined style={{color: filtered ? '#1677ff' : undefined}}/>
        ),
        onFilter: (value, record) => record[dataIndex].toString().toLowerCase().includes(value.toLowerCase()),
        onFilterDropdownChange: (visible) => {
            if (visible) {
                setTimeout(() => searchInput.current?.select(), 100);
            }
        },
    })

    const roleIcon = {
        'superadmin': <CrownOutlined />,
        'admin': <UserOutlined />,
        'moderator': <TeamOutlined />,
    };

    const roleColor = {
        'superadmin': 'red',
        'admin': 'yellow',
        'moderator': 'green',
    };

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            sorter: {
                compare: (a,b) => a.id - b.id,
            }
        },
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
            render: (text, user) => <Tooltip title="Open Admin"><Button type="link" onClick={() => navigate(`/admin/admins/${user.id}`)}>{text}</Button></Tooltip>,
            ...getColumnSearchProps('username')
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            ...getColumnSearchProps('email')
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            ...getColumnSearchProps('role'),
            render: (_, { role }) => (
                <>
                    {
                        
                    }
                        <Tag icon={roleIcon[role]} color={roleColor[role]}>
                            {String(role).toLocaleUpperCase()}
                        </Tag>

                </>
            )        },
        {
            title: 'Status',
            dataIndex: 'disabled',
            key: 'disabled',
            render: (_, { disabled }) => (
                <Tooltip title={disabled ? "Account is disabled" : "Account is active"}>
                    <Tag color={disabled ? 'red' : 'green'} icon={disabled ? <LockOutlined /> : <UnlockOutlined />}>
                        {disabled ? "DISABLED" : "ACTIVE"}
                    </Tag>
                </Tooltip>
            ),
            filters: [
                { text: 'Active', value: false },
                { text: 'Disabled', value: true },
            ],
            onFilter: (value, record) => record.disabled === value,
        },
        {
            title: 'Created at',
            dataIndex: 'created_at',
            key: 'created_at',
            sorter: (a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
        
                // Sort by time, then by date
                return dateA - dateB;
            },
            render: (_, { created_at }) => <p>{formatDateTime(created_at, true)}</p>
        },
        {
            title: 'Action',
            dataIndex: 'action',            render: (_, record) => (
                <Flex justify={"center"} gap="small">
                    {window.currentUserRole === 'superadmin' && (
                        <Tooltip title={record.disabled ? "Enable Admin" : "Disable Admin"}>
                            <Button 
                                icon={record.disabled ? <UnlockOutlined /> : <LockOutlined />} 
                                style={{ borderColor: record.disabled ? "green" : "orange", color: record.disabled ? "green" : "orange" }}
                                onClick={() => toggleAdminStatus(record)}
                                disabled={record.id === getCurrentAdminId()}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title="Delete Admin">
                        <Button icon={<DeleteOutlined/>} danger onClick={() => handleModalOpen(record, setShowModal)}/>
                    </Tooltip>
                </Flex>
            )
        },
    ]

    const handleModalOpen = (user, setModal) => {
        setModal(true)
        setSelectedUser(user)
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    }

    const handleModalClose = (setModal) => {
        setModal(false);
        getUsers();
    };

    const getUsers = async () => {
        try {
            setLoadingUsers(true)
            const res = await fetch(`${API_URL}/api/admin/list`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                console.log(data);
                setData(data)
                setLoadingUsers(false)
            }
        } catch (error) {
            console.error('Error validating token:', error);
            setLoadingUsers(false)
        }
    }

    const getUsersMemoized = useCallback(getUsers, [token])

    useEffect(() => {
        getUsersMemoized()
    }, [token, getUsersMemoized])

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showModal && event.target.classList.contains('modal')) {
                handleModalClose(setShowModal);
            }
            if (showCreateModal && event.target.classList.contains('modal')) {
                handleModalClose(setCreateShowModal);
            }
        };
  
        document.addEventListener('mousedown', handleClickOutside);
  
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
        // eslint-disable-next-line
      }, [showModal, showCreateModal]);

      useEffect(() => {
        const handleEscapeKey = (event) => {
          if (showModal && event.key === 'Escape') {
            handleModalClose(setShowModal);
          }
          if (showCreateModal && event.key === 'Escape') {
            handleModalClose(setCreateShowModal);
          }
        };
      
        document.addEventListener('keydown', handleEscapeKey);
      
        return () => {
          document.removeEventListener('keydown', handleEscapeKey);
        };
        // eslint-disable-next-line
    }, [showModal, showCreateModal]);

    useEffect(() => {
        // Sort data by createdAt in descending order
        const sorted = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setSortedData(sorted);
    }, [data]);

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "10px"}}>
                <h1>Manage Admins</h1>
                <h2>{sortedData.length} Admins</h2>
                <Flex gap={"5px"}>
                    <Tooltip title="Create a new Admin">
                        <Button
                        type="primary"
                        onClick={() => handleModalOpen({}, setCreateShowModal)}
                        style={{
                            width: 90,
                        }}
                        >
                            Create Admin
                        </Button>
                    </Tooltip>
                    <Tooltip title="Reload List">
                        <Button
                        type="primary"
                        onClick={getUsers}
                        style={{
                            width: 90,
                        }}
                        loading={loadingUsers}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Flex>
            </Flex>
            <Table
              dataSource={sortedData}
              columns={columns}
              pagination={{pageSize:10}}
              className="custom-table" 
            />
            {showModal && (
                <DeleteAccount
                onClose={() => handleModalClose(setShowModal)}
                user={selectedUser}
                getUsers={getUsers}
                />
            )}
            {showCreateModal && (
                <CreateAccount
                onClose={() => handleModalClose(setCreateShowModal)}
                getUsers={getUsers}
                />
            )}
        </Flex>
    )
}

export default ManageAdmins