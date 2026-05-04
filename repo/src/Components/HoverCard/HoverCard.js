import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './HoverCard.css';
import { API_URL } from '../../config';
import { createMyListFormData } from '../../Utils/myListPayload';

const HOVER_WIDTH = 320; // px

function HoverCard({ movie, anchorRect, onClose, onInfoClick, onPopupEnter, closing, onExitComplete }) {
  const ref = useRef(null);
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [inList, setInList] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const leaveTimerRef = useRef(null);

  // Fade-in on mount + check mylist status
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));

    const checkMyList = async () => {
      const token = localStorage.getItem('token');
      if (!token || !movie) return;
      try {
        const fd = createMyListFormData(movie);
        const res = await fetch(`${API_URL}/api/mylist/check`, {
          method: 'POST',
          body: fd,
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setInList(data.exists);
        }
      } catch (_) {}
    };
    checkMyList();

    return () => cancelAnimationFrame(id);
  }, [movie]);

  // Animate out when closing
  useEffect(() => {
    if (closing) setVisible(false);
  }, [closing]);

  const handleTransitionEnd = (e) => {
    if (e.propertyName === 'opacity' && !visible && onExitComplete) {
      onExitComplete();
    }
  };

  // Position: centered over anchor card
  const style = (() => {
    if (!anchorRect) return { display: 'none' };
    const vw = window.innerWidth;
    const hoverHeight = HOVER_WIDTH * (9 / 16) + 110;

    let left = anchorRect.left + anchorRect.width / 2 - HOVER_WIDTH / 2 + window.scrollX;
    left = Math.max(12, Math.min(left, vw - HOVER_WIDTH - 12));
    let top = anchorRect.top + window.scrollY + anchorRect.height / 2 - hoverHeight / 2;

    return { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` };
  })();

  const handleMouseEnter = () => {
    clearTimeout(leaveTimerRef.current);
    if (onPopupEnter) onPopupEnter();
  };

  const handleMouseLeave = (e) => {
    // Don't close if mouse is still within the hover card bounds
    // (e.g. moving from info strip up to thumbnail area, which has pointer-events:none)
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      if (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top  && e.clientY <= rect.bottom
      ) return;
    }
    leaveTimerRef.current = setTimeout(onClose, 200);
  };

  const handleInfoClick = (e) => {
    e.stopPropagation();
    onClose();
    onInfoClick(movie, e);
  };

  const handlePlay = async (e) => {
    e.stopPropagation();
    onClose();
    const mediaType = movie.media_type || movie.content_type;
    const movieId = movie.id || movie.show_id;
    const wh = movie.watch_history;

    if (mediaType === 'tv') {
      if (wh?.finished_show) {
        navigate(`/watch/t-${movieId}-1-1?timestamp=0`);
        return;
      }
      const token = localStorage.getItem('token');
      if (!token) {
        navigate(`/watch/t-${movieId}-1-1`);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/watch-history/next-episode/${movieId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const isCompleted = wh && wh.is_completed;
          const ts = isCompleted ? '?timestamp=0' : '';
          if (data.episode_id) {
            navigate(`/watch/${data.episode_id}${ts}`);
          } else {
            navigate(`/watch/t-${movieId}-${data.season_number}-${data.episode_number}${ts}`);
          }
        } else {
          navigate(`/watch/t-${movieId}-1-1`);
        }
      } catch (_) {
        navigate(`/watch/t-${movieId}-1-1`);
      }
    } else {
      const isCompleted = wh && wh.is_completed;
      const ts = isCompleted ? '?timestamp=0' : '';
      navigate(`/watch/m-${movieId}${ts}`);
    }
  };

  // Derive play button label from embedded watch_history
  const getPlayLabel = () => {
    const wh = movie.watch_history;
    const mt = movie.media_type || movie.content_type;
    if (mt === 'tv') {
      if (!wh) return 'Play';
      if (wh.finished_show) return 'Replay';
      if (wh.is_completed && wh.next_episode) {
        return wh.next_episode.restarted ? 'Play' : 'Play Next Episode';
      }
      return 'Resume';
    } else {
      if (!wh || wh.progress_percentage === 0) return 'Play';
      if (wh.progress_percentage >= 98) return 'Replay';
      return 'Resume';
    }
  };

  const playLabel = getPlayLabel();

  const handleMyList = async (e) => {
    e.stopPropagation();
    const token = localStorage.getItem('token');
    if (!token || listLoading) return;
    setListLoading(true);
    try {
      const fd = createMyListFormData(movie);
      const url = `${API_URL}/api/mylist/${inList ? 'delete' : 'add'}`;
      const res = await fetch(url, {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInList(data.exist === true);
      }
    } catch (_) {}
    setListLoading(false);
  };

  const displayTitle = movie.name || movie.title || '';
  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const rating = movie.vote_average ? Math.round(movie.vote_average * 10) / 10 : null;
  const mediaType = movie.media_type || movie.content_type;
  const imgSrc = `${API_URL}/cdn/images${movie.backdrop_path}`;

  // ── Badge / progress logic — mirrors Card.js exactly ─────────
  const wh = movie.watch_history;
  const mt = movie.media_type || movie.content_type;
  const isWatched = wh?.is_completed || false;
  const isShowCompleted = mt !== 'movie' && isWatched && wh?.finished_show;
  const shouldShowWatchedBadge = (mt === 'movie' && isWatched) || isShowCompleted;

  const episodeBadge = (() => {
    if (!wh || wh.finished_show || mt !== 'tv') return null;
    if (wh.is_completed && wh.next_episode) {
      return { season: wh.next_episode.season_number, episode: wh.next_episode.episode_number, isNext: true };
    }
    if (wh.season_number && wh.episode_number) {
      return { season: wh.season_number, episode: wh.episode_number, isNext: false };
    }
    return null;
  })();
  const shouldShowEpisodeBadge = episodeBadge && !wh?.finished_show;

  // Progress only shown when NOT fully watched (same as Card.js watchProgress > 0 && isWatched === false)
  const progressPercentage = (() => {
    if (!wh || isWatched) return 0;
    if (mt === 'tv' && wh.is_completed && wh.next_episode) {
      return wh.next_episode.progress_percentage || 0;
    }
    return wh.progress_percentage || 0;
  })();

  const popup = (
    <div
      ref={ref}
      className={`hover-card${visible ? ' hover-card--visible' : ''}`}
      style={style}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Thumbnail — pointer-events:none in CSS, so events pass through to the slider card below */}
      <div className="hover-card__thumb">
        <img
          src={imgSrc}
          alt=""
          draggable="false"
          onError={(e) => { e.target.src = `${API_URL}/cdn/images/unkwon_image.jpg`; }}
        />
        {/* Watched badge — same text/position as Card.js */}
        {shouldShowWatchedBadge && (
          <div className="hover-card__badge">
            <span>Watched</span>
          </div>
        )}
        {/* Episode badge — matches Card.js exactly */}
        {shouldShowEpisodeBadge && (
          <div className={`hover-card__badge${episodeBadge.isNext ? ' hover-card__badge--next' : ''}`}>
            <span>
              {episodeBadge.isNext ? 'Next: ' : ''}
              S{episodeBadge.season} E{episodeBadge.episode}
            </span>
          </div>
        )}
        {progressPercentage > 0 && (
          <div className="hover-card__progress-container">
            <div className="hover-card__progress-bar" style={{ width: `${progressPercentage}%` }} />
          </div>
        )}
      </div>

      {/* Info section — pointer-events:auto so buttons work; enter/leave handled here */}
      <div
        className="hover-card__info"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="hover-card__actions">
          {/* Play */}
          <button className="hover-card__btn hover-card__btn--play hover-card__btn--play-wide" title={playLabel} onClick={handlePlay}>
            {playLabel === 'Replay' ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" style={{ flexShrink: 0 }}>
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14" style={{ marginLeft: '2px', flexShrink: 0 }}>
                <polygon points="6,3 20,12 6,21" />
              </svg>
            )}
            <span>{playLabel}</span>
          </button>

          {/* My List */}
          <button
            className={`hover-card__btn hover-card__btn--list${inList ? ' hover-card__btn--list-active' : ''}`}
            title={inList ? 'Remove from My List' : 'Add to My List'}
            onClick={handleMyList}
            disabled={listLoading}
          >
            {inList ? (
              /* Checkmark */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              /* Plus */
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            )}
          </button>

          {/* More Info — pushed to the right */}
          <button className="hover-card__btn hover-card__btn--info hover-card__btn--right" title="More Info" onClick={handleInfoClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        <div className="hover-card__title">{displayTitle}</div>

        <div className="hover-card__meta">
          {rating !== null && <span className="hover-card__rating">★ {rating}</span>}
          {year && <span className="hover-card__year">{year}</span>}
          {mediaType && (
            <span className="hover-card__type">
              {mediaType === 'movie' ? 'Movie' : 'Series'}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(popup, document.body);
}

export default HoverCard;
