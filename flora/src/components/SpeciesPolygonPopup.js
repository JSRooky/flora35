import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/SpeciesPolygonPopup.css";

function formatPointCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}

function getCollapsedSummary(polygonInfo) {
  if (!polygonInfo?.built) {
    return "Полигон не построен";
  }

  return polygonInfo.nameRu || polygonInfo.nameLatin || "Полигон вида";
}

export default function SpeciesPolygonPopup({
  polygonInfo,
  onReset,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const speciesLabel =
    polygonInfo?.nameRu ||
    polygonInfo?.nameLatin ||
    "Вид не определён";

  return (
    <div className={`species-polygon-popup ${collapsed ? "species-polygon-popup--collapsed" : ""}`}>
      <div className="species-polygon-popup-header">
        <h3 className="species-polygon-popup-title">Полигон</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
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
      </div>

      {collapsed ? (
        <p className="popup-collapsed-summary">{getCollapsedSummary(polygonInfo)}</p>
      ) : (
        <div className="species-polygon-popup-content">
          <p className="species-polygon-popup-species">
            Вид: <strong>{speciesLabel}</strong>
          </p>

          {polygonInfo?.nameLatin && polygonInfo?.nameRu && (
            <p className="species-polygon-popup-species-latin">{polygonInfo.nameLatin}</p>
          )}

          {polygonInfo?.pointCount > 0 && (
            <p className="species-polygon-popup-points">
              Точек вида: <strong>{formatPointCount(polygonInfo.pointCount)}</strong>
            </p>
          )}

          <p className="species-polygon-popup-status">
            {polygonInfo?.built
              ? "Полигон построен по точкам вида (выпуклая оболочка)."
              : "Не удалось построить полигон для выбранного вида."}
          </p>

          <button
            type="button"
            className="species-polygon-reset-btn"
            onClick={onReset}
            disabled={!polygonInfo?.built}
          >
            Сброс
          </button>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.POLYGON} open={helpOpen} />
    </div>
  );
}
