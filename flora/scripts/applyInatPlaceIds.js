/**
 * Apply known iNaturalist placeIds (from iNat "(2019)" federal-subject places)
 * without network calls. Missing ids stay null — UI shows "—".
 *
 * Usage: node flora/scripts/applyInatPlaceIds.js
 */
const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "../src/externalSources/russiaRegionsGadm.json");
const regions = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

/** Verified placeId map from iNaturalist autocomplete (name contains "(2019)"). */
const PLACE_IDS = {
  amur: 134597,
  astrakhan: 134598,
  belgorod: 134599,
  bryansk: 134600,
  buryat: 134601,
  vladimir: 134602,
  volgograd: 134603,
  vologda: 134604,
  voronezh: 134605,
  yevrey: 134610,
  "zabaykal-ye": 134611,
  ivanovo: 134612,
  ingush: 134613,
  "kabardin-balkar": 134615,
  kaliningrad: 134616,
  kaluga: 134617,
  "karachay-cherkess": 134619,
  kemerovo: 134620,
  kirov: 134697,
  kostroma: 134698,
  krasnodar: 134699,
  kurgan: 134700,
  kursk: 134701,
  leningrad: 134702,
  lipetsk: 134703,
  murmansk: 134704,
  nenets: 134705,
  novgorod: 134706,
  adygey: 134707,
  "mariy-el": 134585,
  tatarstan: 134586,
  novosibirsk: 139356,
  omsk: 139357,
  orenburg: 139358,
  orel: 139359,
  penza: 139360,
  perm: 139361,
  "primor-ye": 139362,
  pskov: 139363,
  "gorno-altay": 139364,
  bashkortostan: 139365,
  tula: 139366,
  tambov: 139367,
  tver: 139368,
  rostov: 139369,
  ryazan: 139370,
  dagestan: 139496,
  kalmyk: 139497,
  karelia: 139498,
  northossetia: 139499,
  tuva: 139500,
  khakass: 139502,
  chechnya: 139503,
  sakhalin: 139504,
  tyumen: 139505,
  chelyabinsk: 139506,
  saratov: 139489,
  sverdlovsk: 139490,
  smolensk: 139491,
  tomsk: 139492,
  yaroslavl: 139493,
  udmurt: 143642
};

let filled = 0;
let kept = 0;
let missing = 0;

for (const region of regions) {
  const known = PLACE_IDS[region.id];
  if (known != null) {
    region.inaturalist = { placeId: known };
    filled += 1;
  } else if (region.inaturalist?.placeId != null) {
    kept += 1;
  } else {
    region.inaturalist = { placeId: null };
    missing += 1;
    console.log("null", region.id, region.label);
  }
}

fs.writeFileSync(jsonPath, `${JSON.stringify(regions, null, 2)}\n`);
console.log(`filled=${filled} kept=${kept} missing=${missing}`);
