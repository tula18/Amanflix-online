import React from 'react';
import { API_URL } from '../../config';
import './CategoryHeader.css';

const getImageUrl = (path) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;

    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_URL}/cdn/images${normalizedPath}`;
};

const CategoryHeader = ({
    title,
    eyebrow,
    description,
    meta = [],
    actions,
    backgroundPath,
    tone = 'default'
}) => {
    const imageUrl = getImageUrl(backgroundPath);
    const metaItems = meta.filter(Boolean);

    return (
        <section
            className={`category-header category-header--${tone}${imageUrl ? ' category-header--image' : ''}`}
            style={imageUrl ? { '--category-header-image': `url("${imageUrl}")` } : undefined}
        >
            <div className="category-header__content">
                <div className="category-header__copy">
                    {eyebrow && <span className="category-header__eyebrow">{eyebrow}</span>}
                    <h1>{title}</h1>
                    {description && <p>{description}</p>}
                </div>

                {(actions || metaItems.length > 0) && (
                    <div className="category-header__meta" aria-label="Category details">
                        {actions}
                        {metaItems.map((item, index) => (
                            <span key={`${item}-${index}`}>{item}</span>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default CategoryHeader;
