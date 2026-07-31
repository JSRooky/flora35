import React, { useEffect, useState } from "react";
import { getPointsForSpecies, POLYGON_BUILD_MODES } from "./addSpeciesPolygonLayer";
import { formatPointCount } from "./featurePropertyLabels";
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

function getSpeciesLabel(species, speciesList) {
  const hasDuplicateName = speciesList.filter(
    (item) => item.nameRu === species.nameRu
  ).length > 1;

  if (hasDuplicateName && species.nameLatin) {
    return `${species.nameRu} (${species.nameLatin})`;
  }

  return species.nameRu;
}

function getArealLabel(entry, polygons) {
  const hasDuplicateName = polygons.filter((item) => item.nameRu === entry.nameRu).length > 1;

  if (hasDuplicateName && entry.nameLatin) {
    return `Ареал — ${entry.nameRu} (${entry.nameLatin})`;
  }

  return `Ареал — ${entry.nameRu || entry.nameLatin || "Без названия"}`;
}

/** Краткая подпись для свёрнутой панели. */
function getCollapsedSummary(polygons, containedSpecies) {
  const built = polygons.filter((entry) => entry.built);

  if (built.length === 0) {
    return "Полигон не построен";
  }

  if (built.length === 1) {
    if (containedSpecies?.count > 0) {
      return `В полигоне: ${formatSpeciesCount(containedSpecies.count)}`;
    }

    return getArealLabel(built[0], built);
  }

  return `Ареалы: ${formatSpeciesCount(built.length)}`;
}

/**
 * Панель экспериментального модуля «Полигон».
 * feature — текущая выбранная точка; polygons — построенные ареалы на карте.
 */
export default function SpeciesPolygonPopup({
  feature,
  polygons = [],
  activePolygonId = null,
  addMode = false,
  containedSpecies = null,
  onBuild,
  onBuildAllPoints,
  onResetAll,
  onResetOne,
  onToggleHidden,
  onSelectPolygon,
  onAddModeChange,
  onSpeciesSelect,
  collapsed = false,
  onCollapsedChange
}) {
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const [listVisible, setListVisible] = useState(false);
  const builtPolygons = polygons.filter((entry) => entry.built);
  const visibleBuiltPolygons = builtPolygons.filter((entry) => !entry.hidden);
  const speciesLabel =
    feature?.properties?.name_ru ||
    feature?.properties?.name_latin ||
    "Вид не определён";
  const speciesLatin = feature?.properties?.name_latin;
  const pointCount = feature ? getPointsForSpecies(feature).length : 0;
  const canBuild = Boolean(feature) && pointCount > 0;
  const canBuildAllPoints = canBuild && pointCount >= 3;
  const currentSpeciesEntry = speciesLatin
    ? builtPolygons.find((entry) => entry.nameLatin === speciesLatin)
    : null;
  const isAllPointsMode =
    currentSpeciesEntry?.mode === POLYGON_BUILD_MODES.ALL_POINTS;
  const showContainedSpecies = visibleBuiltPolygons.length === 1;
  const hasContainedSpecies = showContainedSpecies && builtPolygons.length > 0;
  const hasSpeciesInPolygon = containedSpecies?.count > 0;

  useEffect(() => {
    setListVisible(false);
  }, [builtPolygons.length, activePolygonId, containedSpecies?.count]);

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
          {getCollapsedSummary(polygons, containedSpecies)}
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
              className={`species-polygon-build-all-btn${
                isAllPointsMode ? " species-polygon-build-all-btn--active" : ""
              }`}
              onClick={onBuildAllPoints}
              disabled={!canBuildAllPoints}
              title={
                canBuildAllPoints
                  ? isAllPointsMode
                    ? "Вернуть выпуклую оболочку (как «Построить»)"
                    : "Построить полигон через все точки вида"
                  : "Нужно не менее трёх точек вида"
              }
            >
              Все точки
            </button>
          </div>

          {builtPolygons.length > 0 && (
            <div className="species-polygon-areals-section">
              <button
                type="button"
                className="species-polygon-reset-all-btn"
                onClick={onResetAll}
              >
                Сбросить всё
              </button>

              <p className="species-polygon-areals-title">
                Ареалы на карте: <strong>{formatSpeciesCount(builtPolygons.length)}</strong>
              </p>

              <ul className="species-polygon-areals-list">
                {builtPolygons.map((entry) => {
                  const isActive = entry.id === activePolygonId;
                  const isHidden = entry.hidden;

                  return (
                    <li
                      key={entry.id}
                      className={`species-polygon-areal-item${
                        isActive ? " species-polygon-areal-item--active" : ""
                      }${isHidden ? " species-polygon-areal-item--hidden" : ""}`}
                    >
                      <button
                        type="button"
                        className="species-polygon-areal-select-btn"
                        onClick={() => onSelectPolygon?.(entry.id)}
                        title="Выбрать ареал"
                      >
                        {getArealLabel(entry, builtPolygons)}
                      </button>
                      <div className="species-polygon-areal-actions">
                        <button
                          type="button"
                          className="species-polygon-visibility-btn"
                          onClick={() => onToggleHidden?.(entry.id)}
                          aria-label={isHidden ? "Показать на карте" : "Скрыть на карте"}
                          title={isHidden ? "Показать на карте" : "Скрыть на карте"}
                        >
                          {isHidden ? "Показать" : "Скрыть"}
                        </button>
                        <button
                          type="button"
                          className="species-polygon-areal-reset-btn"
                          onClick={() => onResetOne?.(entry.id)}
                          aria-label={`Сбросить ${getArealLabel(entry, builtPolygons)}`}
                        >
                          Сбросить
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="species-polygon-add-section">
            <button
              type="button"
              className={`species-polygon-add-btn${
                addMode ? " species-polygon-add-btn--active" : ""
              }`}
              onClick={() => onAddModeChange?.(!addMode)}
            >
              {addMode ? "Отменить выбор" : "Добавить полигон"}
            </button>
            {addMode && (
              <p className="species-polygon-popup-status">
                Выберите точку вида на карте. Клик по точке того же вида обновит его ареал.
              </p>
            )}
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
