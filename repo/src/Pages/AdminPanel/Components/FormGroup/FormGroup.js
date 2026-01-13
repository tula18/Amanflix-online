import React from 'react';
import './FormGroup.css';
import { Button, Tooltip, Spin } from 'antd';
import { FaXmark } from 'react-icons/fa6';
import useFormField from './hooks/useFormField';
import useInputMask from './hooks/useInputMask';

/**
 * FormGroup - Reusable form input component
 * 
 * @param {string} label - Input label text
 * @param {string} name - Input name/id attribute
 * @param {string} type - Input type (text, number, date, email, etc.)
 * @param {string} value - Controlled input value
 * @param {function} onChange - Change handler
 * @param {object|string} error - Error object with field names as keys, or error message
 * @param {object|string} success - Success object with field names as keys, or success message
 * @param {boolean} disabled - Whether input is disabled
 * @param {boolean} required - Whether field is required
 * @param {number} min - Minimum value (for number inputs)
 * @param {number} step - Step value (for number inputs)
 * @param {number|null} maxLength - Maximum character length
 * @param {boolean} showBtn - Whether to show action button
 * @param {function} btnOnClick - Button click handler
 * @param {string} btnText - Button text
 * @param {boolean} loading - Show loading spinner
 * @param {boolean} clearable - Show clear button when input has value
 * @param {function} onClear - Clear button handler (if not provided, clears value automatically)
 * @param {string} mask - Input mask pattern (phone, credit-card, date, or custom pattern)
 * @param {boolean} returnUnmasked - Return unmasked value in onChange (default: false)
 * @param {object} style - Custom styles
 * @param {string} className - Additional CSS classes
 */
const FormGroup = ({ 
    label, 
    name, 
    type = 'text', 
    value, 
    onChange, 
    error, 
    success, 
    disabled = false, 
    required = false, 
    min = 0, 
    step = 1, 
    maxLength = null, 
    showBtn = false, 
    btnOnClick, 
    btnText,
    loading = false,
    clearable = false,
    onClear,
    mask,
    returnUnmasked = false,
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

    // Input masking hook
    const { handleMaskedChange, getMaskedValue, hasMask } = useInputMask(mask, returnUnmasked);

    // Handle input change with optional masking
    const handleInputChange = (e) => {
        if (hasMask) {
            handleMaskedChange(e.target.value, onChange, name);
        } else {
            handleChange(e);
        }
    };

    // Handle clear button click
    const handleClearClick = () => {
        if (onClear) {
            onClear();
        } else if (onChange) {
            onChange({ target: { name, value: '' } });
        }
    };

    // For date inputs, always show the label
    const showPlaceholderLabel = hasValue || type === 'date';
    const inputClassName = getInputClassName(className);
    const ariaProps = getAriaAttributes(required);
    
    // Display value (apply mask if needed)
    const displayValue = hasMask ? getMaskedValue(safeValue) : safeValue;
    
    // Show clear/loading buttons
    const showClearButton = clearable && hasValue && !disabled && !loading;
    const showLoadingSpinner = loading && !disabled;

    return (
        <div className="form-group">
            {/* Floating label */}
            <label 
                htmlFor={name} 
                className={`placeholder-label ${showPlaceholderLabel ? 'placeholder-label_active' : ''}`}
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

            {/* Input field */}
            <input 
                type={type}
                id={name}
                name={name}
                value={displayValue}
                onChange={handleInputChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className={inputClassName}
                disabled={disabled}
                placeholder={`${label}${required ? ' *' : ''}`}
                min={min}
                step={step}
                maxLength={maxLength}
                style={style}
                {...ariaProps}
            />

            {/* Loading spinner */}
            {showLoadingSpinner && (
                <span className="input-icon loading-icon">
                    <Spin size="small" />
                </span>
            )}

            {/* Clear button */}
            {showClearButton && (
                <button
                    type="button"
                    className="input-icon clear-button"
                    onClick={handleClearClick}
                    aria-label="Clear input"
                    tabIndex={-1}
                >
                    <FaXmark />
                </button>
            )}

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

            {/* Optional action button */}
            {showBtn && (
                <span className="show_image">
                    <Button onClick={btnOnClick} type="link">{btnText}</Button>
                </span>
            )}
        </div>
    );
};

export default FormGroup;