import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, "../src/locations/points.json");
const outputPath = inputPath;

const SPECIES_FIELDS = ["regnum", "status", "family", "name_ru", "name_latin"];
const FINDING_FIELDS = ["found_by", "identified_by", "found_year"];

function slugify(nameLatin) {
  return String(nameLatin)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function speciesKey(feature) {
  return feature.properties.name_latin || feature.properties.name_ru || feature.id;
}

function readLegacyFeatures(data) {
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    return data.features;
  }

  if (data.type === "SpeciesCollection" && Array.isArray(data.species)) {
    throw new Error("points.json is already in SpeciesCollection format");
  }

  throw new Error("Unsupported points.json format");
}

const legacy = JSON.parse(readFileSync(inputPath, "utf8"));
const features = readLegacyFeatures(legacy);
const speciesMap = new Map();

features.forEach((feature, index) => {
  const key = speciesKey(feature);
  const props = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error(`Feature #${index} has invalid coordinates`);
  }

  if (!speciesMap.has(key)) {
    speciesMap.set(key, {
      id: slugify(props.name_latin || props.name_ru || `species-${index}`),
      regnum: props.regnum,
      status: props.status,
      family: props.family,
      name_ru: props.name_ru,
      name_latin: props.name_latin,
      findings: []
    });
  }

  const species = speciesMap.get(key);

  SPECIES_FIELDS.forEach((field) => {
    if (species[field] != null && props[field] != null && species[field] !== props[field]) {
      console.warn(
        `Warning: species "${key}" has conflicting ${field}: "${species[field]}" vs "${props[field]}", keeping first`
      );
    }
  });

  const finding = {
    coordinates: [coordinates[0], coordinates[1]],
    found_by: props.found_by,
    identified_by: props.identified_by,
    found_year: props.found_year
  };

  FINDING_FIELDS.forEach((field) => {
    if (finding[field] == null) {
      console.warn(`Warning: feature #${index} (${key}) is missing ${field}`);
    }
  });

  species.findings.push(finding);
});

const species = [...speciesMap.values()]
  .sort((a, b) => {
    const nameA = a.name_ru || a.name_latin || "";
    const nameB = b.name_ru || b.name_latin || "";
    return nameA.localeCompare(nameB, "ru");
  })
  .map((entry) => {
    entry.findings = entry.findings.map((finding, index) => ({
      id: `${entry.id}-${String(index + 1).padStart(3, "0")}`,
      ...finding
    }));
    return entry;
  });

const output = {
  type: "SpeciesCollection",
  species
};

const expandedCount = species.reduce((sum, entry) => sum + entry.findings.length, 0);

if (expandedCount !== features.length) {
  throw new Error(`Finding count mismatch: ${expandedCount} vs ${features.length}`);
}

writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

console.log(`Migrated ${features.length} findings into ${species.length} species records.`);
