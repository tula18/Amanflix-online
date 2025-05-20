import React, { useEffect } from 'react'
import './NotFoundPage.css'
import { useNavigate } from 'react-router-dom'
import ErrorHandler from '../../../Utils/ErrorHandler';

const NotFoundPage = () => {
    const navigate = useNavigate();

    useEffect(() => {
        ErrorHandler("not_found", navigate)
    })

    return (
        <div className='NotFoundPage'>
            <h1>not found</h1>
        </div>
    )
}

export default NotFoundPage