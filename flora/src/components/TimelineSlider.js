import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTimelineColors, TIMELINE_GRADIENT_LIGHT } from "./timelineColors";
import "../styles/TimelineSlider.css";

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
      ratio: (tickYear - minYear) / (maxYear - minYear || 1)
    });
  }

  return ticks;
}

export default function TimelineSlider({
  visible,
  year,
  onYearChange,
  yearBounds,
  children = null
}) {
  const { min: minYear, max: maxYear } = yearBounds;
  const yearTicks = useMemo(
    () => buildYearTicks(minYear, maxYear),
    [minYear, maxYear]
  );
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
      <div
        className="timeline-slider-wrap"
        style={{
          "--timeline-accent": timelineColors.accent,
          "--timeline-accent-soft": timelineColors.accentSoft
        }}
      >
        {children ? <div className="timeline-slider-dynamics">{children}</div> : null}
        <div className="timeline-slider-panel">
          <div className="timeline-slider-row">
            <span className="timeline-slider-bound">{minYear}</span>
            <div
              className="timeline-slider-track-wrap"
              style={{
                "--range-progress": `${rangeProgress}%`,
                "--range-ratio": Math.max(filledRatio, 0.001),
                "--timeline-gradient-start": TIMELINE_GRADIENT_LIGHT.start,
                "--timeline-gradient-middle": TIMELINE_GRADIENT_LIGHT.middle,
                "--timeline-gradient-end": TIMELINE_GRADIENT_LIGHT.end
              }}
            >
              <span className="timeline-slider-year-wrap" aria-hidden="true">
                <span className="timeline-slider-year">{year}</span>
              </span>
              <div className="timeline-slider-track">
                <div className="timeline-slider-ticks" aria-hidden="true">
                  {yearTicks.map(({ year: tickYear, major, ratio }) => {
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
                                "--tick-filled-dot": tickColors.filledDot
                              }
                            : {})
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
