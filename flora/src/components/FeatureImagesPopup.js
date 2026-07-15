import React, { useEffect, useState } from "react";
import "../styles/FeatureImagesPopup.css";

export default function FeatureImagesPopup({ images, onClose }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [images]);

  if (!images || images.length === 0) return null;

  const next = () => setIndex((i) => (i + 1) % images.length);
  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);

  return (
    <div className="img-popup-overlay" onClick={onClose}>
      <div className="img-popup" onClick={(e) => e.stopPropagation()}>
        <button className="img-popup-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>

        <div className="img-popup-content">
          <img
            src={images[index]}
            alt={`Иллюстрация ${index + 1}`}
            className="img-popup-image"
          />

          {images.length > 1 && (
            <div className="img-popup-controls">
              <button className="img-popup-btn" onClick={prev} aria-label="Предыдущее">
                ←
              </button>
              <span className="img-popup-counter">
                {index + 1} / {images.length}
              </span>
              <button className="img-popup-btn" onClick={next} aria-label="Следующее">
                →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
