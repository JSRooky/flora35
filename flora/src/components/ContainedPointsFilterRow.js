import React from "react";
import PointsFilterButton from "./PointsFilterButton";
import "../styles/PointsFilterButton.css";

/** Строка со сводкой и кнопкой «Только эти». */
export default function ContainedPointsFilterRow({
  summary,
  pointsFilterEnabled = false,
  onPointsFilterToggle,
  pointsFilterAvailable = true
}) {
  return (
    <div className="contained-points-filter-row">
      <p className="contained-points-filter-summary">{summary}</p>
      <PointsFilterButton
        enabled={pointsFilterEnabled}
        onToggle={onPointsFilterToggle}
        disabled={!pointsFilterAvailable}
      />
    </div>
  );
}
