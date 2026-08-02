export const SHARE_POINT_PARAM = "point";
export const SHARE_ZOOM_PARAM = "z";
export const DEFAULT_SHARE_ZOOM = 11;

/** Параметры ссылки на точку из query string. */
export function parseSharePointParams(search) {
  const params = new URLSearchParams(search);
  const findingId = params.get(SHARE_POINT_PARAM);

  if (!findingId) {
    return null;
  }

  const lng = Number.parseFloat(params.get("lng"));
  const lat = Number.parseFloat(params.get("lat"));
  const zoom = Number.parseFloat(params.get(SHARE_ZOOM_PARAM));

  return {
    findingId,
    lng: Number.isFinite(lng) ? lng : null,
    lat: Number.isFinite(lat) ? lat : null,
    zoom: Number.isFinite(zoom) ? zoom : DEFAULT_SHARE_ZOOM
  };
}

/** Собирает URL текущей страницы со ссылкой на точку. */
export function buildSharePointUrl(feature) {
  const findingId = feature?.properties?.finding_id ?? feature?.id;

  if (findingId == null) {
    return null;
  }

  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const url = new URL(window.location.href);

  url.search = "";
  url.searchParams.set(SHARE_POINT_PARAM, String(findingId));

  if (Number.isFinite(lng) && Number.isFinite(lat)) {
    url.searchParams.set("lng", lng.toFixed(6));
    url.searchParams.set("lat", lat.toFixed(6));
  }

  url.searchParams.set(SHARE_ZOOM_PARAM, String(DEFAULT_SHARE_ZOOM));
  return url.toString();
}

export async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/** Копирует ссылку на точку в буфер обмена. Возвращает false, если ссылку собрать нельзя. */
export async function copySharePointLink(feature) {
  const url = buildSharePointUrl(feature);

  if (!url) {
    return false;
  }

  await copyTextToClipboard(url);
  return true;
}

/** Перемещает карту к точке из shared-ссылки. */
export function focusMapOnSharedPoint(map, feature, { zoom = DEFAULT_SHARE_ZOOM } = {}) {
  const coordinates = feature?.geometry?.coordinates;

  if (!map || !coordinates) {
    return;
  }

  map.flyTo({
    center: coordinates,
    zoom: Math.min(zoom, DEFAULT_SHARE_ZOOM),
    duration: 800
  });
}
