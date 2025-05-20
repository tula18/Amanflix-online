import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_URL } from '../../config';
import './Login.css'
import FormGroup from '../AdminPanel/Components/FormGroup/FormGroup';
import PasswordFormGroup from '../AdminPanel/Components/FormGroup/PasswordFormGroup';
import { Alert } from 'antd';

const Login = () => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [callErr, setCallErr] = useState(false)
  const [callErrMsg, setCallErrMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate();
  const { state } = useLocation();
  useEffect(() => {
    const message = state?.message || ""
    if (message) {
      setCallErr(true)
      setCallErrMsg(state.message)
    }
  }, [state])

  const validate = () => {
    if ((username === '' || username === null) && (password === '' || password === null)) {
      setErrorMessage("Please enter username or password")
      return false
    }
    return true
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCallErr(false)
    setCallErrMsg('')
    setErrorMessage('');
    
    if (validate()) {
      setLoading(true)
      const data = new FormData();
      data.append('username', username)
      data.append('password', password)
      try {
        const res = await fetch(`${API_URL}/api/auth/login`, {
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
          <div className='login__content'>
            <div className='login__head'><h1>Sign In</h1></div>
            <div className='login__inputs' onKeyDown={handleKeyPress}>
              <FormGroup label={"Username"} name={"username"} value={username} onChange={(e) => setUsername(e.target.value)} required />
              <PasswordFormGroup label={'Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className='login__errorMessage'>{errorMessage}</p>
              <button className='login__button' onClick={handleSubmit}>{loading ? 'Loading...' : 'Sign In'}</button>
            </div>
          </div>
          <div className='login__footer'>
            <div className='login__signup'>
              New to Amanflix? <Link className='signup__link' to='/signup'>Sign up now.</Link>
            </div>
            {callErr && <Alert message={callErrMsg} type="error" closable onClose={closeAlert} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;