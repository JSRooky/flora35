import React, { useEffect, useMemo, useRef, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import {
  buildSeasonalityCoordinateBounds,
  buildSeasonalityStats,
  SEASONALITY_COORD_STEP
} from "../dataWork/buildSeasonalityStats";
import "../styles/SeasonalityPanel.css";

const MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек"
];

function formatCoord(value) {
  return Number(value).toFixed(2);
}

function rangesEqual(a, b) {
  return (
    a?.latMin === b?.latMin &&
    a?.latMax === b?.latMax &&
    a?.lonMin === b?.lonMin &&
    a?.lonMax === b?.lonMax
  );
}

function getRangeProgress(value, min, max) {
  if (max <= min) {
    return 0;
  }

  return ((value - min) / (max - min)) * 100;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function snapToStep(value, min, max, step) {
  if (step <= 0 || max <= min) {
    return clamp(value, min, max);
  }

  const snapped = min + Math.round((value - min) / step) * step;
  const precision = Math.max(0, String(step).split(".")[1]?.length ?? 0);
  return Number(clamp(snapped, min, max).toFixed(precision));
}

/**
 * Двойной ползунок без CSS-rotate: вертикальная ось иначе «залипает»
 * из‑за рассинхрона hit-area и видимого бегунка.
 */
function SeasonalityDualSlider({
  orientation = "horizontal",
  min,
  max,
  step,
  start,
  end,
  onStartChange,
  onEndChange,
  startLabel,
  endLabel
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const valuesRef = useRef({ start, end });
  const [activeThumb, setActiveThumb] = useState(null);
  const isVertical = orientation === "vertical";

  valuesRef.current = { start, end };

  const startProgress = getRangeProgress(start, min, max);
  const endProgress = getRangeProgress(end, min, max);

  const valueFromPointer = (clientX, clientY) => {
    const track = trackRef.current;
    if (!track) {
      return min;
    }

    const rect = track.getBoundingClientRect();
    let ratio;

    if (isVertical) {
      // Сверху — max (север), снизу — min.
      ratio = rect.height <= 0 ? 0 : 1 - (clientY - rect.top) / rect.height;
    } else {
      ratio = rect.width <= 0 ? 0 : (clientX - rect.left) / rect.width;
    }

    return snapToStep(min + clamp(ratio, 0, 1) * (max - min), min, max, step);
  };

  const pickThumb = (clientX, clientY) => {
    const track = trackRef.current;
    if (!track || max <= min) {
      return "start";
    }

    const rect = track.getBoundingClientRect();
    const pointerRatio = isVertical
      ? rect.height <= 0
        ? 0
        : 1 - (clientY - rect.top) / rect.height
      : rect.width <= 0
        ? 0
        : (clientX - rect.left) / rect.width;

    const startRatio = (valuesRef.current.start - min) / (max - min);
    const endRatio = (valuesRef.current.end - min) / (max - min);
    return Math.abs(pointerRatio - startRatio) <= Math.abs(pointerRatio - endRatio)
      ? "start"
      : "end";
  };

  const applyThumbValue = (thumb, nextValue) => {
    const { start: currentStart, end: currentEnd } = valuesRef.current;
    if (thumb === "start") {
      const nextStart = Math.min(nextValue, currentEnd);
      valuesRef.current = { start: nextStart, end: currentEnd };
      onStartChange(nextStart);
      return;
    }

    const nextEnd = Math.max(nextValue, currentStart);
    valuesRef.current = { start: currentStart, end: nextEnd };
    onEndChange(nextEnd);
  };

  const handlePointerDown = (event) => {
    if (event.button != null && event.button !== 0) {
      return;
    }

    const thumbEl = event.target.closest?.("[data-thumb]");
    const thumb =
      thumbEl?.dataset?.thumb === "start" || thumbEl?.dataset?.thumb === "end"
        ? thumbEl.dataset.thumb
        : pickThumb(event.clientX, event.clientY);

    dragRef.current = thumb;
    setActiveThumb(thumb);
    trackRef.current?.setPointerCapture?.(event.pointerId);
    applyThumbValue(thumb, valueFromPointer(event.clientX, event.clientY));
    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    const thumb = dragRef.current;
    if (!thumb) {
      return;
    }

    applyThumbValue(thumb, valueFromPointer(event.clientX, event.clientY));
  };

  const clearDrag = (event) => {
    dragRef.current = null;
    setActiveThumb(null);
    if (trackRef.current?.hasPointerCapture?.(event.pointerId)) {
      trackRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const nudgeThumb = (thumb, delta) => {
    if (delta === 0) {
      return;
    }

    const { start: currentStart, end: currentEnd } = valuesRef.current;
    if (thumb === "start") {
      onStartChange(
        Math.min(snapToStep(currentStart + delta, min, max, step), currentEnd)
      );
      return;
    }

    onEndChange(
      Math.max(snapToStep(currentEnd + delta, min, max, step), currentStart)
    );
  };

  const keyDelta = (event) => {
    if (isVertical) {
      if (event.key === "ArrowUp") {
        return step;
      }
      if (event.key === "ArrowDown") {
        return -step;
      }
      return 0;
    }

    if (event.key === "ArrowRight") {
      return step;
    }
    if (event.key === "ArrowLeft") {
      return -step;
    }
    return 0;
  };

  const startStyle = isVertical
    ? { bottom: `${startProgress}%` }
    : { left: `${startProgress}%` };
  const endStyle = isVertical
    ? { bottom: `${endProgress}%` }
    : { left: `${endProgress}%` };

  return (
    <div
      ref={trackRef}
      className={`seasonality-dual-slider seasonality-dual-slider--${orientation}`}
      style={{
        "--dual-start": `${startProgress}%`,
        "--dual-end": `${endProgress}%`
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearDrag}
      onPointerCancel={clearDrag}
      role="group"
      aria-label={isVertical ? "Диапазон широты" : "Диапазон долготы"}
    >
      <button
        type="button"
        role="slider"
        data-thumb="start"
        className={`seasonality-dual-thumb seasonality-dual-thumb--start${
          activeThumb === "start" ? " seasonality-dual-thumb--active" : ""
        }`}
        style={startStyle}
        aria-label={startLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={start}
        onKeyDown={(event) => {
          const delta = keyDelta(event);
          if (delta === 0) {
            return;
          }
          event.preventDefault();
          nudgeThumb("start", delta);
        }}
      />
      <button
        type="button"
        role="slider"
        data-thumb="end"
        className={`seasonality-dual-thumb seasonality-dual-thumb--end${
          activeThumb === "end" ? " seasonality-dual-thumb--active" : ""
        }`}
        style={endStyle}
        aria-label={endLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={end}
        onKeyDown={(event) => {
          const delta = keyDelta(event);
          if (delta === 0) {
            return;
          }
          event.preventDefault();
          nudgeThumb("end", delta);
        }}
      />
    </div>
  );
}

function SeasonalityChart({ stats, ariaLabel }) {
  const maxCount = stats?.byMonth?.length ? Math.max(0, ...stats.byMonth) : 0;

  return (
    <div className="seasonality-chart" role="img" aria-label={ariaLabel}>
      {MONTH_LABELS.map((label, index) => {
        const count = stats.byMonth[index] ?? 0;
        const heightPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

        return (
          <div key={label} className="seasonality-chart-col">
            <div className="seasonality-chart-bar-wrap">
              <div
                className="seasonality-chart-bar"
                style={{ height: `${heightPct}%` }}
                title={`${label}: ${count}`}
              />
            </div>
            <div className="seasonality-chart-count">{count}</div>
            <div className="seasonality-chart-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

const LINE_CHART_WIDTH = 360;
const LINE_CHART_HEIGHT = 120;
const LINE_CHART_PAD = { top: 12, right: 10, bottom: 28, left: 10 };

/**
 * Монотонный кубический сплайн (Fritsch–Carlson): без перехлёста за локальные
 * значения, поэтому линия не уходит ниже нуля находок.
 * @param {{ x: number, y: number }[]} points
 * @returns {string}
 */
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

function SeasonalityLineChart({ stats, ariaLabel }) {
  const byMonth = stats?.byMonth ?? [];
  const maxCount = byMonth.length ? Math.max(0, ...byMonth) : 0;
  const plotWidth = LINE_CHART_WIDTH - LINE_CHART_PAD.left - LINE_CHART_PAD.right;
  const plotHeight = LINE_CHART_HEIGHT - LINE_CHART_PAD.top - LINE_CHART_PAD.bottom;
  const baselineY = LINE_CHART_PAD.top + plotHeight;

  const points = MONTH_LABELS.map((label, index) => {
    const count = byMonth[index] ?? 0;
    const x =
      LINE_CHART_PAD.left +
      (MONTH_LABELS.length <= 1 ? plotWidth / 2 : (index / (MONTH_LABELS.length - 1)) * plotWidth);
    const y =
      LINE_CHART_PAD.top +
      (maxCount > 0 ? plotHeight * (1 - count / maxCount) : plotHeight);
    return { label, count, x, y };
  });

  const linePath = buildSmoothLinePath(points);
  const areaPath =
    points.length > 0 && linePath
      ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${baselineY.toFixed(
          1
        )} L ${points[0].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
      : "";

  return (
    <div className="seasonality-line-chart" role="img" aria-label={ariaLabel}>
      <svg
        className="seasonality-line-chart-svg"
        viewBox={`0 0 ${LINE_CHART_WIDTH} ${LINE_CHART_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          className="seasonality-line-chart-baseline"
          x1={LINE_CHART_PAD.left}
          y1={baselineY}
          x2={LINE_CHART_PAD.left + plotWidth}
          y2={baselineY}
        />
        {areaPath ? <path className="seasonality-line-chart-area" d={areaPath} /> : null}
        {linePath ? <path className="seasonality-line-chart-line" d={linePath} fill="none" /> : null}
        {points.map((point) => (
          <g key={point.label}>
            <text
              className="seasonality-line-chart-count"
              x={point.x}
              y={Math.max(10, point.y - 8)}
              textAnchor="middle"
            >
              {point.count}
            </text>
            <text
              className="seasonality-line-chart-label"
              x={point.x}
              y={LINE_CHART_HEIGHT - 6}
              textAnchor="middle"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * Панель сезонности: гистограмма находок по месяцам для вида выбранной точки.
 * Опционально — широтный анализ с фильтром по широте и долготе.
 */
export default function SeasonalityPanel({
  nameLatin = null,
  nameRu = null,
  features = [],
  selectionKey = null,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);
  const [latAnalysisOpen, setLatAnalysisOpen] = useState(false);
  const [geoRange, setGeoRange] = useState(null);
  const geoRangeRef = useRef(geoRange);

  const hasSpecies = Boolean(nameLatin);

  const stats = useMemo(
    () => buildSeasonalityStats(features, nameLatin),
    [features, nameLatin]
  );

  const coordBounds = useMemo(
    () => buildSeasonalityCoordinateBounds(features, nameLatin),
    [features, nameLatin]
  );
  const coordBoundsRef = useRef(coordBounds);
  coordBoundsRef.current = coordBounds;

  useEffect(() => {
    if (!coordBounds) {
      setGeoRange(null);
      return;
    }

    setGeoRange((prev) => {
      if (!prev) {
        return { ...coordBounds };
      }

      const next = {
        latMin: Math.min(Math.max(prev.latMin, coordBounds.latMin), coordBounds.latMax),
        latMax: Math.max(Math.min(prev.latMax, coordBounds.latMax), coordBounds.latMin),
        lonMin: Math.min(Math.max(prev.lonMin, coordBounds.lonMin), coordBounds.lonMax),
        lonMax: Math.max(Math.min(prev.lonMax, coordBounds.lonMax), coordBounds.lonMin)
      };

      if (next.latMin > next.latMax) {
        next.latMin = coordBounds.latMin;
        next.latMax = coordBounds.latMax;
      }
      if (next.lonMin > next.lonMax) {
        next.lonMin = coordBounds.lonMin;
        next.lonMax = coordBounds.lonMax;
      }

      return rangesEqual(prev, next) ? prev : next;
    });
  }, [coordBounds]);

  useEffect(() => {
    geoRangeRef.current = geoRange;
  }, [geoRange]);

  useEffect(() => {
    if (!hasSpecies) {
      setLatAnalysisOpen(false);
    }
  }, [hasSpecies]);

  useEffect(() => {
    // Как кнопка «Сброс осей»: при выборе новой точки — полное окно.
    const bounds = coordBoundsRef.current;
    setGeoRange(bounds ? { ...bounds } : null);
  }, [selectionKey]);

  const filteredStats = useMemo(() => {
    if (!latAnalysisOpen || !geoRange) {
      return null;
    }

    return buildSeasonalityStats(features, nameLatin, geoRange);
  }, [latAnalysisOpen, geoRange, features, nameLatin]);

  const emitGeoRange = (next) => {
    geoRangeRef.current = next;
    setGeoRange(next);
  };

  const handleLatMinChange = (nextMin) => {
    const { latMax, lonMin, lonMax } = geoRangeRef.current;
    emitGeoRange({
      latMin: Math.min(nextMin, latMax),
      latMax,
      lonMin,
      lonMax
    });
  };

  const handleLatMaxChange = (nextMax) => {
    const { latMin, lonMin, lonMax } = geoRangeRef.current;
    emitGeoRange({
      latMin,
      latMax: Math.max(nextMax, latMin),
      lonMin,
      lonMax
    });
  };

  const handleLonMinChange = (nextMin) => {
    const { latMin, latMax, lonMax } = geoRangeRef.current;
    emitGeoRange({
      latMin,
      latMax,
      lonMin: Math.min(nextMin, lonMax),
      lonMax
    });
  };

  const handleLonMaxChange = (nextMax) => {
    const { latMin, latMax, lonMin } = geoRangeRef.current;
    emitGeoRange({
      latMin,
      latMax,
      lonMin,
      lonMax: Math.max(nextMax, lonMin)
    });
  };

  const handleOpenLatAnalysis = () => {
    setLatAnalysisOpen(true);
    if (collapsed) {
      setCollapsed(false);
    }
  };

  const handleCloseLatAnalysis = () => {
    setLatAnalysisOpen(false);
    if (coordBounds) {
      emitGeoRange({ ...coordBounds });
    }
  };

  const isFullGeoRange =
    Boolean(coordBounds && geoRange) && rangesEqual(geoRange, coordBounds);

  const handleResetGeoRange = () => {
    if (coordBounds) {
      emitGeoRange({ ...coordBounds });
    }
  };

  const analysisStats = filteredStats ?? stats;

  return (
    <aside
      className={`seasonality-panel${collapsed ? " seasonality-panel--collapsed" : ""}${
        latAnalysisOpen && !collapsed ? " seasonality-panel--lat-analysis" : ""
      }`}
    >
      <div className="seasonality-panel-header">
        <h3 className="seasonality-panel-title">Сезонность</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="seasonality-panel-toggle"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
          >
            {collapsed ? "▾" : "▴"}
          </button>
          {onClose ? <PanelCloseButton onClick={onClose} /> : null}
        </div>
      </div>

      {!collapsed && (
        <div className="seasonality-panel-content">
          {!hasSpecies ? (
            <p className="seasonality-panel-empty">
              Выберите точку с латинским названием вида.
            </p>
          ) : (
            <>
              <div className="seasonality-panel-species">
                {nameRu ? (
                  <div className="seasonality-panel-species-ru">{nameRu}</div>
                ) : null}
                <div className="seasonality-panel-species-latin">{nameLatin}</div>
              </div>

              {stats && stats.total === 0 ? (
                <p className="seasonality-panel-empty">
                  Нет точек этого вида в текущей выборке карты.
                </p>
              ) : null}

              {stats && stats.total > 0 ? (
                <>
                  <div className="seasonality-panel-summary">
                    <span>В анализе - {stats.total} точек.</span>
                  </div>

                  <SeasonalityChart
                    stats={stats}
                    ariaLabel="Находки по месяцам"
                  />

                  <div className="seasonality-panel-actions">
                    {!latAnalysisOpen ? (
                      <button
                        type="button"
                        className="seasonality-panel-btn"
                        onClick={handleOpenLatAnalysis}
                        disabled={!coordBounds}
                        title={
                          coordBounds
                            ? "Открыть широтный анализ"
                            : "Нет координат у точек вида"
                        }
                      >
                        Широтный анализ
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="seasonality-panel-btn seasonality-panel-btn--active"
                        onClick={handleCloseLatAnalysis}
                      >
                        Скрыть широтный анализ
                      </button>
                    )}
                  </div>

                  {latAnalysisOpen ? (
                    <div className="seasonality-lat-analysis">
                      <div className="seasonality-lat-analysis-header">
                        <h4 className="seasonality-lat-analysis-title">
                          Широтный анализ
                        </h4>
                        <button
                          type="button"
                          className="seasonality-panel-btn seasonality-panel-btn--ghost"
                          onClick={handleResetGeoRange}
                          disabled={isFullGeoRange || !coordBounds}
                        >
                          Сброс осей
                        </button>
                      </div>

                      {!coordBounds || !geoRange ? (
                        <p className="seasonality-panel-empty">
                          Нет координат для построения осей.
                        </p>
                      ) : (
                        <>
                          <p className="seasonality-lat-analysis-hint">
                            Ползунки задают окно по широте (вертикаль) и долготе
                            (горизонталь). Гистограмма ниже пересчитывается для
                            точек внутри окна.
                          </p>

                          <div className="seasonality-lat-axes">
                            <div className="seasonality-lat-range" aria-live="polite">
                              <span>
                                φ {formatCoord(geoRange.latMin)}° —{" "}
                                {formatCoord(geoRange.latMax)}°
                              </span>
                              <span>
                                λ {formatCoord(geoRange.lonMin)}° —{" "}
                                {formatCoord(geoRange.lonMax)}°
                              </span>
                            </div>

                            <div className="seasonality-lat-axis seasonality-lat-axis--vertical">
                              <span className="seasonality-lat-axis-label" aria-hidden="true">
                                φ
                              </span>
                              <SeasonalityDualSlider
                                orientation="vertical"
                                min={coordBounds.latMin}
                                max={coordBounds.latMax}
                                step={SEASONALITY_COORD_STEP}
                                start={geoRange.latMin}
                                end={geoRange.latMax}
                                onStartChange={handleLatMinChange}
                                onEndChange={handleLatMaxChange}
                                startLabel="Минимальная широта"
                                endLabel="Максимальная широта"
                              />
                            </div>

                            <div className="seasonality-lat-chart">
                              {analysisStats && analysisStats.total > 0 ? (
                                <SeasonalityLineChart
                                  stats={analysisStats}
                                  ariaLabel="Находки по месяцам в выбранном широтном окне"
                                />
                              ) : (
                                <p className="seasonality-panel-empty">
                                  В выбранном окне нет точек вида.
                                </p>
                              )}
                            </div>

                            <div className="seasonality-lat-axis seasonality-lat-axis--horizontal">
                              <SeasonalityDualSlider
                                orientation="horizontal"
                                min={coordBounds.lonMin}
                                max={coordBounds.lonMax}
                                step={SEASONALITY_COORD_STEP}
                                start={geoRange.lonMin}
                                end={geoRange.lonMax}
                                onStartChange={handleLonMinChange}
                                onEndChange={handleLonMaxChange}
                                startLabel="Минимальная долгота"
                                endLabel="Максимальная долгота"
                              />
                              <span
                                className="seasonality-lat-axis-label seasonality-lat-axis-label--below"
                                aria-hidden="true"
                              >
                                λ
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                  <p className="seasonality-panel-hint">
                    Для полных данных по внешним источникам перезагрузите их после
                    обновления приложения (месяц сохраняется при загрузке).
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.SEASONALITY} open={helpOpen} />
    </aside>
  );
}
