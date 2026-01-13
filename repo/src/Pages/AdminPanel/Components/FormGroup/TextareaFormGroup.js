import React from 'react';
import './FormGroup.css';
import { Tooltip } from 'antd';
import useFormField from './hooks/useFormField';

/**
 * TextareaFormGroup - Multi-line text input component
 * 
 * @param {string} label - Input label text
 * @param {string} name - Input name/id attribute
 * @param {string} value - Controlled input value
 * @param {function} onChange - Change handler
 * @param {object|string} error - Error object with field names as keys
 * @param {object|string} success - Success object with field names as keys
 * @param {number|null} maxLength - Maximum character length
 * @param {boolean} disabled - Whether input is disabled
 * @param {boolean} required - Whether field is required
 * @param {number} rows - Number of visible text rows
 * @param {object} style - Custom styles
 * @param {string} className - Additional CSS classes
 */
const TextareaFormGroup = ({ 
    label, 
    name, 
    value, 
    onChange, 
    error, 
    success, 
    maxLength = null, 
    disabled = false, 
    required = false,
    rows = 4,
    style = {},
    className = ''
}) => {
    const {
        safeValue,
        hasValue,
        errorMessage,
        successMessage,
        handleFocus,
        handleBlur,
        handleChange,
        getInputClassName,
        getAriaAttributes,
    } = useFormField({ name, value, error, success, onChange });

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

            {/* Textarea field */}
            <textarea 
                id={name}
                name={name}
                value={safeValue}
                onChange={handleChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={inputClassName}
                maxLength={maxLength}
                disabled={disabled}
                placeholder={`${label}${required ? ' *' : ''}`}
                rows={rows}
                style={style}
                {...ariaProps}
            />

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

export default TextareaFormGroup;