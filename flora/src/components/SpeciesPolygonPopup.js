import React, { useEffect, useState } from "react";
import { getPointsForSpecies } from "./addSpeciesPolygonLayer";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import "../styles/SpeciesPolygonPopup.css";
import "../styles/ArealPopup.css";

/** Склонение «N вид/вида/видов» для русского интерфейса. */
function formatSpeciesCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} вид`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} вида`;
  }

  return `${count} видов`;
}

/** Склонение «N точка/точки/точек» для русского интерфейса. */
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

function getSpeciesLabel(species, speciesList) {
  const hasDuplicateName = speciesList.filter(
    (item) => item.nameRu === species.nameRu
  ).length > 1;

  if (hasDuplicateName && species.nameLatin) {
    return `${species.nameRu} (${species.nameLatin})`;
  }

  return species.nameRu;
}

/** Краткая подпись для свёрнутой панели — по построенному полигону, а не по выбранной точке. */
function getCollapsedSummary(polygonInfo, containedSpecies) {
  if (!polygonInfo?.built) {
    return "Полигон не построен";
  }

  if (containedSpecies?.count > 0) {
    return `В полигоне: ${formatSpeciesCount(containedSpecies.count)}`;
  }

  return polygonInfo.nameRu || polygonInfo.nameLatin || "Полигон вида";
}

/**
 * Текст статуса в панели: различает «ещё не построен», «построен для выбранного вида»
 * и «на карте другой вид, чем выбран сейчас».
 */
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

/**
 * Панель экспериментального модуля «Полигон».
 * feature — текущая выбранная точка; polygonInfo — что уже отображено на карте.
 * Полигон не перестраивается автоматически при смене точки — только по кнопкам.
 */
export default function SpeciesPolygonPopup({
  feature,
  polygonInfo,
  containedSpecies = null,
  onBuild,
  onReset,
  onSpeciesSelect,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## polygon в docs/moduleHelp.md
  const [listVisible, setListVisible] = useState(false);
  const speciesLabel =
    feature?.properties?.name_ru ||
    feature?.properties?.name_latin ||
    "Вид не определён";
  const speciesLatin = feature?.properties?.name_latin;
  const pointCount = feature ? getPointsForSpecies(feature).length : 0;
  const canBuild = Boolean(feature) && pointCount > 0;
  const hasContainedSpecies = polygonInfo?.built;
  const hasSpeciesInPolygon = containedSpecies?.count > 0;

  useEffect(() => {
    setListVisible(false);
  }, [polygonInfo?.built, polygonInfo?.nameLatin, containedSpecies?.count]);

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
        <p className="popup-collapsed-summary">
          {getCollapsedSummary(polygonInfo, containedSpecies)}
        </p>
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

          {hasContainedSpecies && (
            <div className="areal-contained-points">
              <div className="species-polygon-contained-header">
                <p className="areal-contained-points-title">
                  В полигоне:{" "}
                  <strong>{formatSpeciesCount(containedSpecies?.count ?? 0)}</strong>
                </p>
                <button
                  type="button"
                  className="species-polygon-list-toggle"
                  onClick={() => setListVisible((visible) => !visible)}
                  aria-expanded={listVisible}
                >
                  {listVisible ? "Скрыть" : "Показать"}
                </button>
              </div>

              {listVisible && hasSpeciesInPolygon ? (
                <ul className="areal-contained-points-list">
                  {containedSpecies.species.map((species) => (
                    <li key={species.nameLatin || species.nameRu}>
                      <button
                        type="button"
                        className="areal-contained-points-item"
                        onClick={() => onSpeciesSelect?.(species.point)}
                      >
                        {getSpeciesLabel(species, containedSpecies.species)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {listVisible && !hasSpeciesInPolygon ? (
                <p className="species-polygon-popup-status">
                  Ни один другой вид не попал в полигон.
                </p>
              ) : null}
            </div>
          )}
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.POLYGON} open={helpOpen} />
    </div>
  );
}
