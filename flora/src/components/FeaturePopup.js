import React, { useState } from "react";
import FeatureImagesPopup from "./FeatureImagesPopup";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/FeaturePopup.css";

// Служебные поля, добавленные слоем карты; не показываем в списке свойств.
const INTERNAL_PROPERTIES = new Set(["image", "images", "species_id", "finding_id"]);

/**
 * Собирает URL иллюстраций из properties.
 * Поле `image` — служебная иконка маркера (plant.svg/animal.svg),
 * добавляемая слоем карты, и не является иллюстрацией вида — не используем её здесь.
 */
function getImages(properties) {
  if (properties.images?.length > 0) return properties.images;
  return [];
}

export default function FeaturePopup({
  feature,
  collapsed = false,
  onCollapsedChange,
  activeFilters = {},
  onFilterChange,
  activeStatusFilters = [],
  onStatusFilterChange,
  onFiltersReset,
  onOpenAreal,
  arealDockedOpen = false,
  onOpenBuffer,
  bufferDockedOpen = false
}) {
  const [showImages, setShowImages] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // блок справки из docs/moduleHelp.md, раздел ## feature

  const collapsedSummary = feature
    ? feature.properties?.name_ru ||
      feature.properties?.name_latin ||
      "Точка данных"
    : "Точка не выбрана";

  const geometry = feature?.geometry;
  const properties = feature?.properties;
  const [lng, lat] = geometry?.coordinates ?? [0, 0];
  const images = properties ? getImages(properties) : [];
  // status выводится отдельно — у него свой фильтр через StatusFilterPanel.
  const displayProperties = properties
    ? Object.entries(properties).filter(
        ([key]) => !INTERNAL_PROPERTIES.has(key) && key !== "status"
      )
    : [];

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const hasPropertyFilters = Object.keys(activeFilters).length > 0;
  const hasStatusFilter =
    Boolean(properties?.status) && activeStatusFilters.includes(properties.status);
  const canResetFilters = hasPropertyFilters || hasStatusFilter;

  return (
    <>
      <div className={`feature-popup ${collapsed ? "feature-popup--collapsed" : ""}`}>
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">Сведения о точке данных</h3>
          <div className="popup-panel-header-actions">
            <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
            {onCollapsedChange && (
              <button
                type="button"
                className="popup-panel-toggle"
                onClick={() => onCollapsedChange(!collapsed)}
                aria-expanded={!collapsed}
                aria-label={toggleLabel}
                title={toggleLabel}
              >
                {collapsed ? "▾" : "▴"}
              </button>
            )}
          </div>
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
                    <div className="popup-section-header">
                      <h4>Основное</h4>
                      <button
                        type="button"
                        className="popup-filters-reset"
                        onClick={() => onFiltersReset?.()}
                        disabled={!canResetFilters}
                        aria-label="Сбросить все фильтры свойств"
                        title="Сбросить все фильтры свойств"
                      >
                        Сброс
                      </button>
                    </div>

                    {displayProperties.map(([key, value]) => (
                      <div key={key} className="popup-item popup-item--filter">
                        <div className="popup-item-text">
                          <strong>{key}:</strong>
                          <span>{String(value)}</span>
                        </div>
                        <label className="property-switch" title="Показать маркеры с этим свойством">
                          <input
                            type="checkbox"
                            // Фильтр по точному совпадению пары ключ–значение.
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

                {(onOpenAreal || onOpenBuffer) && (
                  <div className="feature-module-actions">
                    {onOpenAreal && (
                      <button
                        type="button"
                        className={`feature-open-areal-btn${arealDockedOpen ? " feature-open-areal-btn--active" : ""}`}
                        onClick={onOpenAreal}
                        disabled={arealDockedOpen}
                      >
                        {arealDockedOpen ? "Ареал открыт" : "Ареал"}
                      </button>
                    )}
                    {onOpenBuffer && (
                      <button
                        type="button"
                        className={`feature-open-buffer-btn${bufferDockedOpen ? " feature-open-buffer-btn--active" : ""}`}
                        onClick={onOpenBuffer}
                        disabled={bufferDockedOpen}
                      >
                        {bufferDockedOpen ? "Буфер открыт" : "Буфер"}
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
        <ModuleHelpPanel sectionId={MODULE_IDS.FEATURE} open={helpOpen} />
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
