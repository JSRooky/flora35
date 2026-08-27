import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  COMPARE_SET_MIN,
  plaquesToCompareLayerInputs
} from "../dataWork/compare/countSpeciesByLayers";
import {
  computeCompareStats,
  downloadCompareStatsCsv,
  getCompareStatsTool
} from "../dataWork/compare/compareExtraStats";
import CompareRegnumFilter, { useCompareRegnumFilter } from "./CompareRegnumFilter";
import { listTempLayerPlaques, subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareStatsPopup.css";

function formatSharedSpeciesLead(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  let word = "видов";
  if (mod10 === 1 && mod100 !== 11) {
    word = "вид";
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    word = "вида";
  }
  const adj = word === "вид" ? "общий" : "общих";
  return `${count} ${adj} ${word} по семействам`;
}

function resolvePlaques(plaqueKeys) {
  const plaques = listTempLayerPlaques();
  const byKey = new Map(plaques.map((plaque) => [plaque.key, plaque]));
  return (plaqueKeys ?? []).map((key) => byKey.get(key)).filter(Boolean);
}

export default function CompareStatsPopup({
  open,
  kind,
  plaqueKeys = [],
  onClose,
  onMinimize
}) {
  const [plaques, setPlaques] = useState(() => resolvePlaques(plaqueKeys));
  const [selectedKingdom, setSelectedKingdom] = useState(null);
  const keysSignature = plaqueKeys.join("\u0001");
  const tool = getCompareStatsTool(kind);
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

  const allowedRegnumsKey = allowedRegnums ? [...allowedRegnums].sort().join("\u0001") : "*";

  useEffect(() => {
    setSelectedKingdom(null);
  }, [kind, keysSignature, allowedRegnumsKey]);

  const layers = useMemo(
    () => plaquesToCompareLayerInputs(plaques, { allowedRegnums }),
    [plaques, allowedRegnums]
  );
  const report = useMemo(() => computeCompareStats(kind, layers), [kind, layers]);
  const tooFew = plaques.length < COMPARE_SET_MIN;
  const canExport = !tooFew && (report.sections ?? []).some((section) => section.rows?.length);
  const kingdomDetail =
    selectedKingdom != null ? report.overlapKingdoms?.[selectedKingdom] ?? null : null;

  const handleExport = useCallback(() => {
    if (!canExport) {
      return;
    }
    downloadCompareStatsCsv(report, kind);
  }, [canExport, kind, report]);

  const handleSelectKingdom = useCallback((rowId) => {
    setSelectedKingdom((current) => (current === rowId ? null : rowId));
  }, []);

  if (!open || !tool) {
    return null;
  }

  return (
    <div className="compare-stats-overlay">
      <div
        className={`compare-stats-dialog${kingdomDetail ? " compare-stats-dialog--with-side" : ""}`}
        role="dialog"
        aria-labelledby="compare-stats-title"
      >
        <div className="compare-stats-header">
          <h2 id="compare-stats-title" className="compare-stats-title">
            {tool.title}
          </h2>
          <div className="popup-panel-header-actions">
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
          </div>
        </div>

        {tooFew ? (
          <p className="compare-stats-empty">
            Для расчёта нужны не меньше двух слоёв в поле панели «Сравнение».
          </p>
        ) : (
          <div className="compare-stats-body">
            <div className="compare-stats-main">
              <CompareRegnumFilter
                presentRegnums={presentRegnums}
                isRegnumOn={isRegnumOn}
                allRegnumsOn={allRegnumsOn}
                noneRegnumsOn={noneRegnumsOn}
                onSelectAll={handleSelectAllRegnums}
                onReset={handleResetRegnums}
                onToggleRegnum={handleToggleRegnum}
              />
              {report.hint ? <PanelHint>{report.hint}</PanelHint> : null}
              {(report.sections ?? []).map((section) => (
                <div key={section.title} className="compare-stats-block">
                  <h3 className="compare-stats-section">{section.title}</h3>
                  <div className="compare-stats-table-wrap">
                    <table className="compare-stats-table">
                      <thead>
                        <tr>
                          {(section.columns ?? []).map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(section.rows ?? []).map((row, rowIndex) => {
                          const rowId = section.selectable ? section.rowIds?.[rowIndex] : undefined;
                          const clickable = section.selectable && rowId !== undefined;
                          const selected = clickable && selectedKingdom === rowId;
                          return (
                            <tr
                              key={`${section.title}:${rowIndex}`}
                              className={
                                clickable
                                  ? `compare-stats-table-row--clickable${
                                      selected ? " compare-stats-table-row--selected" : ""
                                    }`
                                  : undefined
                              }
                              tabIndex={clickable ? 0 : undefined}
                              aria-selected={clickable ? selected : undefined}
                              onClick={
                                clickable
                                  ? () => handleSelectKingdom(rowId)
                                  : undefined
                              }
                              onKeyDown={
                                clickable
                                  ? (event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        handleSelectKingdom(rowId);
                                      }
                                    }
                                  : undefined
                              }
                            >
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex}>{cell}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="compare-stats-footer">
                <button
                  type="button"
                  className="compare-stats-export"
                  disabled={!canExport}
                  onClick={handleExport}
                >
                  Экспорт
                </button>
              </div>
            </div>
            {kingdomDetail ? (
              <aside className="compare-stats-side" aria-label={`Общие виды: ${kingdomDetail.label}`}>
                <div className="compare-stats-side-header">
                  <h3 className="compare-stats-side-title">{kingdomDetail.label}</h3>
                  <button
                    type="button"
                    className="compare-stats-side-close"
                    onClick={() => setSelectedKingdom(null)}
                  >
                    Закрыть
                  </button>
                </div>
                <p className="compare-stats-side-lead">{formatSharedSpeciesLead(kingdomDetail.count)}</p>
                <ul className="compare-stats-family-list">
                  {kingdomDetail.families.map((family) => (
                    <li key={family.key || "__none__"} className="compare-stats-family">
                      <div className="compare-stats-family-head">
                        <span className="compare-stats-family-name">{family.label}</span>
                        <span className="compare-stats-family-count">{family.species.length}</span>
                      </div>
                      <ul className="compare-stats-species-list">
                        {family.species.map((species) => (
                          <li key={species.key}>{species.name}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
