import React, { useEffect, useMemo, useState } from "react";
import { getPointsForSpecies } from "./addSpeciesPolygonLayer";
import FeatureImagesPopup from "./FeatureImagesPopup";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import RussianNamePickerPopup from "./RussianNamePickerPopup";
import SpeciesDescriptionPopup from "./SpeciesDescriptionPopup";
import {
  formatPointCount,
  formatPropertyValue,
  getPropertyLabel,
  sortPropertyEntries
} from "./featurePropertyLabels";
import { resolveFeatureRegnum } from "../gbif/taxonFilters";
import { buildSharePointUrl, copyTextToClipboard } from "./sharePointLink";
import { getOverlayEntry, getOverlayRussianName } from "../names/nameRuCache";
import "../styles/FeaturePopup.css";
import { CheckIcon, CopyIcon, ShareIcon, TrashIcon } from "../images/buttons";

// Служебные поля, добавленные слоем карты; не показываем в списке свойств.
const INTERNAL_PROPERTIES = new Set([
  "image",
  "images",
  "species_id",
  "finding_id",
  "description_md",
  "source",
  "origin_source",
  "gbif_url",
  "inat_url",
  "species_key",
  "coordinates_original",
  "dense_pile_size",
  "merged_id",
  "merged_from_json",
  "gbif_key",
  "inat_id",
  "redbook_match_id",
  // Дублирует regnum; единая категория «Царство» — только regnum.
  "kingdom",
  "temp_layer_id",
  "temp_marker_color"
]);

/** Поля GBIF, которые уводим в раскрывающийся блок «Информация из GBIF». */
const GBIF_META_PROPERTIES = new Set(["basisOfRecord", "gbif_key", "datasetKey", "region_id"]);

const GBIF_META_DISPLAY_ORDER = ["basisOfRecord", "gbif_key", "datasetKey", "region_id"];

function isGbifFeature(feature) {
  return feature?.properties?.source === "gbif";
}

function hasDisplayValue(value) {
  return value != null && value !== "";
}

/** Поля iNaturalist для раскрывающегося блока. */
const INAT_META_PROPERTIES = new Set([
  "quality_grade",
  "inat_id",
  "place_guess",
  "license_code",
  "obscured",
  "region_id"
]);

const INAT_META_DISPLAY_ORDER = [
  "quality_grade",
  "place_guess",
  "license_code",
  "obscured",
  "inat_id",
  "region_id"
];

function isInatFeature(feature) {
  return feature?.properties?.source === "inaturalist";
}

function isMergedFeature(feature) {
  return feature?.properties?.source === "merged";
}

function isRedBookFeature(feature) {
  return feature?.properties?.source === "redbook";
}

function parseMergedFrom(properties) {
  const raw = properties?.merged_from_json;
  if (!raw) {
    return [];
  }

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatMergedSourceCoords(coordinates) {
  if (
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(coordinates[0]) ||
    !Number.isFinite(coordinates[1])
  ) {
    return null;
  }

  return `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`;
}

function getMergedSourceLabel(source) {
  if (source === "gbif") {
    return "GBIF";
  }
  if (source === "inaturalist") {
    return "iNaturalist";
  }
  return String(source || "Источник");
}

function sortInatMetaEntries(entries) {
  const order = new Map(INAT_META_DISPLAY_ORDER.map((key, index) => [key, index]));

  return [...entries].sort(([keyA], [keyB]) => {
    const orderA = order.has(keyA) ? order.get(keyA) : Number.MAX_SAFE_INTEGER;
    const orderB = order.has(keyB) ? order.get(keyB) : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return keyA.localeCompare(keyB);
  });
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
  onLookupRussianName,
  onApplyRussianName,
  onClearRussianName,
  onMinimize,
  onClose
}) {
  const [showImages, setShowImages] = useState(false);
  const [showSpeciesDescription, setShowSpeciesDescription] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // блок справки из docs/moduleHelp.md, раздел ## feature
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [gbifInfoOpen, setGbifInfoOpen] = useState(false);
  const [inatInfoOpen, setInatInfoOpen] = useState(false);
  const [nameRuLookupState, setNameRuLookupState] = useState("idle");
  const [nameRuCandidates, setNameRuCandidates] = useState([]);
  const [showNameRuPicker, setShowNameRuPicker] = useState(false);

  const shareUrl = useMemo(() => buildSharePointUrl(feature), [feature]);

  useEffect(() => {
    setShowImages(false);
    setShowSpeciesDescription(false);
    setSharePanelOpen(false);
    setShareCopied(false);
    setGbifInfoOpen(false);
    setInatInfoOpen(false);
    setNameRuCandidates([]);
    setShowNameRuPicker(false);

    const props = feature?.properties;
    const isExternalSource =
      props?.source === "gbif" ||
      props?.source === "inaturalist" ||
      props?.source === "redbook";
    const overlayNameRu =
      isExternalSource && props?.name_latin
        ? getOverlayRussianName(props.name_latin)
        : null;
    const resolvedNameRu = props?.name_ru || overlayNameRu;

    if (isExternalSource && props?.name_latin && !resolvedNameRu) {
      const entry = getOverlayEntry(props.name_latin);
      if (entry && !entry.nameRu) {
        setNameRuLookupState("not_found");
        return;
      }
    }

    setNameRuLookupState("idle");
  }, [feature]);

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
  const fromInat = isInatFeature(feature);
  const fromMerged = isMergedFeature(feature);
  const fromRedBook = isRedBookFeature(feature);
  const fromExternal = fromGbif || fromInat || fromRedBook;
  const properties = feature?.properties;
  const nameLatin = properties?.name_latin;
  const nameRu =
    properties?.name_ru ||
    (fromExternal && nameLatin ? getOverlayRussianName(nameLatin) : null);
  const collapsedSummary = feature
    ? nameRu ||
      nameLatin ||
      (fromGbif
        ? `GBIF #${feature.properties?.gbif_key ?? ""}`
        : fromInat
          ? `iNat #${feature.properties?.inat_id ?? ""}`
          : fromMerged
            ? "Слияние точек"
            : fromRedBook
              ? "Красная книга"
              : "Точка данных")
    : "Точка не выбрана";

  const mergedFromEntries = fromMerged ? parseMergedFrom(properties) : [];

  const showExternalNameLookup = fromExternal && Boolean(nameLatin) && !nameRu;
  const speciesPointCount = feature ? getPointsForSpecies(feature).length : 0;
  const images = properties ? getImages(properties) : [];
  const descriptionPath = properties?.description_md;
  const gbifUrl = properties?.gbif_url;
  const inatUrl = properties?.inat_url;
  // status выводится отдельно — у него свой фильтр через StatusFilterPanel.
  // Для старых снимков GBIF/iNat: kingdom → regnum, чтобы в UI было одно «Царство».
  const resolvedRegnum = resolveFeatureRegnum(properties);
  const displayProperties = properties
    ? sortPropertyEntries(
        Object.entries({
          ...properties,
          ...(resolvedRegnum ? { regnum: resolvedRegnum } : {})
        }).filter(
          ([key, value]) =>
            !INTERNAL_PROPERTIES.has(key) &&
            !GBIF_META_PROPERTIES.has(key) &&
            !INAT_META_PROPERTIES.has(key) &&
            key !== "status" &&
            !(fromExternal && key === "name_ru") &&
            hasDisplayValue(value)
        )
      )
    : [];

  const gbifMetaProperties =
    (fromGbif || (fromRedBook && properties?.origin_source === "gbif")) && properties
      ? sortGbifMetaEntries(
          Object.entries(properties).filter(
            ([key, value]) => GBIF_META_PROPERTIES.has(key) && hasDisplayValue(value)
          )
        )
      : [];

  const inatMetaProperties =
    (fromInat || (fromRedBook && properties?.origin_source === "inaturalist")) &&
    properties
      ? sortInatMetaEntries(
          Object.entries(properties).filter(
            ([key, value]) => INAT_META_PROPERTIES.has(key) && hasDisplayValue(value)
          )
        )
      : [];

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const hasPropertyFilters = Object.keys(activeFilters).length > 0;
  const hasStatusFilter =
    Boolean(properties?.status) && activeStatusFilters.includes(properties.status);
  const canResetFilters = hasPropertyFilters || hasStatusFilter;

  const handleFindRussianName = async ({ force = false } = {}) => {
    if (!onLookupRussianName || !feature || nameRuLookupState === "loading") {
      return;
    }

    setNameRuLookupState("loading");
    setNameRuCandidates([]);
    setShowNameRuPicker(false);

    try {
      const result = await onLookupRussianName(feature, { force });
      const candidates = result?.candidates ?? [];

      if (candidates.length > 0) {
        setNameRuCandidates(candidates);
        setShowNameRuPicker(true);
        setNameRuLookupState("idle");
        return;
      }

      // Обновление при уже выбранном имени: оставляем его, если вариантов нет.
      if (force && nameRu) {
        setNameRuLookupState("idle");
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

  const handleCloseNameRuPicker = () => {
    setShowNameRuPicker(false);
    setNameRuCandidates([]);
    setNameRuLookupState("idle");
  };

  const handleSelectRussianName = async (choice) => {
    if (!onApplyRussianName || !feature || !choice?.nameRu) {
      return;
    }

    setShowNameRuPicker(false);
    setNameRuLookupState("loading");

    try {
      await onApplyRussianName(feature, choice);
      setNameRuCandidates([]);
      setNameRuLookupState("idle");
    } catch {
      setNameRuLookupState("idle");
    }
  };

  const handleClearRussianName = async () => {
    if (!onClearRussianName || !feature || nameRuLookupState === "loading") {
      return;
    }

    if (nameRu && activeFilters.name_ru === nameRu) {
      onFilterChange?.("name_ru", nameRu, false);
    }

    setNameRuLookupState("loading");

    try {
      await onClearRussianName(feature);
      setNameRuCandidates([]);
      setShowNameRuPicker(false);
      setNameRuLookupState("idle");
    } catch {
      setNameRuLookupState("idle");
    }
  };

  const nameRuButtonLabel =
    nameRuLookupState === "loading"
      ? "Ищем…"
      : nameRuLookupState === "not_found"
        ? "Искать снова"
        : "Найти";

  const nameRuButtonDisabled = nameRuLookupState === "loading";
  const nameRuActionsDisabled = nameRuLookupState === "loading";

  return (
    <>
      <div className={`feature-popup ${collapsed ? "feature-popup--collapsed" : ""}`}>
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">О точке</h3>
          <div className="popup-panel-header-actions">
            <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
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
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
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
                {fromInat && (
                  <div className="popup-item">
                    <strong>Источник:</strong>
                    <span>iNaturalist</span>
                  </div>
                )}
                {fromMerged && (
                  <div className="popup-item">
                    <strong>Источник:</strong>
                    <span>Слияние точек</span>
                  </div>
                )}

                <div className="popup-item">
                  <strong>Точек вида на карте:</strong>
                  <span>{formatPointCount(speciesPointCount)}</span>
                </div>

                {(displayProperties.length > 0 ||
                  showExternalNameLookup ||
                  (fromExternal && nameRu)) && (
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

                    {(showExternalNameLookup || (fromExternal && nameRu)) && (
                      <div className="popup-item popup-item--filter popup-item--name-ru">
                        <div className="popup-item-text">
                          <strong>{getPropertyLabel("name_ru")}:</strong>
                          {nameRu ? (
                            <span>{formatPropertyValue("name_ru", nameRu)}</span>
                          ) : (
                            <button
                              type="button"
                              className={`popup-item-value-btn${
                                nameRuLookupState === "not_found"
                                  ? " popup-item-value-btn--failure"
                                  : ""
                              }`}
                              onClick={() =>
                                handleFindRussianName({
                                  force: nameRuLookupState === "not_found"
                                })
                              }
                              disabled={nameRuButtonDisabled}
                              aria-busy={nameRuLookupState === "loading"}
                            >
                              {nameRuButtonLabel}
                            </button>
                          )}
                        </div>
                        {nameRu ? (
                          <div className="popup-name-ru-actions">
                            <button
                              type="button"
                              className="popup-name-ru-delete"
                              onClick={handleClearRussianName}
                              disabled={nameRuActionsDisabled || !onClearRussianName}
                              aria-label="Удалить"
                              title="Удалить"
                            >
                              <TrashIcon className="feature-popup-action-icon" aria-hidden="true" focusable="false" />
                            </button>
                            <label className="property-switch" title="Показать маркеры с этим свойством">
                              <input
                                type="checkbox"
                                checked={activeFilters.name_ru === nameRu}
                                onChange={(e) => onFilterChange?.("name_ru", nameRu, e.target.checked)}
                              />
                              <span className="property-switch-slider" />
                            </label>
                          </div>
                        ) : null}
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

                {(gbifMetaProperties.length > 0 || gbifUrl) && (
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
                      {gbifUrl && (
                        <div className="feature-gbif-info-actions">
                          <a
                            className="feature-popup-action-btn"
                            href={gbifUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть на GBIF
                          </a>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {(inatMetaProperties.length > 0 || inatUrl) && (
                  <details
                    className="feature-gbif-info"
                    open={inatInfoOpen}
                    onToggle={(event) => setInatInfoOpen(event.currentTarget.open)}
                  >
                    <summary className="feature-gbif-info-summary">
                      Информация из iNaturalist
                    </summary>
                    <div className="feature-gbif-info-body">
                      {inatMetaProperties.map(([key, value]) => (
                        <div key={key} className="popup-item">
                          <div className="popup-item-text">
                            <strong>{getPropertyLabel(key)}:</strong>
                            <span>{formatPropertyValue(key, value)}</span>
                          </div>
                        </div>
                      ))}
                      {inatUrl && (
                        <div className="feature-gbif-info-actions">
                          <a
                            className="feature-popup-action-btn"
                            href={inatUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Открыть на iNaturalist
                          </a>
                        </div>
                      )}
                    </div>
                  </details>
                )}

                {fromMerged && mergedFromEntries.length > 0 && (
                  <div className="feature-merged-from">
                    <hr />
                    <h4 className="feature-merged-from-title">Объединено из</h4>
                    {mergedFromEntries.map((entry, index) => {
                      const label = getMergedSourceLabel(entry.source);
                      const coordsLabel = formatMergedSourceCoords(entry.coordinates);
                      return (
                        <div
                          key={`${entry.source}-${entry.id || index}`}
                          className="popup-item feature-merged-from-item"
                        >
                          <div className="popup-item-text">
                            <strong>{label}:</strong>
                            <span>
                              {entry.url ? (
                                <a
                                  href={entry.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {entry.id || "открыть"}
                                </a>
                              ) : (
                                entry.id || "—"
                              )}
                              {coordsLabel ? ` (${coordsLabel})` : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                    <button
                      type="button"
                      className={`feature-popup-share-btn${sharePanelOpen ? " feature-popup-share-btn--active" : ""}`}
                      onClick={handleShareClick}
                      aria-label="Поделиться точкой"
                      aria-expanded={sharePanelOpen}
                      title="Поделиться точкой"
                      disabled={!shareUrl}
                    >
                      <ShareIcon className="feature-popup-action-icon" aria-hidden="true" focusable="false" />
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
              {shareCopied ? <CheckIcon className="feature-popup-action-icon" aria-hidden="true" focusable="false" /> : <CopyIcon className="feature-popup-action-icon" aria-hidden="true" focusable="false" />}
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

      {showNameRuPicker && nameRuCandidates.length > 0 && (
        <RussianNamePickerPopup
          nameLatin={nameLatin}
          candidates={nameRuCandidates}
          onSelect={handleSelectRussianName}
          onClose={handleCloseNameRuPicker}
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
