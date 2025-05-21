import React, { useEffect, useState } from "react";
import './AdminPage.css'
import { Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "./Components/Sidebar/Sidebar";
import AdminHomePage from "./pages/AdminHome/Home";
import AdminPrivateRoute from "./utils/AdminPrivateRoute";
import { API_URL } from "../../config";
import ManageMovies from "./pages/Movies/ManageMoviesPage";
import ManageShows from "./pages/Shows/ManageShowsPage";
import ManageUsers from "./pages/Users/ManageUsersPage";
import ManageAdmins from "./pages/Admins/ManageAdminsPage";
import AdminLogin from "./pages/AdminLogin/AdminLogin";
import AdminProfile from "./pages/AdminProfile/AdminProfile";
import UserProfile from "./pages/Users/UserProfile/UserProfile";
import ManageAdminProfile from "./pages/Admins/AdminProfile/ManageAdmin";
import NotFoundPage from "../ErrorsPages/NotFoundPage/NotFoundPage";
import UnresolvedBugs from "./pages/BugsPage/BugsPage";
import ManageUploadRequests from "./pages/UploadRequests/UploadRequests";
import ManageNotifications from "./pages/Notifications/ManageNotificationsPage";
import AnalyticsDashboard from './pages/Analytics/AnalyticsDashboard';
import ActiveSessions from './pages/Analytics/ActiveSessions';
import CdnManagementPage from './pages/CDNManagement/CDNManagementPage'; // Add this import

const AdminPage = () => {
    const token = localStorage.getItem('admin_token');
    const [user, setUser] = useState({})
    let contentPadding = '0px';
    const [isLoading, setIsLoading] = useState(true);
    const location = useLocation();

    useEffect(() => {
        const getProfile = async () => {
            try {
                if (!token) {
                    setIsLoading(false);
                    console.log("no token");
                    return;
                }

                const res = await fetch(`${API_URL}/api/admin/profile`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log(data);
                    setUser(data)
                }
            } catch (error) {
                console.error('Error validating token:', String(error.error));
            } finally {
                setIsLoading(false);
            }
        }

        getProfile()
    }, [token])

    const showSidebar = () => {
        if (location.pathname.startsWith('/admin/login')) {
            contentPadding = '0px';
            return false;
        }
        contentPadding = '20px';
        return true;
    }

    if (isLoading === true) {
        return (
            <div className="spinner-container" style={{display:"flex"}}>
                <div className="spinner-border"></div>
            </div>
        )
    }

    return (
        <div className="AdminPage">
            <div style={{display: 'flex', width: '100%'}}>
                {showSidebar() && <Sidebar user={user}/>}
                <div style={{flex:1, padding: contentPadding, overflowY: "auto", height: "100vh"}}>
                    <Routes>
                        <Route path="/" element={<AdminPrivateRoute requiredRoleLevel={"moderator"}><AdminHomePage/></AdminPrivateRoute>}/>
                        <Route path="/login" element={<AdminLogin/>}/>
                        <Route path="/profile" element={<AdminPrivateRoute requiredRoleLevel={"moderator"}><AdminProfile/></AdminPrivateRoute>}/>
                        <Route path="/upload/movie" element={<AdminPrivateRoute requiredRoleLevel={"moderator"}><ManageMovies/></AdminPrivateRoute>}/>
                        <Route path="/upload/show" element={<AdminPrivateRoute requiredRoleLevel={"moderator"}><ManageShows/></AdminPrivateRoute>}/>
                        <Route path="/users" element={<AdminPrivateRoute requiredRoleLevel={"admin"}><ManageUsers/></AdminPrivateRoute>}/>
                        <Route path="/users/:user_id" element={<AdminPrivateRoute requiredRoleLevel={"admin"}><UserProfile/></AdminPrivateRoute>}/>
                        <Route path="/admins" element={<AdminPrivateRoute requiredRoleLevel={"admin"}><ManageAdmins/></AdminPrivateRoute>}/>
                        <Route path="/admins/:admin_id" element={<AdminPrivateRoute requiredRoleLevel={"admin"}><ManageAdminProfile/></AdminPrivateRoute>}/>
                        <Route path="/bugs" element={<AdminPrivateRoute requiredRoleLevel={"admin"}><UnresolvedBugs/></AdminPrivateRoute>}/>
                        <Route path="/uploadRequests" element={<AdminPrivateRoute requiredRoleLevel={"moderator"}><ManageUploadRequests/></AdminPrivateRoute>}/>
                        <Route path="/notifications" element={<AdminPrivateRoute requiredRoleLevel={"admin"}><ManageNotifications/></AdminPrivateRoute>}/>
                        <Route path="/analytics" element={<AnalyticsDashboard />} />
                        <Route path="/analytics/sessions" element={<ActiveSessions />} />
                        {/* Add the new CDN Management route */}
                        <Route path="/cdn" element={<AdminPrivateRoute requiredRoleLevel={"moderator"}><CdnManagementPage/></AdminPrivateRoute>}/>
                        <Route path="*" element={<NotFoundPage/>}/>
                    </Routes>
                </div>
            </div>
        </div>
    )
}

export default AdminPage