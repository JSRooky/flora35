import React from "react";
import { getYearBounds } from "./yearBounds";
import "../styles/TimelineSlider.css";

const YEAR_BOUNDS = getYearBounds();

function getRangeProgress(value, min, max) {
  if (max === min) {
    return 100;
  }

  return ((value - min) / (max - min)) * 100;
}

export default function TimelineSlider({ year, onYearChange }) {
  const { min: minYear, max: maxYear } = YEAR_BOUNDS;

  return (
    <div className="timeline-slider" role="region" aria-label="Таймлайн по годам">
      <div className="timeline-slider-inner">
        <p className="timeline-slider-label">
          Показаны находки до <strong>{year}</strong> года
        </p>
        <div
          className="timeline-slider-track"
          style={{ "--range-progress": `${getRangeProgress(year, minYear, maxYear)}%` }}
        >
          <input
            type="range"
            min={minYear}
            max={maxYear}
            step={1}
            value={year}
            className="timeline-slider-input"
            aria-label="Год таймлайна"
            aria-valuemin={minYear}
            aria-valuemax={maxYear}
            aria-valuenow={year}
            onChange={(event) => onYearChange(Number(event.target.value))}
          />
        </div>
        <div className="timeline-slider-bounds">
          <span>{minYear}</span>
          <span>{maxYear}</span>
        </div>
      </div>
    </div>
  );
}
