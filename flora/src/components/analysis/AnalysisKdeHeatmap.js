import React from "react";

function colorForT(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(255 * (0.96 - 0.55 * clamped));
  const g = Math.round(255 * (0.91 - 0.78 * clamped));
  const b = Math.round(80 + 140 * (1 - clamped));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Превью сетки KDE без внешних библиотек. */
export default function AnalysisKdeHeatmap({ grid, title = "Плотность" }) {
  if (!grid?.values?.length || !grid.cols || !grid.rows || !(grid.max > 0)) {
    return null;
  }

  const { cols, rows, values, max } = grid;
  const cell = 4;
  const width = cols * cell;
  const height = rows * cell;

  const rects = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const t = values[row * cols + col] / max;
      if (t < 0.04) {
        continue;
      }
      // row 0 = юг (ymin); в SVG y растёт вниз, поэтому переворачиваем.
      rects.push(
        <rect
          key={`${col}:${row}`}
          x={col * cell}
          y={(rows - 1 - row) * cell}
          width={cell}
          height={cell}
          fill={colorForT(t)}
        />
      );
    }
  }

  return (
    <figure className="analysis-chart">
      {title ? <figcaption className="analysis-chart-title">{title}</figcaption> : null}
      <svg
        className="analysis-chart-svg analysis-kde-svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
      >
        <rect x="0" y="0" width={width} height={height} className="analysis-kde-svg-bg" />
        {rects}
      </svg>
      <div className="analysis-kde-legend" aria-hidden="true">
        <span>ниже</span>
        <span className="analysis-kde-legend-bar" />
        <span>выше</span>
      </div>
    </figure>
  );
}
