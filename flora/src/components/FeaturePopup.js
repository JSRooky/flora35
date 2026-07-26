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
  collapsed = false,
  onCollapsedChange,
  activeFilters = {},
  onFilterChange,
  activeStatusFilters = [],
  onStatusFilterChange
}) {
  const [showImages, setShowImages] = useState(false);

  const collapsedSummary = feature
    ? feature.properties?.name_ru ||
      feature.properties?.name_latin ||
      "Точка данных"
    : "Точка не выбрана";

  const geometry = feature?.geometry;
  const properties = feature?.properties;
  const [lng, lat] = geometry?.coordinates ?? [0, 0];
  const images = properties ? getImages(properties) : [];
  const displayProperties = properties
    ? Object.entries(properties).filter(
        ([key]) => !INTERNAL_PROPERTIES.has(key) && key !== "status"
      )
    : [];

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <>
      <div className={`feature-popup ${collapsed ? "feature-popup--collapsed" : ""}`}>
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">Сведения о точке данных</h3>
          <button
            type="button"
            className="popup-panel-toggle"
            onClick={() => onCollapsedChange?.(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            {collapsed ? "▾" : "▴"}
          </button>
        </div>

        {collapsed ? (
          <p className="popup-collapsed-summary">{collapsedSummary}</p>
        ) : (
          <div className="popup-content">
            {!feature ? (
              <p className="popup-empty-state">Выберите точку на карте</p>
            ) : null}

            {feature ? (
              <>
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
                      <div className="popup-item popup-item--filter">
                        <div className="popup-item-text">
                          <strong>status:</strong>
                          <span>{properties.status}</span>
                        </div>
                        <label className="property-switch" title="Показать маркеры с этим свойством">
                          <input
                            type="checkbox"
                            checked={activeStatusFilters.includes(properties.status)}
                            onChange={(e) =>
                              onStatusFilterChange?.(properties.status, e.target.checked)
                            }
                          />
                          <span className="property-switch-slider" />
                        </label>
                      </div>
                    )}

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
              </>
            ) : null}
          </div>
        )}
      </div>

      {showImages && images.length > 0 && (
        <FeatureImagesPopup
          images={images}
          onClose={() => setShowImages(false)}
        />
      )}
    </>
  );
}
