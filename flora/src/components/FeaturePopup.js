import React, { useEffect, useMemo, useState } from "react";
import { getPointsForSpecies } from "./addSpeciesPolygonLayer";
import FeatureImagesPopup from "./FeatureImagesPopup";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import SpeciesDescriptionPopup from "./SpeciesDescriptionPopup";
import {
  formatPointCount,
  formatPropertyValue,
  getPropertyLabel,
  sortPropertyEntries
} from "./featurePropertyLabels";
import { buildSharePointUrl, copyTextToClipboard } from "./sharePointLink";
import "../styles/FeaturePopup.css";

// Служебные поля, добавленные слоем карты; не показываем в списке свойств.
const INTERNAL_PROPERTIES = new Set([
  "image",
  "images",
  "species_id",
  "finding_id",
  "description_md"
]);

/**
 * Собирает URL иллюстраций из properties.
 * Поле `image` — служебная иконка маркера (plant.svg/animal.svg),
 * добавляемая слоем карты, и не является иллюстрацией вида — не используем её здесь.
 */
function getImages(properties) {
  if (properties.images?.length > 0) return properties.images;
  return [];
}

function ShareIcon() {
  return (
    <svg
      className="feature-popup-action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.27 3.27 0 0 0 0-1.39l7.05-4.11A2.991 2.991 0 1 0 14.05 6l-7.05 4.11a3 3 0 1 0 0 4.78l7.05 4.11a2.995 2.995 0 1 0 .9-1.92z"
        fill="currentColor"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      className="feature-popup-action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
        fill="currentColor"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="feature-popup-action-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
        fill="currentColor"
      />
    </svg>
  );
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
  const [showSpeciesDescription, setShowSpeciesDescription] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // блок справки из docs/moduleHelp.md, раздел ## feature
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const shareUrl = useMemo(() => buildSharePointUrl(feature), [feature]);

  useEffect(() => {
    setShowSpeciesDescription(false);
    setSharePanelOpen(false);
    setShareCopied(false);
  }, [feature?.id, feature?.properties?.finding_id]);

  useEffect(() => {
    if (!shareCopied) {
      return undefined;
    }

    const timerId = window.setTimeout(() => setShareCopied(false), 2000);
    return () => window.clearTimeout(timerId);
  }, [shareCopied]);

  const handleShareClick = () => {
    if (!shareUrl) {
      return;
    }

    setSharePanelOpen((open) => !open);
    setShareCopied(false);
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) {
      return;
    }

    await copyTextToClipboard(shareUrl);
    setShareCopied(true);
  };

  const collapsedSummary = feature
    ? feature.properties?.name_ru ||
      feature.properties?.name_latin ||
      "Точка данных"
    : "Точка не выбрана";

  const properties = feature?.properties;
  const speciesPointCount = feature ? getPointsForSpecies(feature).length : 0;
  const images = properties ? getImages(properties) : [];
  const descriptionPath = properties?.description_md;
  // status выводится отдельно — у него свой фильтр через StatusFilterPanel.
  const displayProperties = properties
    ? sortPropertyEntries(
        Object.entries(properties).filter(
          ([key]) => !INTERNAL_PROPERTIES.has(key) && key !== "status"
        )
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
                  <strong>Точек вида на карте:</strong>
                  <span>{formatPointCount(speciesPointCount)}</span>
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
                          <strong>{getPropertyLabel(key)}:</strong>
                          <span>{formatPropertyValue(key, value)}</span>
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
                          <strong>{getPropertyLabel("status")}:</strong>
                          <span>{formatPropertyValue("status", properties.status)}</span>
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
                  </>
                )}

                {(descriptionPath ||
                  images.length > 0 ||
                  onOpenAreal ||
                  onOpenBuffer ||
                  feature) && (
                  <div className="feature-popup-actions">
                    {descriptionPath && (
                      <button
                        type="button"
                        className="feature-popup-action-btn"
                        onClick={() => setShowSpeciesDescription(true)}
                      >
                        О виде
                      </button>
                    )}
                    {images.length > 0 && (
                      <button
                        type="button"
                        className="feature-popup-action-btn"
                        onClick={() => setShowImages(true)}
                      >
                        Иллюстрации
                      </button>
                    )}
                    {onOpenAreal && (
                      <button
                        type="button"
                        className={`feature-popup-action-btn${arealDockedOpen ? " feature-popup-action-btn--active" : ""}`}
                        onClick={onOpenAreal}
                        aria-pressed={arealDockedOpen}
                      >
                        Ареал
                      </button>
                    )}
                    {onOpenBuffer && (
                      <button
                        type="button"
                        className={`feature-popup-action-btn${bufferDockedOpen ? " feature-popup-action-btn--active" : ""}`}
                        onClick={onOpenBuffer}
                        aria-pressed={bufferDockedOpen}
                      >
                        Буфер
                      </button>
                    )}
                    <button
                      type="button"
                      className={`feature-popup-share-btn${sharePanelOpen ? " feature-popup-share-btn--active" : ""}`}
                      onClick={handleShareClick}
                      aria-label="Поделиться точкой"
                      aria-expanded={sharePanelOpen}
                      title="Поделиться точкой"
                      disabled={!shareUrl}
                    >
                      <ShareIcon />
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
        <ModuleHelpPanel sectionId={MODULE_IDS.FEATURE} open={helpOpen} />
      </div>

      {sharePanelOpen && shareUrl && !collapsed && (
        <div className="feature-share-panel">
          <p className="feature-share-panel-title">Ссылка на точку</p>
          <div className="feature-share-panel-row">
            <input
              type="text"
              className="feature-share-panel-url"
              value={shareUrl}
              readOnly
              aria-label="Ссылка на точку"
              onFocus={(event) => event.target.select()}
            />
            <button
              type="button"
              className={`feature-share-panel-copy${shareCopied ? " feature-share-panel-copy--copied" : ""}`}
              onClick={handleCopyShareUrl}
              aria-label={shareCopied ? "Ссылка скопирована" : "Скопировать ссылку"}
              title={shareCopied ? "Ссылка скопирована" : "Скопировать ссылку"}
            >
              {shareCopied ? <CheckIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>
      )}

      {showImages && images.length > 0 && (
        <FeatureImagesPopup
          images={images}
          onClose={() => setShowImages(false)}
        />
      )}

      {showSpeciesDescription && descriptionPath && (
        <SpeciesDescriptionPopup
          descriptionPath={descriptionPath}
          onClose={() => setShowSpeciesDescription(false)}
        />
      )}
    </>
  );
}
