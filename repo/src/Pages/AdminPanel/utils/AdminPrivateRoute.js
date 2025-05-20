import React, { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { API_URL } from "../../../config";
import ErrorHandler from "../../../Utils/ErrorHandler";

const roleLevels = {
    moderator: 1,
    admin: 2,
    superadmin: 3,
};

const AdminPrivateRoute = ({ requiredRoleLevel, children }) => {
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate()
    const location = useLocation()
    const [authState, setAuthState] = useState({
        isAuthenticated: false,
        userRoleLevel: 0,
    });

    useEffect(() => {
        const validateToken = async () => {
            const token = localStorage.getItem('admin_token');
            if (token) {
                try {

                    if (!token) {
                        setAuthState({ isAuthenticated: false, userRoleLevel: 0 });
                        setIsLoading(false);
                        console.log("no token");
                        return;
                    }

                    const res = await fetch(`${API_URL}/api/admin/verify`, {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    });
                    const data = await res.json();

                    if (res.ok && data.valid) {
                        const userRoleLevel = roleLevels[data.role] || 0;
                        console.log(userRoleLevel);
                        window.currentUserRole = data.role
                        setAuthState({
                            isAuthenticated: true,
                            userRoleLevel,
                        });
                    } else {
                        setAuthState({ isAuthenticated: false, userRoleLevel: 0 });
                        ErrorHandler(res, navigate, data)
                    }
                } catch (error) {
                    console.error('Error validating token:', error);
                    setAuthState({ isAuthenticated: false, userRoleLevel: 0 });
                    ErrorHandler(error, navigate)
                    
                } finally {
                    setIsLoading(false);
                }
            } else {
                console.log("no token");
                setAuthState({ isAuthenticated: false, userRoleLevel: 0 });
                if (location.pathname !== '/admin') {
                    ErrorHandler("admin_token_missing", navigate)
                } else {
                    navigate('/admin/login')
                }
            }
        }

        validateToken();
    }, []);

    if (isLoading) {
        return <div>loading...</div>;
    }

    if (!authState.isAuthenticated) {
        return <Navigate to={"/admin/login"}/>;
    }

    const requiredLevel = roleLevels[requiredRoleLevel] || 0;

    if (authState.userRoleLevel < requiredLevel) {
        return (
            <div className="error-page">
                <div className="error_modal-content">
                    <h4 className="error_modal-title">Unauthorized</h4>
                    <p>You do not have permissions to access this page.</p>
                    <div className="divider"/>
                    <div className="profile-form_buttons">
                        <button type="button"onClick={() => navigate('/admin')} className="profile_save_btn" >
                            Back to Panel
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return children;
}

export default AdminPrivateRoute