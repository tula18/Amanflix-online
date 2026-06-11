import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowRight, FaUsers } from 'react-icons/fa';
import { API_URL } from '../../config';
import './PartyJoinPage.css';

const PartyJoinPage = () => {
  const { partyCode } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(partyCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const joinParty = async (rawCode) => {
    const normalizedCode = (rawCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      setError('Enter a party code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/watch-party/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ code: normalizedCode })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Could not join this party');
      }

      navigate(`/watch/${data.party.watch_id}?party=${data.party.code}`, { replace: true });
    } catch (err) {
      setError(err.message || 'Could not join this party');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (partyCode) {
      setCode(partyCode);
      joinParty(partyCode);
    }
  }, [partyCode]);

  const handleSubmit = (event) => {
    event.preventDefault();
    joinParty(code);
  };

  return (
    <main className="partyJoinPage">
      <form className="partyJoinBox" onSubmit={handleSubmit}>
        <div className="partyJoinIcon">
          <FaUsers />
        </div>
        <h1>Join Watch Party</h1>
        <div className="partyJoinInputRow">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="PARTY CODE"
            maxLength={12}
            autoFocus={!partyCode}
          />
          <button type="submit" disabled={loading}>
            <FaArrowRight />
          </button>
        </div>
        {loading && <div className="partyJoinStatus">Joining...</div>}
        {error && <div className="partyJoinError">{error}</div>}
      </form>
    </main>
  );
};

export default PartyJoinPage;
