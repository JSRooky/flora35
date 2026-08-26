import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { COMPARE_SET_MIN, plaquesToCompareLayerInputs } from "../dataWork/compare/countSpeciesByLayers";
import {
  computeLayerSimilarity,
  formatSimilarityCoef,
  downloadSimilarityCsv,
  SIMILARITY_TABLE_LEVELS,
  SIMILARITY_TABLE_METRICS
} from "../dataWork/compare/similarityByLayers";
import { listTempLayerPlaques, subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareSimilarityPopup.css";

function resolvePlaques(plaqueKeys) {
  const plaques = listTempLayerPlaques();
  const byKey = new Map(plaques.map((plaque) => [plaque.key, plaque]));
  return (plaqueKeys ?? []).map((key) => byKey.get(key)).filter(Boolean);
}

/**
 * Окно попарного сходства слоёв: R и R² по видам, родам, семействам и общему совпадению.
 */
export default function CompareSimilarityPopup({
  open,
  plaqueKeys = [],
  onClose,
  onMinimize
}) {
  const [plaques, setPlaques] = useState(() => resolvePlaques(plaqueKeys));
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

  const result = useMemo(
    () => computeLayerSimilarity(plaquesToCompareLayerInputs(plaques)),
    [plaques]
  );
  const tooFew = plaques.length < COMPARE_SET_MIN;
  const canExport = !tooFew && result.pairs.length > 0;

  const handleExport = useCallback(() => {
    if (!canExport) {
      return;
    }
    downloadSimilarityCsv(result);
  }, [canExport, result]);

  if (!open) {
    return null;
  }

  return (
    <div className="compare-similarity-overlay">
      <div
        className="compare-similarity-dialog"
        role="dialog"
        aria-labelledby="compare-similarity-title"
      >
        <div className="compare-similarity-header">
          <h2 id="compare-similarity-title" className="compare-similarity-title">
            Сходство
          </h2>
          <div className="popup-panel-header-actions">
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
          </div>
        </div>

        {tooFew ? (
          <p className="compare-similarity-empty">
            Для расчёта нужны не меньше двух слоёв в поле панели «Сравнение».
          </p>
        ) : (
          <>
            <PanelHint>
              Попарно считаются корреляция Пирсона R и коэффициент детерминации R². Виды — по числу
              точек каждого вида (нет в слое = 0). Роды и семейства — так же по точкам группы.
              Общее — один вектор: число родов в каждом семействе, число видов в каждом роде и число
              точек каждого вида. «—» только если в уровне меньше двух групп.
            </PanelHint>

            <div className="compare-similarity-table-wrap">
              <table className="compare-similarity-table">
                <colgroup>
                  <col className="compare-similarity-col-level" />
                  <col className="compare-similarity-col-metric" />
                  {result.pairs.map((pair) => (
                    <col
                      key={`${pair.leftId}:${pair.rightId}`}
                      className="compare-similarity-col-pair"
                      style={{
                        width: `${60 / Math.max(result.pairs.length, 1)}%`
                      }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className="compare-similarity-level" scope="col">
                      Уровень
                    </th>
                    <th className="compare-similarity-metric" scope="col">
                      Показ.
                    </th>
                    {result.pairs.map((pair) => (
                      <th
                        key={`${pair.leftId}:${pair.rightId}`}
                        className="compare-similarity-pair"
                        scope="col"
                        title={`${pair.leftLabel} · ${pair.rightLabel}`}
                      >
                        <span className="compare-similarity-pair-name">{pair.leftLabel}</span>
                        <span className="compare-similarity-pair-sep" aria-hidden="true">
                          ·
                        </span>
                        <span className="compare-similarity-pair-name">{pair.rightLabel}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {SIMILARITY_TABLE_LEVELS.map((level) =>
                    SIMILARITY_TABLE_METRICS.map((metric, metricIndex) => (
                      <tr
                        key={`${level.key}:${metric.key}`}
                        className={
                          metricIndex === 0 ? "compare-similarity-level-start" : undefined
                        }
                      >
                        {metricIndex === 0 ? (
                          <th className="compare-similarity-level" rowSpan={3} scope="row">
                            {level.label}
                          </th>
                        ) : null}
                        <th className="compare-similarity-metric" scope="row">
                          {metric.label}
                        </th>
                        {result.pairs.map((pair) => {
                          const cell = pair[level.key];
                          const value =
                            metric.key === "n"
                              ? cell?.n ?? "—"
                              : formatSimilarityCoef(cell?.[metric.key]);
                          return (
                            <td key={`${pair.leftId}:${pair.rightId}:${level.key}:${metric.key}`}>
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="compare-similarity-footer">
              <button
                type="button"
                className="compare-similarity-export"
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
