const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const USERPOINTS_PATH = join(__dirname, "../src/locations/userpoints.json");

// Должен совпадать с DEFAULT_SPECIES_DESCRIPTION_MD в defaultSpeciesDescription.js
const DEFAULT_SPECIES_DESCRIPTION_MD = "species/primula_veris.md";

const EMPTY_COLLECTION = {
  type: "SpeciesCollection",
  species: []
};

function slugify(nameLatin) {
  return String(nameLatin)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readUserPoints() {
  try {
    const raw = readFileSync(USERPOINTS_PATH, "utf8");
    const data = JSON.parse(raw);

    if (data.type !== "SpeciesCollection" || !Array.isArray(data.species)) {
      throw new Error("Invalid userpoints.json format");
    }

    return data;
  } catch (error) {
    if (error.code === "ENOENT") {
      writeUserPoints(EMPTY_COLLECTION);
      return { ...EMPTY_COLLECTION, species: [] };
    }

    throw error;
  }
}

function writeUserPoints(collection) {
  writeFileSync(USERPOINTS_PATH, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
}

/**
 * Добавляет находку в userpoints.json в формате SpeciesCollection (как points.json).
 * @param {object} payload
 * @returns {object} обновлённая коллекция
 */
function appendUserFinding(payload) {
  const {
    name_ru: nameRu,
    name_latin: nameLatin,
    regnum,
    status,
    family,
    found_year: foundYear,
    found_by: foundBy,
    identified_by: identifiedBy,
    coordinates
  } = payload;

  if (!nameRu?.trim() || !nameLatin?.trim() || !foundBy?.trim() || !family?.trim() || !status?.trim()) {
    throw new Error("Missing required fields");
  }

  if (!Number.isInteger(foundYear) || foundYear < 1500 || foundYear > 2100) {
    throw new Error("Invalid found_year");
  }

  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new Error("Invalid coordinates");
  }

  const collection = readUserPoints();
  const speciesId = slugify(nameLatin);
  let species = collection.species.find((entry) => entry.id === speciesId);

  if (!species) {
    species = {
      id: speciesId,
      regnum,
      status: status.trim(),
      family: family.trim(),
      name_ru: nameRu.trim(),
      name_latin: nameLatin.trim(),
      description_md: DEFAULT_SPECIES_DESCRIPTION_MD,
      findings: []
    };

    collection.species.push(species);
  } else if (!species.description_md) {
    species.description_md = DEFAULT_SPECIES_DESCRIPTION_MD;
  }

  const findingNumber = species.findings.length + 1;
  const findingId = `${speciesId}-${String(findingNumber).padStart(3, "0")}`;

  species.findings.push({
    id: findingId,
    coordinates: [coordinates[0], coordinates[1]],
    found_by: foundBy.trim(),
    identified_by: identifiedBy?.trim() || "",
    found_year: foundYear
  });

  writeUserPoints(collection);
  return collection;
}

module.exports = {
  USERPOINTS_PATH,
  readUserPoints,
  writeUserPoints,
  appendUserFinding
};
