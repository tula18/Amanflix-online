import React from 'react';
import './FormGroup.css';
import { Button, Tooltip } from 'antd';

const FormGroup = ({ label, name, type = 'text', value, onChange, error, success, disabled=false, required=false, min=0, step=1, maxLength=null, showBtn=false, btnOnClick, btnText, style={}, className="" }) => {
    const handleChange = (e) => {
        onChange(e);
    };
    var errorMessage = (typeof(error) == "object" && Object.prototype.hasOwnProperty.call(error, name)) ? error[name] : undefined
    var successMessage = (typeof(success) == "object" && Object.prototype.hasOwnProperty.call(success, name)) ? success[name] : undefined

    const inputClass = `${errorMessage ? 'is-invalid' : ''} ${successMessage ? 'is-valid' : ''} ${className}`;
    
    return (
        <div className="form-group">
            <label htmlFor={name} className={`placeholder-label ${(value || type === 'date') ? 'placeholder-label_active' : ''}`}>
                {label} {required && (<p style={{fontSize: "1.1rem", color: 'gold', marginLeft: 5, cursor: 'help', marginBottom: 0}}><Tooltip title="Required">*</Tooltip></p>)}
            </label>
            <label htmlFor={name} className={`maxLength-label ${(maxLength !== null) ? 'maxLength-label_active' : ''}`}>
                ({(value ?? "").length} / {maxLength})
            </label>
            <input 
                type={type}
                min={min}
                step={step}
                maxLength={maxLength}
                id={name}
                name={name}
                style={style}
                value={value}
                onChange={handleChange}
                className={inputClass}
                disabled={disabled}
                placeholder={`${label} ${required ? ("*") : ("")}`}
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
            {showBtn && (
                <span className="show_image">
                    <Button onClick={btnOnClick} type="link">{btnText}</Button>
                </span>
            )}
        </div>
    )
}

export default FormGroup;