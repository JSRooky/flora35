const RU_TEXT_FIELD = ["coalesce", ["get", "name:ru"], ["get", "name_ru"], ["get", "name"]];

function isNameLabelField(field) {
  if (field == null) {
    return false;
  }
  if (typeof field === "string") {
    return /\{name(_[a-z]+)?\}/i.test(field);
  }
  if (!Array.isArray(field) || field.length === 0) {
    return false;
  }
  if (field[0] === "get" && typeof field[1] === "string" && /^name(:[a-z]+|_?[a-z]*)?$/i.test(field[1])) {
    return true;
  }
  if (field[0] === "coalesce" || field[0] === "format" || field[0] === "concat") {
    return field.slice(1).some((part) => isNameLabelField(part));
  }
  return false;
}

/** Подписи подложки: русское имя, иначе локальное (аналог language: "ru" у Mapbox). */
export function applyBasemapLanguage(map, language = "ru") {
  if (!map?.getStyle || language !== "ru") {
    return;
  }

  const layers = map.getStyle()?.layers;
  if (!layers?.length) {
    return;
  }

  layers.forEach((layer) => {
    if (layer.type !== "symbol") {
      return;
    }
    try {
      const textField = map.getLayoutProperty(layer.id, "text-field");
      if (!isNameLabelField(textField)) {
        return;
      }
      map.setLayoutProperty(layer.id, "text-field", RU_TEXT_FIELD);
    } catch {
      // слой без text-field или служебный
    }
  });
}
