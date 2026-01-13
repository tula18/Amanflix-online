import React, { useState } from 'react';
import './FormGroup.css';
import { Tooltip } from 'antd';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import useFormField from './hooks/useFormField';

/**
 * PasswordFormGroup - Password input with visibility toggle
 * 
 * @param {string} label - Input label text
 * @param {string} name - Input name/id attribute
 * @param {string} value - Controlled input value
 * @param {function} onChange - Change handler
 * @param {object|string} error - Error object with field names as keys
 * @param {object|string} success - Success object with field names as keys
 * @param {boolean} disabled - Whether input is disabled
 * @param {boolean} required - Whether field is required
 * @param {number|null} maxLength - Maximum character length
 * @param {object} style - Custom styles
 * @param {string} className - Additional CSS classes
 */
const PasswordFormGroup = ({ 
    label, 
    name, 
    value, 
    onChange, 
    error, 
    success, 
    disabled = false, 
    required = false, 
    maxLength = null,
    style = {}, 
    className = '' 
}) => {
    const [passwordVisible, setPasswordVisible] = useState(false);
    
    const {
        safeValue,
        hasValue,
        isFocused,
        errorMessage,
        successMessage,
        handleFocus,
        handleBlur,
        handleChange,
        getInputClassName,
        getAriaAttributes,
    } = useFormField({ name, value, error, success, onChange });

    const togglePasswordVisibility = () => {
        setPasswordVisible(prev => !prev);
    };

    const inputClassName = getInputClassName(className);
    const ariaProps = getAriaAttributes(required);

    return (
        <div className="form-group">
            {/* Floating label */}
            <label 
                htmlFor={name} 
                className={`placeholder-label ${hasValue ? 'placeholder-label_active' : ''}`}
            >
                {label}
                {required && (
                    <span className="required-indicator">
                        <Tooltip title="Required">*</Tooltip>
                    </span>
                )}
            </label>

            {/* Character count label */}
            {maxLength !== null && (
                <label 
                    htmlFor={name} 
                    className="maxLength-label maxLength-label_active"
                >
                    ({safeValue.length} / {maxLength})
                </label>
            )}

            {/* Password input field */}
            <input
                type={passwordVisible ? 'text' : 'password'}
                id={name}
                name={name}
                value={safeValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={`${inputClassName} password-input`}
                disabled={disabled}
                placeholder={`${label}${required ? ' *' : ''}`}
                maxLength={maxLength}
                style={style}
                autoComplete="current-password"
                {...ariaProps}
            />

            {/* Password visibility toggle */}
            <button
                type="button"
                className="eye-icon-wrapper"
                onClick={togglePasswordVisibility}
                aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                tabIndex={-1}
                style={{ height: isFocused ? 50 : 45, transition: 'height 0.3s' }}
            >
                {passwordVisible ? (
                    <FaEyeSlash className="password-eye-icon" />
                ) : (
                    <FaEye className="password-eye-icon" />
                )}
            </button>

            {/* Error message */}
            {errorMessage && (
                <span 
                    id={`${name}-error`}
                    className="error-message show-error"
                    role="alert"
                >
                    {errorMessage}
                </span>
            )}

            {/* Success message */}
            {successMessage && (
                <span 
                    id={`${name}-success`}
                    className="success-message show-error"
                    role="status"
                >
                    {successMessage}
                </span>
            )}
        </div>
    );
};

export default PasswordFormGroup;