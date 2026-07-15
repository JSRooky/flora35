import React, { useState } from "react";
import FeatureImagesPopup from "./FeatureImagesPopup";
import "../styles/FeaturePopup.css";

function getImages(properties) {
  if (properties.images?.length > 0) return properties.images;
  if (properties.image) return [properties.image];
  return [];
}

export default function FeaturePopup({ feature, onClose }) {
  const [showImages, setShowImages] = useState(false);

  if (!feature) return null;

  const { geometry, properties } = feature;
  const [lng, lat] = geometry.coordinates;
  const images = properties ? getImages(properties) : [];

  const handleClose = () => {
    setShowImages(false);
    onClose();
  };

  return (
    <>
      <div className="feature-popup">
        <button className="popup-close" onClick={handleClose}>
          ×
        </button>

        <div className="popup-content">
          <h3>Marker Info</h3>

          <div className="popup-item">
            <strong>Latitude:</strong>
            <span>{lat.toFixed(4)}</span>
          </div>

          <div className="popup-item">
            <strong>Longitude:</strong>
            <span>{lng.toFixed(4)}</span>
          </div>

          {properties && Object.entries(properties).length > 0 && (
            <>
              <hr />
              <h4>Properties</h4>

              {Object.entries(properties).map(([key, value]) => (
                <div key={key} className="popup-item">
                  <strong>{key}:</strong>
                  <span>{String(value)}</span>
                </div>
              ))}

              {images.length > 0 && (
                <button
                  className="popup-images-btn"
                  onClick={() => setShowImages(true)}
                >
                  Иллюстрации
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showImages && (
        <FeatureImagesPopup
          images={images}
          onClose={() => setShowImages(false)}
        />
      )}
    </>
  );
}
