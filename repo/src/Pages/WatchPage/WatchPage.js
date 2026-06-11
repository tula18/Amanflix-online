import React, { useState, useRef, useEffect } from 'react';
import './WatchPage.css';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FaArrowDown, FaBan, FaCopy, FaCrown, FaExpandAlt, FaLink, FaMinus, FaPaperPlane, FaSignOutAlt, FaSmile, FaTimes } from 'react-icons/fa';
import { LuPartyPopper } from "react-icons/lu";
import { API_URL } from '../../config';
import ErrorHandler from '../../Utils/ErrorHandler';
import ReactNetflixPlayer from '../../Components/NetflixPlayer/index.tsx';

const PARTY_REACTIONS = ['👍', '😂', '❤️', '😮', '🔥', '👏'];
const PARTY_EXPIRY_WARNING_SECONDS = 10 * 60;

const WatchPage = () => {
    const { watch_id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const videoRef = useRef(null);
    const initialSeekPerformed = useRef(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [volume, setVolume] = useState(1);
    
    // Content tracking state
    const [contentType, setContentType] = useState(null);
    const [contentId, setContentId] = useState(null);
    const [seasonNumber, setSeasonNumber] = useState(null);
    const [episodeNumber, setEpisodeNumber] = useState(null);
    const [totalDuration, setTotalDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const lastSavedTimeRef = useRef(0);
    const isSavingRef = useRef(false);
    const [startTimeFromParams, setStartTimeFromParams] = useState(null);
    const [useOldPlayer, setUseOldPlayer] = useState(false)
    const [disablePreview, setDisablePreview] = useState(true);
    const [disableBuffer, setDisableBuffer] = useState(false);

    // Watch party state
    const [party, setParty] = useState(null);
    const [partyStatus, setPartyStatus] = useState('idle');
    const [partyError, setPartyError] = useState('');
    const [partyNotice, setPartyNotice] = useState(null);
    const [partyToast, setPartyToast] = useState(null);
    const [partyPanelOpen, setPartyPanelOpen] = useState(false);
    const [partyPanelCollapsed, setPartyPanelCollapsed] = useState(false);
    const [partyExpiryRemaining, setPartyExpiryRemaining] = useState(null);
    const [isCreatingParty, setIsCreatingParty] = useState(false);
    const [chatDraft, setChatDraft] = useState('');
    const [showReactionBar, setShowReactionBar] = useState(false);
    const [typingUsers, setTypingUsers] = useState({});
    const [unreadCount, setUnreadCount] = useState(0);
    const [chatAtBottom, setChatAtBottom] = useState(true);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);
    const wsRef = useRef(null);
    const joinedPartyCodeRef = useRef(null);
    const reconnectTimeoutRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);
    const reconnectAttemptsRef = useRef(0);
    const shouldReconnectRef = useRef(false);
    const applyingRemotePlaybackRef = useRef(false);
    const partyRef = useRef(null);
    const partyExpiryAtRef = useRef(null);
    const partyNoticeTimerRef = useRef(null);
    const partyToastTimerRef = useRef(null);
    const currentPartyUserIdRef = useRef(null);
    const chatLogRef = useRef(null);
    const chatTextareaRef = useRef(null);
    const partyPanelOpenRef = useRef(false);
    const typingTimeoutsRef = useRef({});
    const typingDebounceRef = useRef(null);
    const isTypingRef = useRef(false);

    // State for player props
    const [mediaTitle, setMediaTitle] = useState('');
    const [mediaSubTitle, setMediaSubTitle] = useState('');
    const [mediaTitleMedia, setMediaTitleMedia] = useState('');
    const [mediaExtraInfoMedia, setMediaExtraInfoMedia] = useState('');
    const [mediaDataNext, setMediaDataNext] = useState(null);
    const [mediaReproductionList, setMediaReproductionList] = useState([]);
    const [isLoadingMediaData, setIsLoadingMediaData] = useState(true);

    const getPartyCodeFromUrl = () => {
        const queryParams = new URLSearchParams(location.search);
        return queryParams.get('party');
    };

    const getPartySocketUrl = (code) => {
        return `${API_URL.replace(/^http/, 'ws')}/api/watch-party/ws/${encodeURIComponent(code)}`;
    };

    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        };
    };

    const openPartyPanel = () => {
        partyPanelOpenRef.current = true;
        setPartyPanelOpen(true);
        setPartyPanelCollapsed(false);
        setUnreadCount(0);
    };

    const closePartyPanel = () => {
        partyPanelOpenRef.current = false;
        setPartyPanelOpen(false);
        setPartyPanelCollapsed(false);
    };

    const togglePartyPanelCollapsed = () => {
        setPartyPanelCollapsed((collapsed) => !collapsed);
    };

    const updatePartyExpiry = (expiresIn) => {
        const remaining = Number(expiresIn);
        if (!Number.isFinite(remaining)) return;
        const normalizedRemaining = Math.max(0, Math.ceil(remaining));
        partyExpiryAtRef.current = Date.now() + normalizedRemaining * 1000;
        setPartyExpiryRemaining(normalizedRemaining);
    };

    const showPartyNotice = (message, type = 'info') => {
        if (partyNoticeTimerRef.current) {
            clearTimeout(partyNoticeTimerRef.current);
        }
        setPartyNotice({ message, type });
        partyNoticeTimerRef.current = setTimeout(() => {
            setPartyNotice(null);
            partyNoticeTimerRef.current = null;
        }, 2600);
    };

    const showPartyToast = (message, type = 'info') => {
        if (partyToastTimerRef.current) {
            clearTimeout(partyToastTimerRef.current);
        }
        setPartyToast({ message, type });
        partyToastTimerRef.current = setTimeout(() => {
            setPartyToast(null);
            partyToastTimerRef.current = null;
        }, 5200);
    };

    const updatePartyState = (nextParty) => {
        if (!nextParty) return;
        partyRef.current = nextParty;
        if (nextParty.current_user_id) {
            currentPartyUserIdRef.current = nextParty.current_user_id;
        }
        if (typeof nextParty.expires_in === 'number') {
            updatePartyExpiry(nextParty.expires_in);
        }
        setParty(nextParty);
    };

    const closePartySocket = (allowReconnect = false) => {
        shouldReconnectRef.current = allowReconnect;
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        if (wsRef.current) {
            const socket = wsRef.current;
            wsRef.current = null;
            socket.onopen = null;
            socket.onmessage = null;
            socket.onclose = null;
            socket.onerror = null;
            try {
                socket.close();
            } catch (error) {
                console.debug('Failed to close party socket:', error);
            }
        }
    };

    const applyRemotePlayback = (playback) => {
        if (!videoRef.current || !playback) return;

        const video = videoRef.current;
        const nowSeconds = Date.now() / 1000;
        const updatedAt = Number(playback.updated_at) || nowSeconds;
        const elapsed = playback.playing ? Math.max(0, nowSeconds - updatedAt) : 0;
        const targetTime = Math.max(0, Number(playback.position || 0) + elapsed);
        const drift = Math.abs((video.currentTime || 0) - targetTime);

        applyingRemotePlaybackRef.current = true;

        try {
            if (drift > 1.25 && Number.isFinite(targetTime)) {
                video.currentTime = targetTime;
                setCurrentTime(targetTime);
            }

            if (playback.playing && video.paused) {
                video.play().catch((error) => {
                    console.debug('Remote party play was blocked:', error);
                });
            } else if (!playback.playing && !video.paused) {
                video.pause();
            }
        } finally {
            setTimeout(() => {
                applyingRemotePlaybackRef.current = false;
            }, 350);
        }
    };

    const sendPartyPlayback = (action, position, playing) => {
        const activeParty = partyRef.current;
        const socket = wsRef.current;
        const video = videoRef.current;

        if (!activeParty || !socket || socket.readyState !== WebSocket.OPEN || applyingRemotePlaybackRef.current) {
            return;
        }

        if ((action === 'seek' || action === 'sync') && !activeParty.is_leader) {
            return;
        }

        socket.send(JSON.stringify({
            type: 'playback',
            action,
            position: typeof position === 'number' ? position : (video ? video.currentTime : 0),
            playing: typeof playing === 'boolean' ? playing : (video ? !video.paused : false)
        }));
    };

    const handlePartySocketMessage = (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.debug('Invalid watch party message:', error);
            return;
        }

        if (data.type === 'ready') {
            updatePartyState(data.party);
            reconnectAttemptsRef.current = 0;
            setPartyStatus('connected');
            setPartyError('');
            openPartyPanel();

            if (data.party?.is_leader && videoRef.current) {
                setTimeout(() => {
                    const video = videoRef.current;
                    if (video) {
                        sendPartyPlayback('sync', video.currentTime, !video.paused);
                    }
                }, 250);
            } else if (data.party?.playback) {
                applyRemotePlayback(data.party.playback);
            }
            return;
        }

        if (data.type === 'party_state') {
            updatePartyState(data.party);
            return;
        }

        if (data.type === 'pong') {
            if (typeof data.expires_in === 'number') {
                updatePartyExpiry(data.expires_in);
            }
            return;
        }

        if (data.type === 'typing') {
            const typingUserId = data.user_id;
            const typingUsername = data.username;
            if (data.typing) {
                setTypingUsers((prev) => ({ ...prev, [typingUserId]: typingUsername }));
                if (typingTimeoutsRef.current[typingUserId]) {
                    clearTimeout(typingTimeoutsRef.current[typingUserId]);
                }
                typingTimeoutsRef.current[typingUserId] = setTimeout(() => {
                    setTypingUsers((prev) => { const next = { ...prev }; delete next[typingUserId]; return next; });
                    delete typingTimeoutsRef.current[typingUserId];
                }, 4000);
            } else {
                setTypingUsers((prev) => { const next = { ...prev }; delete next[typingUserId]; return next; });
                if (typingTimeoutsRef.current[typingUserId]) {
                    clearTimeout(typingTimeoutsRef.current[typingUserId]);
                    delete typingTimeoutsRef.current[typingUserId];
                }
            }
            return;
        }

        if (data.type === 'playback') {
            setParty((previousParty) => {
                if (!previousParty) return previousParty;
                const nextParty = { ...previousParty, playback: data.playback };
                partyRef.current = nextParty;
                return nextParty;
            });

            if (data.source_user_id !== currentPartyUserIdRef.current) {
                applyRemotePlayback(data.playback);
            }
            return;
        }

        if (data.type === 'chat_message') {
            setParty((previousParty) => {
                if (!previousParty) return previousParty;
                const nextChat = [...(previousParty.chat || []), data.message].slice(-100);
                const nextParty = { ...previousParty, chat: nextChat };
                partyRef.current = nextParty;
                return nextParty;
            });
            if (!partyPanelOpenRef.current) {
                setUnreadCount((prev) => prev + 1);
            }
            if (data.message?.type === 'reaction') {
                const emoji = data.message.reaction || data.message.message;
                const reactionId = Date.now() + Math.random();
                setFloatingReactions((prev) => [...prev, { id: reactionId, emoji, x: 15 + Math.random() * 70 }]);
                setTimeout(() => {
                    setFloatingReactions((prev) => prev.filter((r) => r.id !== reactionId));
                }, 2000);
            }
            return;
        }

        if (data.type === 'party_ended' || data.type === 'party_expired') {
            closePartySocket(false);
            joinedPartyCodeRef.current = null;
            setPartyStatus('ended');
            const message = data.type === 'party_ended' ? 'Party ended' : 'Party expired';
            setPartyError(message);
            showPartyToast(message, 'warning');
            setParty(null);
            partyRef.current = null;
            partyExpiryAtRef.current = null;
            setPartyExpiryRemaining(null);
            return;
        }

        if (data.type === 'kicked') {
            closePartySocket(false);
            joinedPartyCodeRef.current = null;
            setPartyStatus('ended');
            setPartyError(data.message || 'You were kicked from the party');
            showPartyToast(data.message || 'You were kicked from the party', 'error');
            setParty(null);
            partyRef.current = null;
            partyExpiryAtRef.current = null;
            setPartyExpiryRemaining(null);
            navigate(`/watch/${watch_id}`, { replace: true });
            return;
        }

        if (data.type === 'error') {
            setPartyError(data.message || 'Watch party error');
            showPartyToast(data.message || 'Watch party error', 'error');
        }
    };

    const connectPartySocket = (code) => {
        const token = localStorage.getItem('token');
        if (!token || !code) return;

        closePartySocket(true);
        shouldReconnectRef.current = true;
        setPartyStatus('connecting');

        const socket = new WebSocket(getPartySocketUrl(code));
        wsRef.current = socket;

        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'auth', token }));
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
            heartbeatIntervalRef.current = setInterval(() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'heartbeat' }));
                }
            }, 30000);
        };

        socket.onmessage = handlePartySocketMessage;

        socket.onerror = () => {
            setPartyStatus('error');
            setPartyError('Watch party connection failed');
        };

        socket.onclose = () => {
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
                heartbeatIntervalRef.current = null;
            }
            if (!shouldReconnectRef.current || joinedPartyCodeRef.current !== code) {
                return;
            }
            reconnectAttemptsRef.current += 1;
            const delay = Math.min(10000, reconnectAttemptsRef.current * 1500);
            setPartyStatus('reconnecting');
            reconnectTimeoutRef.current = setTimeout(() => connectPartySocket(code), delay);
        };
    };

    const joinPartyByCode = async (code) => {
        const normalizedCode = (code || '').trim().toUpperCase();
        if (!normalizedCode) return;

        try {
            setPartyStatus('joining');
            setPartyError('');
            const response = await fetch(`${API_URL}/api/watch-party/join`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ code: normalizedCode })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Could not join this party');
            }

            if (data.party.watch_id !== watch_id) {
                navigate(`/watch/${data.party.watch_id}?party=${data.party.code}`, { replace: true });
                return;
            }

            joinedPartyCodeRef.current = data.party.code;
            updatePartyState(data.party);
            openPartyPanel();
            connectPartySocket(data.party.code);
        } catch (error) {
            setPartyStatus('error');
            setPartyError(error.message || 'Could not join this party');
        }
    };

    const startWatchParty = async () => {
        if (!watch_id || isCreatingParty) return;

        try {
            setIsCreatingParty(true);
            setPartyError('');
            const response = await fetch(`${API_URL}/api/watch-party/create`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ watch_id })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Could not start party');
            }

            joinedPartyCodeRef.current = data.party.code;
            updatePartyState(data.party);
            openPartyPanel();
            navigate(`/watch/${watch_id}?party=${data.party.code}`, { replace: true });
            connectPartySocket(data.party.code);
        } catch (error) {
            setPartyStatus('error');
            setPartyError(error.message || 'Could not start party');
        } finally {
            setIsCreatingParty(false);
        }
    };

    const leaveWatchParty = () => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'leave' }));
        }
        closePartySocket(false);
        joinedPartyCodeRef.current = null;
        partyRef.current = null;
        partyExpiryAtRef.current = null;
        setParty(null);
        setPartyStatus('idle');
        setPartyError('');
        setPartyNotice(null);
        setPartyExpiryRemaining(null);
        navigate(`/watch/${watch_id}`, { replace: true });
    };

    const endWatchParty = async () => {
        const activeParty = partyRef.current;
        if (!activeParty?.code || !activeParty.is_leader) {
            leaveWatchParty();
            return;
        }

        try {
            await fetch(`${API_URL}/api/watch-party/${activeParty.code}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });
        } catch (error) {
            console.debug('Failed to end watch party:', error);
        } finally {
            leaveWatchParty();
        }
    };

    const copyPartyInvite = async () => {
        if (!party?.code) return;
        const inviteLink = `${window.location.origin}/party/${party.code}`;
        try {
            await navigator.clipboard.writeText(inviteLink);
            showPartyNotice('Invite link copied', 'success');
        } catch (error) {
            showPartyNotice(inviteLink, 'info');
        }
    };

    const copyPartyCode = async () => {
        if (!party?.code) return;
        try {
            await navigator.clipboard.writeText(party.code);
            showPartyNotice('Party code copied', 'success');
        } catch (error) {
            showPartyNotice(party.code, 'info');
        }
    };

    const sendChatMessage = (event) => {
        event.preventDefault();
        const message = chatDraft.trim();
        if (!message || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        wsRef.current.send(JSON.stringify({ type: 'chat', message }));
        setChatDraft('');
        setMentionOpen(false);
        sendTypingIndicator(false);
        if (chatTextareaRef.current) {
            chatTextareaRef.current.style.height = 'auto';
        }
    };

    const handleChatKeyDown = (event) => {
        if (event.key === 'Escape' && mentionOpen) {
            event.preventDefault();
            setMentionOpen(false);
            setMentionIndex(0);
            return;
        }
        if (mentionOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            const members = Array.isArray(partyRef.current?.members)
                ? partyRef.current.members
                : Object.values(partyRef.current?.members || {});
            const matches = members
                .filter(m => m.id !== currentPartyUserIdRef.current && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
                .slice(0, 5);
            if (matches.length === 0) return;
            setMentionIndex(prev =>
                event.key === 'ArrowDown'
                    ? (prev + 1) % matches.length
                    : (prev - 1 + matches.length) % matches.length
            );
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            if (mentionOpen) {
                const members = Array.isArray(partyRef.current?.members)
                    ? partyRef.current.members
                    : Object.values(partyRef.current?.members || {});
                const matches = members
                    .filter(m => m.id !== currentPartyUserIdRef.current && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
                    .slice(0, 5);
                const selected = matches[mentionIndex] || matches[0];
                if (selected) {
                    insertMention(selected.username);
                    setMentionIndex(0);
                    return;
                }
            }
            const message = chatDraft.trim();
            if (!message || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
            wsRef.current.send(JSON.stringify({ type: 'chat', message }));
            setChatDraft('');
            setMentionOpen(false);
            setMentionIndex(0);
            sendTypingIndicator(false);
            if (chatTextareaRef.current) {
                chatTextareaRef.current.style.height = 'auto';
            }
        }
    };

    useEffect(() => {
        const el = chatTextareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
    }, [chatDraft]);

    const sendPartyReaction = (reaction) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({ type: 'reaction', reaction }));
        setShowReactionBar(false);
    };

    const sendTypingIndicator = (typing) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !partyRef.current) return;
        if (isTypingRef.current === typing) return;
        isTypingRef.current = typing;
        wsRef.current.send(JSON.stringify({ type: 'typing', typing }));
    };

    const kickPartyMember = (member) => {
        if (!isPartyLeader || !member?.id || member.id === party?.current_user_id) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'kick', target_user_id: member.id }));
    };

    const handleChatScroll = () => {
        const el = chatLogRef.current;
        if (!el) return;
        setChatAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    };

    const scrollChatToBottom = () => {
        if (chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
        setChatAtBottom(true);
    };

    const insertMention = (username) => {
        const textarea = chatTextareaRef.current;
        if (!textarea) return;
        const cursorPos = textarea.selectionStart;
        const textBefore = chatDraft.slice(0, cursorPos);
        const textAfter = chatDraft.slice(cursorPos);
        const atIndex = textBefore.lastIndexOf('@');
        const newDraft = textBefore.slice(0, atIndex) + '@' + username + ' ' + textAfter;
        setChatDraft(newDraft);
        setMentionOpen(false);
        setMentionQuery('');
        textarea.focus();
    };

    const handleChatChange = (event) => {
        const value = event.target.value;
        setChatDraft(value);
        if (value.trim() && partyRef.current) {
            sendTypingIndicator(true);
            if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
            typingDebounceRef.current = setTimeout(() => sendTypingIndicator(false), 2000);
        } else {
            if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
            sendTypingIndicator(false);
        }
        const cursorPos = event.target.selectionStart;
        const textBefore = value.slice(0, cursorPos);
        const mentionMatch = textBefore.match(/@(\w*)$/);
        if (mentionMatch) {
            setMentionQuery(mentionMatch[1]);
            setMentionOpen(true);
            setMentionIndex(0);
        } else {
            setMentionOpen(false);
            setMentionQuery('');
            setMentionIndex(0);
        }
    };

    const transferPartyLeader = (member) => {
        if (!isPartyLeader || !member?.id || member.id === party?.current_user_id) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'leader_transfer',
            target_user_id: member.id
        }));
    };

    const handlePartyPlayPause = (playing, position) => {
        sendPartyPlayback(playing ? 'play' : 'pause', position, playing);
    };

    const handlePartySeek = (position) => {
        if (!partyRef.current?.is_leader) return;
        sendPartyPlayback('seek', position, videoRef.current ? !videoRef.current.paused : false);
    };

    useEffect(() => {
        const code = getPartyCodeFromUrl();

        if (!code) {
            if (joinedPartyCodeRef.current) {
                closePartySocket(false);
                joinedPartyCodeRef.current = null;
                partyRef.current = null;
                partyExpiryAtRef.current = null;
                setParty(null);
                setPartyStatus('idle');
                setPartyExpiryRemaining(null);
            }
            return;
        }

        const normalizedCode = code.trim().toUpperCase();
        if (
            joinedPartyCodeRef.current === normalizedCode &&
            partyRef.current?.watch_id === watch_id
        ) {
            return;
        }

        joinPartyByCode(normalizedCode);
    }, [location.search, watch_id]);

    useEffect(() => {
        return () => {
            closePartySocket(false);
            if (partyNoticeTimerRef.current) {
                clearTimeout(partyNoticeTimerRef.current);
            }
            if (partyToastTimerRef.current) {
                clearTimeout(partyToastTimerRef.current);
            }
            if (typingDebounceRef.current) {
                clearTimeout(typingDebounceRef.current);
            }
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

    useEffect(() => {
        if (!party?.code || !partyExpiryAtRef.current) {
            return;
        }

        const updateRemaining = () => {
            const remaining = Math.max(0, Math.ceil((partyExpiryAtRef.current - Date.now()) / 1000));
            setPartyExpiryRemaining(remaining);
        };

        updateRemaining();
        const intervalId = setInterval(updateRemaining, 1000);
        return () => clearInterval(intervalId);
    }, [party?.code]);

    useEffect(() => {
        if (!party?.code || !party.is_leader || partyStatus !== 'connected') {
            return;
        }

        const intervalId = setInterval(() => {
            const video = videoRef.current;
            if (video && !video.paused) {
                sendPartyPlayback('sync', video.currentTime, true);
            }
        }, 5000);

        return () => clearInterval(intervalId);
    }, [party?.code, party?.is_leader, partyStatus]);

    useEffect(() => {
        if (chatAtBottom && chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
    }, [party?.chat?.length]);

    // Parse the watch ID and URL parameters once
    useEffect(() => {
        if (!watch_id) return;
        
        // Parse watch ID format
        const parts = watch_id.split('-');
        
        if (parts[0] === 'm' && parts.length >= 2) {
            setContentType('movie');
            setContentId(parseInt(parts[1]));
        } else if (parts[0] === 't' && parts.length >= 4) {
            setContentType('tv');
            setContentId(parseInt(parts[1]));
            setSeasonNumber(parseInt(parts[2]));
            setEpisodeNumber(parseInt(parts[3]));
        } else {
            ErrorHandler("invalid_id_format", navigate);
        }
        
        // Get timestamp from URL parameters
        const queryParams = new URLSearchParams(location.search);
        const timestampParam = queryParams.get('timestamp');
        
        if (timestampParam) {
            const timestamp = parseFloat(timestampParam);
            if (!isNaN(timestamp) && timestamp >= 0) {
                setStartTimeFromParams(timestamp);
                initialSeekPerformed.current = false; // Reset flag when timestamp changes
            }
        } else {
            setStartTimeFromParams(null);
            initialSeekPerformed.current = false;
        }
    }, [watch_id, navigate, location.search]);

    // Fetch media details
    useEffect(() => {
        const fetchMediaData = async () => {
            if (!contentId || !contentType) return;

            setIsLoadingMediaData(true);
            const token = localStorage.getItem('token');
            if (!token) {
                ErrorHandler("token_not_found", navigate);
                setIsLoadingMediaData(false);
                return;
            }

            let contentDetailsUrl = '';
            if (contentType === 'movie') {
                contentDetailsUrl = `${API_URL}/api/movies/${contentId}`;
            } else if (contentType === 'tv') {
                contentDetailsUrl = `${API_URL}/api/shows/${contentId}`;
            }

            try {
                const response = await fetch(contentDetailsUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!response.ok) {
                    throw new Error('Failed to fetch media details');
                }
                const data = await response.json();
                console.log('API Response Data:', data); // DEBUGGING

                if (contentType === 'movie') {
                    setMediaTitle(data.title || 'Movie');
                    setMediaSubTitle(data.tagline || '');
                    setMediaTitleMedia(data.title || 'Movie');
                    // setMediaExtraInfoMedia(`Release Date: ${data.release_date}`);
                    // For movies, dataNext and reproductionList might be empty or based on recommendations (future enhancement)
                    setMediaDataNext(null); 
                    setMediaReproductionList([]);
                } else if (contentType === 'tv') {
                    setMediaTitle(data.title || 'TV Show');
                    console.log('TV Show Name:', data.title); // DEBUGGING
                    
                    // Find the current season and episode
                    const currentSeason = data.seasons?.find(s => s.season_number === seasonNumber);
                    const currentEpisode = currentSeason?.episodes?.find(ep => 
                        ep.episode_number === episodeNumber || 
                        (ep.episode_number_end && ep.episode_number <= episodeNumber && ep.episode_number_end >= episodeNumber)
                    );
                    console.log('Current Season:', currentSeason); // DEBUGGING
                    console.log('Current Episode:', currentEpisode); // DEBUGGING

                    if (currentEpisode) {
                        const epLabel = currentEpisode.episode_number_end 
                            ? `E${currentEpisode.episode_number}-${currentEpisode.episode_number_end}`
                            : `E${episodeNumber}`;
                        setMediaSubTitle(`S${seasonNumber} ${epLabel}: ${currentEpisode.title}`);
                        setMediaTitleMedia(`${data.title} - S${seasonNumber} ${epLabel}: ${currentEpisode.title}`);
                    } else {
                        setMediaSubTitle(`Season ${seasonNumber} Episode ${episodeNumber}`);
                        setMediaTitleMedia(`${data.title} - Season ${seasonNumber} Episode ${episodeNumber}`);
                    }
                    // setMediaExtraInfoMedia(`First Aired: ${data.first_air_date}`);                    // Populate reproductionList (episodes of the current season)
                    if (currentSeason && currentSeason.episodes) {
                        const episodeList = currentSeason.episodes.map(ep => {
                            const epLabel = ep.episode_number_end 
                                ? `E${ep.episode_number}-${ep.episode_number_end}`
                                : `E${ep.episode_number}`;
                            const isPlaying = ep.episode_number === episodeNumber || 
                                (ep.episode_number_end && ep.episode_number <= episodeNumber && ep.episode_number_end >= episodeNumber);
                            return {
                                id: `t-${contentId}-${currentSeason.season_number}-${ep.episode_number}`,
                                name: `${epLabel}: ${ep.title}`,
                                playing: isPlaying,
                                percent: 50,
                                seasonNumber: currentSeason.season_number,
                                episodeNumber: ep.episode_number
                                // percent: calculate from watch history if available (future enhancement)
                            };
                        });
                        setMediaReproductionList(episodeList);
                        console.log('Populated Reproduction List:', episodeList); // DEBUGGING
                    } else {
                        setMediaReproductionList([]);
                        console.log('No current season or episodes for reproduction list.'); // DEBUGGING
                    }

                    // Populate dataNext (next episode)
                    let nextEpisode;
                    if (currentSeason && currentEpisode) {
                        const currentEpisodeIndex = currentSeason.episodes.findIndex(ep => 
                            ep.episode_number === episodeNumber || 
                            (ep.episode_number_end && ep.episode_number <= episodeNumber && ep.episode_number_end >= episodeNumber)
                        );
                        if (currentEpisodeIndex !== -1 && currentEpisodeIndex < currentSeason.episodes.length - 1) {
                            nextEpisode = currentSeason.episodes[currentEpisodeIndex + 1];
                            const nextEpLabel = nextEpisode.episode_number_end
                                ? `E${nextEpisode.episode_number}-${nextEpisode.episode_number_end}`
                                : `E${nextEpisode.episode_number}`;
                            setMediaDataNext({
                                title: `Next: S${seasonNumber} ${nextEpLabel} - ${nextEpisode.title}`,
                                description: nextEpisode.overview,
                                // Add identifiers for the next episode
                                nextSeasonNumber: seasonNumber,
                                nextEpisodeNumber: nextEpisode.episode_number,
                                nextContentId: contentId
                            });
                            console.log('Next Episode Data:', { 
                                title: `Next: S${seasonNumber} E${nextEpisode.episode_number} - ${nextEpisode.title}`,
                                nextSeasonNumber: seasonNumber,
                                nextEpisodeNumber: nextEpisode.episode_number
                            }); // DEBUGGING
                        } else {
                            // Check if there's a next season
                            const nextSeason = data.seasons
                                ?.filter(s => s.season_number > seasonNumber)
                                ?.sort((a, b) => a.season_number - b.season_number)[0];
                            if (nextSeason && nextSeason.episodes && nextSeason.episodes.length > 0) {
                                const firstEpisode = nextSeason.episodes[0];
                                const nextEpLabel = firstEpisode.episode_number_end
                                    ? `E${firstEpisode.episode_number}-${firstEpisode.episode_number_end}`
                                    : `E${firstEpisode.episode_number}`;
                                setMediaDataNext({
                                    title: `Next: S${nextSeason.season_number} ${nextEpLabel} - ${firstEpisode.title}`,
                                    description: firstEpisode.overview,
                                    nextSeasonNumber: nextSeason.season_number,
                                    nextEpisodeNumber: firstEpisode.episode_number,
                                    nextContentId: contentId
                                });
                                console.log('Next Season Episode Data:', {
                                    title: `Next: S${nextSeason.season_number} E${firstEpisode.episode_number} - ${firstEpisode.title}`,
                                    nextSeasonNumber: nextSeason.season_number,
                                    nextEpisodeNumber: firstEpisode.episode_number
                                }); // DEBUGGING
                            } else {
                                setMediaDataNext(null);
                                console.log('No next episode in current season and no next season found.'); // DEBUGGING
                            }
                        }
                    } else {
                        setMediaDataNext(null);
                        console.log('No current season or episode to determine next episode.'); // DEBUGGING
                    }
                }
                setIsLoadingMediaData(false);
            } catch (error) {
                console.error('Failed to fetch media data:', error);
                ErrorHandler("media_load_error", navigate);
                setIsLoadingMediaData(false);
            }
        };

        fetchMediaData();
    }, [contentId, contentType, seasonNumber, episodeNumber, navigate]);


    // Handle initial video loading
    useEffect(() => {
        if (!startTimeFromParams) {
            loadWatchHistory();
        }
    }, [startTimeFromParams]);

    // Handle metadata loaded - this is when video is ready to seek
    const handleMetadataLoaded = () => {
        if (!videoRef.current) return;
        
        setTotalDuration(videoRef.current.duration);
        
        // Set initial playback position only once when metadata is loaded
        if (!initialSeekPerformed.current) {
            if (startTimeFromParams !== null) {
                console.log(`Setting video time to ${startTimeFromParams} seconds from URL parameter`);
                videoRef.current.currentTime = startTimeFromParams;
                setCurrentTime(startTimeFromParams);
                initialSeekPerformed.current = true;
            } else if (!startTimeFromParams) {
                // If no URL timestamp parameter, load from watch history instead
                loadWatchHistory();
            }
        }
    };

    const loadWatchHistory = async () => {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`${API_URL}/api/watch-history/get-by-id/${watch_id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.watch_timestamp && videoRef.current && !initialSeekPerformed.current) {
                    // Only set this if we haven't already performed the initial seek
                    // and if the video element is ready
                    if (videoRef.current.readyState >= 1) {
                        videoRef.current.currentTime = data.watch_timestamp;
                        setCurrentTime(data.watch_timestamp);
                        initialSeekPerformed.current = true;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load watch history:', error);
        }
    };

    // Save watch history with deduplication guards
    const saveWatchHistory = async (force = false) => {
        if (!videoRef.current || !totalDuration || !contentType || !contentId) return;
        
        const currentTime = videoRef.current.currentTime;
        
        // Don't save if we're at the beginning (avoid saving abandoned views)
        if (currentTime < 10) return;
        
        // Skip if not enough time has passed since last save (unless forced)
        if (!force && Math.abs(currentTime - lastSavedTimeRef.current) < 10) return;
        
        // Prevent concurrent saves
        if (isSavingRef.current) return;
        isSavingRef.current = true;
        
        try {
            const token = localStorage.getItem('token');
            if (!token) { isSavingRef.current = false; return; }
            
            console.debug("save time:", currentTime);
            
            const payload = {
                content_type: contentType,
                content_id: contentId,
                watch_timestamp: currentTime,
                total_duration: totalDuration
            };
            
            if (contentType === 'tv') {
                payload.season_number = seasonNumber;
                payload.episode_number = episodeNumber;
            }
            
            const response = await fetch(`${API_URL}/api/watch-history/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                lastSavedTimeRef.current = currentTime;
            }
        } catch (error) {
            console.error('Failed to save watch history:', error);
        } finally {
            isSavingRef.current = false;
        }
    };    // Handle video progress and time updates with throttling
    const lastProgressUpdate = useRef(0);
    const handleProgress = () => {
        if (videoRef.current) {
            const newTime = videoRef.current.currentTime;
            const now = Date.now();
            
            // Throttle progress updates to reduce state changes and re-renders
            if (now - lastProgressUpdate.current > 1000) { // Update max 1 time per second for better performance
                lastProgressUpdate.current = now;
                setCurrentTime(newTime);
                setProgress((newTime / videoRef.current.duration) * 100);
                
                // Check save inside the throttle so it runs at most once per second;
                // the 10-second threshold is enforced inside saveWatchHistory itself
                saveWatchHistory();
            }
        }
    };

    // Auto-save interval as a fallback (e.g. when video is paused and no timeUpdate fires)
    useEffect(() => {
        const saveInterval = setInterval(() => {
            if (videoRef.current && videoRef.current.currentTime > 0) {
                saveWatchHistory();
            }
        }, 30000); // Save every 30 seconds as a fallback
        
        return () => {
            clearInterval(saveInterval);
            // Final save when component unmounts
            if (videoRef.current && videoRef.current.currentTime > 0) {
                saveWatchHistory(true);
            }
        };
    }, [contentId, contentType, seasonNumber, episodeNumber, totalDuration]);

    // Handle errors
    const handleError = async (errorInfo) => {
        // If it's a network error (code 2), check if the video is being re-encoded
        if (errorInfo && errorInfo.code === 2) {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    const response = await fetch(`${API_URL}/api/can-watch/${watch_id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (response.status === 503) {
                        const data = await response.json();
                        if (data.reason === 'processing') {
                            ErrorHandler('video_processing', navigate);
                            return;
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to check video processing status:', err);
            }
        }
        
        // If it's a decode error (code 3), report it to the API to trigger re-encoding
        if (errorInfo && errorInfo.code === 3) {
            const token = localStorage.getItem('token');
            if (token) {
                fetch(`${API_URL}/api/report-error`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        watch_id: watch_id,
                        error_code: errorInfo.code,
                        error_message: errorInfo.message || ''
                    })
                }).catch(err => console.error('Failed to report video error:', err));
            }
        }
        
        ErrorHandler("video_error", navigate);
    };    const handleNextEpisode = () => {
        if (mediaDataNext && mediaDataNext.nextContentId && mediaDataNext.nextSeasonNumber && mediaDataNext.nextEpisodeNumber) {
            const { nextContentId, nextSeasonNumber, nextEpisodeNumber } = mediaDataNext;
            const nextWatchId = `t-${nextContentId}-${nextSeasonNumber}-${nextEpisodeNumber}`;
            console.log(`Navigating to next episode: /watch/${nextWatchId}`); // DEBUGGING
            navigate(`/watch/${nextWatchId}`, { replace: true });
        } else {
            console.log("No next episode data available to navigate."); // DEBUGGING
        }
    };

    const handleEpisodeClick = (episodeId, isCurrentEpisode) => {
        // Don't navigate if it's the current episode
        if (isCurrentEpisode) {
            console.log('Already watching this episode');
            return;
        }
        
        // Save current progress before navigating
        if (videoRef.current && videoRef.current.currentTime > 0) {
            saveWatchHistory();
        }
        
        // Navigate to the selected episode
        console.log(`Navigating to episode: /watch/${episodeId}`);
        navigate(`/watch/${episodeId}`, { replace: true });
    };

    const isInParty = Boolean(party?.code);
    const isPartyLeader = Boolean(party?.is_leader);
    const disablePartyNavigation = isInParty && !isPartyLeader;
    const partyMembers = party?.members || [];
    const partyChat = party?.chat || [];
    const partyOnlineCount = partyMembers.filter((member) => member.connected).length;
    const filteredMentionMembers = mentionOpen
        ? partyMembers
            .filter(m => m.id !== party?.current_user_id && m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()))
            .slice(0, 5)
        : [];
    const typingUsernames = Object.values(typingUsers);
    const showExpiryWarning = isInParty
        && typeof partyExpiryRemaining === 'number'
        && partyExpiryRemaining > 0
        && partyExpiryRemaining <= PARTY_EXPIRY_WARNING_SECONDS;
    const partyStatusLabel = partyStatus === 'connected'
        ? `Connected • ${partyOnlineCount} online`
        : partyStatus === 'reconnecting'
            ? 'Reconnecting • trying to restore sync'
            : partyStatus === 'joining' || partyStatus === 'connecting'
                ? 'Connecting'
                : partyStatus === 'ended'
                    ? 'Ended'
                    : partyStatus === 'error'
                        ? 'Offline'
                        : 'Idle';

    const formatPartyRemaining = (seconds) => {
        const safeSeconds = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(safeSeconds / 60);
        const remainingSeconds = safeSeconds % 60;
        if (minutes <= 0) {
            return `${remainingSeconds}s`;
        }
        return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
    };

    const formatMemberLastSeen = (lastSeen) => {
        if (!lastSeen) return 'Offline';
        const secondsAgo = Math.max(0, Math.floor(Date.now() / 1000 - Number(lastSeen)));
        if (secondsAgo < 30) return 'Just now';
        if (secondsAgo < 60) return `${secondsAgo}s ago`;
        const minutesAgo = Math.floor(secondsAgo / 60);
        if (minutesAgo < 60) return `${minutesAgo}m ago`;
        return `${Math.floor(minutesAgo / 60)}h ago`;
    };

    const getMemberConnectionLabel = (member) => {
        if (member.id === party?.current_user_id && partyStatus === 'reconnecting') {
            return 'Reconnecting';
        }
        if (member.connected) {
            return 'Online';
        }
        return `Last seen ${formatMemberLastSeen(member.last_seen)}`;
    };

    const renderMessageWithMentions = (text) => {
        if (!text || !text.includes('@')) return text;
        const selfMember = partyMembers.find(m => m.id === party?.current_user_id);
        const selfUsername = selfMember?.username || '';
        const parts = text.split(/(@\w+)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                const isSelf = selfUsername && part.slice(1).toLowerCase() === selfUsername.toLowerCase();
                return <mark key={i} className={`watchPartyMention${isSelf ? ' self' : ''}`}>{part}</mark>;
            }
            return part;
        });
    };

    const renderPartyChatMessage = (message) => {
        if (message.type === 'system') {
            return (
                <div className="watchPartyChatMessage system" key={message.id}>
                    <span>{message.message}</span>
                </div>
            );
        }

        const isOwnMessage = message.user_id === party?.current_user_id;
        const isReaction = message.type === 'reaction';

        return (
            <div
                className={`watchPartyChatMessage ${isOwnMessage ? 'own' : ''} ${isReaction ? 'reaction' : ''}`}
                key={message.id}
            >
                <div className="watchPartyChatMeta">
                    <strong>{message.username}</strong>
                    {message.created_at && (
                        <time>
                            {new Date(message.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                            })}
                        </time>
                    )}
                </div>
                <span>{isReaction ? message.reaction || message.message : renderMessageWithMentions(message.message)}</span>
            </div>
        );
    };

    const renderPartyToast = () => {
        if (partyToast) {
            return (
                <div className={`watchPartyToast ${partyToast.type}`}>
                    <span>{partyToast.message}</span>
                    {party && (
                        <button onClick={openPartyPanel}>Open</button>
                    )}
                </div>
            );
        }

        if (!showExpiryWarning) return null;

        return (
            <div className="watchPartyToast warning">
                <span>Party expires in {formatPartyRemaining(partyExpiryRemaining)}</span>
                <button onClick={openPartyPanel}>Open</button>
            </div>
        );
    };

    const renderWatchPartyPanel = () => (
        <aside className={`watchPartyPanel ${partyPanelOpen ? 'open' : ''} ${partyPanelCollapsed ? 'collapsed' : ''}`}>
            <div className="watchPartyPanelHeader">
                <div>
                    <div className="watchPartyEyebrow">Watch Party</div>
                    <div className="watchPartyTitle">{party?.code || 'Start a party'}</div>
                </div>
                <div className="watchPartyHeaderButtons">
                    <button
                        className="watchPartyIconButton"
                        onClick={togglePartyPanelCollapsed}
                        title={partyPanelCollapsed ? 'Expand' : 'Collapse'}
                    >
                        {partyPanelCollapsed ? <FaExpandAlt /> : <FaMinus />}
                    </button>
                    <button className="watchPartyIconButton" onClick={closePartyPanel} title="Close">
                        <FaTimes />
                    </button>
                </div>
            </div>

            <div className={`watchPartyStatus ${partyStatus}`}>
                <span />
                {partyStatusLabel}
            </div>

            {!partyPanelCollapsed && (
                <>
                    {!party && (
                        <div className="watchPartyEmpty">
                            <button className="watchPartyPrimaryButton" onClick={startWatchParty} disabled={isCreatingParty}>
                                <LuPartyPopper />
                                {isCreatingParty ? 'Starting...' : 'Start Party'}
                            </button>
                            <button className="watchPartySecondaryButton" onClick={() => navigate('/party')}>
                                Join By Code
                            </button>
                        </div>
                    )}

                    {party && (
                        <>
                            <div className="watchPartyActions">
                                <button className="watchPartySecondaryButton" onClick={copyPartyInvite}>
                                    <FaLink />
                                    Copy Link
                                </button>
                                <button className="watchPartySecondaryButton" onClick={copyPartyCode}>
                                    <FaCopy />
                                    Copy Code
                                </button>
                                <button
                                    className={isPartyLeader ? 'watchPartyDangerButton' : 'watchPartySecondaryButton'}
                                    onClick={isPartyLeader ? endWatchParty : leaveWatchParty}
                                >
                                    <FaSignOutAlt />
                                    {isPartyLeader ? 'End' : 'Leave'}
                                </button>
                            </div>

                            <section className="watchPartySection">
                                <div className="watchPartySectionTitle">Members</div>
                                <div className="watchPartyMembers">
                                    {partyMembers.map((member) => (
                                        <div className="watchPartyMember" key={member.id} title={getMemberConnectionLabel(member)}>
                                            <div className="watchPartyMemberInfo">
                                                <span className={member.connected ? 'online' : ''} />
                                                <div className="watchPartyMemberText">
                                                    <strong>{member.username}</strong>
                                                </div>
                                            </div>
                                            <div className="watchPartyMemberActions">
                                                {member.is_leader && (
                                                    <span className="watchPartyLeaderBadge" title="Leader">
                                                        <FaCrown />
                                                    </span>
                                                )}
                                                {isPartyLeader && !member.is_leader && member.connected && member.id !== party.current_user_id && (
                                                    <button
                                                        className="watchPartyMakeLeaderButton"
                                                        onClick={() => transferPartyLeader(member)}
                                                    >
                                                        Make Leader
                                                    </button>
                                                )}
                                                {isPartyLeader && !member.is_leader && member.id !== party.current_user_id && (
                                                    <button
                                                        className="watchPartyKickButton"
                                                        onClick={() => kickPartyMember(member)}
                                                        title={`Kick ${member.username}`}
                                                    >
                                                        <FaBan />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <section className="watchPartySection watchPartyChatSection">
                                <div className="watchPartySectionTitle">Chat</div>
                                <div className="watchPartyChatLogWrapper">
                                    <div className="watchPartyChatLog" ref={chatLogRef} onScroll={handleChatScroll}>
                                        {partyChat.length === 0 && <div className="watchPartyChatEmpty">No messages yet</div>}
                                        {partyChat.map(renderPartyChatMessage)}
                                    </div>
                                    {!chatAtBottom && (
                                        <button type="button" className="watchPartyChatScrollBtn" onClick={scrollChatToBottom} title="Scroll to bottom">
                                            <FaArrowDown />
                                        </button>
                                    )}
                                </div>
                                {typingUsernames.length > 0 && (
                                    <div className="watchPartyTypingIndicator">
                                        <span className="watchPartyTypingDots"><span /><span /><span /></span>
                                        {typingUsernames.join(', ')} {typingUsernames.length === 1 ? 'is' : 'are'} typing
                                    </div>
                                )}
                                {showReactionBar && (
                                    <div className="watchPartyReactionBar" aria-label="Chat reactions">
                                        {PARTY_REACTIONS.map((reaction) => (
                                            <button
                                                key={reaction}
                                                type="button"
                                                onClick={() => sendPartyReaction(reaction)}
                                                disabled={partyStatus !== 'connected'}
                                            >
                                                {reaction}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <div className="watchPartyChatInputArea">
                                    {mentionOpen && filteredMentionMembers.length > 0 && (
                                        <div className="watchPartyMentionDropdown">
                                            {filteredMentionMembers.map((member, idx) => (
                                                <button
                                                    key={member.id}
                                                    type="button"
                                                    className={`watchPartyMentionItem${idx === mentionIndex ? ' active' : ''}`}
                                                    onMouseDown={(e) => { e.preventDefault(); insertMention(member.username); }}
                                                >
                                                    @{member.username}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <form className="watchPartyChatForm" onSubmit={sendChatMessage}>
                                    <textarea
                                        ref={chatTextareaRef}
                                        value={chatDraft}
                                        onChange={handleChatChange}
                                        onKeyDown={handleChatKeyDown}
                                        onBlur={() => setTimeout(() => setMentionOpen(false), 200)}
                                        maxLength={500}
                                        placeholder="Message"
                                        rows={1}
                                    />
                                    <button
                                        type="button"
                                        className={`watchPartyEmojiToggle${showReactionBar ? ' active' : ''}`}
                                        onClick={() => setShowReactionBar(v => !v)}
                                        title="Reactions"
                                    >
                                        <FaSmile />
                                    </button>
                                    <button type="submit" disabled={!chatDraft.trim()} title="Send">
                                        <FaPaperPlane />
                                    </button>
                                </form>
                                </div>
                            </section>
                        </>
                    )}
                </>
            )}

            {showExpiryWarning && (
                <div className="watchPartyExpiryInline">
                    Party expires in {formatPartyRemaining(partyExpiryRemaining)}
                </div>
            )}
            {partyNotice && <div className={`watchPartyNotice ${partyNotice.type}`}>{partyNotice.message}</div>}
            {partyError && <div className="watchPartyError">{partyError}</div>}
        </aside>
    );

    if (isLoadingMediaData && !useOldPlayer) {
        return <div className="watchPageLoading">Loading player data...</div>; // Or a proper loading spinner
    }

    return (
        <div className={`watchPageContainer ${useOldPlayer ? 'use-old-player' : ''}`}>
            {renderWatchPartyPanel()}
            {renderPartyToast()}
            {floatingReactions.length > 0 && (
                <div className="watchPartyFloatingReactions" aria-hidden="true">
                    {floatingReactions.map((r) => (
                        <span key={r.id} className="watchPartyFloatingReaction" style={{ left: `${r.x}%` }}>
                            {r.emoji}
                        </span>
                    ))}
                </div>
            )}

            <div className="watchPlayerShell">
            {useOldPlayer ? (
                <video
                    ref={videoRef}
                    src={`${API_URL}/api/stream/${watch_id}`}
                    controls={true}
                    onError={(e) => {
                        const vid = e.target;
                        const mediaError = vid?.error;
                        handleError({
                            code: mediaError?.code,
                            message: mediaError?.message,
                        });
                    }}
                    onTimeUpdate={handleProgress}
                    onLoadedMetadata={handleMetadataLoaded}
                    autoPlay
                    width="100%"
                    height="100%"
                />
            ) : (                <ReactNetflixPlayer 
                    src={`${API_URL}/api/stream/${watch_id}`}
                    onErrorVideo={handleError}
                    onTimeUpdate={handleProgress}
                    onLoadedMetadata={handleMetadataLoaded}
                    autoPlay
                    backButton={() => navigate(`/${contentId}`)}
                    disablePreview={disablePreview}
                    disableBufferPreview={disableBuffer}
                    primaryColor='#e50914'
                    title={mediaTitle}
                    subTitle={mediaSubTitle}
                    titleMedia={mediaTitleMedia}
                    extraInfoMedia={mediaExtraInfoMedia}
                    dataNext={mediaDataNext}
                    reproductionList={mediaReproductionList}
                    onClickItemListReproduction={handleEpisodeClick}
                    videoRef={videoRef}
                    onPlayPause={handlePartyPlayPause}
                    onSeek={handlePartySeek}
                    onWatchPartyClick={openPartyPanel}
                    watchPartyActive={isInParty}
                    watchPartyLabel={isInParty ? `Party ${party.code}` : 'Watch Party'}
                    watchPartyUnreadCount={unreadCount}
                    disableSeeking={disablePartyNavigation}
                    disableNextControls={disablePartyNavigation}
                    disableReproductionList={disablePartyNavigation}
                    onNextClick={mediaDataNext ? handleNextEpisode : undefined} // Pass the handler
                />
            )}
            </div>
        </div>
    );
};

export default WatchPage;
