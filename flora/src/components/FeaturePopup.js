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
  const [collapsed, setCollapsed] = useState(false);

  if (!feature) return null;

  const { geometry, properties } = feature;
  const [lng, lat] = geometry.coordinates;
  const images = properties ? getImages(properties) : [];
  const displayProperties = properties
    ? Object.entries(properties).filter(
        ([key]) => !INTERNAL_PROPERTIES.has(key) && key !== "status"
      )
    : [];
  const collapsedSummary = properties?.name_ru || properties?.name_latin || "Точка данных";

  const handleClose = () => {
    setShowImages(false);
    onClose();
  };

  return (
    <>
      <div className={`feature-popup ${collapsed ? "feature-popup--collapsed" : ""}`}>
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">Сведения о точке данных</h3>
          <div className="feature-popup-actions">
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? "Развернуть сведения о точке" : "Свернуть сведения о точке"}
            >
              {collapsed ? "▾" : "▴"}
            </button>
            <button className="popup-close" onClick={handleClose} aria-label="Закрыть">
              ×
            </button>
          </div>
        </div>

        {collapsed ? (
          <p className="popup-collapsed-summary">{collapsedSummary}</p>
        ) : (
          <div className="popup-content">
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

              {properties?.status && (
                <div className="popup-item">
                  <div className="popup-item-text">
                    <strong>status:</strong>
                    <span>{properties.status}</span>
                  </div>
                </div>
              )}

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
        )}
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
