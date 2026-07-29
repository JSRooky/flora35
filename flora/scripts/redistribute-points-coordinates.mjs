import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const POINTS_PATH = join(__dirname, "../src/locations/points.json");

const REGION_BOUNDS = {
  lonMin: 35.5,
  lonMax: 45.6,
  latMin: 57.35,
  latMax: 61.85
};

/** ~3 км между соседними точками в начале; при нехватке места порог плавно снижается. */
const INITIAL_MIN_DISTANCE = 0.035;

function createRng(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle(items, rng) {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function generateSpreadCoordinates(count, bounds, rng) {
  const coordinates = [];
  let minDistance = INITIAL_MIN_DISTANCE;

  while (coordinates.length < count && minDistance >= 0.004) {
    let attempts = 0;
    const maxAttempts = count * 400;

    while (coordinates.length < count && attempts < maxAttempts) {
      attempts += 1;

      const lon =
        bounds.lonMin + rng() * (bounds.lonMax - bounds.lonMin);
      const lat =
        bounds.latMin + rng() * (bounds.latMax - bounds.latMin);

      const isTooClose = coordinates.some(
        (coordinate) =>
          Math.hypot(coordinate[0] - lon, coordinate[1] - lat) < minDistance
      );

      if (!isTooClose) {
        coordinates.push([
          Number(lon.toFixed(4)),
          Number(lat.toFixed(4))
        ]);
      }
    }

    if (coordinates.length < count) {
      coordinates.length = 0;
      minDistance *= 0.75;
    }
  }

  if (coordinates.length < count) {
    throw new Error(
      `Failed to generate ${count} coordinates, got ${coordinates.length}`
    );
  }

  return { coordinates, minDistance };
}

function minDistanceBetween(coordinates) {
  let min = Number.POSITIVE_INFINITY;

  for (let index = 0; index < coordinates.length; index += 1) {
    for (let other = index + 1; other < coordinates.length; other += 1) {
      const distance = Math.hypot(
        coordinates[index][0] - coordinates[other][0],
        coordinates[index][1] - coordinates[other][1]
      );

      if (distance < min) {
        min = distance;
      }
    }
  }

  return min;
}

function regnumDominance(findings) {
  const bins = new Map();

  findings.forEach(({ regnum, coordinates }) => {
    const key = `${coordinates[0].toFixed(1)},${coordinates[1].toFixed(1)}`;
    const bin = bins.get(key) ?? { plantae: 0, animalia: 0, fungi: 0, total: 0 };
    bin[regnum] += 1;
    bin.total += 1;
    bins.set(key, bin);
  });

  const dominated = [...bins.values()].filter((bin) => {
    if (bin.total < 3) {
      return false;
    }

    const dominant = Math.max(bin.plantae, bin.animalia, bin.fungi);
    return dominant / bin.total >= 0.9;
  });

  return dominated.length;
}

const collection = JSON.parse(readFileSync(POINTS_PATH, "utf8"));
const rng = createRng(20260729);

const findings = collection.species.flatMap((species) =>
  species.findings.map((finding) => ({
    speciesId: species.id,
    regnum: species.regnum,
    finding
  }))
);

const { coordinates, minDistance: targetMinDistance } = generateSpreadCoordinates(
  findings.length,
  REGION_BOUNDS,
  rng
);
const shuffledCoordinates = shuffle(coordinates, rng);

findings.forEach(({ finding }, index) => {
  finding.coordinates = shuffledCoordinates[index];
});

const assigned = findings.map(({ regnum, finding }) => ({
  regnum,
  coordinates: finding.coordinates
}));

writeFileSync(POINTS_PATH, `${JSON.stringify(collection, null, 2)}\n`, "utf8");

console.log(`Redistributed ${assigned.length} findings.`);
console.log(`Target min distance (deg): ${targetMinDistance.toFixed(5)}`);
console.log(`Actual min distance (deg): ${minDistanceBetween(assigned.map((item) => item.coordinates)).toFixed(5)}`);
console.log(`Regnum-dominated bins (>=3 points, >=90% one regnum): ${regnumDominance(assigned)}`);
