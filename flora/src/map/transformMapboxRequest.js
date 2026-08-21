/**
 * Преобразует mapbox:// URL в HTTPS Mapbox API — MapLibre сам схему mapbox:// не знает.
 * Логика как у Mapbox GL JS (normalizeStyle/Sprite/Glyphs/Source URL).
 */

function parseUrl(url) {
  const parts = url.match(/^(\w+):\/\/([^/?]*)(\/[^?]+)?\??(.+)?/);
  if (!parts) {
    return null;
  }
  return {
    protocol: parts[1],
    authority: parts[2],
    path: parts[3] || "/",
    params: parts[4] ? parts[4].split("&") : []
  };
}

function formatUrl(urlObject, accessToken) {
  const params = [...urlObject.params];
  if (accessToken && !params.some((param) => param.startsWith("access_token="))) {
    params.push(`access_token=${accessToken}`);
  }
  const query = params.length ? `?${params.join("&")}` : "";
  return `${urlObject.protocol}://${urlObject.authority}${urlObject.path}${query}`;
}

function withMapboxApi(urlObject, accessToken) {
  urlObject.protocol = "https";
  urlObject.authority = "api.mapbox.com";
  return formatUrl(urlObject, accessToken);
}

function normalizeStyleURL(url, accessToken) {
  const urlObject = parseUrl(url);
  urlObject.path = `/styles/v1${urlObject.path}`;
  return withMapboxApi(urlObject, accessToken);
}

function normalizeGlyphsURL(url, accessToken) {
  const urlObject = parseUrl(url);
  urlObject.path = `/fonts/v1${urlObject.path}`;
  return withMapboxApi(urlObject, accessToken);
}

function normalizeSourceURL(url, accessToken) {
  const urlObject = parseUrl(url);
  urlObject.path = `/v4/${urlObject.authority}.json`;
  urlObject.params.push("secure");
  return withMapboxApi(urlObject, accessToken);
}

function normalizeSpriteURL(url, accessToken, resourceType) {
  const urlObject = parseUrl(url);
  let path = urlObject.path || "/";
  let format = "";
  let extension = resourceType === "SpriteImage" ? ".png" : ".json";

  const fileMatch = path.match(/(@2x)?\.(png|json)$/i);
  if (fileMatch) {
    format = fileMatch[1] || "";
    extension = `.${fileMatch[2].toLowerCase()}`;
    path = path.slice(0, -fileMatch[0].length);
  } else if (path.includes("@2x")) {
    format = "@2x";
    path = path.replace("@2x", "");
  }

  path = path.replace(/\/sprite$/i, "");
  urlObject.path = `/styles/v1${path}/sprite${format}${extension}`;
  return withMapboxApi(urlObject, accessToken);
}

export function isMapboxURL(url) {
  return typeof url === "string" && url.indexOf("mapbox:") === 0;
}

function appendAccessToken(url, accessToken) {
  if (!accessToken || /[?&]access_token=/.test(url)) {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}access_token=${accessToken}`;
}

export function transformMapboxUrl(url, resourceType, accessToken) {
  if (!url) {
    return { url };
  }

  if (isMapboxURL(url)) {
    if (url.includes("mapbox://styles/") && !url.includes("/sprite")) {
      return { url: normalizeStyleURL(url, accessToken) };
    }
    if (url.includes("mapbox://sprites/") || url.includes("/sprites/")) {
      return { url: normalizeSpriteURL(url, accessToken, resourceType) };
    }
    if (url.includes("mapbox://fonts/") || url.includes("/fonts/")) {
      return { url: normalizeGlyphsURL(url, accessToken) };
    }
    if (resourceType === "Source" || url.includes("mapbox://")) {
      return { url: normalizeSourceURL(url, accessToken) };
    }
  }

  if (
    accessToken &&
    (url.includes("api.mapbox.com") || url.includes("events.mapbox.com"))
  ) {
    return { url: appendAccessToken(url, accessToken) };
  }

  return { url };
}

/** Убирает свойства стиля Mapbox GL JS 3, которые MapLibre не понимает. */
export function sanitizeMapboxStyle(_previousStyle, nextStyle) {
  if (!nextStyle || typeof nextStyle !== "object") {
    return nextStyle;
  }

  const next = { ...nextStyle };
  delete next.imports;
  delete next.featuresets;
  delete next.schema;
  delete next.fog;
  delete next.lights;

  if (next.projection && next.projection.name && next.projection.name !== "mercator") {
    next.projection = { name: "mercator" };
  }

  return next;
}
