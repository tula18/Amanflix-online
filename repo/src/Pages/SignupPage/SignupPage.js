import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
import { API_URL } from '../../config';
import FormGroup from '../AdminPanel/Components/FormGroup/FormGroup';
import PasswordFormGroup from '../AdminPanel/Components/FormGroup/PasswordFormGroup';
import { Alert } from 'antd';

const Signup = () => {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [callErr, setCallErr] = useState(false)
  const [callErrMsg, setCallErrMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [inputErrors, setInputErrors] = useState({});
  const navigate = useNavigate();
  const { state } = useLocation();
  useEffect(() => {
    const message = state?.message || ""
    if (message) {
      setCallErr(true)
      setCallErrMsg(state.message)
    }
  }, [state])

  const validateInputs = (name, value) => {
    let errorMessage = '';
    
    switch (name) {
      case "username":
        if (!value) {
          errorMessage = 'Username cannot be empty';
        }
        break;
      case "email":
        // Only validate email if it's provided (email is optional)
        if (value && value.trim() !== '') {
          const pattern = /^[\w._%+-]+@services\.idf$/i;
          if (!pattern.test(value)) {
            errorMessage = 'Invalid Email (T123456@services.idf)';
          }
        }
        break;
      case "password":
        if (!value) {
          errorMessage = 'Password cannot be empty';
        } else if (value.length < 8) {
          errorMessage = 'Password should be at least 8 characters';
        }
        console.log(`Password validation: value="${value}", length=${value.length}, error="${errorMessage}"`);
        break;
      default:
        break;
    }
    console.log(`Validating ${name} with value: ${value}, error: ${errorMessage}`);
    setInputErrors((prevErrors) => {
      const newErrors = {
        ...prevErrors,
        [name]: errorMessage
      };
      console.log(`Updated inputErrors for ${name}:`, newErrors);
      return newErrors;
    });
    return { isValid: errorMessage === '', error: errorMessage };
  }

  const validateForm = () => {
    const newInputErrors = {};
    let FormisValid = true;
    const data = {
      username: username,
      password: password,
    }
    
    if (email && email.trim() !== '') {
      data.email = email;
    }
    
    for (const key in data) {
      const validationResult = validateInputs(key, data[key]);
      if (!validationResult.isValid) {
        newInputErrors[key] = validationResult.error
        FormisValid = false;
      } else {
        newInputErrors[key] = ''; // Clear any existing errors
      }
    }

    return FormisValid
  }

  const getUsernameValue = (e) => {
    setUsername(e.target.value)
  }

  const getEmailValue = (e) => {
    setEmail(e.target.value)
  }
  const getPasswordValue = (e) => {
    setPassword(e.target.value)
  }
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setCallErr(false)
    setCallErrMsg('')
    setError(false)
    setErrorMessage("")
    const isValid = validateForm()
    if (isValid) {
      setLoading(true)
      const data = new FormData();
      data.append('username', username)
      // Only include email if it's provided (since it's optional)
      if (email && email.trim() !== '') {
        data.append('email', email)
      }
      data.append('password', password)
      try {
        const res = await fetch(`${API_URL}/api/auth/register`, {
          method: "POST",
          body: data
        })
        const json = await res.json()
        if (res.ok) {
          localStorage.setItem('token', json.api_key)
          setCallErr(true)
          setCallErrMsg(String(json.message))
          setLoading(false);
          navigate('/')
        } else {
          console.log(json);
          setCallErr(true)
          setCallErrMsg(String(json.message))
          setLoading(false);
        }
      } catch (err) {
        console.log(String(err));
        setCallErr(true)
        setCallErrMsg(String(err))
        setLoading(false);
      }
    } else {
      setCallErr(true)
      setCallErrMsg('Please fill in the required fields!')
    }
    setLoading(false)
  }

  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setLoading(true)
      handleSubmit(event)
    }
  };

  const closeAlert = () => {
    setCallErr(false);
    setCallErrMsg('');
  };

  return (
    <div className='login' style={{backgroundImage: `url('${API_URL}/cdn/images/login_background.jpg')`}}>
      <div className='login__cover'>
        <div className='login__container'>
          <form className='signup__content'>
            <div className='login__head'><h1>Sign Up</h1></div>
            <div className='login__inputs' onKeyDown={handleKeyPress}>              <FormGroup label={"Username"} name={"username"} value={username} onChange={getUsernameValue} error={inputErrors} required />
              <FormGroup label={"Email (T123456@services.idf) - Optional"} name={"email"} value={email} onChange={getEmailValue} error={inputErrors} />
              <PasswordFormGroup label={'Password'} name="password" value={password} onChange={getPasswordValue} error={inputErrors} required />
              <p className='login__errorMessage'>{errorMessage}</p>
              <button className='login__button' onClick={handleSubmit}>{loading ? 'Loading...' : 'Sign Up'}</button>
            </div>
          </form>
          <div className='login__footer'>
            <div className='login__signup'>
              Already a user? <Link className='signup__link' to='/signin'>Sign in now.</Link>
            </div>
            {callErr && <Alert message={callErrMsg} type="error" closable onClose={closeAlert} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;