import React, { useState, useRef, useEffect } from 'react';
import './Navbar.css';
import { FaMagnifyingGlass, FaBell, FaBars, FaCaretDown } from 'react-icons/fa6';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaTimes } from 'react-icons/fa';
import { IoHelpCircleOutline } from 'react-icons/io5'
import { API_URL, DEV_IP, ENV_TYPE } from '../../config';
import { BugOutlined, CrownOutlined } from '@ant-design/icons';
import Alert from 'antd/es/alert/Alert';
import { Button, message, notification } from 'antd';
import FormGroup from '../../Pages/AdminPanel/Components/FormGroup/FormGroup';
import TextareaFormGroup from '../../Pages/AdminPanel/Components/FormGroup/TextareaFormGroup';
import NotificationsDropdown from '../NotificationsDropdown/NotificationsDropdown';

const BugModal = ({onClose}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [inputErrors, setInputErrors] = useState({});

  const toggle = () => {
      onClose();
  };

  const validateInputs = (name, value) => {
      let errorMessage = '';

      setInputErrors((prevSuccess) => ({
        ...prevSuccess,
        [name]: errorMessage
      }));
      switch (name) {
        case "title":
          if (!value) {
            errorMessage = 'Title cannot be empty';
          }
          break;
        case "description":
          if (!value) {
            errorMessage = 'Description cannot be empty';
          }
          break;
        // default:
        //   break;
      }

      setInputErrors((prevSuccess) => ({
        ...prevSuccess,
        [name]: errorMessage
      }));

      return { isValid: errorMessage === '', error: errorMessage };
  }

  const validateForm = () => {
    const data = {
      title: title,
      description: description,
    }
    let FormisValid = true;
    const newInputErrors = { ...inputErrors };
    for (const key in data) {
      const validationResult = validateInputs(key, data[key]);
      
      if (!validationResult.isValid) {
          newInputErrors[key] = validationResult.error
          FormisValid = false;
      }
    }

    setInputErrors(newInputErrors);
    return FormisValid
  }

  async function handleBugReport() {
      setMessage('');
      if (validateForm()) {
        try {
          setLoading(true);
          const formData = new FormData()
          formData.append('title', title);
          formData.append('description', description);

          const response = await fetch(`${API_URL}/api/bugreport`, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + localStorage.getItem('token')
            },
            body: formData
          });

          const json = await response.json();
          console.log(json);

          if (response.status === 200) {
            notification.success({message:json.message})
            // setMessage(json.message);
            onClose()
          } else {
              // setMessage(json.message);
              notification.error({message:json.message})
              // message.error(json.message)
              message.error(json.message)
              setLoading(false);
          }
        } catch (error) {
          // setMessage('Error submitting bug. Please try again later.')
          notification.error({message:"Error submitting bug. Please try again later"})
          setLoading(false);
        } finally {
            setLoading(false)
            // onClose()
        }
      } else {
        notification.error({message: "Please fill in all the fields!"})
      }
  }

  const handleToggle = () => {
    setTitle('')
    setDescription('')
    toggle();
  };

  return (
      <div className="modal">
          <div className="profile_modal-content" style={{width: 500}}>
              <h4 className="modal-title">Report a Bug</h4>
              <FormGroup label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} error={inputErrors} required />
              <TextareaFormGroup label="Description" name={"description"} value={description} onChange={(e) => setDescription(e.target.value)} error={inputErrors} required />
              <div className="divider"/>
              <div className="profile-form_buttons">
                  <button type="button" className="profile_save_btn" onClick={handleToggle}>
                      Cancel
                  </button>
                  <button type="button" className="profile_delete_btn" onClick={handleBugReport}>
                      {loading ? "Submitting..." : "Submit"}
                  </button>
              </div>
              {/* <div className="profile-message">
                  {message}
              </div> */}
          </div>
      </div>
  )
}

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [clientIp, setClientIp] = useState('');
  const [user, setUser] = useState({});
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [alertShowMore, setAlertShowMore] = useState(false);
  const searchInputRef = useRef(null);
  const [isMenuVisible, setIsMenuVisible] = React.useState( );
  const token = localStorage.getItem('token')
  const admin_token = localStorage.getItem('admin_token')
  const query = new URLSearchParams(useLocation().search).get('q') || ''
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (location.pathname === '/search' && query && query !== searchQuery) {
      setSearchQuery(query)
    } 
  }, [setSearchQuery, location, query, searchQuery])
  
  
  useEffect(() => {
    const getIP = async () => {
      try {
        const response = await fetch(`${API_URL}/ip`);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const json = await response.json();
        console.log(json);
        setClientIp(json.ip)
      } catch (error) {
        console.log('There was an error fetching data:', error);
      }
    }
    const fetchData = async (setUser, token) => {
      try {
        const customHeaders = {
          Authorization: `Bearer ${token}`,
        };
    
        const response = await fetch(`${API_URL}/api/auth/profile`, {
          method: 'GET',
          headers: customHeaders,
        });
        const json = await response.json();
        console.log(json);
    
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
    
        
        setUser(json);
      } catch (error) {
        console.log('There was an error fetching data:', error);
      }
    };
    if (token) {
      fetchData(setUser, token);
      getIP()
    }
  }, [setUser, token]);

  // Add this with your other useEffect hooks
  useEffect(() => {
    // Mock notification data - in a real app, you would fetch this from your API
    const mockNotifications = [
      { 
        id: 1, 
        message: 'New season of Stranger Things is now available!', 
        time: '2 hours ago', 
        read: false 
      },
      { 
        id: 2, 
        message: 'Continue watching "The Crown" where you left off.', 
        time: '1 day ago', 
        read: true 
      }
    ];
    
    // In a real implementation, you would fetch notifications from your API
    // For example:
    // const fetchNotifications = async () => {
    //   try {
    //     const response = await fetch(`${API_URL}/api/notifications`, {
    //       headers: { Authorization: `Bearer ${token}` }
    //     });
    //     if (response.ok) {
    //       const data = await response.json();
    //       setNotifications(data);
    //     }
    //   } catch (error) {
    //     console.error('Error fetching notifications:', error);
    //   }
    // };
    // 
    // if (token) {
    //   fetchNotifications();
    // }

    // For now, we'll just use the mock data
    setNotifications(mockNotifications);
  }, [token]);

  // useEffect(() => {
  //   if (token) {
  //     const customHeaders = {
  //       Authorization: `Bearer ${token}`,
  //     };
  //     fetch(`${API_URL}/api/auth/profile`, {
  //         method: 'GET',
  //         headers: customHeaders,
  //     }).then(res => {
  //       res.json().then(json => {
  //         setUser(json);
  //       })
  //     })
  //   }
    
  // }, [setUser, token])
 

  const toggleMenu = () => {
    setIsMenuVisible(!isMenuVisible);
  };

  const handleModalOpen = () => {
    setShowBugModal(true);
  };

  const handleModalClose = () => {
    setShowBugModal(false);
    const navbar = document.getElementsByClassName('navbar');
  };

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (searchQuery) {
        navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      }
    }
  };

  const handleSearchQueryChange = (event) => {
    let newSearchQuery = event.target.value;
    if (newSearchQuery.includes(' ')) {
      newSearchQuery = event.target.value.replace(/ /g, '%20'); 
    }
    setSearchQuery(newSearchQuery);
    navigate(`/search?q=${encodeURIComponent(newSearchQuery.trim())}`);
  };

  const toggleSearchBar = () => {
    setSearchQuery('')
    setShowSearchBar(!showSearchBar);
    navigate('/search')
    setTimeout(() => {
      searchInputRef.current.focus();
    }, 0);
  }

  // const clearSearchText = () => {
  //   setSearchQuery('');
  // };

  const isSearchPage = location.pathname.startsWith('/search')

  const handleLogOut = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json()
        console.log(data.message);
        // localStorage.removeItem('token')
        window.location.reload()
        navigate('/')
      } else {
        const data = await res.json()
        console.log(data.message);
      }
    } catch (error) {
      console.error('Error validating token:', error);
    }
  }

  return (
    <div className={`navbar ${location.pathname.startsWith('/signup') ? 'nav_half_hide' : ''} ${location.pathname.startsWith('/signin') ? 'nav_half_hide' : ''} ${location.pathname.startsWith('/watch') ? 'navbar_hide' : ''} ${location.pathname.startsWith('/admin') ? 'navbar_hide' : ''} ${location.pathname.startsWith('/error') ? 'nav_half_hide' : ''}`}>
      {ENV_TYPE === 'dev' && !window.location.pathname.startsWith('/admin') && clientIp !== DEV_IP && (<Alert className='dev-message' style={{marginTop: 70, position: 'absolute', width: '100%', whiteSpace: 'pre-line'}} description={alertShowMore && "This site is intended for testing and development purposes only.\nThe data you see here might not be real or up-to-date. Do not rely on any information presented on this site for production use.\nIf you are seeing this message on a live site, please be aware that the site is currently undergoing development and some functionality might not work as expected."} type="error" message={(<div>WARNING: This is a development environment. if you a Bug please Report.<Button type="link" onClick={() => setAlertShowMore(!alertShowMore)}>{alertShowMore ? "Show Less" : "Show More."}</Button></div>)} closable={true}/>)}
      <div className='nav_left'>
        <span className='navbar__logo' onClick={() => navigate('/')}>AMANFLIX</span>
        <span className={`route ${location.pathname === '/' ? 'cur_route' : ''}`}><Link className='link' to="/">Home</Link></span>
        <span className={`route ${location.pathname === '/shows' ? 'cur_route' : ''}`}><Link className='link' to="/shows">TV Shows</Link></span>
        <span className={`route ${location.pathname === '/movies' ? 'cur_route' : ''}`}><Link className='link' to="/movies">Movies</Link></span>
        <span className={`route ${location.pathname === '/list' ? 'cur_route' : ''}`}><Link className='link' to="/list">My List</Link></span>
      </div>
      <div className='nav_right'>
        <div className='search-span'>
            {isSearchPage ? (
              <div>
                <input 
                  ref={searchInputRef}
                  className='search-input' 
                  type="text" 
                  placeholder="Search..." 
                  onKeyDown={handleKeyPress} 
                  onChange={handleSearchQueryChange}  
                  value={decodeURIComponent(searchQuery)} 
                />
              </div>
            ) : (
            <FaMagnifyingGlass 
              className='search-icon' 
              style={{fontSize:25, cursor: 'pointer', fontWeight: 100, paddingRight:'5px' }}
              onClick={toggleSearchBar}
            />)}
          </div>
          {/* <span className='nav_right_item notifications__div'>
            <FaBell 
              style={{
                fontSize:25, 
                cursor: 'pointer', 
                fontWeight: 100, 
                paddingRight:'5px', 
                display: 'flex', 
                alignItems: 'center' 
              }}
                          />
            <ul className="dropdown-options notifications-dropdown">
              <div className='dropdown-arrow'></div>
              <div className="notifications-header">
                <h3>Notifications</h3>
              </div>
              {notifications && notifications.length > 0 ? (
                notifications.map((notification, index) => (
                  <div key={index} className={`dropdown-item notification-item ${notification.read ? '' : 'unread'}`}>
                    <span className='notification-text'>{notification.message}</span>
                    <span className='notification-time'>{notification.time}</span>
                  </div>
                ))
              ) : (
                <div className="no-notifications">
                  <span>No new notifications</span>
                </div>
              )}
            </ul>
          </span> */}
          <div className="nav_right_item notifications__div">
            <NotificationsDropdown />
          </div>
          <span className='profile__div'>
            <img loading={'lazy'} alt='User Avarar' className='profile-image' src={`${API_URL}/cdn/images/profile.png`} />
            <FaCaretDown className='profile_arrow' style={{fontSize:15, cursor: 'pointer', fontWeight: 100, paddingRight:'5px', display: 'flex', alignItems: 'center' }}/>
            <ul className="dropdown-options">
              <div className='dropdown-arrow'></div>
              <div className={`dropdown-item ${location.pathname === '/profile' ? 'highlighted' : ''}`} onClick={() => navigate('profile')}>
                <img loading={'lazy'} alt='User Avarar' className='profile-tiny-image' src={`${API_URL}/cdn/images/profile.png`} />
                <span className='item-text'>{user.username}</span>
              </div>
              <div className='middle-line'></div>
              <div className={`dropdown-item ${location.pathname === '/help' ? 'highlighted' : ''}`} onClick={() => navigate('help')}>
                <IoHelpCircleOutline style={{fontSize:22, cursor: 'pointer', fontWeight: 100, display: 'flex', alignItems: 'center' }}/>
                <span className='item-text'>Help Center</span>
              </div>
              <div className={`dropdown-item`} onClick={() => handleModalOpen()}>
                <BugOutlined style={{fontSize:22, cursor: 'pointer', fontWeight: 100, display: 'flex', alignItems: 'center' }}/>
                <span className='item-text'>Report a Bug</span>
              </div>
              {admin_token && (
                <div className={`dropdown-item ${location.pathname === '/admin' ? 'highlighted' : ''}`} onClick={() => navigate('admin')}>
                  <CrownOutlined style={{fontSize:22, cursor: 'pointer', fontWeight: 100, display: 'flex', alignItems: 'center' }}/>
                  <span className='item-text'>Admin Panel</span>
                </div>
              )}
              <div className='middle-line'></div>
              <div className='dropdown-item ' onClick={handleLogOut}>
                <span className='item-text'>Sign Out of Amanflix</span>
              </div>
            </ul>
          </span>



        {/* Hamburger Menu Button */}
        <button className='menu_btn' onClick={toggleMenu}>
            {isMenuVisible ? <FaTimes /> : <FaBars /> }
        </button>
      </div>
      {/* Mobile Menu */}
      <div 
        className={`mobile_menu ${isMenuVisible ? 'show' : ''}`}
        onClick={toggleMenu}
        style={{height: '100vh'}}
      >
        <div className='menu_options'>
          <span className={`route_mobile ${location.pathname === '/' ? 'cur_route' : ''}`}><Link className='link_mobile' to="/">Home</Link></span>
          <span className={`route_mobile ${location.pathname === '/shows' ? 'cur_route' : ''}`}><Link className='link_mobile' to="/shows">Tv Shows</Link></span>
          <span className={`route_mobile ${location.pathname === '/movies' ? 'cur_route' : ''}`}><Link className='link_mobile' to="/movies">Movies</Link></span>
          <span className={`route_mobile ${location.pathname === '/list' ? 'cur_route' : ''}`}><Link className='link_mobile' to="/list">My List</Link></span>
        </div>

        <div className='profile_menu_options'>
          <span className={`route_mobile ${location.pathname === '/profile' ? 'cur_route' : ''}`}><Link className='link_mobile' to="/profile">Manage Account</Link></span>
          <span className={`route_mobile ${location.pathname === '/profile' ? 'cur_route' : ''}`}><button className='link_mobile' onClick={handleLogOut}>Sign Out of Amanflix</button></span>
        </div>
      </div>

      {showBugModal && (
        <BugModal
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

export default Navbar;