import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { COMPARE_SET_MIN, plaquesToCompareLayerInputs } from "../dataWork/compare/countSpeciesByLayers";
import {
  computeLayerSimilarity,
  formatSimilarityCoef,
  downloadSimilarityCsv
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
                <thead>
                  <tr>
                    <th rowSpan={2}>Пара</th>
                    <th colSpan={3}>Виды</th>
                    <th colSpan={3}>Роды</th>
                    <th colSpan={3}>Семейства</th>
                    <th colSpan={3}>Общее</th>
                  </tr>
                  <tr>
                    <th>n</th>
                    <th>R</th>
                    <th>R²</th>
                    <th>n</th>
                    <th>R</th>
                    <th>R²</th>
                    <th>n</th>
                    <th>R</th>
                    <th>R²</th>
                    <th>n</th>
                    <th>R</th>
                    <th>R²</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pairs.map((pair) => (
                    <tr key={`${pair.leftId}:${pair.rightId}`}>
                      <td>
                        {pair.leftLabel} · {pair.rightLabel}
                      </td>
                      <td>{pair.species.n}</td>
                      <td>{formatSimilarityCoef(pair.species.r)}</td>
                      <td>{formatSimilarityCoef(pair.species.r2)}</td>
                      <td>{pair.genus.n}</td>
                      <td>{formatSimilarityCoef(pair.genus.r)}</td>
                      <td>{formatSimilarityCoef(pair.genus.r2)}</td>
                      <td>{pair.family.n}</td>
                      <td>{formatSimilarityCoef(pair.family.r)}</td>
                      <td>{formatSimilarityCoef(pair.family.r2)}</td>
                      <td>{pair.overall.n}</td>
                      <td>{formatSimilarityCoef(pair.overall.r)}</td>
                      <td>{formatSimilarityCoef(pair.overall.r2)}</td>
                    </tr>
                  ))}
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
