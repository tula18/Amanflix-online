export const getContentType = (item) => {
  const rawType = item?.media_type || item?.content_type || item?.type;

  if (rawType === 'movie' || rawType === 'movies') return 'movie';
  if (rawType === 'tv' || rawType === 'tv_series' || rawType === 'show' || rawType === 'shows') return 'tv';

  if (item?.first_air_date || item?.name || item?.show_id) return 'tv';
  return 'movie';
};

export const getContentId = (item) => item?.id ?? item?.show_id ?? item?.movie_id;

export const createMyListFormData = (item) => {
  const formData = new FormData();
  const contentType = getContentType(item);
  const contentId = getContentId(item);

  if (contentType) formData.append('content_type', contentType);
  if (contentId !== undefined && contentId !== null) formData.append('content_id', contentId);

  return formData;
};
