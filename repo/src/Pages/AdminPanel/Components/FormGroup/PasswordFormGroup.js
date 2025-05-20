import React, {useState} from 'react';
import './FormGroup.css';
import { Tooltip } from 'antd';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';

const PasswordFormGroup = ({ label, name, value, onChange, error, success, disabled=false, required=false, style={}, className="" }) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [focused, setFocused] = useState(false);
    const handleChange = (e) => {
        onChange(e);
    };
    
    var errorMessage = (typeof(error) == "object" && Object.prototype.hasOwnProperty.call(error, name)) ? error[name] : undefined
    var successMessage = (typeof(success) == "object" && Object.prototype.hasOwnProperty.call(success, name)) ? success[name] : undefined

    const inputClass = ` ${errorMessage ? 'is-invalid' : ''} ${successMessage ? 'is-valid' : ''} ${className}`;
    
    return (
        <div className="form-group">
            <label htmlFor={name} className={`placeholder-label ${value ? 'placeholder-label_active' : ''}`}>
                {label} {required && (<p style={{fontSize: "1.1rem", color: 'gold', marginLeft: 5, cursor: 'help', marginBottom: 0}}><Tooltip title="Required">*</Tooltip></p>)}
            </label>
            <input
                type={passwordVisible ? 'text' : 'password'}
                name={name}
                value={value}
                onChange={handleChange}
                className={inputClass}
                disabled={disabled}
                alt='Password'
                style={style}
                placeholder={`${label} ${required && ("*")}`}
                onFocus={(e) => {
                    e.target.classList.add('focused')
                    setFocused(true)
                }}
                onBlur={(e) => {
                    e.target.classList.remove('focused')
                    setFocused(false)
                }}
            />
            <span className="eye-icon-wrapper" style={{height: focused ? 50 : 45, transition: 'all 0.3s'}}>
                {passwordVisible ? <FaEyeSlash className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} /> : <FaEye className="password-eye-icon" onClick={() => setPasswordVisible(!passwordVisible)} />}
            </span>
            {errorMessage && (
                <span className="error-message show-error">
                    {errorMessage}
                </span>
            )}
            {successMessage && (
                <span className="error-message show-error">
                    {successMessage}
                </span>
            )}
        </div>
    )
}

export default PasswordFormGroup;