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
import { getOverlayEntry } from "../names/nameRuCache";
import "../styles/FeaturePopup.css";

// Служебные поля, добавленные слоем карты; не показываем в списке свойств.
const INTERNAL_PROPERTIES = new Set([
  "image",
  "images",
  "species_id",
  "finding_id",
  "description_md",
  "source",
  "gbif_url",
  "species_key"
]);

/** Поля GBIF, которые уводим в раскрывающийся блок «Информация из GBIF». */
const GBIF_META_PROPERTIES = new Set(["basisOfRecord", "gbif_key", "datasetKey"]);

const GBIF_META_DISPLAY_ORDER = ["basisOfRecord", "gbif_key", "datasetKey"];

function isGbifFeature(feature) {
  return feature?.properties?.source === "gbif";
}

function hasDisplayValue(value) {
  return value != null && value !== "";
}

function sortGbifMetaEntries(entries) {
  const order = new Map(GBIF_META_DISPLAY_ORDER.map((key, index) => [key, index]));

  return [...entries].sort(([keyA], [keyB]) => {
    const orderA = order.has(keyA) ? order.get(keyA) : Number.MAX_SAFE_INTEGER;
    const orderB = order.has(keyB) ? order.get(keyB) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return keyA.localeCompare(keyB);
  });
}

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

/** Панель со сведениями о выбранной точке данных: свойства, фильтры, иллюстрации, доп. инструменты. */
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
  arealDisabled = false,
  arealDisabledTitle,
  onOpenBuffer,
  bufferDockedOpen = false,
  bufferDisabled = false,
  bufferDisabledTitle,
  onResolveRussianName
}) {
  const [showImages, setShowImages] = useState(false);
  const [showSpeciesDescription, setShowSpeciesDescription] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // блок справки из docs/moduleHelp.md, раздел ## feature
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [gbifInfoOpen, setGbifInfoOpen] = useState(false);
  const [nameRuLookupState, setNameRuLookupState] = useState("idle");
  const [nameRuLookupResult, setNameRuLookupResult] = useState(null);

  const shareUrl = useMemo(() => {
    if (isGbifFeature(feature)) {
      return null;
    }
    return buildSharePointUrl(feature);
  }, [feature]);

  useEffect(() => {
    setShowImages(false);
    setShowSpeciesDescription(false);
    setSharePanelOpen(false);
    setShareCopied(false);
    setGbifInfoOpen(false);
    setNameRuLookupState("idle");
    setNameRuLookupResult(null);

    const props = feature?.properties;
    if (props?.source === "gbif" && props?.name_latin && !props?.name_ru) {
      const entry = getOverlayEntry(props.name_latin);
      if (entry && !entry.nameRu) {
        setNameRuLookupState("not_found");
      }
    }
  }, [feature?.id, feature?.properties]);

  useEffect(() => {
    if (!shareCopied) {
      return undefined;
    }

    // Автоматически скрываем индикатор «скопировано» через 2 секунды.
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

  const fromGbif = isGbifFeature(feature);
  const collapsedSummary = feature
    ? feature.properties?.name_ru ||
      feature.properties?.name_latin ||
      (fromGbif ? `GBIF #${feature.properties?.gbif_key ?? ""}` : "Точка данных")
    : "Точка не выбрана";

  const properties = feature?.properties;
  const nameLatin = properties?.name_latin;
  const nameRu = properties?.name_ru;
  const showGbifNameLookup = fromGbif && Boolean(nameLatin) && !nameRu;
  const speciesPointCount = feature ? getPointsForSpecies(feature).length : 0;
  const images = properties ? getImages(properties) : [];
  const descriptionPath = properties?.description_md;
  const gbifUrl = properties?.gbif_url;
  // status выводится отдельно — у него свой фильтр через StatusFilterPanel.
  const displayProperties = properties
    ? sortPropertyEntries(
        Object.entries(properties).filter(
          ([key, value]) =>
            !INTERNAL_PROPERTIES.has(key) &&
            !GBIF_META_PROPERTIES.has(key) &&
            key !== "status" &&
            !(fromGbif && key === "name_ru") &&
            hasDisplayValue(value) &&
            // kingdom дублирует regnum, если оба есть.
            !(key === "kingdom" && properties.regnum)
        )
      )
    : [];

  const gbifMetaProperties =
    fromGbif && properties
      ? sortGbifMetaEntries(
          Object.entries(properties).filter(
            ([key, value]) => GBIF_META_PROPERTIES.has(key) && hasDisplayValue(value)
          )
        )
      : [];

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const hasPropertyFilters = Object.keys(activeFilters).length > 0;
  const hasStatusFilter =
    Boolean(properties?.status) && activeStatusFilters.includes(properties.status);
  const canResetFilters = hasPropertyFilters || hasStatusFilter;

  const handleFindRussianName = async () => {
    if (!onResolveRussianName || !feature || nameRuLookupState === "loading") {
      return;
    }

    setNameRuLookupState("loading");
    setNameRuLookupResult(null);

    try {
      const result = await onResolveRussianName(feature);
      if (result?.nameRu) {
        setNameRuLookupResult(result.nameRu);
        setNameRuLookupState("found");
        return;
      }

      setNameRuLookupState("not_found");
    } catch (error) {
      if (error?.name === "AbortError") {
        setNameRuLookupState("idle");
        return;
      }

      setNameRuLookupState("not_found");
    }
  };

  const nameRuButtonLabel =
    nameRuLookupState === "loading"
      ? "Ищем…"
      : nameRuLookupState === "found"
        ? nameRuLookupResult || "Найдено"
        : nameRuLookupState === "not_found"
          ? "Не найдено"
          : "Найти";

  const nameRuButtonDisabled =
    nameRuLookupState === "loading" ||
    nameRuLookupState === "found" ||
    nameRuLookupState === "not_found";

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
                {fromGbif && (
                  <div className="popup-item">
                    <strong>Источник:</strong>
                    <span>GBIF</span>
                  </div>
                )}

                <div className="popup-item">
                  <strong>Точек вида на карте:</strong>
                  <span>{formatPointCount(speciesPointCount)}</span>
                </div>

                {(displayProperties.length > 0 || showGbifNameLookup || (fromGbif && nameRu)) && (
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

                    {(showGbifNameLookup || (fromGbif && nameRu)) && (
                      <div className="popup-item popup-item--filter">
                        <div className="popup-item-text">
                          <strong>{getPropertyLabel("name_ru")}:</strong>
                          {nameRu ? (
                            <span>{formatPropertyValue("name_ru", nameRu)}</span>
                          ) : (
                            <button
                              type="button"
                              className={`popup-item-value-btn${
                                nameRuLookupState === "found"
                                  ? " popup-item-value-btn--success"
                                  : nameRuLookupState === "not_found"
                                    ? " popup-item-value-btn--failure"
                                    : ""
                              }`}
                              onClick={handleFindRussianName}
                              disabled={nameRuButtonDisabled}
                              aria-busy={nameRuLookupState === "loading"}
                            >
                              {nameRuButtonLabel}
                            </button>
                          )}
                        </div>
                        {nameRu && (
                          <label className="property-switch" title="Показать маркеры с этим свойством">
                            <input
                              type="checkbox"
                              checked={activeFilters.name_ru === nameRu}
                              onChange={(e) => onFilterChange?.("name_ru", nameRu, e.target.checked)}
                            />
                            <span className="property-switch-slider" />
                          </label>
                        )}
                      </div>
                    )}

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

                {gbifMetaProperties.length > 0 && (
                  <details
                    className="feature-gbif-info"
                    open={gbifInfoOpen}
                    onToggle={(event) => setGbifInfoOpen(event.currentTarget.open)}
                  >
                    <summary className="feature-gbif-info-summary">Информация из GBIF</summary>
                    <div className="feature-gbif-info-body">
                      {gbifMetaProperties.map(([key, value]) => (
                        <div key={key} className="popup-item">
                          <div className="popup-item-text">
                            <strong>{getPropertyLabel(key)}:</strong>
                            <span>{formatPropertyValue(key, value)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {(descriptionPath ||
                  images.length > 0 ||
                  onOpenAreal ||
                  onOpenBuffer ||
                  gbifUrl ||
                  (!fromGbif && feature)) && (
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
                        disabled={arealDisabled}
                        title={arealDisabled ? arealDisabledTitle : undefined}
                      >
                        Радиус
                      </button>
                    )}
                    {onOpenBuffer && (
                      <button
                        type="button"
                        className={`feature-popup-action-btn${bufferDockedOpen ? " feature-popup-action-btn--active" : ""}`}
                        onClick={onOpenBuffer}
                        aria-pressed={bufferDockedOpen}
                        disabled={bufferDisabled}
                        title={bufferDisabled ? bufferDisabledTitle : undefined}
                      >
                        Буфер
                      </button>
                    )}
                    {gbifUrl && (
                      <a
                        className="feature-popup-action-btn"
                        href={gbifUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть на GBIF
                      </a>
                    )}
                    {!fromGbif && (
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
                    )}
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
