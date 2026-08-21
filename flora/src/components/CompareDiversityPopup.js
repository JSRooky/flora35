import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  COMPARE_SET_MIN,
  countSpeciesByLayers,
  downloadDiversityCsv,
  listSharedSpeciesRows,
  plaquesToCompareLayerInputs,
  summarizeDiversity
} from "../dataWork/compare/countSpeciesByLayers";
import { listTempLayerPlaques, subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareDiversityPopup.css";

function resolvePlaques(plaqueKeys) {
  const plaques = listTempLayerPlaques();
  const byKey = new Map(plaques.map((plaque) => [plaque.key, plaque]));
  return (plaqueKeys ?? []).map((key) => byKey.get(key)).filter(Boolean);
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

  const comparison = useMemo(() => {
    return countSpeciesByLayers(
      plaquesToCompareLayerInputs(plaques, { includeGbif, includeInat })
    );
  }, [plaques, includeGbif, includeInat]);

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
    downloadDiversityCsv(tableComparison, summary);
  }, [canExport, tableComparison, summary]);

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
            <div className="compare-diversity-sources" role="group" aria-label="Точки">
              <span className="compare-diversity-sources-label">Точки</span>
              <div className="compare-diversity-source-group">
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
            </div>

            {noPoints ? (
              <p className="compare-diversity-empty">У выбранных слоёв нет точек с видами.</p>
            ) : (
              <>
                <p className="compare-diversity-lead">
                  Именованных видов всего: {summary.namedSpeciesTotal}. Общих для всех слоёв:{" "}
                  {summary.sharedNamedSpecies}.
                </p>
                <table className="compare-diversity-summary">
                  <thead>
                    <tr>
                      <th>Слой</th>
                      <th>Видов</th>
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
                        <th>Латинское название</th>
                        <th>Русское название</th>
                        {comparison.layers.map((layer) => (
                          <th key={layer.id}>{layer.label}</th>
                        ))}
                        <th>Всего</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.length === 0 ? (
                        <tr>
                          <td colSpan={comparison.layers.length + 3}>
                            Нет видов, общих для всех слоёв.
                          </td>
                        </tr>
                      ) : (
                        tableRows.map((row) => (
                          <tr key={row.key}>
                            <td>
                              <em>{row.nameLatin}</em>
                            </td>
                            <td>{row.nameRu || "—"}</td>
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
