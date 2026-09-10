import { normalizeLatinName } from "../normalizeLatinName";
import { parseYear } from "./parseYear";

export const DEFAULT_QUALITY_FILTER = {
  requireYear: false,
  requireLatinName: false,
  inatResearchOnly: false
};

export const QUALITY_FILTER_OPTIONS = [
  {
    id: "requireYear",
    label: "Только с годом",
    title: "Убрать точки без found_year"
  },
  {
    id: "requireLatinName",
    label: "Только с латынью",
    title: "Убрать точки без латинского названия"
  },
  {
    id: "inatResearchOnly",
    label: "iNat: research grade",
    title: "Для iNaturalist оставить только research; прочие источники не трогать"
  }
];

function hasLatinName(feature) {
  return Boolean(normalizeLatinName(feature?.properties?.name_latin));
}

/** Фильтр качества выборки анализа. По умолчанию ничего не отсекает. */
export function applyQualityFilter(features, filter = DEFAULT_QUALITY_FILTER) {
  const list = Array.isArray(features) ? features : [];
  if (!filter?.requireYear && !filter?.requireLatinName && !filter?.inatResearchOnly) {
    return list;
  }

  return list.filter((feature) => {
    const properties = feature?.properties ?? {};
    if (filter.requireYear && parseYear(properties.found_year) == null) {
      return false;
    }
    if (filter.requireLatinName && !hasLatinName(feature)) {
      return false;
    }
    if (
      filter.inatResearchOnly &&
      properties.source === "inaturalist" &&
      properties.quality_grade !== "research"
    ) {
      return false;
    }
    return true;
  });
}

export function countQualityDropped(features, filter = DEFAULT_QUALITY_FILTER) {
  const total = Array.isArray(features) ? features.length : 0;
  return Math.max(0, total - applyQualityFilter(features, filter).length);
}

export function describeQualityFilter(filter = DEFAULT_QUALITY_FILTER) {
  const labels = QUALITY_FILTER_OPTIONS.filter((option) => filter[option.id]).map(
    (option) => option.label
  );
  return labels.length ? labels.join(", ") : "без доп. фильтра";
}
