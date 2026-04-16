/**
 * PhotoGallery - alternating full-width + two-up layout with lightbox.
 *
 * Rhythm: image 0 full-width, images 1+2 two-up pair, image 3 full-width, 4+5 two-up, etc.
 * An odd trailing image renders as a single full-width at the end.
 *
 * Lightbox: swipe (touch), arrow keys (desktop), click backdrop or X to close, Esc to close.
 * All images are lazy-loaded except the first (eager) - lightbox uses the same src.
 *
 * Props:
 *   images: Array<{ src: string, alt: string }>   - ordered gallery array from realWeddings frontmatter
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export default function PhotoGallery({ images = [] }) {
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const isOpen = lightboxIndex !== null;

  // Chunk images into the alternating rhythm: [full, pair, full, pair, ...]
  const rows = useMemo(() => {
    const out = [];
    let i = 0;
    while (i < images.length) {
      out.push({ type: 'full', indices: [i] });
      i += 1;
      if (i < images.length) {
        const pair = [i];
        if (i + 1 < images.length) pair.push(i + 1);
        out.push({ type: pair.length === 2 ? 'pair' : 'full', indices: pair });
        i += pair.length;
      }
    }
    return out;
  }, [images]);

  const openAt = useCallback((i) => setLightboxIndex(i), []);
  const close = useCallback(() => setLightboxIndex(null), []);
  const next = useCallback(() => {
    setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % images.length));
  }, [images.length]);
  const prev = useCallback(() => {
    setLightboxIndex((p) => (p === null ? null : (p - 1 + images.length) % images.length));
  }, [images.length]);

  // Keyboard navigation + body scroll lock while lightbox is open
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close, next, prev]);

  // Touch swipe on the lightbox image
  const [touchStart, setTouchStart] = useState(null);
  const onTouchStart = (e) => setTouchStart(e.changedTouches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchStart === null) return;
    const dx = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
    setTouchStart(null);
  };

  if (!images.length) return null;

  return (
    <div className="rw-gallery">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className={row.type === 'pair' ? 'rw-gallery-pair' : 'rw-gallery-full'}>
          {row.indices.map((i) => (
            <button
              key={i}
              type="button"
              className="rw-gallery-tile"
              aria-label={`View photo ${i + 1} of ${images.length}: ${images[i].alt}`}
              onClick={() => openAt(i)}
            >
              <img
                src={images[i].src}
                alt={images[i].alt}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </button>
          ))}
        </div>
      ))}

      {isOpen && (
        <div
          className="rw-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${lightboxIndex + 1} of ${images.length}`}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <button type="button" className="rw-lightbox-close" aria-label="Close photo viewer" onClick={close}>
            <span aria-hidden="true">&times;</span>
          </button>

          {images.length > 1 && (
            <button
              type="button"
              className="rw-lightbox-prev"
              aria-label="Previous photo"
              onClick={(e) => { e.stopPropagation(); prev(); }}
            >
              <span aria-hidden="true">&larr;</span>
            </button>
          )}

          <figure className="rw-lightbox-figure" onClick={(e) => e.stopPropagation()}>
            <img src={images[lightboxIndex].src} alt={images[lightboxIndex].alt} />
            <figcaption className="rw-lightbox-count">{lightboxIndex + 1} / {images.length}</figcaption>
          </figure>

          {images.length > 1 && (
            <button
              type="button"
              className="rw-lightbox-next"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); next(); }}
            >
              <span aria-hidden="true">&rarr;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
