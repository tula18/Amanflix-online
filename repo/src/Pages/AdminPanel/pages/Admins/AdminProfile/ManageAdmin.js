import React, { useEffect, useState } from "react";
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate, useParams } from "react-router";
import { Button, FloatButton, Tooltip } from 'antd';
import { ArrowLeftOutlined } from "@ant-design/icons";
import { API_URL } from "../../../../../config";
import PasswordFormGroup from "../../../Components/FormGroup/PasswordFormGroup";

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

const ManageAdminProfile = () => {
    const token = localStorage.getItem('admin_token')
    const [user, setUser] = useState({});
    const [username, setUsername] = useState('')
    const [role, setRole] = useState('')
    const [email, setEmail] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newPasswordVisible, setNewPasswordVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [saveLoading, setSaveLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const { admin_id } = useParams();
    const currentUserRole = window.currentUserRole

    useEffect(() => {
        if (token) {
            const formdata = new FormData();
            formdata.append('admin_id', admin_id)
            const customHeaders = {
                Authorization: `Bearer ${token}`,
            };
            fetch(`${API_URL}/api/admin/admin`, {
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
                    setRole(json.role)
                }
            })
          })
        }
        
      }, [setUser, token, admin_id])

    const handleUpdate = async () => {
        try {
            setSaveLoading(true);
            setMessage('')
            const formData = new FormData();
            formData.append('admin_id', admin_id)
            if (username !== user.username) {
                formData.append('username', username);
            }
            if (email !== user.email) {
                formData.append('email', email);
            }

            if (role !== user.role) {
                formData.append('newRole', role)
            }

            if (newPassword) {
                formData.append('newPassword', newPassword)
            }

            const res = await fetch(`${API_URL}/api/admin/update/${user.id}`, {
                method: "POST",
                body: formData,
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.ok) {
                const data = await res.json();
                setMessage(data.message);
                setUsername(data.username || user.username);
                setEmail(data.email || user.email);
                setNewPassword('');
            } else {
                const data = await res.json();
                setMessage(data.message)
            }
        } catch (error) {
            console.error('Error validating token:', error);
            setMessage(error.error);
        } finally {
            setSaveLoading(false);
        }
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
        <div className="ProfilePage">
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
                                <div className="form-group sidebar_form-group">
                                    <label htmlFor="role">Role</label>
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
        </div>
    )
}

export default ManageAdminProfile