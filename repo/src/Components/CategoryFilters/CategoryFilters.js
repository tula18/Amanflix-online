import React, { useEffect, useState } from 'react';
import { API_URL } from '../../config';
import './CategoryFilters.css';

const CURRENT_YEAR = new Date().getFullYear();
const FILTER_PANEL_ANIMATION_MS = 280;

export const DEFAULT_CATEGORY_FILTERS = {
    genre: '',
    year: '',
    minRating: 0,
    maxRating: 10,
    mediaType: 'all'
};

export const CategoryFiltersToggle = ({
    filtersOpen,
    onToggle
}) => (
    <button
        className="category-filters__toggle"
        onClick={onToggle}
        aria-expanded={filtersOpen}
    >
        {filtersOpen ? '▲ Hide Filters' : '▼ Filters'}
    </button>
);

const CategoryFilters = ({
    filters,
    onChange,
    showMediaType = false,
    filtersOpen: controlledFiltersOpen,
    onToggle,
    hideToggle = false
}) => {
    const [facets, setFacets] = useState({
        genres: [],
        year_min: 1900,
        year_max: CURRENT_YEAR
    });
    const [internalFiltersOpen, setInternalFiltersOpen] = useState(false);
    const filtersOpen = controlledFiltersOpen ?? internalFiltersOpen;
    const toggleFilters = onToggle ?? (() => setInternalFiltersOpen(open => !open));
    const [shouldRenderPanel, setShouldRenderPanel] = useState(filtersOpen);
    const [panelExpanded, setPanelExpanded] = useState(filtersOpen);

    useEffect(() => {
        fetch(`${API_URL}/cdn/facets`)
            .then(res => res.json())
            .then(data => setFacets({
                genres: data.genres || [],
                year_min: data.year_min || 1900,
                year_max: data.year_max || CURRENT_YEAR
            }))
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (filtersOpen) {
            setShouldRenderPanel(true);
            setPanelExpanded(false);
            const timeoutId = window.setTimeout(() => setPanelExpanded(true), 20);
            return () => window.clearTimeout(timeoutId);
        }
        setPanelExpanded(false);
        const timeoutId = window.setTimeout(() => setShouldRenderPanel(false), FILTER_PANEL_ANIMATION_MS);
        return () => window.clearTimeout(timeoutId);
    }, [filtersOpen]);

    const updateFilters = (nextFilters) => {
        onChange({
            ...filters,
            ...nextFilters
        });
    };

    const resetFilters = () => {
        onChange(DEFAULT_CATEGORY_FILTERS);
    };

    if (hideToggle && !shouldRenderPanel) {
        return null;
    }

    return (
        <div className="category-filters">
            {!hideToggle && (
                <CategoryFiltersToggle
                    filtersOpen={filtersOpen}
                    onToggle={toggleFilters}
                />
            )}

            {shouldRenderPanel && (
                <div
                    className={`category-filters__body${panelExpanded ? ' category-filters__body--open' : ' category-filters__body--closed'}`}
                    aria-hidden={!filtersOpen}
                    onTransitionEnd={event => {
                        if (event.target === event.currentTarget && event.propertyName === 'max-height' && !filtersOpen) {
                            setShouldRenderPanel(false);
                        }
                    }}
                >
                    <label className="category-filter__label">
                        Genre
                        <select
                            className="category-filter__select"
                            value={filters.genre}
                            onChange={event => updateFilters({ genre: event.target.value })}
                        >
                            <option value="">All genres</option>
                            {facets.genres.map(genre => (
                                <option key={genre} value={genre}>{genre}</option>
                            ))}
                        </select>
                    </label>

                    <label className="category-filter__label">
                        Year
                        <input
                            className="category-filter__input"
                            type="number"
                            placeholder={`${facets.year_min}-${facets.year_max}`}
                            min={facets.year_min || 1900}
                            max={facets.year_max || CURRENT_YEAR}
                            value={filters.year}
                            onChange={event => updateFilters({ year: event.target.value })}
                        />
                    </label>

                    <div className="category-filter__label">
                        Rating
                        <div className="category-filter__rating-row">
                            <span>{filters.minRating.toFixed(1)}</span>
                            <input
                                type="range"
                                className="category-filter__range"
                                min={0}
                                max={10}
                                step={0.5}
                                value={filters.minRating}
                                onChange={event => {
                                    const value = parseFloat(event.target.value);
                                    updateFilters({
                                        minRating: value,
                                        maxRating: value > filters.maxRating ? value : filters.maxRating
                                    });
                                }}
                            />
                            <span>-</span>
                            <input
                                type="range"
                                className="category-filter__range"
                                min={0}
                                max={10}
                                step={0.5}
                                value={filters.maxRating}
                                onChange={event => {
                                    const value = parseFloat(event.target.value);
                                    updateFilters({
                                        minRating: value < filters.minRating ? value : filters.minRating,
                                        maxRating: value
                                    });
                                }}
                            />
                            <span>{filters.maxRating.toFixed(1)}</span>
                        </div>
                    </div>

                    {showMediaType && (
                        <label className="category-filter__label">
                            Type
                            <select
                                className="category-filter__select"
                                value={filters.mediaType}
                                onChange={event => updateFilters({ mediaType: event.target.value })}
                            >
                                <option value="all">All</option>
                                <option value="movies">Movies</option>
                                <option value="tv">TV Shows</option>
                            </select>
                        </label>
                    )}

                    <button
                        className="category-filter__reset"
                        onClick={resetFilters}
                    >
                        Reset filters
                    </button>
                </div>
            )}
        </div>
    );
};

export default CategoryFilters;
