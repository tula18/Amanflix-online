export const applyCategoryFiltersToUrl = (url, filters) => {
    const nextUrl = new URL(url);

    nextUrl.searchParams.set('min_rating', filters.minRating);
    nextUrl.searchParams.set('max_rating', filters.maxRating);

    if (filters.genre) {
        nextUrl.searchParams.set('genre', filters.genre);
    }

    if (filters.year) {
        nextUrl.searchParams.set('year', filters.year);
    } else {
        nextUrl.searchParams.delete('year');
    }

    return nextUrl.toString();
};

export const applyNewTitleFiltersToUrl = (url, filters) => {
    const nextUrl = new URL(applyCategoryFiltersToUrl(url, filters));

    if (filters.mediaType === 'movies') {
        nextUrl.searchParams.set('content_type', 'movie');
    } else if (filters.mediaType === 'tv') {
        nextUrl.searchParams.set('content_type', 'tv');
    } else {
        nextUrl.searchParams.delete('content_type');
    }

    return nextUrl.toString();
};
