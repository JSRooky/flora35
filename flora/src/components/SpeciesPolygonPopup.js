import React, { useState } from "react";
import { getPointsForSpecies } from "./addSpeciesPolygonLayer";
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

function getStatusMessage(feature, polygonInfo) {
  if (!feature) {
    return "Выберите точку на карте.";
  }

  if (!polygonInfo?.built) {
    return "Нажмите «Построить», чтобы построить полигон по точкам выбранного вида.";
  }

  const selectedSpecies = feature.properties?.name_latin;
  const builtSpecies = polygonInfo.nameLatin;

  if (selectedSpecies && builtSpecies && selectedSpecies !== builtSpecies) {
    const builtLabel = polygonInfo.nameRu || polygonInfo.nameLatin;
    return `На карте отображается полигон вида «${builtLabel}». «Построить» заменит его полигоном выбранного вида.`;
  }

  if (polygonInfo.built) {
    return "Полигон построен по точкам вида (выпуклая оболочка).";
  }

  return "Не удалось построить полигон для выбранного вида.";
}

export default function SpeciesPolygonPopup({
  feature,
  polygonInfo,
  onBuild,
  onReset,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const speciesLabel =
    feature?.properties?.name_ru ||
    feature?.properties?.name_latin ||
    "Вид не определён";
  const speciesLatin = feature?.properties?.name_latin;
  const pointCount = feature ? getPointsForSpecies(feature).length : 0;
  const canBuild = Boolean(feature) && pointCount > 0;

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
            Выбранный вид: <strong>{speciesLabel}</strong>
          </p>

          {speciesLatin && feature?.properties?.name_ru && (
            <p className="species-polygon-popup-species-latin">{speciesLatin}</p>
          )}

          {pointCount > 0 && (
            <p className="species-polygon-popup-points">
              Точек вида: <strong>{formatPointCount(pointCount)}</strong>
            </p>
          )}

          <p className="species-polygon-popup-status">
            {getStatusMessage(feature, polygonInfo)}
          </p>

          <div className="species-polygon-actions">
            <button
              type="button"
              className="species-polygon-build-btn"
              onClick={onBuild}
              disabled={!canBuild}
            >
              Построить
            </button>
            <button
              type="button"
              className="species-polygon-reset-btn"
              onClick={onReset}
              disabled={!polygonInfo?.built}
            >
              Сбросить
            </button>
          </div>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.POLYGON} open={helpOpen} />
    </div>
  );
}
