import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  COMPARE_SET_MIN,
  DIVERSITY_GROUP_MODES,
  countSpeciesByLayers,
  downloadDiversityCsv,
  listSharedSpeciesRows,
  plaquesToCompareLayerInputs,
  summarizeDiversity
} from "../dataWork/compare/countSpeciesByLayers";
import CompareRegnumFilter, { useCompareRegnumFilter } from "./CompareRegnumFilter";
import { listTempLayerPlaques, subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareDiversityPopup.css";

function resolvePlaques(plaqueKeys) {
  const plaques = listTempLayerPlaques();
  const byKey = new Map(plaques.map((plaque) => [plaque.key, plaque]));
  return (plaqueKeys ?? []).map((key) => byKey.get(key)).filter(Boolean);
}

function groupCopy(groupMode) {
  if (groupMode === DIVERSITY_GROUP_MODES.GENUS) {
    return {
      nameHeader: "Род",
      summaryHeader: "Родов",
      leadTotal: "Родов всего",
      emptyMatches: "Нет родов, общих для всех слоёв."
    };
  }
  if (groupMode === DIVERSITY_GROUP_MODES.FAMILY) {
    return {
      nameHeader: "Семейство",
      summaryHeader: "Семейств",
      leadTotal: "Семейств всего",
      emptyMatches: "Нет семейств, общих для всех слоёв."
    };
  }
  return {
    nameHeader: "Латинское название",
    summaryHeader: "Видов",
    leadTotal: "Именованных видов всего",
    emptyMatches: "Нет видов, общих для всех слоёв."
  };
}

/**
 * Окно сравнения биологического разнообразия выбранных плашек.
 */
export default function CompareDiversityPopup({
  open,
  plaqueKeys = [],
  onClose,
  onMinimize
}) {
  const [plaques, setPlaques] = useState(() => resolvePlaques(plaqueKeys));
  const [includeGbif, setIncludeGbif] = useState(true);
  const [includeInat, setIncludeInat] = useState(true);
  const [matchesOnly, setMatchesOnly] = useState(false);
  const [groupMode, setGroupMode] = useState(DIVERSITY_GROUP_MODES.SPECIES);

  const keysSignature = plaqueKeys.join("\u0001");

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const keys = keysSignature ? keysSignature.split("\u0001") : [];
    setPlaques(resolvePlaques(keys));
    return subscribeTempLayers(() => {
      setPlaques(resolvePlaques(keys));
    });
  }, [open, keysSignature]);

  const bothSources = includeGbif && includeInat;
  const {
    presentRegnums,
    allRegnumsOn,
    noneRegnumsOn,
    allowedRegnums,
    handleSelectAllRegnums,
    handleResetRegnums,
    handleToggleRegnum,
    isRegnumOn
  } = useCompareRegnumFilter(plaques);

  const comparison = useMemo(() => {
    return countSpeciesByLayers(
      plaquesToCompareLayerInputs(plaques, { includeGbif, includeInat, allowedRegnums }),
      groupMode
    );
  }, [plaques, includeGbif, includeInat, allowedRegnums, groupMode]);

  const summary = useMemo(() => summarizeDiversity(comparison), [comparison]);
  const tableRows = useMemo(() => {
    return matchesOnly ? listSharedSpeciesRows(comparison) : comparison.rows;
  }, [comparison, matchesOnly]);
  const tableComparison = useMemo(
    () => ({ ...comparison, rows: tableRows }),
    [comparison, tableRows]
  );
  const tooFew = plaques.length < COMPARE_SET_MIN;
  const noPoints = !tooFew && comparison.rows.length === 0;
  const canExport = !tooFew && tableRows.length > 0;

  const handleToggleAll = useCallback(() => {
    const next = !bothSources;
    setIncludeGbif(next);
    setIncludeInat(next);
  }, [bothSources]);

  const handleExport = useCallback(() => {
    if (!canExport) {
      return;
    }
    downloadDiversityCsv(tableComparison, summary, groupMode);
  }, [canExport, tableComparison, summary, groupMode]);

  const copy = groupCopy(groupMode);
  const showRuColumn = groupMode === DIVERSITY_GROUP_MODES.SPECIES;
  const emptyColSpan = comparison.layers.length + (showRuColumn ? 3 : 2);

  const handleGroupMode = useCallback((nextMode) => {
    setGroupMode((current) =>
      current === nextMode ? DIVERSITY_GROUP_MODES.SPECIES : nextMode
    );
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="compare-diversity-overlay">
      <div
        className="compare-diversity-dialog"
        role="dialog"
        aria-labelledby="compare-diversity-title"
      >
        <div className="compare-diversity-header">
          <h2 id="compare-diversity-title" className="compare-diversity-title">
            Разнообразие
          </h2>
          <div className="popup-panel-header-actions">
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
          </div>
        </div>

        {tooFew ? (
          <p className="compare-diversity-empty">
            Для сравнения нужны не меньше двух слоёв в поле панели «Сравнение».
          </p>
        ) : (
          <>
            <div className="compare-diversity-sources" role="toolbar" aria-label="Фильтры таблицы">
              <span className="compare-diversity-sources-label">Точки</span>
              <div className="compare-diversity-source-group" role="group" aria-label="Точки">
                <button
                  type="button"
                  className={`compare-diversity-source${
                    bothSources ? " compare-diversity-source--on" : ""
                  }`}
                  aria-pressed={bothSources}
                  onClick={handleToggleAll}
                >
                  Все
                </button>
                <button
                  type="button"
                  className={`compare-diversity-source compare-diversity-source--gbif${
                    includeGbif ? " compare-diversity-source--on" : ""
                  }`}
                  aria-pressed={includeGbif}
                  onClick={() => setIncludeGbif((current) => !current)}
                >
                  GBIF
                </button>
                <button
                  type="button"
                  className={`compare-diversity-source compare-diversity-source--inat${
                    includeInat ? " compare-diversity-source--on" : ""
                  }`}
                  aria-pressed={includeInat}
                  onClick={() => setIncludeInat((current) => !current)}
                >
                  iNat
                </button>
              </div>
              {presentRegnums.length > 0 ? (
                <CompareRegnumFilter
                  presentRegnums={presentRegnums}
                  isRegnumOn={isRegnumOn}
                  allRegnumsOn={allRegnumsOn}
                  noneRegnumsOn={noneRegnumsOn}
                  onSelectAll={handleSelectAllRegnums}
                  onReset={handleResetRegnums}
                  onToggleRegnum={handleToggleRegnum}
                />
              ) : null}
              <button
                type="button"
                className={`compare-diversity-filter${
                  matchesOnly ? " compare-diversity-filter--on" : ""
                }`}
                aria-pressed={matchesOnly}
                title="Только виды, которые есть в каждом выбранном слое"
                onClick={() => setMatchesOnly((current) => !current)}
              >
                Только совпадения
              </button>
              <button
                type="button"
                className={`compare-diversity-filter${
                  groupMode === DIVERSITY_GROUP_MODES.GENUS ? " compare-diversity-filter--on" : ""
                }`}
                aria-pressed={groupMode === DIVERSITY_GROUP_MODES.GENUS}
                title="Сравнить количество родов"
                onClick={() => handleGroupMode(DIVERSITY_GROUP_MODES.GENUS)}
              >
                По родам
              </button>
              <button
                type="button"
                className={`compare-diversity-filter${
                  groupMode === DIVERSITY_GROUP_MODES.FAMILY ? " compare-diversity-filter--on" : ""
                }`}
                aria-pressed={groupMode === DIVERSITY_GROUP_MODES.FAMILY}
                title="Сравнить количество семейств"
                onClick={() => handleGroupMode(DIVERSITY_GROUP_MODES.FAMILY)}
              >
                По семействам
              </button>
            </div>

            {noPoints ? (
              <p className="compare-diversity-empty">У выбранных слоёв нет точек с видами.</p>
            ) : (
              <>
                <p className="compare-diversity-lead">
                  {copy.leadTotal}: {summary.namedSpeciesTotal}. Общих для всех слоёв:{" "}
                  {summary.sharedNamedSpecies}.
                </p>
                <table className="compare-diversity-summary">
                  <thead>
                    <tr>
                      <th>Слой</th>
                      <th>{copy.summaryHeader}</th>
                      <th>Точек</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.layers.map((layer) => (
                      <tr key={layer.id}>
                        <td>{layer.label}</td>
                        <td>{layer.uniqueSpecies}</td>
                        <td>{layer.pointCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="compare-diversity-table-wrap">
                  <table className="compare-diversity-table">
                    <thead>
                      <tr>
                        <th>{copy.nameHeader}</th>
                        {showRuColumn ? <th>Русское название</th> : null}
                        {comparison.layers.map((layer) => (
                          <th key={layer.id}>{layer.label}</th>
                        ))}
                        <th>Всего</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.length === 0 ? (
                        <tr>
                          <td colSpan={emptyColSpan}>{copy.emptyMatches}</td>
                        </tr>
                      ) : (
                        tableRows.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <em>{row.nameLatin}</em>
                            </td>
                            {showRuColumn ? <td>{row.nameRu || "—"}</td> : null}
                            {comparison.layers.map((layer) => (
                              <td key={layer.id}>{row.counts[layer.id] || 0}</td>
                            ))}
                            <td>{row.total}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="compare-diversity-footer">
              <button
                type="button"
                className="compare-diversity-export"
                disabled={!canExport}
                onClick={handleExport}
              >
                Экспорт
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
