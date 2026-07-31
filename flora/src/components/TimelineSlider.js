import React, { useEffect, useRef, useState } from "react";
import { getYearBounds } from "./yearBounds";
import "../styles/TimelineSlider.css";

const YEAR_BOUNDS = getYearBounds();
const ANIMATION_MS = 450;

function getRangeProgress(value, min, max) {
  if (max === min) {
    return 100;
  }

  return ((value - min) / (max - min)) * 100;
}

function buildYearTicks(minYear, maxYear) {
  const ticks = [];

  for (let tickYear = minYear; tickYear <= maxYear; tickYear += 1) {
    ticks.push({
      year: tickYear,
      major: tickYear % 10 === 0,
      ratio: (tickYear - minYear) / (maxYear - minYear || 1),
    });
  }

  return ticks;
}

const YEAR_TICKS = buildYearTicks(YEAR_BOUNDS.min, YEAR_BOUNDS.max);

const TIMELINE_GRADIENT = {
  start: "#d32f2f",
  middle: "#1565c0",
  end: "#2b9e08",
};

function parseHex(hex) {
  const value = hex.replace("#", "");

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function clampRatio(ratio) {
  return Math.min(1, Math.max(0, ratio));
}

function lerpChannel(start, end, ratio) {
  return Math.round(start + (end - start) * ratio);
}

function lerpRgb(startHex, endHex, ratio) {
  const start = parseHex(startHex);
  const end = parseHex(endHex);

  return {
    r: lerpChannel(start.r, end.r, ratio),
    g: lerpChannel(start.g, end.g, ratio),
    b: lerpChannel(start.b, end.b, ratio),
  };
}

function getColorAtRatio(ratio) {
  const t = clampRatio(ratio);

  if (t <= 0.5) {
    return lerpRgb(TIMELINE_GRADIENT.start, TIMELINE_GRADIENT.middle, t / 0.5);
  }

  return lerpRgb(TIMELINE_GRADIENT.middle, TIMELINE_GRADIENT.end, (t - 0.5) / 0.5);
}

function getTimelineColors(ratio) {
  const { r, g, b } = getColorAtRatio(ratio);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    accent: `rgb(${r}, ${g}, ${b})`,
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.45)`,
    filledDot: luminance > 0.58 ? "rgba(0, 0, 0, 0.28)" : "rgba(255, 255, 255, 0.65)",
  };
}

export default function TimelineSlider({ visible, year, onYearChange }) {
  const { min: minYear, max: maxYear } = YEAR_BOUNDS;
  const wasVisibleRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  const rangeProgress = getRangeProgress(year, minYear, maxYear);
  const filledRatio = rangeProgress / 100;
  const timelineColors = getTimelineColors(filledRatio);

  useEffect(() => {
    if (visible) {
      wasVisibleRef.current = true;
      setMounted(true);
      setClosing(false);
      return undefined;
    }

    if (!wasVisibleRef.current) {
      return undefined;
    }

    setClosing(true);
    const timer = window.setTimeout(() => {
      wasVisibleRef.current = false;
      setMounted(false);
      setClosing(false);
    }, ANIMATION_MS);

    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!mounted) {
    return null;
  }

  return (
    <div
      className={`timeline-slider${closing ? " timeline-slider--closing" : ""}`}
      role="region"
      aria-label="Таймлайн по годам"
      aria-hidden={closing}
    >
      <div className="timeline-slider-wrap">
        <div className="timeline-slider-panel">
          <div className="timeline-slider-row">
            <span className="timeline-slider-bound">{minYear}</span>
            <div
              className="timeline-slider-track-wrap"
              style={{
                "--range-progress": `${rangeProgress}%`,
                "--range-ratio": Math.max(filledRatio, 0.001),
                "--timeline-gradient-start": TIMELINE_GRADIENT.start,
                "--timeline-gradient-middle": TIMELINE_GRADIENT.middle,
                "--timeline-gradient-end": TIMELINE_GRADIENT.end,
                "--timeline-accent": timelineColors.accent,
                "--timeline-accent-soft": timelineColors.accentSoft,
              }}
            >
              <span className="timeline-slider-year-wrap" aria-hidden="true">
                <span className="timeline-slider-year">{year}</span>
              </span>
              <div className="timeline-slider-track">
                <div className="timeline-slider-ticks" aria-hidden="true">
                  {YEAR_TICKS.map(({ year: tickYear, major, ratio }) => {
                    const isFilled = ratio <= filledRatio;
                    const tickColors = getTimelineColors(ratio);

                    return (
                      <span
                        key={tickYear}
                        className={`timeline-slider-tick${major ? " timeline-slider-tick--major" : ""}${
                          isFilled ? " timeline-slider-tick--filled" : ""
                        }`}
                        style={{
                          "--tick-ratio": ratio,
                          ...(isFilled
                            ? {
                                "--tick-accent": tickColors.accent,
                                "--tick-filled-dot": tickColors.filledDot,
                              }
                            : {}),
                        }}
                      />
                    );
                  })}
                </div>
                <input
                  type="range"
                  min={minYear}
                  max={maxYear}
                  step={1}
                  value={year}
                  className="timeline-slider-input"
                  aria-label={`Год таймлайна: ${year}`}
                  aria-valuemin={minYear}
                  aria-valuemax={maxYear}
                  aria-valuenow={year}
                  onChange={(event) => onYearChange(Number(event.target.value))}
                />
              </div>
            </div>
            <span className="timeline-slider-bound">{maxYear}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
