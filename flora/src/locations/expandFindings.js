/** Разворачивает species-centric points.json в GeoJSON FeatureCollection для карты. */
export function expandFindingsToFeatures(data) {
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    return data;
  }

  if (data.type !== "SpeciesCollection" || !Array.isArray(data.species)) {
    throw new Error("Unsupported points.json format");
  }

  const features = data.species.flatMap((species) =>
    (species.findings ?? []).map((finding, index) => {
      const findingId = finding.id ?? `${species.id}-${index + 1}`;

      return {
        type: "Feature",
        id: findingId,
        geometry: {
          type: "Point",
          coordinates: finding.coordinates
        },
        properties: {
          species_id: species.id,
          finding_id: findingId,
          regnum: species.regnum,
          status: species.status,
          family: species.family,
          name_ru: species.name_ru,
          name_latin: species.name_latin,
          found_by: finding.found_by,
          identified_by: finding.identified_by,
          found_year: finding.found_year
        }
      };
    })
  );

  return {
    type: "FeatureCollection",
    features
  };
}
