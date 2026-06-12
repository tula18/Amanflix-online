import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { LuPartyPopper } from 'react-icons/lu';
import { API_URL } from '../../config';
import './PartyJoinPage.css';

const PartyJoinPage = () => {
  const { partyCode } = useParams();
  const navigate = useNavigate();
  const [code, setCode] = useState(partyCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waitingApproval, setWaitingApproval] = useState(false);
  const [pendingCode, setPendingCode] = useState('');

  const joinParty = async (rawCode) => {
    const normalizedCode = (rawCode || '').trim().toUpperCase();
    if (!normalizedCode) {
      setError('Enter a party code');
      return;
    }

    setLoading(!waitingApproval);
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
      if (response.status === 202 || data.status === 'pending') {
        setWaitingApproval(true);
        setPendingCode(data.code || normalizedCode);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(data.message || 'Could not join this party');
      }

      setWaitingApproval(false);
      setPendingCode('');
      navigate(`/watch/${data.party.watch_id}?party=${data.party.code}`, { replace: true });
    } catch (err) {
      setWaitingApproval(false);
      setPendingCode('');
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

  useEffect(() => {
    if (!waitingApproval || !pendingCode) return;

    const intervalId = setInterval(() => {
      joinParty(pendingCode);
    }, 3000);

    return () => clearInterval(intervalId);
  }, [waitingApproval, pendingCode]);

  const handleSubmit = (event) => {
    event.preventDefault();
    joinParty(code);
  };

  return (
    <main className="partyJoinPage">
      <form className="partyJoinBox" onSubmit={handleSubmit}>
        <div className="partyJoinHeader">
          <div className="partyJoinIcon">
            <LuPartyPopper />
          </div>
          <div>
            <span className="partyJoinEyebrow">Watch Party</span>
            <h1>Join a Party</h1>
          </div>
        </div>
        <div className="partyJoinInputRow">
          <input
            value={code}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase());
              setWaitingApproval(false);
              setPendingCode('');
            }}
            placeholder="PARTY CODE"
            maxLength={12}
            autoFocus={!partyCode}
          />
          <button type="submit" disabled={loading || waitingApproval}>
            <FaArrowRight />
          </button>
        </div>
        {loading && <div className="partyJoinStatus">Joining...</div>}
        {waitingApproval && (
          <div className="partyJoinStatus approval">
            Waiting for the leader to approve your request...
          </div>
        )}
        {error && <div className="partyJoinError">{error}</div>}
      </form>
    </main>
  );
};

export default PartyJoinPage;
