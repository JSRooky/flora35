import React, { useCallback, useEffect, useMemo, useState } from "react";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  COMPARE_SET_MIN,
  plaquesToCompareLayerInputs
} from "../dataWork/compare/countSpeciesByLayers";
import {
  DISTRIBUTION_TAXON_MODES,
  buildCoordinateDistributions,
  listDistributionTaxa
} from "../dataWork/compare/distributionByCoords";
import { listTempLayerPlaques, subscribeTempLayers } from "../tempLayers/tempLayerStore";
import "../styles/CompareDistributionPopup.css";

const FALLBACK_COLORS = ["#2f6f4e", "#1d4ed8", "#b45309", "#7c3aed", "#be185d", "#0f766e"];
const TAXON_SEARCH_LIMIT = 80;

const TAXON_SEARCH_PLACEHOLDER = {
  [DISTRIBUTION_TAXON_MODES.SPECIES]: "Найти вид…",
  [DISTRIBUTION_TAXON_MODES.GENUS]: "Найти род…",
  [DISTRIBUTION_TAXON_MODES.FAMILY]: "Найти семейство…"
};

function matchesTaxonQuery(item, query) {
  if (!query) {
    return true;
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return (
    String(item.label || "")
      .toLowerCase()
      .includes(needle) ||
    String(item.key || "")
      .toLowerCase()
      .includes(needle)
  );
}

function resolvePlaques(plaqueKeys) {
  const plaques = listTempLayerPlaques();
  const byKey = new Map(plaques.map((plaque) => [plaque.key, plaque]));
  return (plaqueKeys ?? []).map((key) => byKey.get(key)).filter(Boolean);
}

function layerColor(plaque, index) {
  return plaque?.markerColor || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function buildSmoothLinePath(points) {
  if (points.length === 0) {
    return "";
  }
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(
      1
    )} ${points[1].y.toFixed(1)}`;
  }

  const count = points.length;
  const dx = [];
  const slopes = [];
  for (let index = 0; index < count - 1; index += 1) {
    const deltaX = points[index + 1].x - points[index].x;
    const deltaY = points[index + 1].y - points[index].y;
    dx.push(deltaX);
    slopes.push(deltaX === 0 ? 0 : deltaY / deltaX);
  }

  const tangents = new Array(count);
  tangents[0] = slopes[0];
  tangents[count - 1] = slopes[count - 2];
  for (let index = 1; index < count - 1; index += 1) {
    if (slopes[index - 1] * slopes[index] <= 0) {
      tangents[index] = 0;
    } else {
      tangents[index] = (slopes[index - 1] + slopes[index]) / 2;
    }
  }
  for (let index = 0; index < count - 1; index += 1) {
    if (Math.abs(slopes[index]) < 1e-12) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const a = tangents[index] / slopes[index];
    const b = tangents[index + 1] / slopes[index];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangents[index] = t * a * slopes[index];
      tangents[index + 1] = t * b * slopes[index];
    }
  }

  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let index = 0; index < count - 1; index += 1) {
    const handle = dx[index] / 3;
    const cp1x = points[index].x + handle;
    const cp1y = points[index].y + tangents[index] * handle;
    const cp2x = points[index + 1].x - handle;
    const cp2y = points[index + 1].y - tangents[index + 1] * handle;
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(
      1
    )}, ${points[index + 1].x.toFixed(1)} ${points[index + 1].y.toFixed(1)}`;
  }
  return path;
}

function formatCoord(value) {
  return `${value.toFixed(1)}°`;
}

function MeanDirectionPlot({ layers, bounds, ariaLabel }) {
  const size = 280;
  const pad = 28;
  const radius = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const latSpan = (bounds.latMax - bounds.latMin) || 1;
  const lonSpan = (bounds.lonMax - bounds.lonMin) || 1;

  const markers = layers
    .filter((layer) => layer.pointCount > 0 && layer.meanLat != null && layer.meanLon != null)
    .map((layer) => {
      const nx = Math.min(1, Math.max(0, (layer.meanLon - bounds.lonMin) / lonSpan));
      const ny = Math.min(1, Math.max(0, (bounds.latMax - layer.meanLat) / latSpan));
      return {
        ...layer,
        x: cx - radius + nx * radius * 2,
        y: cy - radius + ny * radius * 2
      };
    });

  const axisEnd = [
    { x: cx, y: cy - radius, label: "С" },
    { x: cx, y: cy + radius, label: "Ю" },
    { x: cx - radius, y: cy, label: "З" },
    { x: cx + radius, y: cy, label: "В" }
  ];

  return (
    <figure className="compare-distribution-chart compare-distribution-compass">
      <figcaption>Среднее направление</figcaption>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <circle
          className="compare-distribution-compass-ring"
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
        />
        <line
          className="compare-distribution-axis"
          x1={cx}
          y1={cy - radius}
          x2={cx}
          y2={cy + radius}
        />
        <line
          className="compare-distribution-axis"
          x1={cx - radius}
          y1={cy}
          x2={cx + radius}
          y2={cy}
        />
        {axisEnd.map((end) => (
          <text
            key={end.label}
            className="compare-distribution-compass-label"
            x={end.x}
            y={end.y + (end.label === "С" ? -8 : end.label === "Ю" ? 16 : 4)}
            textAnchor={end.label === "З" ? "end" : end.label === "В" ? "start" : "middle"}
            dx={end.label === "З" ? -6 : end.label === "В" ? 6 : 0}
          >
            {end.label}
          </text>
        ))}
        {markers.map((item) => (
          <circle
            key={item.id}
            cx={item.x}
            cy={item.y}
            r={6}
            fill={item.color}
            stroke="#fff"
            strokeWidth="1.5"
          >
            <title>
              {`${item.label}: ${formatCoord(item.meanLat)}, ${formatCoord(item.meanLon)}`}
            </title>
          </circle>
        ))}
      </svg>
    </figure>
  );
}

function DensityChart({ title, series, axis, ariaLabel }) {
  const width = axis === "lat" ? 280 : 560;
  const height = axis === "lat" ? 340 : 200;
  const pad = { top: 16, right: 16, bottom: 32, left: 44 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const maxShare = Math.max(0, ...series.flatMap((item) => item.shares));
  const minValue = series[0]?.centers[0] ?? 0;
  const maxValue = series[0]?.centers[(series[0]?.centers.length || 1) - 1] ?? 1;

  const toXShare = (share) =>
    pad.left + (maxShare > 0 ? (share / maxShare) * plotWidth : 0);
  const toYLat = (lat) =>
    pad.top + ((maxValue - lat) / (maxValue - minValue || 1)) * plotHeight;
  const toXLon = (lon) =>
    pad.left + ((lon - minValue) / (maxValue - minValue || 1)) * plotWidth;
  const toYShare = (share) =>
    pad.top + plotHeight - (maxShare > 0 ? (share / maxShare) * plotHeight : 0);

  const paths = series
    .filter((item) => item.pointCount > 0)
    .map((item) => {
      const points = item.centers.map((center, index) => {
        const share = item.shares[index] || 0;
        if (axis === "lat") {
          return { x: toXShare(share), y: toYLat(center) };
        }
        return { x: toXLon(center), y: toYShare(share) };
      });
      return { ...item, d: buildSmoothLinePath(points) };
    });

  const startLabel = formatCoord(axis === "lat" ? maxValue : minValue);
  const endLabel = formatCoord(axis === "lat" ? minValue : maxValue);

  return (
    <figure className="compare-distribution-chart">
      <figcaption>{title}</figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          className="compare-distribution-axis"
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + plotHeight}
        />
        <line
          className="compare-distribution-axis"
          x1={pad.left}
          y1={pad.top + plotHeight}
          x2={pad.left + plotWidth}
          y2={pad.top + plotHeight}
        />
        {paths.map((item) => (
          <path
            key={item.id}
            d={item.d}
            fill="none"
            stroke={item.color}
            strokeWidth="2"
          >
            <title>{item.label}</title>
          </path>
        ))}
        {axis === "lat" ? (
          <>
            <text className="compare-distribution-tick" x={8} y={pad.top + 4}>
              {startLabel}
            </text>
            <text className="compare-distribution-tick" x={8} y={pad.top + plotHeight}>
              {endLabel}
            </text>
          </>
        ) : (
          <>
            <text
              className="compare-distribution-tick"
              x={pad.left}
              y={height - 8}
              textAnchor="start"
            >
              {startLabel}
            </text>
            <text
              className="compare-distribution-tick"
              x={pad.left + plotWidth}
              y={height - 8}
              textAnchor="end"
            >
              {endLabel}
            </text>
          </>
        )}
      </svg>
    </figure>
  );
}

export default function CompareDistributionPopup({
  open,
  plaqueKeys = [],
  onClose,
  onMinimize
}) {
  const [plaques, setPlaques] = useState(() => resolvePlaques(plaqueKeys));
  const [taxonMode, setTaxonMode] = useState(DISTRIBUTION_TAXON_MODES.ALL);
  const [taxonKey, setTaxonKey] = useState("");
  const [taxonQuery, setTaxonQuery] = useState("");
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

  const layerInputs = useMemo(() => plaquesToCompareLayerInputs(plaques), [plaques]);
  const taxa = useMemo(
    () => listDistributionTaxa(layerInputs, taxonMode),
    [layerInputs, taxonMode]
  );
  const filteredAll = useMemo(
    () => taxa.filter((item) => matchesTaxonQuery(item, taxonQuery)),
    [taxa, taxonQuery]
  );
  const filteredTaxa = filteredAll.slice(0, TAXON_SEARCH_LIMIT);
  const filteredTaxaTotal = filteredAll.length;
  const selectedTaxon = taxa.find((item) => item.key === taxonKey) || null;

  useEffect(() => {
    setTaxonQuery("");
  }, [taxonMode]);

  useEffect(() => {
    if (taxonMode === DISTRIBUTION_TAXON_MODES.ALL) {
      setTaxonKey("");
      return;
    }
    setTaxonKey((current) => {
      if (current && taxa.some((item) => item.key === current)) {
        return current;
      }
      return taxa[0]?.key || "";
    });
  }, [taxonMode, taxa]);

  const distribution = useMemo(
    () =>
      buildCoordinateDistributions(layerInputs, {
        mode: taxonMode,
        taxonKey: taxonMode === DISTRIBUTION_TAXON_MODES.ALL ? null : taxonKey
      }),
    [layerInputs, taxonMode, taxonKey]
  );

  const colorById = useMemo(() => {
    const map = new Map();
    plaques.forEach((plaque, index) => {
      map.set(plaque.key, layerColor(plaque, index));
    });
    return map;
  }, [plaques]);

  const latSeries = distribution.layers.map((layer) => ({
    ...layer.lat,
    id: layer.id,
    label: layer.label,
    pointCount: layer.pointCount,
    color: colorById.get(layer.id) || FALLBACK_COLORS[0]
  }));
  const lonSeries = distribution.layers.map((layer) => ({
    ...layer.lon,
    id: layer.id,
    label: layer.label,
    pointCount: layer.pointCount,
    color: colorById.get(layer.id) || FALLBACK_COLORS[0]
  }));

  const tooFew = plaques.length < COMPARE_SET_MIN;
  const handleMode = useCallback((nextMode) => {
    setTaxonMode(nextMode);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="compare-distribution-overlay">
      <div
        className="compare-distribution-dialog"
        role="dialog"
        aria-labelledby="compare-distribution-title"
      >
        <div className="compare-distribution-header">
          <h2 id="compare-distribution-title" className="compare-distribution-title">
            Распределение
          </h2>
          <div className="popup-panel-header-actions">
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
          </div>
        </div>

        {tooFew ? (
          <p className="compare-distribution-empty">
            Для сравнения нужны не меньше двух слоёв в поле панели «Сравнение».
          </p>
        ) : (
          <>
            <PanelHint>
              Кривые — доля точек слоя в корзине широты или долготы (сумма долей слоя = 1). Общая
              ось по всем выбранным слоям. Север на графике широты сверху. Точки на компасе — среднее
              положение группы (средняя широта и круговое среднее долготы).
            </PanelHint>

            <div className="compare-distribution-toolbar">
              <div className="compare-distribution-modes" role="group" aria-label="Группа точек">
                {[
                  { id: DISTRIBUTION_TAXON_MODES.ALL, label: "Все точки" },
                  { id: DISTRIBUTION_TAXON_MODES.SPECIES, label: "Вид" },
                  { id: DISTRIBUTION_TAXON_MODES.GENUS, label: "Род" },
                  { id: DISTRIBUTION_TAXON_MODES.FAMILY, label: "Семейство" }
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`compare-distribution-mode${
                      taxonMode === item.id ? " compare-distribution-mode--on" : ""
                    }`}
                    aria-pressed={taxonMode === item.id}
                    onClick={() => handleMode(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {taxonMode !== DISTRIBUTION_TAXON_MODES.ALL ? (
                <div className="compare-distribution-search">
                  <label className="compare-distribution-select-wrap" htmlFor="compare-distribution-taxon-search">
                    Поиск
                    <input
                      id="compare-distribution-taxon-search"
                      className="compare-distribution-search-input"
                      type="search"
                      value={taxonQuery}
                      placeholder={TAXON_SEARCH_PLACEHOLDER[taxonMode] || "Найти…"}
                      autoComplete="off"
                      disabled={taxa.length === 0}
                      onChange={(event) => setTaxonQuery(event.target.value)}
                    />
                  </label>
                  {selectedTaxon ? (
                    <span className="compare-distribution-selected">
                      Выбрано: {selectedTaxon.label}
                    </span>
                  ) : null}
                  {taxa.length === 0 ? (
                    <p className="compare-distribution-search-empty">Нет таксонов</p>
                  ) : (
                    <ul className="compare-distribution-search-list" role="listbox" aria-label="Совпадения">
                      {filteredTaxa.length === 0 ? (
                        <li className="compare-distribution-search-empty">Ничего не найдено</li>
                      ) : (
                        filteredTaxa.map((item) => (
                          <li key={item.key}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={item.key === taxonKey}
                              className={`compare-distribution-search-option${
                                item.key === taxonKey ? " compare-distribution-search-option--on" : ""
                              }`}
                              onClick={() => setTaxonKey(item.key)}
                            >
                              {item.label}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                  {filteredTaxaTotal > TAXON_SEARCH_LIMIT ? (
                    <p className="compare-distribution-search-more">
                      Показаны первые {TAXON_SEARCH_LIMIT} из {filteredTaxaTotal}. Уточните запрос.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <ul className="compare-distribution-legend">
              {distribution.layers.map((layer) => (
                <li key={layer.id}>
                  <span
                    className="compare-distribution-swatch"
                    style={{ background: colorById.get(layer.id) }}
                  />
                  {layer.label}
                  {layer.pointCount > 0 ? ` · ${layer.pointCount}` : " · нет точек"}
                </li>
              ))}
            </ul>

            <div className="compare-distribution-charts">
              <DensityChart
                title="Широта"
                axis="lat"
                series={latSeries}
                ariaLabel="Плотность точек по широте"
              />
              <DensityChart
                title="Долгота"
                axis="lon"
                series={lonSeries}
                ariaLabel="Плотность точек по долготе"
              />
              <MeanDirectionPlot
                layers={distribution.layers.map((layer) => ({
                  ...layer,
                  color: colorById.get(layer.id) || FALLBACK_COLORS[0]
                }))}
                bounds={distribution.bounds}
                ariaLabel="Среднее направление групп по сторонам света"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
