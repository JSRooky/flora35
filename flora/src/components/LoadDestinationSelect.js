import React, { useEffect, useMemo, useState } from "react";
import {
  commitTempLayerStaging,
  getTempLayerBudgetStatus,
  getTempLayerStagingCount,
  isRegionTempLayer,
  listTempLayerPlaques,
  subscribeTempLayers
} from "../tempLayers/tempLayerStore";
import { formatTempDataSize } from "../tempLayers/tempLayerMemory";
import { persistTempLayers } from "../tempLayers/tempLayerPersistence";

export const LOAD_LAYER_DEST = {
  EXTERNAL: "external",
  NEW: "new"
};

export function isExternalLoadDestination(destination) {
  return !destination || destination === LOAD_LAYER_DEST.EXTERNAL;
}

export function overlayPlaqueKey() {
  const plaques = listTempLayerPlaques();
  const overlay = plaques.find((plaque) =>
    plaque.layers.some((layer) => layer.visible && (isRegionTempLayer(layer) || layer.overlays?.length))
  );
  return overlay?.key || "";
}

export async function finalizeLoadDestination(destination, onTempLayersChange, { forceNew = false, plaqueKey } = {}) {
  if (isExternalLoadDestination(destination) || getTempLayerStagingCount() === 0) {
    return null;
  }

  const layer =
    destination === LOAD_LAYER_DEST.NEW
      ? commitTempLayerStaging({
          forceNew,
          plaqueKey: plaqueKey || undefined
        })
      : commitTempLayerStaging({ plaqueKey: destination });

  await persistTempLayers();
  onTempLayersChange?.();
  return layer;
}

export default function LoadDestinationSelect({
  value,
  onChange,
  source = "gbif",
  includeExternal = true,
  disabled = false
}) {
  const [plaques, setPlaques] = useState(() => listTempLayerPlaques());
  const [budget, setBudget] = useState(() => getTempLayerBudgetStatus(0));

  useEffect(() => {
    return subscribeTempLayers(() => {
      setPlaques(listTempLayerPlaques());
      setBudget(getTempLayerBudgetStatus(0));
    });
  }, []);

  const externalLabel =
    source === "inat"
      ? "Слой iNaturalist"
      : source === "all"
        ? "Слои GBIF и iNaturalist"
        : "Слой GBIF";

  const options = useMemo(() => {
    const next = [];
    if (includeExternal) {
      next.push({ value: LOAD_LAYER_DEST.EXTERNAL, label: externalLabel });
    }
    next.push({ value: LOAD_LAYER_DEST.NEW, label: "Новый временный слой" });
    plaques.forEach((plaque) => {
      const count = plaque.layers.reduce(
        (sum, layer) => sum + (layer.features?.length || 0),
        0
      );
      next.push({
        value: plaque.key,
        label: count > 0 ? `${plaque.label} (${count})` : plaque.label
      });
    });
    return next;
  }, [externalLabel, includeExternal, plaques]);

  useEffect(() => {
    if (options.some((option) => option.value === value)) {
      return;
    }
    onChange?.(includeExternal ? LOAD_LAYER_DEST.EXTERNAL : LOAD_LAYER_DEST.NEW);
  }, [includeExternal, onChange, options, value]);

  return (
    <label className="load-destination">
      <span className="load-destination-label">Куда загрузить</span>
      <select
        className="load-destination-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {value !== LOAD_LAYER_DEST.EXTERNAL ? (
        <span className="load-destination-budget">
          В памяти: {new Intl.NumberFormat("ru-RU").format(budget.currentCount)} точек (~
          {formatTempDataSize(budget.currentBytes)}) из{" "}
          {new Intl.NumberFormat("ru-RU").format(budget.limit)}
        </span>
      ) : null}
    </label>
  );
}
