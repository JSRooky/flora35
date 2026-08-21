import React, { useState } from "react";
import { getBoundsFeatureTitle } from "../firebase/boundsCollectionFirestore";
import {
  BOUNDS_DISPLAY_FIELDS,
  formatBoundsPropertyValue,
  getBoundsFeatureAreaDisplay,
  getBoundsFeatureFillColor
} from "./boundsPropertyLabels";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { FilterIcon, ListIcon } from "../images/buttons";
import "../styles/FeaturePopup.css";
import "../styles/OoptFeaturePanel.css";

// Эти ключи уже показаны отдельно как заголовок — исключаем их из общего списка полей.
const TITLE_PROPERTY_KEYS = new Set(["title", "NAME_RU", "NAME"]);

/** Панель со сведениями о выбранном объекте ООПТ: свойства, площадь и точки внутри контура. */
export default function OoptFeaturePanel({
  layerDefinition,
  feature,
  containedSpeciesCount = null,
  containedPointsCount = null,
  pointsFilterEnabled = false,
  pointsFilterAvailable = true,
  speciesListOpen = false,
  onPointsFilterToggle,
  onShowSpeciesList,
  collapsed = false,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const properties = feature?.properties ?? {};
  const title = getBoundsFeatureTitle(properties) || layerDefinition?.label || "ООПТ";
  const accentColor = getBoundsFeatureFillColor(layerDefinition?.id, properties);
  const fields = BOUNDS_DISPLAY_FIELDS[layerDefinition?.id] ?? [];
  const displayFields = fields
    .map((field) => ({
      ...field,
      value: formatBoundsPropertyValue(field, properties)
    }))
    .filter((field) => field.value != null && !TITLE_PROPERTY_KEYS.has(field.key));
  const areaDisplay = getBoundsFeatureAreaDisplay(layerDefinition?.id, feature);
  const hasContainedSummary =
    containedSpeciesCount != null && containedPointsCount != null;

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <div className={`feature-popup oopt-feature-panel ${collapsed ? "feature-popup--collapsed" : ""}`}>
      <div className="feature-popup-header">
        <h3 className="feature-popup-title">Сведения об ООПТ</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            mapToolAccent
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
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
        <p className="popup-collapsed-summary oopt-feature-panel-object-heading">
          <span
            className="oopt-feature-panel-color-dot"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <span>
            {title}
            {hasContainedSummary
              ? ` — внутри точек - ${containedPointsCount}, видов - ${containedSpeciesCount}`
              : ""}
            {pointsFilterEnabled ? " — фильтр точек" : ""}
          </span>
        </p>
      ) : (
        <div className="popup-content">
          <div className="oopt-feature-panel-object-heading">
            <span
              className="oopt-feature-panel-color-dot"
              style={{ backgroundColor: accentColor }}
              aria-hidden="true"
            />
            <h4 className="oopt-feature-panel-object-title">{title}</h4>
          </div>

          {displayFields.length > 0 ? (
            <>
              <hr />
              {displayFields.map((field) => (
                <div key={field.key} className="popup-item">
                  <strong>{field.label}:</strong>
                  <span>{field.value}</span>
                </div>
              ))}
            </>
          ) : null}

          {areaDisplay ? (
            <>
              <hr />
              <div className="popup-item">
                <strong>Площадь:</strong>
                <span>{areaDisplay}</span>
              </div>
            </>
          ) : null}

          {hasContainedSummary ? (
            <>
              <hr />
              <div className="oopt-feature-panel-contained-section">
                <div className="oopt-feature-panel-contained-row">
                  <p className="oopt-feature-panel-contained-summary">
                    Внутри точек - <strong>{containedPointsCount}</strong>, видов -{" "}
                    <strong>{containedSpeciesCount}</strong>
                  </p>
                  <div className="oopt-feature-panel-contained-actions">
                    <button
                      type="button"
                      className={`oopt-feature-panel-icon-btn${
                        pointsFilterEnabled ? " oopt-feature-panel-icon-btn--active" : ""
                      }`}
                      onClick={onPointsFilterToggle}
                      disabled={!pointsFilterAvailable}
                      aria-pressed={pointsFilterEnabled}
                      aria-label="Только эти"
                      title="Только эти"
                    >
                      <FilterIcon className="oopt-feature-panel-icon-btn-svg" />
                    </button>
                    <button
                      type="button"
                      className={`oopt-feature-panel-icon-btn${
                        speciesListOpen ? " oopt-feature-panel-icon-btn--active" : ""
                      }`}
                      onClick={onShowSpeciesList}
                      aria-pressed={speciesListOpen}
                      aria-label={speciesListOpen ? "Скрыть" : "Показать"}
                      title={speciesListOpen ? "Скрыть" : "Показать"}
                    >
                      <ListIcon className="oopt-feature-panel-icon-btn-svg" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.OOPT_FEATURE} open={helpOpen} />
    </div>
  );
}
