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

/** Насколько осветлить палитру (0 — без изменений, 1 — белый). */
const TIMELINE_LIGHTEN = 0.32;

/** Множитель насыщенности (1 — без изменений, >1 — насыщеннее). */
const TIMELINE_SATURATE = 1.45;

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

function lightenRgb({ r, g, b }, amount = TIMELINE_LIGHTEN) {
  return {
    r: lerpChannel(r, 255, amount),
    g: lerpChannel(g, 255, amount),
    b: lerpChannel(b, 255, amount),
  };
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: lightness };
  }

  const delta = max - min;
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue;

  switch (max) {
    case red:
      hue = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
      break;
    case green:
      hue = ((blue - red) / delta + 2) / 6;
      break;
    default:
      hue = ((red - green) / delta + 4) / 6;
      break;
  }

  return { h: hue, s: saturation, l: lightness };
}

function hueToRgbChannel(p, q, t) {
  let channel = t;

  if (channel < 0) {
    channel += 1;
  }

  if (channel > 1) {
    channel -= 1;
  }

  if (channel < 1 / 6) {
    return p + (q - p) * 6 * channel;
  }

  if (channel < 1 / 2) {
    return q;
  }

  if (channel < 2 / 3) {
    return p + (q - p) * (2 / 3 - channel) * 6;
  }

  return p;
}

function hslToRgb({ h, s, l }) {
  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToRgbChannel(p, q, h + 1 / 3) * 255),
    g: Math.round(hueToRgbChannel(p, q, h) * 255),
    b: Math.round(hueToRgbChannel(p, q, h - 1 / 3) * 255),
  };
}

function saturateRgb(rgb, amount = TIMELINE_SATURATE) {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({
    h: hsl.h,
    s: Math.min(1, hsl.s * amount),
    l: hsl.l,
  });
}

function processTimelineRgb(rgb) {
  return saturateRgb(lightenRgb(rgb));
}

function rgbToCss({ r, g, b }) {
  return `rgb(${r}, ${g}, ${b})`;
}

function getProcessedHex(hex) {
  return rgbToCss(processTimelineRgb(parseHex(hex)));
}

function getColorAtRatio(ratio) {
  const t = clampRatio(ratio);
  let rgb;

  if (t <= 0.5) {
    rgb = lerpRgb(TIMELINE_GRADIENT.start, TIMELINE_GRADIENT.middle, t / 0.5);
  } else {
    rgb = lerpRgb(TIMELINE_GRADIENT.middle, TIMELINE_GRADIENT.end, (t - 0.5) / 0.5);
  }

  return processTimelineRgb(rgb);
}

function getTimelineColors(ratio) {
  const { r, g, b } = getColorAtRatio(ratio);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    accent: rgbToCss({ r, g, b }),
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.38)`,
    filledDot: luminance > 0.62 ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.72)",
  };
}

const TIMELINE_GRADIENT_LIGHT = {
  start: getProcessedHex(TIMELINE_GRADIENT.start),
  middle: getProcessedHex(TIMELINE_GRADIENT.middle),
  end: getProcessedHex(TIMELINE_GRADIENT.end),
};

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
                "--timeline-gradient-start": TIMELINE_GRADIENT_LIGHT.start,
                "--timeline-gradient-middle": TIMELINE_GRADIENT_LIGHT.middle,
                "--timeline-gradient-end": TIMELINE_GRADIENT_LIGHT.end,
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
