import React, { useEffect, useState } from "react";
import { API_URL } from "../config";
import { Navigate, useLocation, useNavigate  } from "react-router-dom";
import ErrorHandler from "./ErrorHandler";

const PrivateRoute = ({ children }) => {
    const token = localStorage.getItem('token')
    const [isAuthenticated, setIsAuthenticated] = useState(null);
    const navigate = useNavigate();
    const location = useLocation()

    useEffect(() => {
        const verifyToken = async () => {
            if (token) {
                try {
                    const customHeaders = {
                        Authorization: `Bearer ${token}`,
                    };
                    const response = await fetch(`${API_URL}/api/auth/verify`, {
                        method: 'POST',
                        headers: customHeaders,
                    });
                    const json = await response.json();
                    console.log(token);
                    
                    console.log(json);
                    
                    if (response.status === 200 && json.message === 'valid') {
                        setIsAuthenticated(true);
                    } else {
                        setIsAuthenticated(false);
                        ErrorHandler(response, navigate, json)
                    }
                } catch (error) {
                    setIsAuthenticated(false);
                    ErrorHandler(error, navigate)
                }
            } else {
                console.log(location.pathname);
                if (location.pathname !== '/') {
                    ErrorHandler("token_missing", navigate)
                }
                setIsAuthenticated(false);
            }
        };

        verifyToken();
    }, [token, navigate, isAuthenticated]);

    const spinnerStyle = {
        display: isAuthenticated === null ? 'flex' : 'none',
    };
    if (isAuthenticated === null) {
        return (
            <div className="spinner-container" style={spinnerStyle}>
                <div className="spinner-border"></div>
            </div>
        )
    }

    return (isAuthenticated === true) ? (children) : (<Navigate to="/signin" />);
}

export default PrivateRoute;