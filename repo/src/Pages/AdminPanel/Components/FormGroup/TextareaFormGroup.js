import React from 'react';
import './FormGroup.css';
import { Button, Tooltip } from 'antd';

const TextareaFormGroup = ({ label, name, type = 'text', value, onChange, error, success, maxLength=null, disabled=false, required=false }) => {
    const handleChange = (e) => {
        onChange(e);
    };
    var errorMessage = (typeof(error) == "object" && Object.prototype.hasOwnProperty.call(error, name)) ? error[name] : undefined
    var successMessage = (typeof(success) == "object" && Object.prototype.hasOwnProperty.call(success, name)) ? success[name] : undefined

    const inputClass = `${errorMessage ? 'is-invalid' : ''} ${successMessage ? 'is-valid' : ''}`;
    
    return (
        <div className="form-group">
            <label htmlFor={name} className={`placeholder-label ${value ? 'placeholder-label_active' : ''}`}>
                {label} {required && (<p style={{fontSize: "1.1rem", color: 'gold', marginLeft: 5, cursor: 'help', marginBottom: 0}}><Tooltip title="Required">*</Tooltip></p>)}
            </label>
            <label htmlFor={name} className={`maxLength-label ${(maxLength !== null) ? 'maxLength-label_active' : ''}`}>
                ({value.length} / {maxLength})
            </label>
            <textarea 
                name={name}
                value={value}
                onChange={handleChange}
                className={inputClass}
                maxLength={maxLength}
                disabled={disabled}
                placeholder={`${label} ${required && ("*")}`}
                onFocus={(e) => e.target.classList.add('focused')}
                onBlur={(e) => e.target.classList.remove('focused')}
            />
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

export default TextareaFormGroup;