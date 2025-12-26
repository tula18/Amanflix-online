import React, { useEffect, useState } from 'react';
import { MdExpandLess, MdExpandMore } from 'react-icons/md';
import { HiChevronDoubleLeft, HiChevronDoubleRight } from 'react-icons/hi';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';
import { API_URL } from '../../../../config';
import { GoHome } from 'react-icons/go'
import { TbMovie, TbUserShield } from 'react-icons/tb'
import { LuUser } from 'react-icons/lu'
import { 
    BugOutlined, 
    UploadOutlined, 
    BellOutlined, 
    LineChartOutlined, 
    UserSwitchOutlined,
    CloudServerOutlined // Add this import for the CDN icon
} from '@ant-design/icons';
import { Tooltip, notification } from 'antd';

const Sidebar = ({user}) => {
    const [collapsedCategories, setCollapsedCategories] = useState({})
    const [reportCount, setReportCount] = useState(0)
    const [requestsCount, setRequestsCount] = useState(0)
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        const saved = localStorage.getItem('sidebar_collapsed');
        return saved ? JSON.parse(saved) : false;
    });
    const token = localStorage.getItem('admin_token')
    const location = useLocation();
    const navigate = useNavigate();

    const toggleSidebarCollapse = () => {
        const newState = !isSidebarCollapsed;
        setIsSidebarCollapsed(newState);
        localStorage.setItem('sidebar_collapsed', JSON.stringify(newState));
    };

    useEffect(() => {
        const fetchBugsCount = async () => {
            if (token) {
                try {
                    const res = await fetch(`${API_URL}/api/admin/unresolved_count`, {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });
                    const json = await res.json()
                    console.log();
                    setReportCount(json.unresolved_count)
                } catch {
                    notification.error({message: "There was a problem fetching bugs count."})
                }
            } 
        }

        const fetchRequestsCount = async () => {
            if (token) {
                try {
                    const res = await fetch(`${API_URL}/api/admin/uploadRequests_count`, {
                        method: "GET",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });
                    const json = await res.json()
                    setRequestsCount(json.uploadRequests_count)
                } catch {
                    notification.error({message: "There was a problem fetching bugs count."})
                }
            } 
        }
        fetchRequestsCount()
        fetchBugsCount()
    }, [reportCount])

    const roleLevels = {
        moderator: 1,
        admin: 2,
        superadmin: 3,
    };

    const userRoleLevel = roleLevels[user.role]
    
    const categories = [
        {
            name: "Dashboard",
            links: [
                {name: 'Home', path: '/admin', requiredRoleLevel: 1, icon: GoHome, description: "Show all the general data of the site"},
            ]
        },
        {
            name: "Manage Media",
            links: [
                {name: 'Upload Movie', path: '/admin/upload/movie', requiredRoleLevel: 1, icon: TbMovie, description: "Upload a new Movie to the streaming service"},
                {name: 'Upload TV Show', path: '/admin/upload/show', requiredRoleLevel: 1, icon: TbMovie, description: "Upload a new TV Show to the streaming service"},
                {name: 'Add By File', path: '/admin/upload/by-file', requiredRoleLevel: 1, icon: UploadOutlined, description: "Upload content by analyzing file names with smart detection"},
                // Add the CDN Management link here
                {name: 'CDN Management', path: '/admin/cdn', requiredRoleLevel: 1, icon: CloudServerOutlined, description: "Manage content delivery network and import data"},
            ]
        },
        {
            name: "Users",
            links: [
                {name: 'Manage Users', path: '/admin/users', requiredRoleLevel: 2, icon: LuUser, description: "Manage the Users"},
            ]
        },
        {
            name: "Admins",
            links: [
                {name: 'Manage Admins', path: '/admin/admins', requiredRoleLevel: 2, icon: TbUserShield, description: "Manage the Admins"},
            ]
        },
        {
            name: "Bugs",
            links: [
                {name: `Bug Reports (${reportCount})`, path: '/admin/bugs', requiredRoleLevel: 2, icon: BugOutlined, description: "Manage the Open and resolved bugs"},
            ]
        },
        {
            name: "Upload Requests",
            links: [
                {name: `Upload Requests (${requestsCount})`, path: '/admin/uploadRequests', requiredRoleLevel: 1, icon: UploadOutlined, description: "Manage the Upload requests"},
            ]
        },
        {
            name: "Notifications",
            links: [
                {name: 'Manage Notifications', path: '/admin/notifications', requiredRoleLevel: 2, icon: BellOutlined, description: "Manage system notifications"},
            ]
        },
        {
            name: "Analytics",
            links: [
                {name: 'Dashboard', path: '/admin/analytics', requiredRoleLevel: 1, icon: LineChartOutlined, description: "View site analytics and metrics"},
                {name: 'Active Sessions', path: '/admin/analytics/sessions', requiredRoleLevel: 2, icon: UserSwitchOutlined, description: "View active user sessions"},
            ]
        },
    ];

    const toggleCategory = (categoryName) => {
        setCollapsedCategories((prevState) => ({
            ...prevState,
            [categoryName]: !prevState[categoryName],
        }));
    };

    
  const handleLogOut = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json()
        console.log(data.message);
        // localStorage.removeItem('admin_token')
        navigate('/admin/login')
        // window.location.reload()
      } else {
        const data = await res.json()
        console.log(data.message);
        navigate('/admin/login')
        // window.location.reload()
      }
    } catch (error) {
      console.error('Error validating token:', error);
    }
  }

    
    return (
        <div className={`sidebar ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
            <div className='sidebar_top'>
                <div className='sidebar_header'>
                    {!isSidebarCollapsed && (
                        <span className='sidebar__logo' onClick={() => navigate('/admin')}>
                            Admin Panel
                        </span>
                    )}
                    <button className='sidebar_toggle_btn' onClick={toggleSidebarCollapse} title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                        {isSidebarCollapsed ? <HiChevronDoubleRight /> : <HiChevronDoubleLeft />}
                    </button>
                </div>
                <div className={`sidebar_profile ${location.pathname === "/admin/profile" ? "profile_highlighted" : ""}`} onClick={() => navigate('/admin/profile')}>
                    <img className='sidebar_profile_img' alt="Profile Avatar" loading={'lazy'} draggable="false" src={`${API_URL}/cdn/images/profile.png`} />
                    {!isSidebarCollapsed && (
                        <div className='sidebar_profile_info'>
                            <h1 className='admin_username'>{String(user.username)}</h1>
                            <h3 className='admin_role'>{String(user.role).toUpperCase()}</h3>
                        </div>
                    )}
                </div>
                <div className='sidebar_links'>
                    {categories.map((category) => {
                        const accessibleLinks = category.links.filter(
                            (link) => userRoleLevel >= link.requiredRoleLevel
                        );

                        if (accessibleLinks.length === 0) {
                            return null;
                        }

                        const isCategoryCollapsed = collapsedCategories[category.name]

                        return (
                            <div key={category.name} className='sidebar_category'>
                                {!isSidebarCollapsed && (
                                    <div className='category-header' onClick={() => toggleCategory(category.name)}>
                                        <span>{category.name}</span>
                                        <MdExpandLess className={`coll_icon ${isCategoryCollapsed ? 'collapsed' : ''}`} />
                                    </div>
                                )}
                                <div className={`category_links ${isCategoryCollapsed && !isSidebarCollapsed ? 'category_links_hidden' : ''}`}>
                                    {accessibleLinks.map((link) => (
                                        <Tooltip 
                                            key={link.name}
                                            title={isSidebarCollapsed ? link.name : ''}
                                            placement='right'
                                        >
                                            <NavLink
                                                to={link.path}
                                                className={`sidebar-link ${location.pathname === link.path ? 'active-link' : ''}`}
                                            >
                                                <link.icon className='sidebar_link_icon'/>
                                                {!isSidebarCollapsed && <span className='sidebar_link_text'>{link.name}</span>}
                                            </NavLink>
                                        </Tooltip>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            <div className='sidebar_bottom'>
                <Tooltip title={isSidebarCollapsed ? 'Go Home' : ''} placement='right'>
                    <button className='sidebar_bottom_btn' onClick={() => navigate('/')}>
                        <GoHome className='sidebar_bottom_icon' />
                        {!isSidebarCollapsed && <span>Go Home</span>}
                    </button>
                </Tooltip>
                <Tooltip title={isSidebarCollapsed ? 'Sign Out' : ''} placement='right'>
                    <button className='sidebar_bottom_btn sidebar_logout_btn' onClick={handleLogOut}>
                        <LuUser className='sidebar_bottom_icon' />
                        {!isSidebarCollapsed && <span>Sign Out</span>}
                    </button>
                </Tooltip>
            </div>
        </div>
    )
}

export default Sidebar