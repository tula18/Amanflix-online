import React, { useEffect } from 'react'
import './ServiceDownPage.css'
import { useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../../../config';
import ErrorHandler from '../../../Utils/ErrorHandler';

const ServiceDownPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const token = localStorage.getItem('token')
    console.log(location.state);
    useEffect(() => {
        if (!location.state) {
            navigate('/')
        }
    })
    const error = {
        title: location.state?.error.title || "Title",
        message: location.state?.error.message || "Message",
        image: location.state?.error.image || null,
        with_divider: location.state?.error.with_divider || true,
        buttons: location.state?.error.buttons || [
            {
                text: "refresh",
                type: "primary",
                onClick: () => {
                    navigate(-1)
                },
            },
            {
                text: "Home",
                type: "secondery",
                onClick: () => navigate('/'),
            }
        ]
    }

    const functions = {
        refreshPage: () => {
            console.log("refreshing 123");
            navigate(-1)
            window.location.reload();
        },
        redirectLogin: () => {
            navigate('/signin');
            window.location.reload();
        },
        redirectHome: () => {
            navigate('/');
            window.location.reload();
        },
        logoutUser: async () => {
            try {
                const token = localStorage.getItem('token')
                console.log("logOut user", token);
                const res = await fetch(`${API_URL}/api/auth/logout`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                });
          
                if (res.ok) {
                  const data = await res.json()
                  console.log(data);
                  localStorage.removeItem('token')
                  window.location.reload()
                  navigate('/')
                } else {
                  const data = await res.json()
                  console.log(data);
                  ErrorHandler(res, navigate, data)
                }
              } catch (error) {
                console.error('Error validating token:', error);
              }
        }
        // logoutUser: () => {
        // }
    }

    const handleClick = (clickHandlerId) => {
        if (clickHandlerId && functions[clickHandlerId]) {
            return functions[clickHandlerId]()
        } else {
            console.error("Invalid error handler function");
        }
    }

    console.log(location.state);
    console.log(error);
    
    return (
        <div className="error-page">
            <div className="error_modal-content">
                <h4 className="error_modal-title">{error.title}</h4>
                <p>{error.message}</p>
                {error.with_divider === true && (<div className="divider"/>)}
                {error.buttons && error.buttons.length !== 0 && (
                    <div className="profile-form_buttons">
                        {error.buttons.map((props) => {
                            if (props.type === "primary") {
                                return (
                                    <button type="button" key={error.text + "1"} onClick={() => handleClick(props.onClick)} className="profile_save_btn" >
                                        {props.text}
                                    </button>
                                )
                            } else if (props.type === "secondery") {
                                return (
                                    <button type="button" key={error.text + "2"} onClick={() => handleClick(props.onClick)} className="profile_delete_btn" >
                                        {props.text}
                                    </button>
                                )
                            }
                            return false
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ServiceDownPage