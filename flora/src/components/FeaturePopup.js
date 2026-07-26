import React, { useState } from "react";
import FeatureImagesPopup from "./FeatureImagesPopup";
import "../styles/FeaturePopup.css";

const INTERNAL_PROPERTIES = new Set(["image", "images"]);

function getImages(properties) {
  if (properties.images?.length > 0) return properties.images;
  if (properties.image) return [properties.image];
  return [];
}

export default function FeaturePopup({
  feature,
  onClose,
  activeFilters = {},
  onFilterChange,
  clusterByRegnum = true,
  onClusterByRegnumChange
}) {
  const [showImages, setShowImages] = useState(false);

  if (!feature) return null;

  const { geometry, properties } = feature;
  const [lng, lat] = geometry.coordinates;
  const images = properties ? getImages(properties) : [];
  const displayProperties = properties
    ? Object.entries(properties).filter(([key]) => !INTERNAL_PROPERTIES.has(key))
    : [];

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
          <h3>Сведения о точке данных</h3>

          <div className="popup-item">
            <strong>Широта:</strong>
            <span>{lat.toFixed(4)}</span>
          </div>

          <div className="popup-item">
            <strong>Долгота:</strong>
            <span>{lng.toFixed(4)}</span>
          </div>

          {displayProperties.length > 0 && (
            <>
              <hr />
              <h4>Основное</h4>

              {displayProperties.map(([key, value]) => (
                <div key={key} className="popup-item popup-item--filter">
                  <div className="popup-item-text">
                    <strong>{key}:</strong>
                    <span>{String(value)}</span>
                  </div>
                  <label className="property-switch" title="Показать маркеры с этим свойством">
                    <input
                      type="checkbox"
                      checked={activeFilters[key] === value}
                      onChange={(e) => onFilterChange?.(key, value, e.target.checked)}
                    />
                    <span className="property-switch-slider" />
                  </label>
                </div>
              ))}

              <hr />
              <h4>Кластеризация</h4>

              <label className="feature-switch" title="Группировать в кластеры только точки с одинаковым regnum">
                <input
                  type="checkbox"
                  checked={clusterByRegnum}
                  onChange={(e) => onClusterByRegnumChange?.(e.target.checked)}
                />
                <span className="feature-switch-slider" />
                <span className="feature-switch-label">Группировать по царству</span>
              </label>

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
