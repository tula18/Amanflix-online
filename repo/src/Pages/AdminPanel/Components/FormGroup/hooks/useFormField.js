import { useState, useCallback, useMemo } from 'react';

/**
 * Shared hook for form field logic
 * Handles focus state, error/success messages, and value processing
 */
const useFormField = ({ name, value, error, success, onChange }) => {
    const [isFocused, setIsFocused] = useState(false);

    // Safe value - always returns a string
    const safeValue = useMemo(() => value ?? '', [value]);

    // Extract error message from error object or string
    const errorMessage = useMemo(() => {
        if (typeof error === 'object' && error !== null && Object.prototype.hasOwnProperty.call(error, name)) {
            return error[name];
        }
        return undefined;
    }, [error, name]);

    // Extract success message from success object or string
    const successMessage = useMemo(() => {
        if (typeof success === 'object' && success !== null && Object.prototype.hasOwnProperty.call(success, name)) {
            return success[name];
        }
        return undefined;
    }, [success, name]);

    // Determine if placeholder label should be visible
    const hasValue = useMemo(() => Boolean(safeValue), [safeValue]);

    // Build input class names based on state
    const getInputClassName = useCallback((additionalClasses = '') => {
        const classes = [];
        if (errorMessage) classes.push('is-invalid');
        if (successMessage) classes.push('is-valid');
        if (isFocused) classes.push('focused');
        if (additionalClasses) classes.push(additionalClasses);
        return classes.join(' ').trim();
    }, [errorMessage, successMessage, isFocused]);

    // Handle focus event
    const handleFocus = useCallback((e) => {
        setIsFocused(true);
    }, []);

    // Handle blur event
    const handleBlur = useCallback((e) => {
        setIsFocused(false);
    }, []);

    // Handle change event - wrapper that ensures event is passed correctly
    const handleChange = useCallback((e) => {
        if (onChange) {
            onChange(e);
        }
    }, [onChange]);

    // Get accessibility attributes
    const getAriaAttributes = useCallback((required = false) => ({
        'aria-invalid': errorMessage ? 'true' : undefined,
        'aria-required': required ? 'true' : undefined,
        'aria-describedby': errorMessage ? `${name}-error` : successMessage ? `${name}-success` : undefined,
    }), [name, errorMessage, successMessage]);

    return {
        // State
        isFocused,
        safeValue,
        hasValue,
        errorMessage,
        successMessage,
        
        // Handlers
        handleFocus,
        handleBlur,
        handleChange,
        
        // Utilities
        getInputClassName,
        getAriaAttributes,
    };
};

export default useFormField;
