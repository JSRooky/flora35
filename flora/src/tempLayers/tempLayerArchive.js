import { downloadJsonFile } from "../redbook/redBookStore";
import {
  deleteTempLayerArchiveRecord,
  getTempLayerArchiveRecord,
  persistTempLayers,
  putTempLayerArchiveRecord,
  refreshTempLayerArchiveIndex
} from "./tempLayerPersistence";
import {
  buildArchiveRecordFromLayerId,
  removeWorkingPlaque,
  restorePlaqueLayers,
  toArchiveIndexEntry
} from "./tempLayerStore";

function slugify(value) {
  return String(value || "layer")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "layer";
}

function dateStamp(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "undated";
  }
  return date.toISOString().slice(0, 10);
}

export async function archiveWorkingPlaque(layerId) {
  const record = buildArchiveRecordFromLayerId(layerId);
  if (!record) {
    return { ok: false, reason: "missing" };
  }

  await putTempLayerArchiveRecord(record);
  removeWorkingPlaque(layerId);
  await persistTempLayers();
  await refreshTempLayerArchiveIndex();
  return { ok: true, record: toArchiveIndexEntry(record) };
}

export async function restoreArchivedPlaque(archiveId) {
  const record = await getTempLayerArchiveRecord(archiveId);
  if (!record) {
    return { ok: false, reason: "missing" };
  }

  const restored = restorePlaqueLayers(record.layers);
  if (!restored.ok) {
    return restored;
  }

  await deleteTempLayerArchiveRecord(archiveId);
  await persistTempLayers();
  await refreshTempLayerArchiveIndex();
  return { ok: true };
}

export async function deleteArchivedPlaque(archiveId) {
  await deleteTempLayerArchiveRecord(archiveId);
  await refreshTempLayerArchiveIndex();
}

export function buildArchiveGeoJson(record) {
  const layers = Array.isArray(record?.layers) ? record.layers : [];
  const features = [];
  layers.forEach((layer) => {
    (layer.features || []).forEach((feature) => {
      features.push({
        ...feature,
        properties: {
          ...(feature.properties || {}),
          temp_layer_id: layer.id,
          temp_source: layer.source,
          archive_id: record.archiveId
        }
      });
    });
  });

  return {
    type: "FeatureCollection",
    name: record.title || "temp-layer-archive",
    flora_archive: {
      archiveId: record.archiveId,
      groupKey: record.groupKey,
      title: record.title,
      createdAt: record.createdAt,
      archivedAt: record.archivedAt,
      updatedAt: record.updatedAt,
      markerColor: record.markerColor ?? null
    },
    features
  };
}

export async function exportArchivedPlaque(archiveId, format = "geojson") {
  const record = await getTempLayerArchiveRecord(archiveId);
  if (!record) {
    return { ok: false, reason: "missing" };
  }

  const base = `flora-temp-archive-${slugify(record.title)}-${dateStamp(record.archivedAt)}`;
  if (format === "snapshot") {
    downloadJsonFile(`${base}.json`, record);
    return { ok: true };
  }

  downloadJsonFile(`${base}.geojson`, buildArchiveGeoJson(record));
  return { ok: true };
}
