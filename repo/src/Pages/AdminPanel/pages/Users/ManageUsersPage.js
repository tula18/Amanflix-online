import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Table, Input, Button, Tag, Space, Tooltip, Flex } from "antd";
import { API_URL } from "../../../../config";
import {  FaEye, FaEyeSlash } from "react-icons/fa6";
import { DeleteOutlined, SearchOutlined, StopOutlined, UnlockOutlined } from "@ant-design/icons";
import PasswordFormGroup from "../../Components/FormGroup/PasswordFormGroup";

const BanAccount = ({onClose, user, handleSubmit}) => {
    const [reason, setReason] = useState('');
    const [duration, setDuration] = useState(0);
    const [message, setMessage] = useState('');
    let has_id = true

    const toggle = () => {
        setReason('');
        setDuration(0);
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
                <h4 className="modal-title">Ban Account</h4>
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

    const handleBanAccount = () => {
        handleSubmit(user, reason, duration, setMessage)
        onClose();
    }

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Ban {user.username} Account</h4>
                <p>Are you sure you want to ban {user.username}'s account?</p>
                <div className="form-group">
                    <input 
                        type="text"
                        id="reason"
                        placeholder="Ban Reason"
                        onChange={(e) => setReason(e.target.value)}
                    />
                </div>
                <div className="form-group">
                    <input 
                        type="text"
                        id="duration"
                        placeholder="Ban Duration"
                        onChange={(e) => setDuration(e.target.value)}
                    />
                </div>
                <div className="divider"/>
                <div className="profile-form_buttons">
                    <button type="button" className="profile_save_btn" onClick={toggle}>
                        Cancel
                    </button>
                    <button type="button" className="profile_delete_btn" onClick={handleBanAccount}>
                        Ban Account
                    </button>
                </div>
                <div className="profile-message">
                    {message}
                </div>
            </div>
        </div>
    )
}

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
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const toggle = () => {
        onClose();
    };

    const handleDeleteAccount = async () => {
        setLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('username', username);
        formData.append('email', email);
        formData.append('password', password);

        try {
                const res = await fetch(`${API_URL}/api/auth/register`, {
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

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Create User</h4>
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
                <PasswordFormGroup label={'Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
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

const ManageUsers = () => {
    const token = localStorage.getItem('admin_token');
    const [data, setData] = useState([]);
    const [sortedData, setSortedData] = useState([]);
    // eslint-disable-next-line no-unused-vars
    const [searchTerm, setSearchTerm] = useState('');
    // eslint-disable-next-line no-unused-vars
    const [searchedColumn, setSearchedColumn] = useState('');
    const [showModal, setShowModal] = useState(false)
    const [showCreateModal, setCreateShowModal] = useState(false)
    const [showBanModal, setShowBanModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState('')
    const navigate = useNavigate();

    const searchInput = useRef(null);

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
            render: (text, user) => <Tooltip title="Open User"><Button type="link" onClick={() => navigate(`/admin/users/${user.id}`)}>{text}</Button></Tooltip>,
            ...getColumnSearchProps('username')
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            ...getColumnSearchProps('email')
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
            title: 'Is Banned',
            dataIndex: 'is_banned',
            key: 'is_banned',
            sorter: {
                compare: (a,b) => a.is_banned - b.is_banned
            },
            render: (_, { is_banned, ban_until }) => (
                <>

                    <Tooltip title={is_banned ? ban_until ? `Ban until ${formatDateTime(ban_until, true)}` : "Banned Permanently" : ""}>

                        <Tag color={is_banned ? 'red' : 'green'}>
                            {is_banned ? "Banned" : "Not Banned"}
                        </Tag>
                    </Tooltip>

                </>
            )
        },
        {
            title: 'Ban Reason',
            dataIndex: 'ban_reason',
            key: 'ban_reason',
            ...getColumnSearchProps('ban_reason')
        },
        {
            title: 'Action',
            dataIndex: 'action',
            render: (_, record) => (
                <Flex justify={"center"} gap="small">
                    <Tooltip  title={record.is_banned ? "Unban User" : "Ban User"}>
                        <Button style={{borderColor: "orange", color: "orange"}} icon={record.is_banned ? <UnlockOutlined/> : <StopOutlined/>} onClick={() => record.is_banned ? unbanUser(record) : handleModalOpen(record, setShowBanModal)}/>
                    </Tooltip>
                    <Tooltip title="Delete User">
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

    const banUser = async (user, reason, duration, setMessage) => {
        try {
            const formdata = new FormData();
            formdata.append('user_id', user.id)
            formdata.append('reason', reason)
            if (duration !== 0) {
                formdata.append('duration', duration)
            }
            const res = await fetch(`${API_URL}/api/admin/user/ban`, {
                method: "POST",
                body: formdata,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                console.log(data);
                setMessage(data.message)
            } else {
                const data = await res.json();
                console.log(data);
                setMessage(data.message)
            }
            getUsers();
        } catch (error) {
            console.error('Error validating token:', error);
        }
    }

    const unbanUser = async (user) => {
        try {
            const formdata = new FormData();
            formdata.append('user_id', user.id)
            const res = await fetch(`${API_URL}/api/admin/user/unban`, {
                method: "POST",
                body: formdata,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                console.log(data);
            } else {
                const data = await res.json();
                console.log(data);
            }
            getUsers();
        } catch (error) {
            console.error('Error validating token:', error);
        }
    }

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
                console.log(data);
                setData(data)
            }
        } catch (error) {
            console.error('Error validating token:', error);
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

            if (showBanModal && event.target.classList.contains('modal')) {
                handleModalClose(setShowBanModal);
            }
        };
  
        document.addEventListener('mousedown', handleClickOutside);
  
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
        // eslint-disable-next-line
      }, [showModal, showBanModal]);

      useEffect(() => {
        const handleEscapeKey = (event) => {
          if (showModal && event.key === 'Escape') {
            handleModalClose(setShowModal);
          }
          if (showBanModal && event.key === 'Escape') {
            handleModalClose(setShowBanModal);
        }
        };
      
        document.addEventListener('keydown', handleEscapeKey);
      
        return () => {
          document.removeEventListener('keydown', handleEscapeKey);
        };
        // eslint-disable-next-line
    }, [showModal, showBanModal]);

    useEffect(() => {
        // Sort data by createdAt in descending order
        console.log(data);
        const sorted = [...data].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setSortedData(sorted);
    }, [data]);

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "10px"}}>
                <h1>Manage Users</h1>
                <h2>{sortedData.length} Users</h2>
                <Flex gap={"5px"}>
                    <Tooltip title="Create a new User">
                        <Button
                        type="primary"
                        onClick={() => handleModalOpen({}, setCreateShowModal)}
                        style={{
                            width: 90,
                        }}
                        >
                            Create User
                        </Button>
                    </Tooltip>
                    <Tooltip title="Reload List">
                        <Button
                        type="primary"
                        onClick={getUsers}
                        style={{
                            width: 90,
                        }}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Flex>
            </Flex>
            <Table
              dataSource={sortedData}
              columns={columns}
              className="custom-table" 
            />
            {showModal && (
                <DeleteAccount
                onClose={() => handleModalClose(setShowModal)}
                user={selectedUser}
                />
            )}
            {showBanModal && (
                <BanAccount
                onClose={() => handleModalClose(setShowBanModal)}
                user={selectedUser}
                handleSubmit={banUser}
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

export default ManageUsers