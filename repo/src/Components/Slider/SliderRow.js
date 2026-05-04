import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, Children } from 'react';
import LoadingCard from '../Card/LoadingCard';
import './SliderRow.css';

function SliderRow({
  children,
  title,
  isClickable = false,
  onTitleClick,
  isLoading = false,
  skeletonCount = 6,
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(6);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportRef    = useRef(null);
  const trackRef       = useRef(null);
  const sliderRowRef   = useRef(null);
  const paginationRef  = useRef(null); // the pagination container DOM node

  // Drag refs — avoid stale closures in window event listeners
  const isDraggingRef   = useRef(false);
  const dragStartXRef   = useRef(0);
  const hasDraggedRef   = useRef(false);
  const pageOffsetRef   = useRef(0);
  const totalPagesRef   = useRef(0);
  const currentPageRef  = useRef(0);

  const DRAG_DEADZONE = 8; // px — movement below this is treated as a click

  const CARD_GAP = 4; // px gap between items

  // Responsive breakpoints via ResizeObserver
  const getItemsPerPage = (width) => {
    if (width < 500) return 2;
    if (width < 768) return 3;
    if (width < 1350) return 4;
    if (width < 1750) return 5;
    return 6;
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        setViewportWidth(w);
        const newItems = getItemsPerPage(w);
        setItemsPerPage(newItems);
        setCurrentPage((prev) => {
          const count = isLoading ? skeletonCount : Children.count(children);
          const pages = Math.ceil(count / newItems);
          return Math.min(prev, Math.max(0, pages - 1));
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [children, isLoading, skeletonCount]);

  const items = isLoading
    ? Array.from({ length: skeletonCount }, (_, i) => (
        <LoadingCard key={`skeleton-${i}`} />
      ))
    : Children.toArray(children);

  const totalPages = Math.ceil(items.length / itemsPerPage);

  // Pixel-based item sizing — avoids circular % dependency in flex/grid
  const itemWidth = viewportWidth > 0
    ? (viewportWidth - (itemsPerPage - 1) * CARD_GAP) / itemsPerPage
    : 0;
  const itemHeight = itemWidth > 0 ? Math.round(itemWidth * (160 / 290)) : 0;
  // How many pixels we shift the track per page
  const pageOffset = itemsPerPage * (itemWidth + CARD_GAP);
  const itemStyle = itemWidth > 0
    ? { width: `${itemWidth}px`, height: `${itemHeight}px`, flexShrink: 0 }
    : { flexShrink: 0 };

  // Reset to page 0 when items change (new data loaded)
  useEffect(() => {
    setCurrentPage(0);
  }, [items.length]);

  // Keep refs in sync with derived values
  useEffect(() => { pageOffsetRef.current  = pageOffset;  }, [pageOffset]);
  useEffect(() => { totalPagesRef.current  = totalPages;  }, [totalPages]);
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // ── Direct-DOM pagination helper ───────────────────────────
  const updatePaginationDirect = useCallback((virtualPage) => {
    const container = paginationRef.current;
    if (!container) return;
    const dashes = container.children;
    const tp = totalPagesRef.current;
    for (let i = 0; i < dashes.length; i++) {
      const amount = Math.max(0, 1 - Math.abs(virtualPage - i));
      dashes[i].style.width           = `${12 + 8 * amount}px`;
      dashes[i].style.backgroundColor = `rgba(255,255,255,${(0.35 + 0.65 * amount).toFixed(3)})`;
      dashes[i].style.transition      = 'none';
    }
  }, []);

  const resetPaginationDirect = useCallback((page) => {
    const container = paginationRef.current;
    if (!container) return;
    const dashes = container.children;
    for (let i = 0; i < dashes.length; i++) {
      dashes[i].style.removeProperty('width');
      dashes[i].style.removeProperty('background-color');
      dashes[i].style.removeProperty('transition');
      dashes[i].className = `slider-row__dash${i === page ? ' slider-row__dash--active' : ''}`;
    }
  }, []);

  // ── Direct-DOM track animation ─────────────────────────────
  useLayoutEffect(() => {
    if (!trackRef.current || pageOffset === 0) return;
    trackRef.current.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    trackRef.current.style.transform  = `translateX(${-(currentPage * pageOffset)}px)`;
    resetPaginationDirect(currentPage);
  }, [currentPage, pageOffset, resetPaginationDirect]);

  // Window-level mouse handlers — ZERO React state updates during drag
  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      if (Math.abs(delta) > DRAG_DEADZONE) {
        hasDraggedRef.current = true;
        // 1. Move track directly
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform  =
            `translateX(${-(currentPageRef.current * pageOffsetRef.current) + delta}px)`;
        }
        // 2. Update pagination dots directly
        const po = pageOffsetRef.current;
        if (po > 0) {
          const vp = Math.max(0, Math.min(
            currentPageRef.current + (-delta / po),
            totalPagesRef.current - 1
          ));
          updatePaginationDirect(vp);
        }
      }
    };

    const onMouseUp = (e) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      // Remove drag cursor class directly
      if (sliderRowRef.current) sliderRowRef.current.classList.remove('slider-row--dragging');

      if (hasDraggedRef.current) {
        const delta = e.clientX - dragStartXRef.current;
        const po = pageOffsetRef.current;
        const tp = totalPagesRef.current;
        const cp = currentPageRef.current;
        const SNAP_PX = 60;
        const absDelta = Math.abs(delta);
        const dir = -Math.sign(delta);
        const pages = absDelta < SNAP_PX ? 0 : Math.max(1, Math.round(absDelta / po));
        const nextPage = Math.max(0, Math.min(cp + dir * pages, tp - 1));
        if (trackRef.current) {
          trackRef.current.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          trackRef.current.style.transform  = `translateX(${-(nextPage * po)}px)`;
        }
        resetPaginationDirect(nextPage);
        setCurrentPage(nextPage);
      } else {
        if (trackRef.current) {
          trackRef.current.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
          trackRef.current.style.transform  =
            `translateX(${-(currentPageRef.current * pageOffsetRef.current)}px)`;
        }
        resetPaginationDirect(currentPageRef.current);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, [updatePaginationDirect, resetPaginationDirect]);

  const handleTrackMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDraggingRef.current  = true;
    hasDraggedRef.current  = false;
    dragStartXRef.current  = e.clientX;
    // Add drag cursor class directly — no React state
    if (sliderRowRef.current) sliderRowRef.current.classList.add('slider-row--dragging');
  }, []);

  // Capture-phase click: swallow the click if the mouse moved far enough
  const handleTrackClickCapture = useCallback((e) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      hasDraggedRef.current = false;
    }
  }, []);

  const handlePrev = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1));
  }, [totalPages]);

  const canGoPrev = currentPage > 0;
  const canGoNext = currentPage < totalPages - 1;

  return (
    <div className="slider-row" ref={sliderRowRef}>
      {/* Header */}
      <div className="slider-row__header">
        <div className="slider-row__title-group">
          <h2
            className={`slider-row__title${isClickable ? ' slider-row__title--clickable' : ''}`}
            onClick={isClickable ? onTitleClick : undefined}
          >
            {title}
          </h2>
          {isClickable && (
            <span className="slider-row__explore" onClick={onTitleClick}>
              Explore All <span className="slider-row__explore-chevron">›</span>
            </span>
          )}
        </div>

        {/* Pagination dashes — styled directly during drag, class-based otherwise */}
        {totalPages > 1 && (
          <div className="slider-row__pagination" ref={paginationRef}>
            {Array.from({ length: totalPages }, (_, i) => (
              <span
                key={i}
                className={`slider-row__dash${i === currentPage ? ' slider-row__dash--active' : ''}`}
                onClick={() => setCurrentPage(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Viewport */}
      <div className="slider-row__viewport" ref={viewportRef}>
        {/* Left arrow */}
        {canGoPrev && (
          <button
            className="slider-row__arrow slider-row__arrow--left"
            onClick={handlePrev}
            aria-label="Previous"
          >
            <span className="slider-row__arrow-icon">‹</span>
          </button>
        )}

        {/* Track — transform is applied directly via trackRef to avoid React reconciliation jank */}
        <div
          ref={trackRef}
          className="slider-row__track"
          onMouseDown={handleTrackMouseDown}
          onClickCapture={handleTrackClickCapture}
        >
          {items.map((item, idx) => (
            <div className="slider-row__item" key={idx} style={itemStyle}>
              {item}
            </div>
          ))}
        </div>

        {/* Right arrow */}
        {canGoNext && (
          <button
            className="slider-row__arrow slider-row__arrow--right"
            onClick={handleNext}
            aria-label="Next"
          >
            <span className="slider-row__arrow-icon">›</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default SliderRow;
