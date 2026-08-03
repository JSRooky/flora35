import React from "react";
import { getBoundsFeatureTitle } from "../firebase/boundsCollectionFirestore";
import {
  BOUNDS_DISPLAY_FIELDS,
  formatBoundsPropertyValue,
  getBoundsFeatureAreaDisplay,
  getBoundsFeatureFillColor
} from "./boundsPropertyLabels";
import "../styles/FeaturePopup.css";
import "../styles/OoptFeaturePanel.css";

const TITLE_PROPERTY_KEYS = new Set(["title", "NAME_RU", "NAME"]);

export default function OoptFeaturePanel({
  layerDefinition,
  feature,
  collapsed = false,
  onCollapsedChange
}) {
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

  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";

  return (
    <div className={`feature-popup oopt-feature-panel ${collapsed ? "feature-popup--collapsed" : ""}`}>
      <div className="feature-popup-header">
        <h3 className="feature-popup-title">Сведения об ООПТ</h3>
        <div className="popup-panel-header-actions">
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
        <p className="popup-collapsed-summary oopt-feature-panel-object-heading">
          <span
            className="oopt-feature-panel-color-dot"
            style={{ backgroundColor: accentColor }}
            aria-hidden="true"
          />
          <span>{title}</span>
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
        </div>
      )}
    </div>
  );
}
