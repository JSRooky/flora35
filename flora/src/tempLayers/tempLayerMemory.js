/** Оценка размера одной точки как GeoJSON Feature во временном слое (не колонка GBIF). */
export const TEMP_GEOJSON_FEATURE_BYTES = 800;

/** Сколько точек всех временных слоёв + staging можно держать во вкладке. */
export const TEMP_WORKING_SET_POINT_LIMIT = 1000000;

export function estimateTempGeoJsonBytes(count) {
  const n = Math.max(0, Number(count) || 0);
  return n * TEMP_GEOJSON_FEATURE_BYTES;
}

export function formatTempDataSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 МБ";
  }
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    return `${mb.toFixed(2)} МБ`;
  }
  return `${mb.toFixed(1)} МБ`;
}

export function evaluateTempLayerBudget({
  currentCount = 0,
  incomingCount = 0,
  limit = TEMP_WORKING_SET_POINT_LIMIT
} = {}) {
  const current = Math.max(0, Number(currentCount) || 0);
  const incoming = Math.max(0, Number(incomingCount) || 0);
  const next = current + incoming;
  const remaining = Math.max(0, limit - current);
  return {
    currentCount: current,
    incomingCount: incoming,
    next,
    limit,
    remaining,
    ok: next <= limit,
    currentBytes: estimateTempGeoJsonBytes(current),
    nextBytes: estimateTempGeoJsonBytes(next)
  };
}

export function formatTempBudgetBlockMessage(status) {
  const current = new Intl.NumberFormat("ru-RU").format(status.currentCount);
  const incoming = new Intl.NumberFormat("ru-RU").format(status.incomingCount);
  const limit = new Intl.NumberFormat("ru-RU").format(status.limit);
  return `Нельзя загрузить во временный слой: в памяти уже ${current} точек (~${formatTempDataSize(
    status.currentBytes
  )}), добавится ещё ~${incoming}. Лимит ${limit} точек, чтобы вкладка не упала по памяти. Выберите слой GBIF/iNat, архивируйте плашки или загрузите меньше данных.`;
}
