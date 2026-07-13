import React from "react";
import "../styles/FeaturePopup.css";

export default function FeaturePopup({ feature, onClose }) {
  if (!feature) return null;

  const { geometry, properties } = feature;
  const [lng, lat] = geometry.coordinates;

  return (
    <div className="feature-popup">
      <button className="popup-close" onClick={onClose}>
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
           
          </>
        )}
      </div>
    </div>
  );
}
