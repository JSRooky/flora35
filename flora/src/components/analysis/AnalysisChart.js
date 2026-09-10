import React from "react";

function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  const pad = value * 1.08;
  const exp = 10 ** Math.floor(Math.log10(pad));
  return Math.ceil(pad / exp) * exp;
}

function formatTick(value) {
  if (!Number.isFinite(value)) {
    return "—";
  }
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
  }
  if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-6) {
    return String(Math.round(value));
  }
  return String(Number(value.toFixed(1)));
}

/**
 * Простой линейный график без внешних библиотек.
 * series: [{ x, y, label }]
 */
export default function AnalysisChart({
  series = [],
  xLabel = "",
  yLabel = "",
  title = ""
}) {
  const points = series.filter(
    (item) => Number.isFinite(item?.x) && Number.isFinite(item?.y)
  );
  if (points.length < 2) {
    return null;
  }

  const width = 340;
  const height = 150;
  const padL = 36;
  const padR = 10;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xs = points.map((item) => item.x);
  const ys = points.map((item) => item.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = niceMax(Math.max(...ys, 0));
  const xSpan = xMax - xMin || 1;

  const toX = (x) => padL + ((x - xMin) / xSpan) * innerW;
  const toY = (y) => padT + innerH - (y / yMax) * innerH;
  const d = points
    .map((item, index) => `${index === 0 ? "M" : "L"} ${toX(item.x).toFixed(1)} ${toY(item.y).toFixed(1)}`)
    .join(" ");

  return (
    <figure className="analysis-chart">
      {title ? <figcaption className="analysis-chart-title">{title}</figcaption> : null}
      <svg
        className="analysis-chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title || "График анализа"}
      >
        <line
          x1={padL}
          y1={padT}
          x2={padL}
          y2={padT + innerH}
          className="analysis-chart-axis"
        />
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          className="analysis-chart-axis"
        />
        <path d={d} className="analysis-chart-line" fill="none" />
        <text x={4} y={padT + 8} className="analysis-chart-axis-label">
          {yLabel}
        </text>
        <text x={width - 4} y={height - 4} textAnchor="end" className="analysis-chart-axis-label">
          {xLabel}
        </text>
        <text x={padL} y={height - 4} className="analysis-chart-tick">
          {formatTick(xMin)}
        </text>
        <text x={padL + innerW} y={height - 4} textAnchor="end" className="analysis-chart-tick">
          {formatTick(xMax)}
        </text>
        <text x={padL - 4} y={padT + 4} textAnchor="end" className="analysis-chart-tick">
          {formatTick(yMax)}
        </text>
        <text x={padL - 4} y={padT + innerH} textAnchor="end" className="analysis-chart-tick">
          0
        </text>
      </svg>
    </figure>
  );
}
