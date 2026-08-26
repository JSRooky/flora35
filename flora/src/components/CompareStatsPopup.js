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
import { listTempLayerPlaques, subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareStatsPopup.css";

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
  const keysSignature = plaqueKeys.join("\u0001");
  const tool = getCompareStatsTool(kind);

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

  const layers = useMemo(() => plaquesToCompareLayerInputs(plaques), [plaques]);
  const report = useMemo(() => computeCompareStats(kind, layers), [kind, layers]);
  const tooFew = plaques.length < COMPARE_SET_MIN;
  const canExport = !tooFew && (report.sections ?? []).some((section) => section.rows?.length);

  const handleExport = useCallback(() => {
    if (!canExport) {
      return;
    }
    downloadCompareStatsCsv(report, kind);
  }, [canExport, kind, report]);

  if (!open || !tool) {
    return null;
  }

  return (
    <div className="compare-stats-overlay">
      <div className="compare-stats-dialog" role="dialog" aria-labelledby="compare-stats-title">
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
          <>
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
                      {(section.rows ?? []).map((row, rowIndex) => (
                        <tr key={`${section.title}:${rowIndex}`}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex}>{cell}</td>
                          ))}
                        </tr>
                      ))}
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
          </>
        )}
      </div>
    </div>
  );
}
