import React, { useState, useRef, useEffect, useCallback } from 'react';
import './WatchPage.css';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { FaArrowDown, FaBan, FaCog, FaCopy, FaCrown, FaEllipsisV, FaExpandAlt, FaLink, FaMinus, FaPaperPlane, FaSignal, FaSignOutAlt, FaSmile, FaSyncAlt, FaThumbtack, FaTimes, FaTrashAlt, FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { LuPartyPopper } from "react-icons/lu";
import { API_URL } from '../../config';
import ErrorHandler from '../../Utils/ErrorHandler';
import ReactNetflixPlayer from '../../Components/NetflixPlayer/index.tsx';

const PARTY_REACTIONS = ['👍', '😂', '❤️', '😮', '🔥', '👏'];
const PARTY_EXPIRY_WARNING_SECONDS = 10 * 60;
const DEFAULT_PARTY_SETTINGS = {
    members_can_control_playback: true,
    chat_enabled: true,
    reactions_enabled: true,
    show_playback_feed: true,
    party_locked: false,
    profanity_filter_enabled: true,
    spam_protection_enabled: true
};

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
    const [partyExpiryToastDismissed, setPartyExpiryToastDismissed] = useState(false);
    const [partyPanelOpen, setPartyPanelOpen] = useState(false);
    const [partyPanelCollapsed, setPartyPanelCollapsed] = useState(false);
    const [partyPanelPosition, setPartyPanelPosition] = useState(null);
    const [partyPanelSize, setPartyPanelSize] = useState(null);
    const [isPartyPanelDragging, setIsPartyPanelDragging] = useState(false);
    const [isPartyPanelResizing, setIsPartyPanelResizing] = useState(false);
    const [partyCollapsedPreview, setPartyCollapsedPreview] = useState(null);
    const [partyChatPinned, setPartyChatPinned] = useState(false);
    const [pinnedChatPosition, setPinnedChatPosition] = useState(null);
    const [pinnedChatSize, setPinnedChatSize] = useState(null);
    const [isPinnedChatDragging, setIsPinnedChatDragging] = useState(false);
    const [isPinnedChatResizing, setIsPinnedChatResizing] = useState(false);
    const [isPinnedChatHovered, setIsPinnedChatHovered] = useState(false);
    const [partySettingsOpen, setPartySettingsOpen] = useState(false);
    const [partySyncOpen, setPartySyncOpen] = useState(false);
    const [partyExpiryRemaining, setPartyExpiryRemaining] = useState(null);
    const [isCreatingParty, setIsCreatingParty] = useState(false);
    const [chatDraft, setChatDraft] = useState('');
    const [showReactionBar, setShowReactionBar] = useState(false);
    const [typingUsers, setTypingUsers] = useState({});
    const [unreadCount, setUnreadCount] = useState(0);
    const [unreadDividerMessageId, setUnreadDividerMessageId] = useState(null);
    const [chatAtBottom, setChatAtBottom] = useState(true);
    const [floatingReactions, setFloatingReactions] = useState([]);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionIndex, setMentionIndex] = useState(0);
    const [lastPartyEventAt, setLastPartyEventAt] = useState(null);
    const [lastPartyPlaybackAt, setLastPartyPlaybackAt] = useState(null);
    const [syncHealthTick, setSyncHealthTick] = useState(0);
    const [memberActionMenu, setMemberActionMenu] = useState(null);
    const [leaderConfirmation, setLeaderConfirmation] = useState(null);
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
    const watchIdRef = useRef(watch_id);
    const chatLogRef = useRef(null);
    const chatTextareaRef = useRef(null);
    const chatAtBottomRef = useRef(true);
    const partyChatPinnedRef = useRef(false);
    const pinnedChatMessagesRef = useRef(null);
    const pinnedChatDragRef = useRef(null);
    const pinnedChatResizeRef = useRef(null);
    const pendingJoinRequestIdsRef = useRef(new Set());
    const partyPanelOpenRef = useRef(false);
    const partyPanelCollapsedRef = useRef(false);
    const partyPanelDragRef = useRef(null);
    const partyPanelResizeRef = useRef(null);
    const partyCollapsedPreviewTimerRef = useRef(null);
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
    const [isCheckingVideoAvailability, setIsCheckingVideoAvailability] = useState(true);

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

    const handleVideoAvailabilityResponse = useCallback(async (response) => {
        if (response.status === 503) {
            const data = await response.json();
            if (data.reason === 'processing') {
                ErrorHandler('video_processing', navigate);
                return false;
            }
        }

        if (response.status === 404) {
            ErrorHandler('video_not_found', navigate);
            return false;
        }

        return true;
    }, [navigate]);

    const clearPartyCollapsedPreview = () => {
        if (partyCollapsedPreviewTimerRef.current) {
            clearTimeout(partyCollapsedPreviewTimerRef.current);
            partyCollapsedPreviewTimerRef.current = null;
        }
        setPartyCollapsedPreview(null);
    };

    const markPartyChatRead = () => {
        setUnreadCount(0);
        setUnreadDividerMessageId(null);
    };

    const isPartyChatReadable = () => (
        partyChatPinnedRef.current ||
        (partyPanelOpenRef.current && !partyPanelCollapsedRef.current && chatAtBottomRef.current)
    );

    const registerUnreadPartyMessages = (messages) => {
        const incomingMessages = (messages || []).filter(Boolean);
        if (incomingMessages.length === 0) return;

        if (isPartyChatReadable()) {
            markPartyChatRead();
            return;
        }

        const firstUnreadMessage = incomingMessages.find((message) => message.id);
        if (firstUnreadMessage) {
            setUnreadDividerMessageId((current) => current || firstUnreadMessage.id);
        }
        chatAtBottomRef.current = false;
        setChatAtBottom(false);
        setUnreadCount((prev) => prev + incomingMessages.length);
    };

    const openPartyPanel = () => {
        partyPanelOpenRef.current = true;
        partyPanelCollapsedRef.current = false;
        setPartyPanelOpen(true);
        setPartyPanelCollapsed(false);
        clearPartyCollapsedPreview();
    };

    const closePartyPanel = () => {
        partyPanelOpenRef.current = false;
        partyPanelCollapsedRef.current = false;
        partyPanelDragRef.current = null;
        partyPanelResizeRef.current = null;
        setPartyPanelOpen(false);
        setPartyPanelCollapsed(false);
        setIsPartyPanelDragging(false);
        setIsPartyPanelResizing(false);
        setPartySettingsOpen(false);
        setPartySyncOpen(false);
        setMemberActionMenu(null);
        clearPartyCollapsedPreview();
    };

    const togglePartyPanelCollapsed = () => {
        const nextCollapsed = !partyPanelCollapsedRef.current;
        partyPanelCollapsedRef.current = nextCollapsed;
        setPartyPanelCollapsed(nextCollapsed);
        setPartySettingsOpen(false);
        setPartySyncOpen(false);
        setMemberActionMenu(null);
        partyPanelResizeRef.current = null;
        setIsPartyPanelResizing(false);
        if (!nextCollapsed) {
            clearPartyCollapsedPreview();
        }
    };

    const togglePartySettingsPopup = () => {
        if (partyPanelCollapsedRef.current) {
            partyPanelCollapsedRef.current = false;
            setPartyPanelCollapsed(false);
            clearPartyCollapsedPreview();
        }
        setPartySyncOpen(false);
        setMemberActionMenu(null);
        setPartySettingsOpen((open) => !open);
    };

    const togglePartySyncPopup = () => {
        if (partyPanelCollapsedRef.current) {
            partyPanelCollapsedRef.current = false;
            setPartyPanelCollapsed(false);
            clearPartyCollapsedPreview();
        }
        setPartySettingsOpen(false);
        setMemberActionMenu(null);
        setPartySyncOpen((open) => !open);
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

    const dismissPartyNotice = () => {
        if (partyNoticeTimerRef.current) {
            clearTimeout(partyNoticeTimerRef.current);
            partyNoticeTimerRef.current = null;
        }
        setPartyNotice(null);
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

    const dismissPartyToast = () => {
        if (partyToastTimerRef.current) {
            clearTimeout(partyToastTimerRef.current);
            partyToastTimerRef.current = null;
        }
        setPartyToast(null);
    };

    const openLeaderConfirmation = (confirmation) => {
        setLeaderConfirmation(confirmation);
    };

    const closeLeaderConfirmation = () => {
        setLeaderConfirmation(null);
    };

    const runLeaderConfirmation = () => {
        const action = leaderConfirmation?.onConfirm;
        setLeaderConfirmation(null);
        if (action) {
            action();
        }
    };

    const getCollapsedPreviewContent = (message) => {
        if (!message) return null;

        if (message.type === 'system') {
            return {
                kind: 'system',
                label: 'Party update',
                title: 'Watch Party',
                body: message.message || ''
            };
        }

        if (message.type === 'reaction') {
            return {
                kind: 'reaction',
                label: 'Reaction',
                title: message.username || 'Someone',
                body: message.reaction || message.message || ''
            };
        }

        if (message.type === 'playback_action') {
            return {
                kind: 'playbackAction',
                label: 'Playback',
                title: message.username || 'Someone',
                body: message.message || ''
            };
        }

        return {
            kind: 'message',
            label: 'New message',
            title: message.username || 'Someone',
            body: message.message || ''
        };
    };

    const showCollapsedChatPreview = (message) => {
        if (!partyPanelOpenRef.current || !partyPanelCollapsedRef.current) {
            return;
        }

        const preview = getCollapsedPreviewContent(message);
        if (!preview || !preview.body) {
            return;
        }

        if (partyCollapsedPreviewTimerRef.current) {
            clearTimeout(partyCollapsedPreviewTimerRef.current);
        }

        setPartyCollapsedPreview(preview);
        partyCollapsedPreviewTimerRef.current = setTimeout(() => {
            setPartyCollapsedPreview(null);
            partyCollapsedPreviewTimerRef.current = null;
        }, 3500);
    };

    const showCollapsedPartyStatePreview = (nextParty) => {
        const previousMessages = partyRef.current?.chat || [];
        const nextMessages = nextParty?.chat || [];
        if (nextMessages.length <= previousMessages.length) {
            return;
        }

        const previousIds = new Set(previousMessages.map((message) => message.id));
        const newMessages = nextMessages.filter((message) => message?.id && !previousIds.has(message.id));
        if (newMessages.length > 0) {
            showCollapsedChatPreview(newMessages[newMessages.length - 1]);
            registerUnreadPartyMessages(newMessages);
        }
    };

    const updatePartyState = (nextParty) => {
        if (!nextParty) return;
        const normalizedParty = {
            ...nextParty,
            settings: { ...DEFAULT_PARTY_SETTINGS, ...(nextParty.settings || {}) }
        };
        partyRef.current = normalizedParty;
        if (nextParty.current_user_id) {
            currentPartyUserIdRef.current = nextParty.current_user_id;
        }
        if (typeof nextParty.expires_in === 'number') {
            updatePartyExpiry(nextParty.expires_in);
        }
        setParty(normalizedParty);
    };

    const trackPendingJoinRequests = (nextParty, notify = false) => {
        if (!nextParty?.is_leader) {
            pendingJoinRequestIdsRef.current = new Set();
            return;
        }

        const requests = nextParty.pending_join_requests || [];
        const previousIds = pendingJoinRequestIdsRef.current;
        const nextIds = new Set(requests.map((joinRequest) => joinRequest.user_id));

        if (notify) {
            const newRequest = requests.find((joinRequest) => !previousIds.has(joinRequest.user_id));
            if (newRequest) {
                showPartyToast(`${newRequest.username} wants to join`, 'mention');
            }
        }

        pendingJoinRequestIdsRef.current = nextIds;
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

    const getCurrentPartySettings = () => ({
        ...DEFAULT_PARTY_SETTINGS,
        ...(partyRef.current?.settings || {})
    });

    const getCurrentPartyMember = () => {
        const activeParty = partyRef.current;
        if (!activeParty?.current_user_id) return null;
        const members = Array.isArray(activeParty.members)
            ? activeParty.members
            : Object.values(activeParty.members || {});
        return members.find((member) => member.id === activeParty.current_user_id) || null;
    };

    const getPartyChatDisabledReason = () => {
        if (!partyRef.current || partyStatus !== 'connected') {
            return 'Watch party is not connected';
        }
        const settings = getCurrentPartySettings();
        if (!settings.chat_enabled) {
            return 'Chat is disabled by the leader';
        }
        if (getCurrentPartyMember()?.chat_muted) {
            return 'You are muted in this party';
        }
        return '';
    };

    const escapeMentionRegex = (value) => {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    const getMentionCandidates = (username) => {
        const normalizedUsername = String(username || '').trim();
        const compactUsername = normalizedUsername.replace(/\s+/g, '');
        return Array.from(new Set([normalizedUsername, compactUsername].filter(Boolean)));
    };

    const messageMentionsCurrentUser = (message) => {
        if (!message || message.type !== 'message') return false;
        if (message.user_id === currentPartyUserIdRef.current) return false;

        const currentMember = getCurrentPartyMember();
        const messageText = String(message.message || '');
        if (!currentMember?.username || !messageText.includes('@')) return false;

        return getMentionCandidates(currentMember.username).some((candidate) => {
            const pattern = new RegExp(`(^|\\s)@${escapeMentionRegex(candidate)}(?=$|\\s|[.,!?;:)\\]}])`, 'i');
            return pattern.test(messageText);
        });
    };

    const showMentionNotification = (message) => {
        const rawText = String(message.message || '').trim();
        const preview = rawText.length > 88 ? `${rawText.slice(0, 85)}...` : rawText;
        const sender = message.username || 'Someone';
        showPartyToast(`${sender} mentioned you: ${preview}`, 'mention');
    };

    const handlePartySocketMessage = (event) => {
        let data;
        try {
            data = JSON.parse(event.data);
        } catch (error) {
            console.debug('Invalid watch party message:', error);
            return;
        }
        setLastPartyEventAt(Date.now());

        if (data.type === 'ready') {
            trackPendingJoinRequests(data.party, false);
            updatePartyState(data.party);
            reconnectAttemptsRef.current = 0;
            setPartyStatus('connected');
            setPartyError('');
            openPartyPanel();

            if (data.party?.watch_id && data.party.watch_id !== watchIdRef.current) {
                navigate(`/watch/${data.party.watch_id}?party=${data.party.code}`, { replace: true });
                return;
            }

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
            showCollapsedPartyStatePreview(data.party);
            trackPendingJoinRequests(data.party, true);
            updatePartyState(data.party);
            if (data.party?.watch_id && data.party.watch_id !== watchIdRef.current) {
                navigate(`/watch/${data.party.watch_id}?party=${data.party.code}`, { replace: true });
            }
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
            setLastPartyPlaybackAt(Date.now());
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
            showCollapsedChatPreview(data.message);
            registerUnreadPartyMessages([data.message]);
            if (messageMentionsCurrentUser(data.message) && !isPartyChatReadable()) {
                showMentionNotification(data.message);
            }
            setParty((previousParty) => {
                if (!previousParty) return previousParty;
                const nextChat = [...(previousParty.chat || []), data.message].slice(-100);
                const nextParty = { ...previousParty, chat: nextChat };
                partyRef.current = nextParty;
                return nextParty;
            });
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
            pendingJoinRequestIdsRef.current = new Set();
            partyExpiryAtRef.current = null;
            setPartyExpiryRemaining(null);
            setPartySettingsOpen(false);
            setPartySyncOpen(false);
            setMemberActionMenu(null);
            setLeaderConfirmation(null);
            setPartyChatPinned(false);
            setPartyExpiryToastDismissed(false);
            markPartyChatRead();
            chatAtBottomRef.current = true;
            setChatAtBottom(true);
            setLastPartyEventAt(null);
            setLastPartyPlaybackAt(null);
            clearPartyCollapsedPreview();
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
            pendingJoinRequestIdsRef.current = new Set();
            partyExpiryAtRef.current = null;
            setPartyExpiryRemaining(null);
            setPartySettingsOpen(false);
            setPartySyncOpen(false);
            setMemberActionMenu(null);
            setLeaderConfirmation(null);
            setPartyChatPinned(false);
            setPartyExpiryToastDismissed(false);
            markPartyChatRead();
            chatAtBottomRef.current = true;
            setChatAtBottom(true);
            setLastPartyEventAt(null);
            setLastPartyPlaybackAt(null);
            clearPartyCollapsedPreview();
            navigate(`/watch/${watchIdRef.current}`, { replace: true });
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
            setLastPartyEventAt(Date.now());
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

            if (response.status === 202 || data.status === 'pending') {
                setPartyStatus('joining');
                setPartyError(data.message || 'Waiting for leader approval');
                showPartyToast(data.message || 'Waiting for leader approval', 'info');
                return;
            }

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
        pendingJoinRequestIdsRef.current = new Set();
        setPartyError('');
        setPartyNotice(null);
        setPartyExpiryRemaining(null);
        setPartySettingsOpen(false);
        setPartySyncOpen(false);
        setMemberActionMenu(null);
        setLeaderConfirmation(null);
        setPartyChatPinned(false);
        setPartyExpiryToastDismissed(false);
        markPartyChatRead();
        chatAtBottomRef.current = true;
        setChatAtBottom(true);
        setLastPartyEventAt(null);
        setLastPartyPlaybackAt(null);
        clearPartyCollapsedPreview();
        navigate(`/watch/${watchIdRef.current}`, { replace: true });
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

    const confirmEndWatchParty = () => {
        if (!partyRef.current?.is_leader) {
            leaveWatchParty();
            return;
        }
        openLeaderConfirmation({
            title: 'End party?',
            message: 'This will close the party for everyone in the room.',
            confirmLabel: 'End Party',
            danger: true,
            onConfirm: endWatchParty
        });
    };

    const copyTextToClipboard = async (text) => {
        if (!text) return false;

        if (navigator.clipboard && window.isSecureContext) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {
                console.debug('Secure clipboard copy failed, using fallback:', error);
            }
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.left = '-1000px';
        textarea.style.opacity = '0';
        textarea.style.fontSize = '16px';

        const selection = document.getSelection();
        const selectedRange = selection && selection.rangeCount > 0
            ? selection.getRangeAt(0)
            : null;

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, text.length);

        let copied = false;
        try {
            copied = document.execCommand('copy');
        } catch (error) {
            console.debug('Fallback clipboard copy failed:', error);
        }

        document.body.removeChild(textarea);
        if (selection && selectedRange) {
            selection.removeAllRanges();
            selection.addRange(selectedRange);
        }

        return copied;
    };

    const copyPartyInvite = async () => {
        if (!party?.code) return;
        const inviteLink = `${window.location.origin}/party/${party.code}`;
        const copied = await copyTextToClipboard(inviteLink);
        if (copied) {
            showPartyNotice('Invite link copied', 'success');
        } else {
            showPartyNotice(inviteLink, 'info');
        }
    };

    const copyPartyCode = async () => {
        if (!party?.code) return;
        const copied = await copyTextToClipboard(party.code);
        if (copied) {
            showPartyNotice('Party code copied', 'success');
        } else {
            showPartyNotice(party.code, 'info');
        }
    };

    const sendChatMessage = (event) => {
        event.preventDefault();
        const message = chatDraft.trim();
        if (!message || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        const disabledReason = getPartyChatDisabledReason();
        if (disabledReason) {
            setPartyError(disabledReason);
            return;
        }

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
            const disabledReason = getPartyChatDisabledReason();
            if (disabledReason) {
                setPartyError(disabledReason);
                return;
            }
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
        const disabledReason = getPartyChatDisabledReason();
        if (disabledReason) {
            setPartyError(disabledReason);
            return;
        }
        if (!getCurrentPartySettings().reactions_enabled) {
            setPartyError('Reactions are disabled by the leader');
            return;
        }
        wsRef.current.send(JSON.stringify({ type: 'reaction', reaction }));
        setShowReactionBar(false);
    };

    const sendTypingIndicator = (typing) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !partyRef.current) return;
        if (typing && getPartyChatDisabledReason()) return;
        if (isTypingRef.current === typing) return;
        isTypingRef.current = typing;
        wsRef.current.send(JSON.stringify({ type: 'typing', typing }));
    };

    const kickPartyMember = (member) => {
        if (!isPartyLeader || !member?.id || member.id === party?.current_user_id) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        wsRef.current.send(JSON.stringify({ type: 'kick', target_user_id: member.id }));
    };

    const confirmKickPartyMember = (member) => {
        if (!member) return;
        openLeaderConfirmation({
            title: 'Kick member?',
            message: `${member.username} will be removed from this party.`,
            confirmLabel: 'Kick',
            danger: true,
            onConfirm: () => kickPartyMember(member)
        });
    };

    const handleChatScroll = () => {
        const el = chatLogRef.current;
        if (!el) return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        chatAtBottomRef.current = atBottom;
        setChatAtBottom(atBottom);
        if (atBottom) {
            markPartyChatRead();
        }
    };

    const scrollChatToBottom = () => {
        if (chatLogRef.current) {
            chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
        }
        chatAtBottomRef.current = true;
        setChatAtBottom(true);
        markPartyChatRead();
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
        const chatDisabled = getPartyChatDisabledReason();
        if (value.trim() && partyRef.current && !chatDisabled) {
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

    const confirmTransferPartyLeader = (member) => {
        if (!member) return;
        openLeaderConfirmation({
            title: 'Make leader?',
            message: `${member.username} will get full party control.`,
            confirmLabel: 'Make Leader',
            danger: false,
            onConfirm: () => transferPartyLeader(member)
        });
    };

    const respondToJoinRequest = (joinRequest, action) => {
        if (!isPartyLeader || !joinRequest?.user_id) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'join_request',
            action,
            target_user_id: joinRequest.user_id
        }));
    };

    const updatePartySetting = (key, value) => {
        if (!isPartyLeader || !partyRef.current) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'party_settings',
            settings: { [key]: value }
        }));
    };

    const moderatePartyMember = (member, action) => {
        if (!isPartyLeader || !member?.id || member.id === party?.current_user_id) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'moderation',
            action,
            target_user_id: member.id
        }));
    };

    const openMemberActionMenu = (event, member) => {
        event.stopPropagation();
        if (!member?.id || !isPartyLeader || member.is_leader || member.id === party?.current_user_id) {
            return;
        }

        if (memberActionMenu?.memberId === member.id) {
            setMemberActionMenu(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const menuWidth = 176;
        const menuHeight = 132;
        const left = Math.min(
            Math.max(12, rect.right - menuWidth),
            Math.max(12, window.innerWidth - menuWidth - 12)
        );
        const top = Math.min(
            rect.bottom + 8,
            Math.max(12, window.innerHeight - menuHeight - 12)
        );

        setMemberActionMenu({ memberId: member.id, top, left });
    };

    const closeMemberActionMenu = () => {
        setMemberActionMenu(null);
    };

    const deletePartyChatMessage = (message) => {
        if (!isPartyLeader || !message?.id) return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            return;
        }
        wsRef.current.send(JSON.stringify({
            type: 'moderation',
            action: 'delete_message',
            message_id: message.id
        }));
    };

    const confirmDeletePartyChatMessage = (message) => {
        if (!message) return;
        openLeaderConfirmation({
            title: 'Delete message?',
            message: 'This message will be removed from the party chat.',
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: () => deletePartyChatMessage(message)
        });
    };

    const handlePartyPlayPause = (playing, position) => {
        sendPartyPlayback(playing ? 'play' : 'pause', position, playing);
    };

    const handlePartySeek = (position) => {
        if (!partyRef.current?.is_leader) return;
        sendPartyPlayback('seek', position, videoRef.current ? !videoRef.current.paused : false);
    };

    const followPartyLeader = () => {
        const activeParty = partyRef.current;
        if (!activeParty?.code) return;

        if (activeParty.watch_id && activeParty.watch_id !== watchIdRef.current) {
            navigate(`/watch/${activeParty.watch_id}?party=${activeParty.code}`, { replace: true });
            showPartyNotice('Following leader video', 'success');
            return;
        }

        if (activeParty.playback) {
            applyRemotePlayback(activeParty.playback);
            setLastPartyPlaybackAt(Date.now());
        }
        showPartyNotice('Synced with leader', 'success');
    };

    const togglePartyChatPinned = () => {
        const nextPinned = !partyChatPinnedRef.current;
        partyChatPinnedRef.current = nextPinned;
        setPartyChatPinned(nextPinned);
        if (nextPinned) {
            markPartyChatRead();
        } else {
            pinnedChatDragRef.current = null;
            pinnedChatResizeRef.current = null;
            setIsPinnedChatDragging(false);
            setIsPinnedChatResizing(false);
            setIsPinnedChatHovered(false);
        }
    };

    const clampPartyPanelPosition = (x, y, width, height) => {
        const margin = 10;
        const maxX = Math.max(margin, window.innerWidth - width - margin);
        const maxY = Math.max(margin, window.innerHeight - height - margin);
        return {
            x: Math.min(Math.max(margin, x), maxX),
            y: Math.min(Math.max(margin, y), maxY)
        };
    };

    const clampPartyPanelSize = (width, height, left, top) => {
        const margin = 10;
        const availableWidth = Math.max(0, window.innerWidth - margin * 2);
        const availableHeight = Math.max(0, window.innerHeight - margin * 2);
        const minWidth = Math.min(300, availableWidth);
        const minHeight = Math.min(220, availableHeight);
        const maxWidth = Math.max(minWidth, window.innerWidth - left - margin);
        const maxHeight = Math.max(minHeight, window.innerHeight - top - margin);
        return {
            width: Math.min(Math.max(minWidth, width), maxWidth),
            height: Math.min(Math.max(minHeight, height), maxHeight)
        };
    };

    const startPartyPanelDrag = (event) => {
        if (event.target.closest?.('button')) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const panel = event.currentTarget.closest('.watchPartyPanel');
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        partyPanelDragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            width: rect.width,
            height: rect.height
        };
        setPartyPanelPosition({ x: rect.left, y: rect.top });
        if (!partyPanelCollapsedRef.current) {
            setPartyPanelSize({ width: rect.width, height: rect.height });
        }
        setIsPartyPanelDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const dragPartyPanel = (event) => {
        const dragState = partyPanelDragRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const nextPosition = clampPartyPanelPosition(
            event.clientX - dragState.offsetX,
            event.clientY - dragState.offsetY,
            dragState.width,
            dragState.height
        );
        setPartyPanelPosition(nextPosition);
        event.preventDefault();
    };

    const stopPartyPanelDrag = (event) => {
        const dragState = partyPanelDragRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        partyPanelDragRef.current = null;
        setIsPartyPanelDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    };

    const startPartyPanelResize = (event) => {
        if (partyPanelCollapsedRef.current) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const panel = event.currentTarget.closest('.watchPartyPanel');
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        partyPanelResizeRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        setPartyPanelPosition({ x: rect.left, y: rect.top });
        setPartyPanelSize({ width: rect.width, height: rect.height });
        setIsPartyPanelResizing(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.stopPropagation();
        event.preventDefault();
    };

    const resizePartyPanel = (event) => {
        const resizeState = partyPanelResizeRef.current;
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;

        setPartyPanelSize(
            clampPartyPanelSize(
                resizeState.width + event.clientX - resizeState.startX,
                resizeState.height + event.clientY - resizeState.startY,
                resizeState.left,
                resizeState.top
            )
        );
        event.stopPropagation();
        event.preventDefault();
    };

    const stopPartyPanelResize = (event) => {
        const resizeState = partyPanelResizeRef.current;
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;

        partyPanelResizeRef.current = null;
        setIsPartyPanelResizing(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        event.stopPropagation();
    };

    const clampPinnedChatPosition = (x, y, width, height) => {
        const margin = 10;
        const maxX = Math.max(margin, window.innerWidth - width - margin);
        const maxY = Math.max(margin, window.innerHeight - height - margin);
        return {
            x: Math.min(Math.max(margin, x), maxX),
            y: Math.min(Math.max(margin, y), maxY)
        };
    };

    const clampPinnedChatSize = (width, height, left, top) => {
        const margin = 10;
        const minWidth = Math.min(250, window.innerWidth - margin * 2);
        const minHeight = Math.min(132, window.innerHeight - margin * 2);
        const maxWidth = Math.max(minWidth, window.innerWidth - left - margin);
        const maxHeight = Math.max(minHeight, window.innerHeight - top - margin);
        return {
            width: Math.min(Math.max(minWidth, width), maxWidth),
            height: Math.min(Math.max(minHeight, height), maxHeight)
        };
    };

    const startPinnedChatDrag = (event) => {
        if (event.target.closest?.('button')) return;
        if (event.target.closest?.('.watchPartyPinnedChatResizeHandle')) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const panel = event.currentTarget.closest('.watchPartyPinnedChat');
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        pinnedChatDragRef.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            width: rect.width,
            height: rect.height
        };
        setPinnedChatPosition({ x: rect.left, y: rect.top });
        setIsPinnedChatDragging(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    };

    const dragPinnedChat = (event) => {
        const dragState = pinnedChatDragRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        const nextPosition = clampPinnedChatPosition(
            event.clientX - dragState.offsetX,
            event.clientY - dragState.offsetY,
            dragState.width,
            dragState.height
        );
        setPinnedChatPosition(nextPosition);
        event.preventDefault();
    };

    const stopPinnedChatDrag = (event) => {
        const dragState = pinnedChatDragRef.current;
        if (!dragState || dragState.pointerId !== event.pointerId) return;

        pinnedChatDragRef.current = null;
        setIsPinnedChatDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
    };

    const startPinnedChatResize = (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const panel = event.currentTarget.closest('.watchPartyPinnedChat');
        if (!panel) return;

        const rect = panel.getBoundingClientRect();
        pinnedChatResizeRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height
        };
        setPinnedChatPosition({ x: rect.left, y: rect.top });
        setPinnedChatSize({ width: rect.width, height: rect.height });
        setIsPinnedChatResizing(true);
        event.currentTarget.setPointerCapture?.(event.pointerId);
        event.stopPropagation();
        event.preventDefault();
    };

    const resizePinnedChat = (event) => {
        const resizeState = pinnedChatResizeRef.current;
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;

        setPinnedChatSize(
            clampPinnedChatSize(
                resizeState.width + event.clientX - resizeState.startX,
                resizeState.height + event.clientY - resizeState.startY,
                resizeState.left,
                resizeState.top
            )
        );
        event.stopPropagation();
        event.preventDefault();
    };

    const stopPinnedChatResize = (event) => {
        const resizeState = pinnedChatResizeRef.current;
        if (!resizeState || resizeState.pointerId !== event.pointerId) return;

        pinnedChatResizeRef.current = null;
        setIsPinnedChatResizing(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        event.stopPropagation();
    };

    useEffect(() => {
        watchIdRef.current = watch_id;
    }, [watch_id]);

    useEffect(() => {
        const code = getPartyCodeFromUrl();

        if (!code) {
            if (joinedPartyCodeRef.current) {
                closePartySocket(false);
                joinedPartyCodeRef.current = null;
                partyRef.current = null;
                pendingJoinRequestIdsRef.current = new Set();
                partyExpiryAtRef.current = null;
                setParty(null);
                setPartyStatus('idle');
                setPartyExpiryRemaining(null);
                setPartySettingsOpen(false);
                setPartySyncOpen(false);
                setMemberActionMenu(null);
                setLeaderConfirmation(null);
                setPartyChatPinned(false);
                setPartyExpiryToastDismissed(false);
                markPartyChatRead();
                chatAtBottomRef.current = true;
                setChatAtBottom(true);
                setLastPartyEventAt(null);
                setLastPartyPlaybackAt(null);
                clearPartyCollapsedPreview();
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
            if (partyCollapsedPreviewTimerRef.current) {
                clearTimeout(partyCollapsedPreviewTimerRef.current);
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

    useEffect(() => {
        setPartyExpiryToastDismissed(false);
    }, [party?.code]);

    useEffect(() => {
        partyChatPinnedRef.current = partyChatPinned;
        if (partyChatPinned) {
            markPartyChatRead();
        }
    }, [partyChatPinned]);

    useEffect(() => {
        if (!partyPanelOpen || partyPanelCollapsed || !unreadDividerMessageId) {
            return;
        }

        const timeoutId = setTimeout(() => {
            const divider = chatLogRef.current?.querySelector('.watchPartyUnreadDivider');
            if (divider) {
                divider.scrollIntoView({ block: 'center' });
            }
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [partyPanelOpen, partyPanelCollapsed, unreadDividerMessageId, party?.chat?.length]);

    useEffect(() => {
        if (!party?.code || party.watch_id !== watch_id || !party.playback) {
            return;
        }

        const timeoutId = setTimeout(() => {
            applyRemotePlayback(party.playback);
        }, 450);

        return () => clearTimeout(timeoutId);
    }, [watch_id, party?.code, party?.watch_id]);

    useEffect(() => {
        if (!partySyncOpen || !party?.code) {
            return;
        }
        const intervalId = setInterval(() => {
            setSyncHealthTick((tick) => tick + 1);
        }, 1000);
        return () => clearInterval(intervalId);
    }, [partySyncOpen, party?.code]);

    useEffect(() => {
        if (!party?.is_leader) {
            setPartySettingsOpen(false);
            setMemberActionMenu(null);
            setLeaderConfirmation(null);
        }
    }, [party?.is_leader]);

    useEffect(() => {
        if (!partySettingsOpen && !partySyncOpen) {
            return;
        }

        const handleOutsideClick = (event) => {
            const target = event.target;
            if (
                target.closest?.('.watchPartyPopover') ||
                target.closest?.('.watchPartyPopoverToggle')
            ) {
                return;
            }
            setPartySettingsOpen(false);
            setPartySyncOpen(false);
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('touchstart', handleOutsideClick);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('touchstart', handleOutsideClick);
        };
    }, [partySettingsOpen, partySyncOpen]);

    useEffect(() => {
        if (!memberActionMenu) {
            return;
        }

        const handleOutsideClick = (event) => {
            const target = event.target;
            if (
                target.closest?.('.watchPartyMemberMenu') ||
                target.closest?.('.watchPartyMemberMenuButton')
            ) {
                return;
            }
            setMemberActionMenu(null);
        };

        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [memberActionMenu]);

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

    // Check stream availability before mounting the player. The stream endpoint
    // blocks while a file is re-encoding, which otherwise leaves the player buffering.
    useEffect(() => {
        let isActive = true;

        const checkVideoAvailability = async () => {
            if (!watch_id) return;

            const token = localStorage.getItem('token');
            if (!token) {
                ErrorHandler("token_missing", navigate);
                setIsCheckingVideoAvailability(false);
                return;
            }

            setIsCheckingVideoAvailability(true);

            try {
                const response = await fetch(`${API_URL}/api/stream/can-watch/${watch_id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const canWatch = await handleVideoAvailabilityResponse(response);
                if (isActive && canWatch) {
                    setIsCheckingVideoAvailability(false);
                }
            } catch (error) {
                console.error('Failed to check video availability:', error);
                if (isActive) {
                    setIsCheckingVideoAvailability(false);
                }
            }
        };

        checkVideoAvailability();

        return () => {
            isActive = false;
        };
    }, [watch_id, navigate, handleVideoAvailabilityResponse]);

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
                    const response = await fetch(`${API_URL}/api/stream/can-watch/${watch_id}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    const canWatch = await handleVideoAvailabilityResponse(response);
                    if (!canWatch) {
                        return;
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
                try {
                    const response = await fetch(`${API_URL}/api/stream/report-error`, {
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
                    });

                    if (response.ok) {
                        const data = await response.json();
                        if (data.action === 'reencode_started' || data.action === 'in_progress') {
                            ErrorHandler('video_processing', navigate);
                            return;
                        }
                    }
                } catch (err) {
                    console.error('Failed to report video error:', err);
                }
            }
        }
        
        ErrorHandler("video_error", navigate);
    };

    const requestPartyWatchChange = (nextWatchId) => {
        const activeParty = partyRef.current;
        if (!activeParty?.code) {
            return false;
        }

        if (!activeParty.is_leader) {
            showPartyNotice('Only the party leader can change the video', 'warning');
            return true;
        }

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setPartyError('Watch party is not connected');
            showPartyToast('Reconnect before changing the party video', 'warning');
            return true;
        }

        if (videoRef.current && videoRef.current.currentTime > 0) {
            saveWatchHistory();
        }

        wsRef.current.send(JSON.stringify({
            type: 'watch_change',
            watch_id: nextWatchId,
            playing: videoRef.current ? !videoRef.current.paused : false
        }));
        return true;
    };

    const handleNextEpisode = () => {
        if (mediaDataNext && mediaDataNext.nextContentId && mediaDataNext.nextSeasonNumber && mediaDataNext.nextEpisodeNumber) {
            const { nextContentId, nextSeasonNumber, nextEpisodeNumber } = mediaDataNext;
            const nextWatchId = `t-${nextContentId}-${nextSeasonNumber}-${nextEpisodeNumber}`;
            console.log(`Navigating to next episode: /watch/${nextWatchId}`); // DEBUGGING
            if (requestPartyWatchChange(nextWatchId)) {
                return;
            }
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

        if (requestPartyWatchChange(episodeId)) {
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
    const pendingJoinRequests = party?.pending_join_requests || [];
    const pinnedChatLatestMessageId = partyChat[partyChat.length - 1]?.id || partyChat.length;
    const partySettings = { ...DEFAULT_PARTY_SETTINGS, ...(party?.settings || {}) };
    const currentPartyMember = partyMembers.find((member) => member.id === party?.current_user_id);
    const disablePartyPlayPause = isInParty && !isPartyLeader && !partySettings.members_can_control_playback;
    const chatDisabledReason = !isInParty
        ? ''
        : partyStatus !== 'connected'
            ? 'Watch party is not connected'
            : !partySettings.chat_enabled
                ? 'Chat is disabled by the leader'
                : currentPartyMember?.chat_muted
                    ? 'You are muted in this party'
                    : '';
    const canUsePartyChat = isInParty && !chatDisabledReason;
    const canUsePartyReactions = canUsePartyChat && partySettings.reactions_enabled;
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

    useEffect(() => {
        if (
            !partyChatPinned ||
            isPinnedChatHovered ||
            isPinnedChatDragging ||
            isPinnedChatResizing
        ) {
            return;
        }

        const timeoutId = setTimeout(() => {
            const chatEl = pinnedChatMessagesRef.current;
            if (chatEl) {
                chatEl.scrollTop = chatEl.scrollHeight;
            }
        }, 0);

        return () => clearTimeout(timeoutId);
    }, [
        partyChatPinned,
        pinnedChatLatestMessageId,
        isPinnedChatHovered,
        isPinnedChatDragging,
        isPinnedChatResizing
    ]);

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

    const formatSecondsAgo = (timestamp) => {
        if (!timestamp) return 'No contact yet';
        const secondsAgo = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        if (secondsAgo < 2) return 'Just now';
        if (secondsAgo < 60) return `${secondsAgo}s ago`;
        const minutesAgo = Math.floor(secondsAgo / 60);
        if (minutesAgo < 60) return `${minutesAgo}m ago`;
        return `${Math.floor(minutesAgo / 60)}h ago`;
    };

    const getSyncHealth = () => {
        const nowMs = Date.now() + syncHealthTick * 0;
        const playback = party?.playback;
        const video = videoRef.current;
        let drift = null;

        if (playback && video) {
            const nowSeconds = nowMs / 1000;
            const updatedAt = Number(playback.updated_at) || nowSeconds;
            const elapsed = playback.playing ? Math.max(0, nowSeconds - updatedAt) : 0;
            const targetTime = Math.max(0, Number(playback.position || 0) + elapsed);
            drift = Math.abs((video.currentTime || 0) - targetTime);
        }

        const healthClass = drift === null
            ? 'unknown'
            : drift <= 1.25
                ? 'good'
                : drift <= 3
                    ? 'warning'
                    : 'bad';
        const label = healthClass === 'good'
            ? 'In sync'
            : healthClass === 'warning'
                ? 'Minor drift'
                : healthClass === 'bad'
                    ? 'Needs correction'
                    : 'Waiting for video';

        return {
            drift,
            healthClass,
            label,
            lastServerContact: formatSecondsAgo(lastPartyEventAt),
            lastPlaybackUpdate: formatSecondsAgo(lastPartyPlaybackAt),
            reconnectAttempts: reconnectAttemptsRef.current,
        };
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
        const withUnreadDivider = (node) => {
            if (!message?.id || message.id !== unreadDividerMessageId) {
                return node;
            }

            return (
                <React.Fragment key={`unread-${message.id}`}>
                    <div className="watchPartyUnreadDivider">New messages</div>
                    {node}
                </React.Fragment>
            );
        };

        if (message.type === 'system') {
            return withUnreadDivider(
                <div className="watchPartyChatMessage system" key={message.id}>
                    <span>{message.message}</span>
                </div>
            );
        }

        if (message.type === 'playback_action') {
            return withUnreadDivider(
                <div className="watchPartyChatMessage playbackAction" key={message.id}>
                    <span>{message.message}</span>
                </div>
            );
        }

        const isOwnMessage = message.user_id === party?.current_user_id;
        const isReaction = message.type === 'reaction';

        return withUnreadDivider(
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
                    {isPartyLeader && (
                        <button
                            type="button"
                            className="watchPartyDeleteMessageButton"
                            onClick={() => confirmDeletePartyChatMessage(message)}
                            title="Delete message"
                        >
                            <FaTrashAlt />
                        </button>
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
                        <button className="watchPartyToastActionButton" onClick={openPartyPanel}>Open</button>
                    )}
                    <button
                        className="watchPartyToastCloseButton"
                        onClick={dismissPartyToast}
                        title="Dismiss"
                    >
                        <FaTimes />
                    </button>
                </div>
            );
        }

        if (!showExpiryWarning || partyExpiryToastDismissed) return null;

        return (
            <div className="watchPartyToast warning">
                <span>Party expires in {formatPartyRemaining(partyExpiryRemaining)}</span>
                <button className="watchPartyToastActionButton" onClick={openPartyPanel}>Open</button>
                <button
                    className="watchPartyToastCloseButton"
                    onClick={() => setPartyExpiryToastDismissed(true)}
                    title="Dismiss"
                >
                    <FaTimes />
                </button>
            </div>
        );
    };

    const renderPartySettingsPopup = () => {
        const settingRows = [
            ['members_can_control_playback', 'Members can play/pause'],
            ['chat_enabled', 'Chat enabled'],
            ['reactions_enabled', 'Reactions enabled'],
            ['show_playback_feed', 'Playback feed in chat'],
            ['party_locked', 'Party lock'],
            ['profanity_filter_enabled', 'Profanity filter'],
            ['spam_protection_enabled', 'Spam protection']
        ];

        return (
            <div className="watchPartyPopover watchPartySettingsPopover">
                <div className="watchPartyPopoverHeader">
                    <strong>Party Settings</strong>
                    <button type="button" onClick={() => setPartySettingsOpen(false)} title="Close settings">
                        <FaTimes />
                    </button>
                </div>
                <div className="watchPartyToggleRows">
                    {settingRows.map(([key, label]) => {
                        const enabled = Boolean(partySettings[key]);
                        return (
                            <button
                                key={key}
                                type="button"
                                className={`watchPartyToggleRow ${enabled ? 'enabled' : ''}`}
                                onClick={() => updatePartySetting(key, !enabled)}
                                disabled={partyStatus !== 'connected'}
                            >
                                <span>{label}</span>
                                <span className="watchPartySwitch" aria-hidden="true"><span /></span>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderSyncHealthPopup = () => {
        const syncHealth = getSyncHealth();
        return (
            <div className="watchPartyPopover watchPartySyncPopover">
                <div className="watchPartyPopoverHeader">
                    <strong>Sync Health</strong>
                    <button type="button" onClick={() => setPartySyncOpen(false)} title="Close sync health">
                        <FaTimes />
                    </button>
                </div>
                <div className={`watchPartySyncSummary ${syncHealth.healthClass}`}>
                    <span />
                    <div>
                        <strong>{syncHealth.label}</strong>
                        <small>
                            {syncHealth.drift === null
                                ? 'Drift unavailable'
                                : `${syncHealth.drift.toFixed(1)}s drift`}
                        </small>
                    </div>
                </div>
                <div className="watchPartyHealthGrid">
                    <div>
                        <span>Status</span>
                        <strong>{partyStatusLabel}</strong>
                    </div>
                    <div>
                        <span>Role</span>
                        <strong>{isPartyLeader ? 'Leader' : 'Member'}</strong>
                    </div>
                    <div>
                        <span>Server contact</span>
                        <strong>{syncHealth.lastServerContact}</strong>
                    </div>
                    <div>
                        <span>Playback update</span>
                        <strong>{syncHealth.lastPlaybackUpdate}</strong>
                    </div>
                    <div>
                        <span>Reconnects</span>
                        <strong>{syncHealth.reconnectAttempts}</strong>
                    </div>
                    <div>
                        <span>Expires</span>
                        <strong>{formatPartyRemaining(partyExpiryRemaining || 0)}</strong>
                    </div>
                </div>
            </div>
        );
    };

    const renderMemberActionMenu = () => {
        if (!memberActionMenu || !party || !isPartyLeader) return null;

        const member = partyMembers.find((item) => item.id === memberActionMenu.memberId);
        if (!member || member.is_leader || member.id === party.current_user_id) return null;

        const runAction = (action) => {
            action();
            closeMemberActionMenu();
        };

        return (
            <div
                className="watchPartyMemberMenu"
                style={{ top: `${memberActionMenu.top}px`, left: `${memberActionMenu.left}px` }}
            >
                <button
                    type="button"
                    disabled={!member.connected}
                    onClick={() => runAction(() => confirmTransferPartyLeader(member))}
                >
                    <FaCrown />
                    Make Leader
                </button>
                <button
                    type="button"
                    onClick={() => runAction(() => moderatePartyMember(member, member.chat_muted ? 'unmute' : 'mute'))}
                >
                    {member.chat_muted ? <FaVolumeUp /> : <FaVolumeMute />}
                    {member.chat_muted ? 'Unmute Chat' : 'Mute Chat'}
                </button>
                <button
                    type="button"
                    className="danger"
                    onClick={() => runAction(() => confirmKickPartyMember(member))}
                >
                    <FaBan />
                    Kick Member
                </button>
            </div>
        );
    };

    const getPinnedChatParts = (message) => {
        if (!message) return { author: '', body: '' };
        if (message.type === 'reaction') {
            return {
                author: message.username || 'Someone',
                body: message.reaction || message.message || ''
            };
        }
        if (message.type === 'message') {
            return {
                author: message.username || 'Someone',
                body: message.message || ''
            };
        }
        return { author: '', body: message.message || '' };
    };

    const renderPinnedPartyChat = () => {
        if (!partyChatPinned || !party) return null;

        const visibleMessages = partyChat.slice(-6);
        const pinnedChatStyle = {};
        if (pinnedChatPosition) {
            Object.assign(pinnedChatStyle, {
                left: `${pinnedChatPosition.x}px`,
                top: `${pinnedChatPosition.y}px`,
                right: 'auto'
            });
        }
        if (pinnedChatSize) {
            pinnedChatStyle.width = `${pinnedChatSize.width}px`;
            pinnedChatStyle.height = `${pinnedChatSize.height}px`;
        }

        return (
            <aside
                className={`watchPartyPinnedChat ${isPinnedChatDragging ? 'dragging' : ''} ${isPinnedChatResizing ? 'resizing' : ''}`}
                style={pinnedChatStyle}
                onMouseEnter={() => setIsPinnedChatHovered(true)}
                onMouseLeave={() => setIsPinnedChatHovered(false)}
            >
                <div
                    className="watchPartyPinnedChatHeader"
                    onPointerDown={startPinnedChatDrag}
                    onPointerMove={dragPinnedChat}
                    onPointerUp={stopPinnedChatDrag}
                    onPointerCancel={stopPinnedChatDrag}
                >
                    <strong>Party Chat</strong>
                    <button type="button" onClick={togglePartyChatPinned} title="Unpin chat">
                        <FaTimes />
                    </button>
                </div>
                <div className="watchPartyPinnedChatMessages" ref={pinnedChatMessagesRef}>
                    {visibleMessages.length === 0 && (
                        <div className="watchPartyPinnedChatEmpty">No messages yet</div>
                    )}
                    {visibleMessages.map((message) => {
                        const pinnedMessage = getPinnedChatParts(message);
                        return (
                            <div
                                key={message.id}
                                className={`watchPartyPinnedChatMessage ${message.type || 'message'}`}
                            >
                                {pinnedMessage.author && <strong>{pinnedMessage.author}</strong>}
                                <span>{pinnedMessage.body}</span>
                            </div>
                        );
                    })}
                </div>
                <div
                    className="watchPartyPinnedChatResizeHandle"
                    onPointerDown={startPinnedChatResize}
                    onPointerMove={resizePinnedChat}
                    onPointerUp={stopPinnedChatResize}
                    onPointerCancel={stopPinnedChatResize}
                    title="Resize chat"
                />
            </aside>
        );
    };

    const renderLeaderConfirmation = () => {
        if (!leaderConfirmation) return null;

        return (
            <div className="watchPartyConfirmOverlay" role="dialog" aria-modal="true">
                <div className={`watchPartyConfirmBox ${leaderConfirmation.danger ? 'danger' : ''}`}>
                    <div className="watchPartyConfirmHeader">
                        <strong>{leaderConfirmation.title}</strong>
                        <button type="button" onClick={closeLeaderConfirmation} title="Close">
                            <FaTimes />
                        </button>
                    </div>
                    <p>{leaderConfirmation.message}</p>
                    <div className="watchPartyConfirmActions">
                        <button type="button" className="secondary" onClick={closeLeaderConfirmation}>
                            Cancel
                        </button>
                        <button type="button" className="primary" onClick={runLeaderConfirmation}>
                            {leaderConfirmation.confirmLabel || 'Confirm'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderWatchPartyPanel = () => {
        const partyPanelStyle = {};
        const isPartyPanelCompactHeader = !partyPanelCollapsed && (partyPanelSize?.width || 380) <= 340;
        if (partyPanelPosition) {
            Object.assign(partyPanelStyle, {
                left: `${partyPanelPosition.x}px`,
                top: `${partyPanelPosition.y}px`,
                right: 'auto',
                bottom: 'auto'
            });
            if (partyPanelSize && !partyPanelCollapsed) {
                Object.assign(partyPanelStyle, {
                    width: `${partyPanelSize.width}px`,
                    height: `${partyPanelSize.height}px`
                });
            }
        }

        return (
            <aside
                className={`watchPartyPanel ${partyPanelOpen ? 'open' : ''} ${partyPanelCollapsed ? 'collapsed' : ''} ${isPartyPanelCompactHeader ? 'compactHeader' : ''} ${isPartyPanelDragging ? 'dragging' : ''} ${isPartyPanelResizing ? 'resizing' : ''}`}
                style={partyPanelStyle}
            >
                <div
                    className="watchPartyPanelHeader"
                    onPointerDown={startPartyPanelDrag}
                    onPointerMove={dragPartyPanel}
                    onPointerUp={stopPartyPanelDrag}
                    onPointerCancel={stopPartyPanelDrag}
                >
                    <div>
                        <div className="watchPartyEyebrow">Watch Party</div>
                        <div className="watchPartyTitle">{party?.code || 'Start a party'}</div>
                    </div>
                    <div className="watchPartyHeaderButtons">
                        {party && isPartyLeader && (
                            <button
                                className={`watchPartyIconButton watchPartyPopoverToggle ${partySettingsOpen ? 'active' : ''}`}
                                onClick={togglePartySettingsPopup}
                                title="Party settings"
                            >
                                <FaCog />
                            </button>
                        )}
                        {party && (
                            <button
                                className={`watchPartyIconButton watchPartyPopoverToggle ${partySyncOpen ? 'active' : ''}`}
                                onClick={togglePartySyncPopup}
                                title="Sync health"
                            >
                                <FaSignal />
                            </button>
                        )}
                        {party && (
                            <button
                                className="watchPartyIconButton"
                                onClick={followPartyLeader}
                                title="Follow leader"
                            >
                                <FaSyncAlt />
                            </button>
                        )}
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

                {partySettingsOpen && party && isPartyLeader && !partyPanelCollapsed && renderPartySettingsPopup()}
                {partySyncOpen && party && !partyPanelCollapsed && renderSyncHealthPopup()}

                <div className="watchPartyPanelBody">
                    <div className={`watchPartyStatus ${partyStatus}`}>
                        <span />
                        {partyStatusLabel}
                    </div>

                    {partyPanelCollapsed && partyCollapsedPreview && (
                        <div className={`watchPartyCollapsedPreview ${partyCollapsedPreview.kind || 'message'}`}>
                            <div className="watchPartyCollapsedPreviewMeta">
                                <span>{partyCollapsedPreview.label}</span>
                                <strong>{partyCollapsedPreview.title}</strong>
                            </div>
                            <div className="watchPartyCollapsedPreviewBody">{partyCollapsedPreview.body}</div>
                        </div>
                    )}

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
                                            onClick={isPartyLeader ? confirmEndWatchParty : leaveWatchParty}
                                        >
                                            <FaSignOutAlt />
                                            {isPartyLeader ? 'End' : 'Leave'}
                                        </button>
                                    </div>

                                    {isPartyLeader && pendingJoinRequests.length > 0 && (
                                        <section className="watchPartySection watchPartyRequestsSection">
                                            <div className="watchPartySectionTitle">Join Requests</div>
                                            <div className="watchPartyJoinRequests">
                                                {pendingJoinRequests.map((joinRequest) => (
                                                    <div className="watchPartyJoinRequest" key={joinRequest.user_id}>
                                                        <div>
                                                            <strong>{joinRequest.username}</strong>
                                                            <span>wants to join</span>
                                                        </div>
                                                        <div className="watchPartyJoinRequestActions">
                                                            <button
                                                                type="button"
                                                                className="approve"
                                                                onClick={() => respondToJoinRequest(joinRequest, 'approve')}
                                                            >
                                                                Approve
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="deny"
                                                                onClick={() => respondToJoinRequest(joinRequest, 'deny')}
                                                            >
                                                                Deny
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </section>
                                    )}

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
                                                        {member.chat_muted && (
                                                            <span className="watchPartyMutedBadge" title="Muted in chat">
                                                                <FaVolumeMute />
                                                            </span>
                                                        )}
                                                        {isPartyLeader && !member.is_leader && member.id !== party.current_user_id && (
                                                            <button
                                                                className={`watchPartyMemberMenuButton ${memberActionMenu?.memberId === member.id ? 'active' : ''}`}
                                                                onClick={(event) => openMemberActionMenu(event, member)}
                                                                title={`Actions for ${member.username}`}
                                                            >
                                                                <FaEllipsisV />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="watchPartySection watchPartyChatSection">
                                        <div className="watchPartyChatHeader">
                                            <div className="watchPartySectionTitle">Chat</div>
                                            <button
                                                type="button"
                                                className={`watchPartyPinChatButton ${partyChatPinned ? 'active' : ''}`}
                                                onClick={togglePartyChatPinned}
                                                title={partyChatPinned ? 'Unpin chat' : 'Pin chat'}
                                            >
                                                <FaThumbtack />
                                            </button>
                                        </div>
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
                                        {chatDisabledReason && (
                                            <div className="watchPartyChatDisabled">{chatDisabledReason}</div>
                                        )}
                                        {showReactionBar && (
                                            <div className="watchPartyReactionBar" aria-label="Chat reactions">
                                                {PARTY_REACTIONS.map((reaction) => (
                                                    <button
                                                        key={reaction}
                                                        type="button"
                                                        onClick={() => sendPartyReaction(reaction)}
                                                        disabled={!canUsePartyReactions}
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
                                                    placeholder={chatDisabledReason || 'Message'}
                                                    disabled={!canUsePartyChat}
                                                    rows={1}
                                                />
                                                <button
                                                    type="button"
                                                    className={`watchPartyEmojiToggle${showReactionBar ? ' active' : ''}`}
                                                    onClick={() => setShowReactionBar(v => !v)}
                                                    title="Reactions"
                                                    disabled={!canUsePartyReactions}
                                                >
                                                    <FaSmile />
                                                </button>
                                                <button type="submit" disabled={!chatDraft.trim() || !canUsePartyChat} title="Send">
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
                    {partyNotice && (
                        <div className={`watchPartyNotice ${partyNotice.type}`}>
                            <span>{partyNotice.message}</span>
                            <button type="button" onClick={dismissPartyNotice} title="Dismiss">
                                <FaTimes />
                            </button>
                        </div>
                    )}
                    {partyError && <div className="watchPartyError">{partyError}</div>}
                </div>
                {!partyPanelCollapsed && (
                    <div
                        className="watchPartyPanelResizeHandle"
                        onPointerDown={startPartyPanelResize}
                        onPointerMove={resizePartyPanel}
                        onPointerUp={stopPartyPanelResize}
                        onPointerCancel={stopPartyPanelResize}
                        title="Resize party panel"
                    />
                )}
            </aside>
        );
    };

    if (isCheckingVideoAvailability || (isLoadingMediaData && !useOldPlayer)) {
        return <div className="watchPageLoading">Loading player data...</div>; // Or a proper loading spinner
    }

    const watchPartyOverlay = (
        <>
            {renderWatchPartyPanel()}
            {renderMemberActionMenu()}
            {renderLeaderConfirmation()}
            {renderPinnedPartyChat()}
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
        </>
    );

    return (
        <div className={`watchPageContainer ${useOldPlayer ? 'use-old-player' : ''}`}>
            {useOldPlayer && watchPartyOverlay}

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
                ) : (
                    <ReactNetflixPlayer
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
                        onPlayPauseBlocked={() => showPartyNotice('Only the party leader can control playback', 'warning')}
                        onSeek={handlePartySeek}
                        onWatchPartyClick={openPartyPanel}
                        watchPartyActive={isInParty}
                        watchPartyLabel={isInParty ? `Party ${party.code}` : 'Watch Party'}
                        watchPartyUnreadCount={unreadCount}
                        disablePlayPause={disablePartyPlayPause}
                        disableSeeking={disablePartyNavigation}
                        disableNextControls={disablePartyNavigation}
                        disableReproductionList={disablePartyNavigation}
                        watchPartyOverlay={watchPartyOverlay}
                        onNextClick={mediaDataNext ? handleNextEpisode : undefined} // Pass the handler
                    />
                )}
            </div>
        </div>
    );
};

export default WatchPage;
