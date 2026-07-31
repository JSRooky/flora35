const TIMELINE_GRADIENT = {
  start: "#d32f2f",
  middle: "#1565c0",
  end: "#2b9e08",
};

const TIMELINE_LIGHTEN = 0.32;
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

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

export function getProcessedHex(hex) {
  return rgbToCss(processTimelineRgb(parseHex(hex)));
}

export function getColorAtRatio(ratio) {
  const t = clampRatio(ratio);
  let rgb;

  if (t <= 0.5) {
    rgb = lerpRgb(TIMELINE_GRADIENT.start, TIMELINE_GRADIENT.middle, t / 0.5);
  } else {
    rgb = lerpRgb(TIMELINE_GRADIENT.middle, TIMELINE_GRADIENT.end, (t - 0.5) / 0.5);
  }

  return processTimelineRgb(rgb);
}

export function getTimelineColorCss(ratio) {
  return rgbToCss(getColorAtRatio(ratio));
}

export function getTimelineColorHex(ratio) {
  return rgbToHex(getColorAtRatio(ratio));
}

export function getTimelineColors(ratio) {
  const { r, g, b } = getColorAtRatio(ratio);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return {
    accent: rgbToCss({ r, g, b }),
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.38)`,
    filledDot: luminance > 0.62 ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.72)",
  };
}

export function getYearColorRatio(year, minYear, maxYear) {
  if (maxYear === minYear) {
    return 0;
  }

  return (year - minYear) / (maxYear - minYear);
}

export const TIMELINE_GRADIENT_LIGHT = {
  start: getProcessedHex(TIMELINE_GRADIENT.start),
  middle: getProcessedHex(TIMELINE_GRADIENT.middle),
  end: getProcessedHex(TIMELINE_GRADIENT.end),
};
