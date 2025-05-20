import React, { useEffect, useState } from "react";
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate } from "react-router";
import { API_URL } from '../../config';
import './ProfilePage.css'
import PasswordFormGroup from "../AdminPanel/Components/FormGroup/PasswordFormGroup";

const DeleteAccount = ({onClose}) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const toggle = () => {
        onClose();
    };

    const handleDeleteAccount = () => {
        setLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('password', password);
        fetch(`${API_URL}/api/auth/delete`, {
            method: 'DELETE',
            headers: {
                // 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        }).then((res) => {
            res.json().then((json) => {
              console.log(json);
              if (res.status === 200) {
                setMessage(json.message);
                navigate('/')
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
                <h4 className="modal-title">Delete Account</h4>
                <p>Are you sure you want to delete your account? This action is irreversible.</p>
                <PasswordFormGroup label={'Current Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
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

const ProfilePage = () => {
    const token = localStorage.getItem('token')
    const [user, setUser] = useState({});
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [passwordVisible, setPasswordVisible] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [newPasswordVisible, setNewPasswordVisible] = useState(false);
    const [message, setMessage] = useState('');
    const [saveLoading, setSaveLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)

    useEffect(() => {
        if (token) {
          const customHeaders = {
            Authorization: `Bearer ${token}`,
          };
          fetch(`${API_URL}/api/auth/profile`, {
              method: 'GET',
              headers: customHeaders,
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
        
      }, [setUser, token])

    const handleUpdate = () => {
        setSaveLoading(true);
        setMessage('')
        const formData = new FormData();
        formData.append('username', username);
        formData.append('email', email);

        if (password && newPassword) {
            formData.append('newPassword', newPassword)
            formData.append('password', password);
        }

        fetch(`${API_URL}/api/auth/update`, {
            method: 'POST',
            headers: {
                // 'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            setMessage('Profile updated successfully!');
            setUsername(data.username || user.username);
            setEmail(data.email || user.email);
            setMessage(data.message);
            setNewPassword('');
            setPassword('')
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

    const handleModalOpen = (e) => {
        e.stopPropagation();
        setShowModal(true)
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.add('navbar_hide');
        }
    }

    const handleModalClose = () => {
        let timeoutId;
        clearTimeout(timeoutId);
         timeoutId = setTimeout(() => console.log('hello'), 1000); // 2000ms = 2s
        setShowModal(false);
        const navbar = document.getElementsByClassName('navbar');
        if (navbar[0]) {
            navbar[0].classList.remove('navbar_hide');
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
        <div className="ProfilePage">
            <div className="profile__form__wrapper">
                <h2>Manage Your Account</h2>
                <div className="divider"/>
                <div className="profile__form">
                    <div className="form_content">
                        <div className="first-sec">
                            <img alt="Profile Avatar" loading={'lazy'} draggable="false" className='profile-image-big' src={`${API_URL}/cdn/images/profile.png`} />
                            <div className="first-sec__inputs">
                                <div className="form-group">
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
                                <div className="form-group">
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
                            <div className="password-sec_inputs">
                                <div className="divider"/>
                                <h2>Change Password</h2>
                                <PasswordFormGroup className="sidebar_form-group" label={'Current Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
                                <PasswordFormGroup className="sidebar_form-group" label={'New Password'} name="newpassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{width: 'auto'}} required />
                            </div>
                        </div>
                        <div  className="password-sec">
                            <div className="password-sec_inputs">
                                <div className="divider"/>
                                <h2>Info</h2>
                                <div className="form-group">
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
                                <div className="form-group">
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
                onClose={handleModalClose}
                />
            )}
        </div>
    )
}

export default ProfilePage