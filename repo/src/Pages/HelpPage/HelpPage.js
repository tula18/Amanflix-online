import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    FaArrowRight,
    FaBug,
    FaCheckCircle,
    FaChevronDown,
    FaExclamationTriangle,
    FaHeadphones,
    FaList,
    FaPaperPlane,
    FaPlayCircle,
    FaQuestionCircle,
    FaSearch,
    FaSyncAlt,
    FaTimes,
    FaTv,
    FaUserCircle,
    FaUsers
} from 'react-icons/fa';
import { API_URL } from '../../config';
import './HelpPage.css';

const categories = [
    { id: 'all', label: 'All' },
    { id: 'account', label: 'Account' },
    { id: 'watching', label: 'Watching' },
    { id: 'library', label: 'Library' },
    { id: 'party', label: 'Watch Party' },
    { id: 'support', label: 'Support' }
];

const categoryLabels = categories.reduce((labels, category) => {
    labels[category.id] = category.label;
    return labels;
}, {});

const helpArticles = [
    {
        id: 'account-access',
        category: 'account',
        title: 'Account or sign-in trouble',
        summary: 'Session, profile, and password checks for account access issues.',
        points: [
            'Refresh the page and sign in again if the session expired.',
            'Open Manage Account when profile details need to be reviewed.',
            'Send an issue report if the account still cannot load after signing in again.'
        ]
    },
    {
        id: 'new-account',
        category: 'account',
        title: 'Create a new account',
        summary: 'What to check when signing up for Amanflix for the first time.',
        points: [
            'Use a unique username that has not already been registered.',
            'Email is optional, but if you add one it must match the required IDF email format.',
            'Choose a password with at least 8 characters before submitting the form.'
        ]
    },
    {
        id: 'profile-settings',
        category: 'account',
        title: 'Manage account settings',
        summary: 'Where to update profile details and account preferences.',
        points: [
            'Open Manage Account from the profile menu or the Help Center quick action.',
            'Save changes before leaving the page so the new details are applied.',
            'If a field does not update, refresh the page and check whether the session is still active.'
        ]
    },
    {
        id: 'session-expired',
        category: 'account',
        title: 'Session expired or logged out',
        summary: 'Why Amanflix may ask you to sign in again.',
        points: [
            'Amanflix may redirect you to sign in when your token expires or becomes invalid.',
            'Sign in again before retrying the original action.',
            'If this repeats immediately after signing in, report it with the page you were using.'
        ]
    },
    {
        id: 'playback',
        category: 'watching',
        title: 'Playback will not start',
        summary: 'Checks for stream loading, unavailable titles, and temporary service states.',
        points: [
            'Check service status on this page before retrying playback.',
            'Try a different title to see whether the issue is limited to one stream.',
            'Include the title name and what happened in an issue report.'
        ]
    },
    {
        id: 'buffering',
        category: 'watching',
        title: 'Video buffers or freezes',
        summary: 'Steps for slow playback, pauses, or repeated loading indicators.',
        points: [
            'Pause for a few seconds, then resume playback.',
            'Try a lower network load by closing other streaming tabs or downloads.',
            'If only one title freezes, send an issue report with the title name and timestamp.'
        ]
    },
    {
        id: 'watch-progress',
        category: 'watching',
        title: 'Continue watching looks wrong',
        summary: 'What to do when watch progress, finished status, or next episode data seems off.',
        points: [
            'Refresh the page after finishing a movie or episode.',
            'Open the same title again and confirm whether the progress bar updates.',
            'For show issues, include season and episode numbers in the issue report.'
        ]
    },
    {
        id: 'video-processing',
        category: 'watching',
        title: 'Video is processing',
        summary: 'Why an uploaded video may not play immediately.',
        points: [
            'Some uploads need processing before playback is available.',
            'Wait a few minutes, then retry the title.',
            'Report the title if it remains unavailable after repeated checks.'
        ]
    },
    {
        id: 'search-library',
        category: 'library',
        title: 'Search and My List results',
        summary: 'Useful checks when titles do not appear where expected.',
        points: [
            'Search with a shorter title or a single keyword.',
            'Open My List again after adding or removing a title.',
            'Report missing titles with the exact title name and category.'
        ]
    },
    {
        id: 'uploaded-content',
        category: 'library',
        title: 'Find uploaded movies and shows',
        summary: 'Where recently uploaded content appears in the app.',
        points: [
            'Use the Uploaded Movies quick action to open the uploaded movies list.',
            'Uploaded shows appear in the Uploaded Shows row on the home page.',
            'If a new upload is missing, search by exact title and then report it if it still does not appear.'
        ]
    },
    {
        id: 'my-list',
        category: 'library',
        title: 'Add or remove titles from My List',
        summary: 'How to manage saved movies and shows.',
        points: [
            'Open a title and use the list button to add or remove it.',
            'Return to My List from the navigation bar or Help Center quick action.',
            'Refresh My List if a recent change does not appear immediately.'
        ]
    },
    {
        id: 'search-filters',
        category: 'library',
        title: 'Use search filters',
        summary: 'How to narrow search results by media type, year, or rating.',
        points: [
            'Open Search and use the filter panel when there are too many results.',
            'Try a shorter keyword before applying filters.',
            'Reset filters if the result list becomes empty.'
        ]
    },
    {
        id: 'watch-party',
        category: 'party',
        title: 'Watch party code issues',
        summary: 'Code and joining checks for shared viewing sessions.',
        points: [
            'Use the latest code from the party host.',
            'Check that the code was entered without extra spaces.',
            'Ask the host to create a new party if the current session expired.'
        ]
    },
    {
        id: 'host-watch-party',
        category: 'party',
        title: 'Start a watch party',
        summary: 'How to prepare a shared viewing session.',
        points: [
            'Open the title you want to watch and start a party from the player controls when available.',
            'Share the generated party code with viewers who should join.',
            'Keep the party page open while others connect.'
        ]
    },
    {
        id: 'party-sync',
        category: 'party',
        title: 'Party playback is out of sync',
        summary: 'Checks for viewers who are not aligned with the host.',
        points: [
            'Ask viewers to stay on the party URL instead of opening the title separately.',
            'Pause and resume from the host player to resync playback.',
            'Create a new party if sync controls stop responding.'
        ]
    },
    {
        id: 'party-permissions',
        category: 'party',
        title: 'Cannot join a watch party',
        summary: 'Common reasons a party join request fails.',
        points: [
            'Confirm that you are signed in before joining.',
            'Use the current code from the host and avoid old screenshots or messages.',
            'Report the code and error text if the join button keeps failing.'
        ]
    },
    {
        id: 'maintenance',
        category: 'support',
        title: 'Maintenance or service downtime',
        summary: 'What the status indicator means when the platform is unavailable.',
        points: [
            'Available means normal browsing and playback should work.',
            'Maintenance means admins intentionally limited the service.',
            'Unavailable means the service is down or cannot be reached from the browser.'
        ]
    },
    {
        id: 'help-during-downtime',
        category: 'support',
        title: 'Open Help Center during downtime',
        summary: 'How to reach support information when the service is unavailable.',
        points: [
            'Use the question mark button in the bottom-right corner of the service-down page.',
            'The Help Center remains available even when browsing and playback are blocked.',
            'Use the service status panel on this page to check the current state.'
        ]
    },
    {
        id: 'missing-title-request',
        category: 'support',
        title: 'Request a missing title',
        summary: 'What to include when content is not available in Amanflix.',
        points: [
            'Search by exact title before sending a request.',
            'Include whether the missing content is a movie or TV show.',
            'Add season and episode details for TV requests when possible.'
        ]
    },
    {
        id: 'bug-report',
        category: 'support',
        title: 'Send an issue report',
        summary: 'Details that help admins reproduce and fix a problem faster.',
        points: [
            'Include the title, page, or party code involved.',
            'Describe the last action before the problem appeared.',
            'Mention whether the problem repeats after refreshing the page.'
        ]
    },
    {
        id: 'what-to-report',
        category: 'support',
        title: 'What details should I report?',
        summary: 'The fastest way to make a report actionable.',
        points: [
            'Write the page name, title name, or party code involved.',
            'Include the exact error message if one appears.',
            'Mention what you expected to happen and what happened instead.'
        ]
    }
];

const quickActions = [
    {
        title: 'Manage Account',
        description: 'Profile and password settings',
        to: '/profile',
        icon: <FaUserCircle />
    },
    {
        title: 'My List',
        description: 'Saved movies and shows',
        to: '/list',
        icon: <FaList />
    },
    {
        title: 'Join Party',
        description: 'Enter a watch party code',
        to: '/party',
        icon: <FaUsers />
    },
    {
        title: 'Uploaded Movies',
        description: 'Recently uploaded movies',
        to: '/movies/uploaded',
        icon: <FaPlayCircle />
    }
];

const issueCategories = ['Playback', 'Account', 'Library', 'Watch Party', 'Request', 'Other'];

const getStatusView = (status) => {
    if (status.loading) {
        return {
            type: 'loading',
            icon: <FaSyncAlt />,
            title: 'Checking status',
            text: 'Contacting the service status endpoint.'
        };
    }

    if (status.error) {
        return {
            type: 'error',
            icon: <FaExclamationTriangle />,
            title: 'Status unavailable',
            text: status.error
        };
    }

    if (status.data?.maintenance_mode) {
        return {
            type: 'warning',
            icon: <FaExclamationTriangle />,
            title: status.data.maintenance_title || 'Maintenance mode',
            text: status.data.maintenance_message || 'Service is temporarily limited.'
        };
    }

    if (status.data?.is_available) {
        return {
            type: 'online',
            icon: <FaCheckCircle />,
            title: 'Service available',
            text: 'Browsing and playback services are responding.'
        };
    }

    return {
        type: 'error',
        icon: <FaExclamationTriangle />,
        title: 'Service unavailable',
        text: status.data?.maintenance_message || 'The service is currently unavailable.'
    };
};

const HelpPage = () => {
    const contactSlotRef = useRef(null);
    const [query, setQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [openArticleId, setOpenArticleId] = useState(helpArticles[0].id);
    const [serviceStatus, setServiceStatus] = useState({ loading: true, data: null, error: '' });
    const [isIssuePanelFloating, setIsIssuePanelFloating] = useState(false);
    const [issuePanelPosition, setIssuePanelPosition] = useState({});
    const [issue, setIssue] = useState({
        title: '',
        category: issueCategories[0],
        description: ''
    });
    const [submitState, setSubmitState] = useState({ loading: false, type: '', message: '' });

    const fetchServiceStatus = useCallback(async () => {
        setServiceStatus({ loading: true, data: null, error: '' });

        try {
            const response = await fetch(`${API_URL}/api/service/status`);
            if (!response.ok) {
                throw new Error('The status endpoint returned an error.');
            }

            const data = await response.json();
            setServiceStatus({ loading: false, data, error: '' });
        } catch (error) {
            setServiceStatus({
                loading: false,
                data: null,
                error: error.message || 'Could not reach the status endpoint.'
            });
        }
    }, []);

    useEffect(() => {
        fetchServiceStatus();
    }, [fetchServiceStatus]);

    useEffect(() => {
        const updatePanelPosition = () => {
            if (!contactSlotRef.current) {
                return;
            }

            const isWideLayout = window.matchMedia('(min-width: 901px)').matches;
            const slotRect = contactSlotRef.current.getBoundingClientRect();
            const shouldFloat = isWideLayout && slotRect.top <= 86;

            setIsIssuePanelFloating(shouldFloat);
            setIssuePanelPosition(
                shouldFloat
                    ? {
                        left: `${slotRect.left}px`,
                        width: `${slotRect.width}px`
                    }
                    : {}
            );
        };

        const appShell = document.querySelector('.App');

        updatePanelPosition();
        window.addEventListener('scroll', updatePanelPosition, { passive: true });
        window.addEventListener('resize', updatePanelPosition);
        appShell?.addEventListener('scroll', updatePanelPosition, { passive: true });

        return () => {
            window.removeEventListener('scroll', updatePanelPosition);
            window.removeEventListener('resize', updatePanelPosition);
            appShell?.removeEventListener('scroll', updatePanelPosition);
        };
    }, []);

    const filteredArticles = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();

        return helpArticles.filter((article) => {
            const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
            const searchableText = [
                article.title,
                article.summary,
                categoryLabels[article.category],
                ...article.points
            ].join(' ').toLowerCase();

            return matchesCategory && (!normalizedQuery || searchableText.includes(normalizedQuery));
        });
    }, [query, selectedCategory]);

    const statusView = getStatusView(serviceStatus);

    const handleIssueChange = (event) => {
        const { name, value } = event.target;
        setIssue((currentIssue) => ({
            ...currentIssue,
            [name]: value
        }));
    };

    const handleIssueSubmit = async (event) => {
        event.preventDefault();

        if (!issue.title.trim() || !issue.description.trim()) {
            setSubmitState({
                loading: false,
                type: 'error',
                message: 'Add a title and details before sending.'
            });
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            setSubmitState({
                loading: false,
                type: 'error',
                message: 'Sign in before sending an issue report.'
            });
            return;
        }

        setSubmitState({ loading: true, type: '', message: '' });

        try {
            const formData = new FormData();
            formData.append('title', `[${issue.category}] ${issue.title.trim()}`);
            formData.append(
                'description',
                `${issue.description.trim()}\n\nCategory: ${issue.category}\nSource: Help Center`
            );

            const response = await fetch(`${API_URL}/api/bugreport`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.message || 'Could not send the issue report.');
            }

            setIssue({ title: '', category: issueCategories[0], description: '' });
            setSubmitState({
                loading: false,
                type: 'success',
                message: data.message || 'Issue report sent.'
            });
        } catch (error) {
            setSubmitState({
                loading: false,
                type: 'error',
                message: error.message || 'Could not send the issue report.'
            });
        }
    };

    return (
        <main className="HelpPage">
            <div className="help-shell">
                <section className="help-hero">
                    <div className="help-hero__copy">
                        <span className="help-eyebrow">
                            <FaHeadphones />
                            Help Center
                        </span>
                        <h1>Find help fast</h1>
                        <p>Search common issues, check service status, or send an issue report to the admin team.</p>
                    </div>

                    <div className={`help-status help-status--${statusView.type}`}>
                        <div className="help-status__icon" aria-hidden="true">
                            {statusView.icon}
                        </div>
                        <div className="help-status__body">
                            <span>Service status</span>
                            <strong>{statusView.title}</strong>
                            <p>{statusView.text}</p>
                            {serviceStatus.data?.estimated_downtime && (
                                <small>Estimated downtime: {serviceStatus.data.estimated_downtime}</small>
                            )}
                        </div>
                        <button
                            type="button"
                            className="help-status__refresh"
                            onClick={fetchServiceStatus}
                            title="Refresh status"
                            aria-label="Refresh status"
                            disabled={serviceStatus.loading}
                        >
                            <FaSyncAlt />
                        </button>
                    </div>
                </section>

                <section className="help-search-section" aria-label="Search help topics">
                    <div className="help-search-box">
                        <FaSearch aria-hidden="true" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search help topics"
                            aria-label="Search help topics"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery('')}
                                className="help-search-clear"
                                title="Clear search"
                                aria-label="Clear search"
                            >
                                <FaTimes />
                            </button>
                        )}
                    </div>

                    <div className="help-category-tabs" role="tablist" aria-label="Help categories">
                        {categories.map((category) => (
                            <button
                                key={category.id}
                                type="button"
                                className={selectedCategory === category.id ? 'active' : ''}
                                onClick={() => setSelectedCategory(category.id)}
                            >
                                {category.label}
                            </button>
                        ))}
                    </div>
                </section>

                <section className="help-quick-actions" aria-label="Quick actions">
                    {quickActions.map((action) => (
                        <Link to={action.to} className="help-action" key={action.title}>
                            <span className="help-action__icon" aria-hidden="true">
                                {action.icon}
                            </span>
                            <span>
                                <strong>{action.title}</strong>
                                <small>{action.description}</small>
                            </span>
                            <FaArrowRight className="help-action__arrow" aria-hidden="true" />
                        </Link>
                    ))}
                </section>

                <div className="help-main-grid">
                    <section className="help-articles" aria-label="Help topics">
                        <div className="help-section-heading">
                            <div>
                                <span>
                                    <FaQuestionCircle />
                                    Help topics
                                </span>
                                <h2>Common fixes</h2>
                            </div>
                            <strong>{filteredArticles.length} result{filteredArticles.length === 1 ? '' : 's'}</strong>
                        </div>

                        {filteredArticles.length === 0 ? (
                            <div className="help-empty-state">
                                <FaTv aria-hidden="true" />
                                <h3>No matching topics</h3>
                                <p>Try another keyword or send an issue report with the details.</p>
                            </div>
                        ) : (
                            <div className="help-article-list">
                                {filteredArticles.map((article) => {
                                    const isOpen = openArticleId === article.id;

                                    return (
                                        <article className={`help-article ${isOpen ? 'open' : ''}`} key={article.id}>
                                            <button
                                                type="button"
                                                className="help-article__header"
                                                onClick={() => setOpenArticleId(isOpen ? '' : article.id)}
                                                aria-expanded={isOpen}
                                            >
                                                <span className="help-article__content">
                                                    <span className="help-article__category">
                                                        {categoryLabels[article.category]}
                                                    </span>
                                                    <span className="help-article__title">{article.title}</span>
                                                    <span className="help-article__summary">{article.summary}</span>
                                                </span>
                                                <FaChevronDown className="help-article__chevron" aria-hidden="true" />
                                            </button>

                                            {isOpen && (
                                                <div className="help-article__body">
                                                    <ul>
                                                        {article.points.map((point) => (
                                                            <li key={point}>{point}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <aside className="help-contact-slot" ref={contactSlotRef} aria-label="Issue report">
                        <div
                            className={`help-contact-panel ${isIssuePanelFloating ? 'floating' : ''}`}
                            style={issuePanelPosition}
                        >
                            <div className="help-contact-panel__heading">
                                <span className="help-contact-panel__icon" aria-hidden="true">
                                    <FaBug />
                                </span>
                                <div>
                                    <span>Need an admin?</span>
                                    <h2>Report an issue</h2>
                                </div>
                            </div>

                            <form className="help-issue-form" onSubmit={handleIssueSubmit}>
                                <label>
                                    Title
                                    <input
                                        name="title"
                                        value={issue.title}
                                        onChange={handleIssueChange}
                                        placeholder="Short issue title"
                                    />
                                </label>

                                <label>
                                    Category
                                    <select name="category" value={issue.category} onChange={handleIssueChange}>
                                        {issueCategories.map((category) => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label>
                                    Details
                                    <textarea
                                        name="description"
                                        value={issue.description}
                                        onChange={handleIssueChange}
                                        placeholder="What happened? Include the title, page, or code involved."
                                        rows="6"
                                    />
                                </label>

                                {submitState.message && (
                                    <div className={`help-form-message help-form-message--${submitState.type}`}>
                                        {submitState.message}
                                    </div>
                                )}

                                <button type="submit" className="help-submit-button" disabled={submitState.loading}>
                                    <FaPaperPlane />
                                    {submitState.loading ? 'Sending...' : 'Send report'}
                                </button>
                            </form>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    );
};

export default HelpPage;
