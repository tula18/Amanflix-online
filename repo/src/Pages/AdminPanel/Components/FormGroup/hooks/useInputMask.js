import { useCallback } from 'react';

/**
 * Hook for input masking functionality
 * Supports common formats: phone, credit card, date, custom patterns
 */

// Predefined mask patterns
const MASK_PATTERNS = {
    phone: '(###) ###-####',
    'phone-international': '+# (###) ###-####',
    'credit-card': '#### #### #### ####',
    date: '##/##/####',
    'date-short': '##/##/##',
    ssn: '###-##-####',
    zip: '#####',
    'zip-extended': '#####-####',
};

/**
 * Apply mask to input value
 * @param {string} value - Raw input value
 * @param {string} mask - Mask pattern (# for digit, A for letter, * for any)
 * @returns {string} - Masked value
 */
const applyMask = (value, mask) => {
    if (!mask) return value;
    
    // Remove all non-alphanumeric characters from value
    const cleanValue = value.replace(/[^\w]/gi, '');
    let maskedValue = '';
    let valueIndex = 0;
    
    for (let i = 0; i < mask.length && valueIndex < cleanValue.length; i++) {
        const maskChar = mask[i];
        const valueChar = cleanValue[valueIndex];
        
        if (maskChar === '#') {
            // Digit only
            if (/\d/.test(valueChar)) {
                maskedValue += valueChar;
                valueIndex++;
            } else {
                break;
            }
        } else if (maskChar === 'A') {
            // Letter only
            if (/[a-zA-Z]/.test(valueChar)) {
                maskedValue += valueChar;
                valueIndex++;
            } else {
                break;
            }
        } else if (maskChar === '*') {
            // Any character
            maskedValue += valueChar;
            valueIndex++;
        } else {
            // Mask character (separator)
            maskedValue += maskChar;
        }
    }
    
    return maskedValue;
};

/**
 * Remove mask from value to get raw data
 * @param {string} value - Masked value
 * @returns {string} - Unmasked value (only alphanumeric)
 */
const removeMask = (value) => {
    return value.replace(/[^\w]/gi, '');
};

const useInputMask = (mask, returnUnmasked = false) => {
    // Get actual mask pattern
    const maskPattern = MASK_PATTERNS[mask] || mask;
    
    /**
     * Handle masked input change
     * @param {string} rawValue - Raw input value
     * @param {function} onChange - Original onChange handler
     * @param {string} name - Input name
     */
    const handleMaskedChange = useCallback((rawValue, onChange, name) => {
        if (!maskPattern) {
            // No mask, pass through
            if (onChange) {
                onChange({ target: { name, value: rawValue } });
            }
            return rawValue;
        }
        
        const maskedValue = applyMask(rawValue, maskPattern);
        const unmaskedValue = removeMask(maskedValue);
        
        if (onChange) {
            // Return unmasked or masked value based on preference
            onChange({ 
                target: { 
                    name, 
                    value: returnUnmasked ? unmaskedValue : maskedValue 
                } 
            });
        }
        
        return maskedValue;
    }, [maskPattern, returnUnmasked]);
    
    /**
     * Get masked version of a value
     */
    const getMaskedValue = useCallback((value) => {
        if (!value || !maskPattern) return value;
        return applyMask(value, maskPattern);
    }, [maskPattern]);
    
    return {
        handleMaskedChange,
        getMaskedValue,
        hasMask: Boolean(maskPattern),
    };
};

export default useInputMask;
