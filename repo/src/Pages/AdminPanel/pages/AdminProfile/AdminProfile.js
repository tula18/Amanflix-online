import React, { useEffect, useState } from "react";
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { useNavigate } from "react-router";
import { API_URL } from "../../../../config";
import './AdminProfile.css'
import PasswordFormGroup from "../../Components/FormGroup/PasswordFormGroup";

const DeleteAccount = ({onClose, admin_id}) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const navigate = useNavigate();

    const toggle = () => {
        onClose();
    };

    async function handleDeleteAccount() {
        setLoading(true);
        setMessage('');
    
        try {
            const formData = new FormData();
            formData.append('password', password);
    
            const response = await fetch(`${API_URL}/api/admin/delete/${admin_id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('admin_token')
                },
                body: formData
            });
    
            const json = await response.json();
    
            if (response.status === 200) {
                setMessage(json.message);
                navigate('/admin');
            } else {
                setMessage(json.message);
                setLoading(false);
            }
        } catch (error) {
            console.error("Error deleting account:", error);
            setMessage('Error deleting account. Please try again later.');
            setLoading(false);
        }
    }

    console.log(admin_id);

    const handleToggle = () => {
        setPassword('');
        toggle();
    };

    return (
        <div className="modal">
            <div className="profile_modal-content">
                <h4 className="modal-title">Delete Account</h4>
                <p>Are you sure you want to delete your account? This action is irreversible.</p>
                <PasswordFormGroup label={'Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
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

const AdminProfile = () => {
    const token = localStorage.getItem('admin_token')
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

    const fetchAdminData = async (token, setUser) => {
        const customHeaders = {
            Authorization: `Bearer ${token}`,
        };
    
        try {
            const response = await fetch(`${API_URL}/api/admin/profile`, {
                method: 'GET',
                headers: customHeaders,
            });
    
            if (!response.ok) {
                throw new Error('Failed to fetch admin data');
            }
    
            const json = await response.json();
            setUser(json);
            setUsername(json.username);
            setEmail(json.email);
        } catch (error) {
            console.error("Error fetching admin data:", error.message);
        }
    };
    
    useEffect(() => {
        if (token) {
            fetchAdminData(token, setUser);
        }
    }, [token, setUser]);

    const handleUpdate = async () => {
        setSaveLoading(true);
        setMessage('');

        const formdata = new FormData();
        formdata.append('username', username)
        formdata.append('email', email)
    
        if (password && newPassword) {
            formdata.append('password', password)
            formdata.append('newPassword', newPassword)
        }
    
        try {
            const response = await fetch(`${API_URL}/api/admin/update`, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                },
                body: formdata
            });
    
            if (!response.ok) {
                throw new Error('Failed to update profile');
            }
    
            const json = await response.json();
            setUsername(json.username || user.username);
            setEmail(json.email || user.email);
            setMessage(json.message);
            setNewPassword('');
            setPassword('');
        } catch (error) {
            console.error("Error updating profile:", error.message);
            setMessage('Error updating profile. Please try again later.');
        } finally {
            setSaveLoading(false);
        }
    };

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
        setShowModal(false);
    };

    function formatDateTime(dateTime) {
        if (!dateTime) {
            return "You didnt update Your profile yet."
        }
        const date = new Date(dateTime);
    
        const dayOfWeek = date.toLocaleString('en-US', { weekday: 'long' });
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        const day = date.getDate();
        
        return `${dayOfWeek}, ${day} ${monthName} ${date.getFullYear()}`;
    }

    return (
        <div className="ProfilePage">
            <div className="profile__form__wrapper sidebar_profile__form__wrapper">
                <h2>Manage Your Admin Account</h2>
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
                                <PasswordFormGroup className="sidebar_form-group" label={'Current Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{width: 'auto'}} required />
                                <PasswordFormGroup className="sidebar_form-group" label={'New Password'} name="newpassword" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{width: 'auto'}} required />
                            </div>
                        </div>
                        <div  className="password-sec">
                            <div className="password-sec_inputs sidebar_password-sec_inputs">
                                <div className="divider"/>
                                <h2>Info</h2>
                                <div className="form-group sidebar_form-group">
                                    <label htmlFor="role">Role</label>
                                    <input 
                                        type={"text"}
                                        id="role"
                                        name="role"
                                        placeholder="role"
                                        value={String(user.role).toUpperCase()}
                                        disabled
                                    />
                                </div>
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
                onClose={handleModalClose}
                admin_id={user.id}
                />
            )}
        </div>
    )
}

export default AdminProfile