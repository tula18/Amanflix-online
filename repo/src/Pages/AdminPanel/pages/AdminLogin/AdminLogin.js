import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa6';
// import './Login.css'
import { API_URL } from '../../../../config';
import FormGroup from '../../Components/FormGroup/FormGroup';
import PasswordFormGroup from '../../Components/FormGroup/PasswordFormGroup';
import { Alert } from 'antd';

const AdminLogin = () => {
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
      console.log("theres a message", state.message);
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

  async function handleSubmit(e) {
    e.preventDefault();
    setCallErr(false);
    setCallErrMsg('');
    setErrorMessage('');

    if (validate()) {
        try {
            setLoading(true);
            const data = new FormData();
            data.append('username', username);
            data.append('password', password);

            const response = await fetch(`${API_URL}/api/admin/login`, {
                method: 'POST',
                body: data
            });

            if (response.status === 200) {
                const json = await response.json();
                localStorage.setItem('admin_token', json.api_key);
                setCallErr(true);
                setCallErrMsg('Login successful');
                setLoading(false);
                navigate('/admin');
            } else {
                const json = await response.json();
                setCallErr(true);
                setCallErrMsg(json.message);
                setLoading(false);
            }
        } catch (error) {
            setCallErr(true);
            setCallErrMsg(error.message);
            setLoading(false);
        }
    }
    setLoading(false);
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
            <div className='login__head'><h1>Admin Sign In</h1></div>
            <div className='login__inputs' onKeyDown={handleKeyPress}>
              <FormGroup label={"Username"} name={"username"} value={username} onChange={(e) => setUsername(e.target.value)} required />
              <PasswordFormGroup label={'Password'} name="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <p className='login__errorMessage'>{errorMessage}</p>
              <button className='login__button' onClick={handleSubmit}>{loading ? 'Loading...' : 'Sign In'}</button>
            </div>
          </div>
          <div className='login__footer'>
            <div className='login__signup'>
              <Link className='signup__link' to='/'>Go Back.</Link>
            </div>
            {callErr && <Alert message={callErrMsg} type="error" closable onClose={closeAlert} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;