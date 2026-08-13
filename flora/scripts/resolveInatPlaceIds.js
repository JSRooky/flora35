/**
 * Resolve iNaturalist placeIds — only accept places with "(2019)" in the name
 * (federal-subject polygons used by iNat), plus a few curated fallbacks.
 *
 * Usage: node flora/scripts/resolveInatPlaceIds.js
 */
const fs = require("fs");
const path = require("path");

const jsonPath = path.join(__dirname, "../src/externalSources/russiaRegionsGadm.json");
const regions = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

/** Curated queries / hardcoded placeIds for tricky subjects. */
const CURATED = {
  altay: { queries: ["Altai Krai (2019)", "Altay Kray (2019)"] },
  "arkhangel-sk": { queries: ["Arkhangelsk Oblast (2019)", "Arkhangel'sk Oblast (2019)"] },
  astrakhan: { queries: ["Astrakhan Oblast (2019)", "Astrakhan' Oblast (2019)"] },
  "zabaykal-ye": { queries: ["Zabaykalsky Krai (2019)", "Transbaikal Krai (2019)"] },
  ivanovo: { queries: ["Ivanovo Oblast (2019)"] },
  irkutsk: { queries: ["Irkutsk Oblast (2019)"] },
  kamchatka: { queries: ["Kamchatka Krai (2019)", "Kamchatskiy Kray (2019)"] },
  krasnoyarsk: { queries: ["Krasnoyarsk Krai (2019)", "Krasnoyarskiy Kray (2019)"] },
  magadan: { queries: ["Magadan Oblast (2019)"] },
  moskva: { queries: ["Moscow (2019)", "Moskva (2019)", "gorod Moskva (2019)"] },
  nizhegorod: { queries: ["Nizhny Novgorod Oblast (2019)", "Nizhegorodskaya Oblast (2019)"] },
  novosibirsk: { queries: ["Novosibirsk Oblast (2019)"] },
  omsk: { queries: ["Omsk Oblast (2019)"] },
  orenburg: { queries: ["Orenburg Oblast (2019)"] },
  orel: { queries: ["Oryol Oblast (2019)", "Orel Oblast (2019)"] },
  penza: { queries: ["Penza Oblast (2019)"] },
  pskov: { queries: ["Pskov Oblast (2019)"] },
  perm: { queries: ["Perm Krai (2019)", "Permskiy Kray (2019)"] },
  "primor-ye": { queries: ["Primorsky Krai (2019)", "Primorskiy Kray (2019)"] },
  komi: { queries: ["Komi Republic (2019)", "Respublika Komi (2019)"] },
  mordovia: { queries: ["Mordovia (2019)", "Republic of Mordovia (2019)"] },
  sakha: {
    queries: [
      "Sakha Republic (2019)",
      "Republic of Sakha (2019)",
      "Yakutia (2019)",
      "Respublika Sakha"
    ]
  },
  northossetia: {
    queries: [
      "North Ossetia (2019)",
      "North Ossetia–Alania (2019)",
      "Respublika Severnaya Osetiya"
    ]
  },
  tuva: { queries: ["Tuva (2019)", "Tyva (2019)", "Republic of Tuva (2019)"] },
  chechnya: { queries: ["Chechnya (2019)", "Chechen Republic (2019)"] },
  rostov: { queries: ["Rostov Oblast (2019)"] },
  ryazan: { queries: ["Ryazan Oblast (2019)", "Ryazan' Oblast (2019)"] },
  "cityofst-petersburg": {
    queries: ["Saint Petersburg (2019)", "Sankt-Peterburg (2019)", "St Petersburg (2019)"]
  },
  udmurt: { queries: ["Udmurt Republic (2019)", "Udmurtia (2019)"] },
  khabarovsk: { queries: ["Khabarovsk Krai (2019)"] },
  "khanty-mansiy": {
    queries: [
      "Khanty-Mansi Autonomous Okrug (2019)",
      "Khanty-Mansiysk Autonomous Okrug (2019)"
    ]
  },
  chukot: { queries: ["Chukotka (2019)", "Chukotka Autonomous Okrug (2019)"] },
  "yamal-nenets": {
    queries: ["Yamalo-Nenets Autonomous Okrug (2019)", "Yamalo-Nenets (2019)"]
  },
  sakhalin: { queries: ["Sakhalin Oblast (2019)"] },
  samara: { queries: ["Samara Oblast (2019)"] },
  saratov: { queries: ["Saratov Oblast (2019)"] },
  sverdlovsk: { queries: ["Sverdlovsk Oblast (2019)"] },
  smolensk: { queries: ["Smolensk Oblast (2019)"] },
  stavropol: { queries: ["Stavropol Krai (2019)"] },
  tambov: { queries: ["Tambov Oblast (2019)"] },
  tver: { queries: ["Tver Oblast (2019)", "Tver' Oblast (2019)"] },
  tomsk: { queries: ["Tomsk Oblast (2019)"] },
  tula: { queries: ["Tula Oblast (2019)"] },
  tyumen: { queries: ["Tyumen Oblast (2019)", "Tyumen' Oblast (2019)"] },
  ulyanovsk: { queries: ["Ulyanovsk Oblast (2019)"] },
  chelyabinsk: { queries: ["Chelyabinsk Oblast (2019)"] },
  yaroslavl: { queries: ["Yaroslavl Oblast (2019)"] },
  yevrey: { queries: ["Jewish Autonomous Oblast (2019)"] },
  // Crimea / Sevastopol may be marked UA in iNat — still usable as place filter
  crimea: { queries: ["Crimea (2019)", "Republic of Crimea (2019)", "Respublika Krym"] },
  sevastopol: { queries: ["Sevastopol (2019)", "Sevastopol' (2019)"] }
};

function isAcceptedPlace(place) {
  if (!place) return false;
  const name = place.name || "";
  if (/\(2019\)/.test(name)) return true;
  return false;
}

function score(place) {
  const name = place.name || "";
  const display = place.display_name || "";
  let s = 0;
  if (/\(2019\)/.test(name)) s += 100;
  if (place.place_type === 21) s += 20;
  if (/,\s*RU\b/.test(display)) s += 10;
  if (/,\s*UA\b/.test(display)) s -= 5;
  return s;
}

async function autocomplete(q) {
  const url =
    "https://api.inaturalist.org/v1/places/autocomplete?q=" + encodeURIComponent(q);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${q}`);
  const data = await res.json();
  return data.results || [];
}

function buildQueries(region) {
  const curated = CURATED[region.id]?.queries || [];
  const en = String(region.labelEn || "").replace(/'/g, "");
  const label = region.label || "";
  const list = [...curated];

  if (/область/i.test(label)) {
    list.push(`${en} Oblast (2019)`);
  }
  if (/край/i.test(label)) {
    list.push(`${en} Krai (2019)`, `${en} Kray (2019)`);
  }
  if (/республика/i.test(label)) {
    list.push(`${en} (2019)`, `${en} Republic (2019)`, `Republic of ${en} (2019)`);
  }
  if (/округ/i.test(label)) {
    list.push(`${en} (2019)`, `${en} Autonomous Okrug (2019)`);
  }
  if (/город/i.test(label) || /горсовет/i.test(label)) {
    list.push(`${en} (2019)`);
  }

  return [...new Set(list.filter(Boolean))];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  const missing = [];
  const changed = [];

  for (const region of regions) {
    region.inaturalist = { placeId: null };

    let best = null;
    let bestScore = -Infinity;
    let bestQuery = null;

    for (const q of buildQueries(region)) {
      try {
        const results = await autocomplete(q);
        for (const place of results) {
          if (!isAcceptedPlace(place)) continue;
          const sc = score(place);
          if (sc > bestScore) {
            bestScore = sc;
            best = place;
            bestQuery = q;
          }
        }
        if (best && bestScore >= 120) break;
      } catch (error) {
        console.error("err", region.id, q, error.message);
      }
      await sleep(300);
    }

    if (best) {
      region.inaturalist = { placeId: best.id };
      changed.push(region.id);
      console.log("OK", region.id, best.id, best.display_name, "via", bestQuery);
    } else {
      missing.push({ id: region.id, label: region.label, labelEn: region.labelEn });
      console.log("MISS", region.id, region.label);
    }
  }

  fs.writeFileSync(jsonPath, `${JSON.stringify(regions, null, 2)}\n`);
  console.log("--- ok", changed.length, "missing", missing.length);
  console.log(JSON.stringify(missing, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
