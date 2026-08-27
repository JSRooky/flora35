import { getFoundMonth } from "../../geo/foundDate";
import { getFeatureLonLat } from "../buildSeasonalityStats";
import { normalizeLatinName } from "../normalizeLatinName";
import { getRegnumLabel, REGNUM_ORDER } from "../../components/featurePropertyLabels";
import { resolveFeatureRegnum } from "../../gbif/taxonFilters";
import { getRedBookList } from "../../redbook/redBookStore";
import { normalizeTempSource, TEMP_SOURCE_IDS } from "../../tempLayers/tempLayerStore";

export const COMPARE_STATS_TOOLS = [
  { id: "overlap", title: "Перекрытие" },
  { id: "completeness", title: "Полнота" },
  { id: "evenness", title: "Выравненность" },
  { id: "phenology", title: "Сезонность" },
  { id: "years", title: "Годы" },
  { id: "conservation", title: "Охрана" },
  { id: "indicators", title: "Индикаторы" },
  { id: "quality", title: "Качество данных" }
];

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatNum(value, digits = 3) {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(digits)));
}

function formatCountShare(count, total) {
  const n = Number(count) || 0;
  const all = Number(total) || 0;
  if (all <= 0) {
    return `${n} (—)`;
  }
  const pct = (100 * n) / all;
  const text =
    Math.abs(pct - Math.round(pct)) < 0.05 ? String(Math.round(pct)) : pct.toFixed(1);
  return `${n} (${text}%)`;
}

function speciesKey(feature) {
  return normalizeLatinName(feature?.properties?.name_latin);
}

function familyKey(feature) {
  return normalizeLatinName(feature?.properties?.family);
}

function countByKey(features, keyFn) {
  const counts = new Map();
  (features ?? []).forEach((feature) => {
    const key = keyFn(feature);
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function keysOf(countMap) {
  return new Set(countMap.keys());
}

function jaccard(left, right) {
  let intersection = 0;
  left.forEach((key) => {
    if (right.has(key)) {
      intersection += 1;
    }
  });
  const union = left.size + right.size - intersection;
  if (union === 0) {
    return null;
  }
  return intersection / union;
}

function sorensen(left, right) {
  let intersection = 0;
  left.forEach((key) => {
    if (right.has(key)) {
      intersection += 1;
    }
  });
  const denom = left.size + right.size;
  if (denom === 0) {
    return null;
  }
  return (2 * intersection) / denom;
}

function onlyIn(target, others) {
  const unique = [];
  target.forEach((key) => {
    if (![...others].some((set) => set.has(key))) {
      unique.push(key);
    }
  });
  return unique.sort((a, b) => a.localeCompare(b, "en"));
}

function sharedAll(sets) {
  if (sets.length === 0) {
    return [];
  }
  const [first, ...rest] = sets;
  return [...first]
    .filter((key) => rest.every((set) => set.has(key)))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function bumpCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function voteWinner(countMap, order = []) {
  let bestKey = null;
  let bestCount = -1;
  countMap.forEach((count, key) => {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
      return;
    }
    if (count !== bestCount || bestKey == null) {
      return;
    }
    const leftRank = order.indexOf(key);
    const rightRank = order.indexOf(bestKey);
    const leftOrder = leftRank === -1 ? order.length + 1 : leftRank;
    const rightOrder = rightRank === -1 ? order.length + 1 : rightRank;
    if (leftOrder !== rightOrder) {
      if (leftOrder < rightOrder) {
        bestKey = key;
      }
      return;
    }
    if (String(key).localeCompare(String(bestKey), "en") < 0) {
      bestKey = key;
    }
  });
  return bestKey;
}

function collectSpeciesMeta(layers) {
  const meta = new Map();
  (layers ?? []).forEach((layer) => {
    (layer.features ?? []).forEach((feature) => {
      const key = speciesKey(feature);
      if (!key) {
        return;
      }
      let entry = meta.get(key);
      if (!entry) {
        entry = {
          names: new Map(),
          regnums: new Map(),
          families: new Map(),
          familyLabels: new Map()
        };
        meta.set(key, entry);
      }
      const rawName = String(feature?.properties?.name_latin ?? "").trim();
      if (rawName) {
        bumpCount(entry.names, rawName);
      }
      bumpCount(entry.regnums, resolveFeatureRegnum(feature?.properties) || "");
      const familyNorm = familyKey(feature);
      const familyLabel = String(feature?.properties?.family ?? "").trim();
      bumpCount(entry.families, familyNorm);
      if (familyNorm && familyLabel) {
        const labels = entry.familyLabels.get(familyNorm) || new Map();
        bumpCount(labels, familyLabel);
        entry.familyLabels.set(familyNorm, labels);
      }
    });
  });
  return meta;
}

function resolveSharedSpecies(key, entry) {
  const name = voteWinner(entry.names) || key;
  const regnum = voteWinner(entry.regnums, REGNUM_ORDER) || "";
  const familyNorm = voteWinner(entry.families) || "";
  const familyLabelMap = entry.familyLabels.get(familyNorm);
  const familyLabel = familyNorm
    ? voteWinner(familyLabelMap || new Map()) || familyNorm
    : "Без семейства";
  return {
    key,
    name,
    regnum,
    familyKey: familyNorm,
    familyLabel
  };
}

function orderRegnumKeys(keys) {
  const unique = [...new Set(keys)];
  const ordered = [];
  REGNUM_ORDER.forEach((code) => {
    if (unique.includes(code)) {
      ordered.push(code);
    }
  });
  unique
    .filter((key) => key && !ordered.includes(key))
    .sort((left, right) => getRegnumLabel(left).localeCompare(getRegnumLabel(right), "ru"))
    .forEach((key) => ordered.push(key));
  if (unique.includes("")) {
    ordered.push("");
  }
  return ordered;
}

export function buildOverlapKingdoms(sharedKeys, layers) {
  const meta = collectSpeciesMeta(layers);
  const byRegnum = new Map();
  sharedKeys.forEach((key) => {
    const entry = meta.get(key);
    const species = resolveSharedSpecies(key, entry || { names: new Map(), regnums: new Map(), families: new Map(), familyLabels: new Map() });
    const bucket = byRegnum.get(species.regnum) || [];
    bucket.push(species);
    byRegnum.set(species.regnum, bucket);
  });

  const kingdoms = {};
  orderRegnumKeys([...byRegnum.keys()]).forEach((regnum) => {
    const speciesList = byRegnum.get(regnum) || [];
    const byFamily = new Map();
    speciesList.forEach((species) => {
      const familyId = species.familyKey || "";
      const group = byFamily.get(familyId) || {
        key: familyId,
        label: species.familyLabel,
        species: []
      };
      group.species.push({ key: species.key, name: species.name });
      byFamily.set(familyId, group);
    });
    const families = [...byFamily.values()]
      .map((family) => ({
        ...family,
        species: family.species.sort((left, right) => left.name.localeCompare(right.name, "en"))
      }))
      .sort((left, right) => {
        if (!left.key && right.key) {
          return 1;
        }
        if (left.key && !right.key) {
          return -1;
        }
        return left.label.localeCompare(right.label, "en");
      });
    kingdoms[regnum] = {
      key: regnum,
      label: getRegnumLabel(regnum),
      count: speciesList.length,
      families
    };
  });
  return kingdoms;
}

function shannon(counts) {
  const values = [...counts.values()].filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return null;
  }
  let h = 0;
  values.forEach((value) => {
    const p = value / total;
    h -= p * Math.log(p);
  });
  return h;
}

function simpson(counts) {
  const values = [...counts.values()].filter((value) => value > 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return null;
  }
  let sumSq = 0;
  values.forEach((value) => {
    const p = value / total;
    sumSq += p * p;
  });
  return 1 - sumSq;
}

function pielou(h, richness) {
  if (h == null || richness < 2) {
    return null;
  }
  return h / Math.log(richness);
}

function singletonDoubleton(counts) {
  let f1 = 0;
  let f2 = 0;
  counts.forEach((value) => {
    if (value === 1) {
      f1 += 1;
    } else if (value === 2) {
      f2 += 1;
    }
  });
  return { f1, f2 };
}

export function chao1(counts) {
  const sObs = counts.size;
  const { f1, f2 } = singletonDoubleton(counts);
  if (sObs === 0) {
    return 0;
  }
  if (f2 > 0) {
    return sObs + (f1 * f1) / (2 * f2);
  }
  return sObs + (f1 * (f1 - 1)) / 2;
}

export function coverage(counts) {
  const n = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const { f1 } = singletonDoubleton(counts);
  if (n <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, 1 - f1 / n));
}

export function expectedRichness(counts, subsampleN) {
  const abundances = [...counts.values()].filter((value) => value > 0);
  const nTotal = abundances.reduce((sum, value) => sum + value, 0);
  if (nTotal <= 0 || subsampleN <= 0) {
    return 0;
  }
  if (subsampleN >= nTotal) {
    return abundances.length;
  }
  let richness = 0;
  abundances.forEach((k) => {
    let miss = 1;
    for (let i = 0; i < subsampleN; i += 1) {
      const denom = nTotal - i;
      if (denom <= 0) {
        miss = 0;
        break;
      }
      miss *= (nTotal - k - i) / denom;
    }
    richness += 1 - miss;
  });
  return richness;
}

function layerSets(layers, keyFn) {
  return layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    counts: countByKey(layer.features, keyFn)
  }));
}

export function computeOverlapStats(layers) {
  const items = layerSets(layers, speciesKey);
  const sets = items.map((item) => keysOf(item.counts));
  const pairRows = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      pairRows.push([
        `${items[i].label} · ${items[j].label}`,
        formatNum(jaccard(sets[i], sets[j])),
        formatNum(sorensen(sets[i], sets[j])),
        [...sets[i]].filter((key) => sets[j].has(key)).length
      ]);
    }
  }
  const allShared = sharedAll(sets);
  const overlapKingdoms = buildOverlapKingdoms(allShared, layers);
  const kingdomOrder = orderRegnumKeys(Object.keys(overlapKingdoms));
  return {
    hint: "Жаккар и Сёренсен по присутствию видов. «Только здесь» — виды, которых нет в остальных слоях. Клик по царству открывает списки общих видов по семействам.",
    overlapKingdoms,
    sections: [
      {
        title: "Слои",
        columns: ["Слой", "Видов", "Только здесь"],
        rows: items.map((item, index) => [
          item.label,
          item.counts.size,
          onlyIn(
            sets[index],
            sets.filter((_, other) => other !== index)
          ).length
        ])
      },
      {
        title: "Пары",
        columns: ["Пара", "Жаккар", "Сёренсен", "Общих видов"],
        rows: pairRows
      },
      {
        id: "overlap-kingdoms",
        title: "Общие для всех слоёв",
        columns: ["Царство", "Общих видов"],
        selectable: true,
        rowIds: kingdomOrder,
        rows: kingdomOrder.length
          ? kingdomOrder.map((key) => [overlapKingdoms[key].label, overlapKingdoms[key].count])
          : [["—", "—"]]
      }
    ]
  };
}

export function computeCompletenessStats(layers) {
  const items = layerSets(layers, speciesKey);
  const minN = Math.min(
    ...items.map((item) => [...item.counts.values()].reduce((sum, value) => sum + value, 0) || 0)
  );
  const rarefyN = Math.max(1, Math.min(minN, 500));
  return {
    hint: "Chao1 — оценка полного богатства. Покрытие — 1 − f1/n. Разрежение — ожидаемое число видов при одинаковом числе определённых точек.",
    sections: [
      {
        title: "Полнота выборки (виды)",
        columns: ["Слой", "n точек с видом", "S набл.", "Chao1", "Покрытие", `S при n=${rarefyN}`],
        rows: items.map((item) => {
          const n = [...item.counts.values()].reduce((sum, value) => sum + value, 0);
          return [
            item.label,
            n,
            item.counts.size,
            formatNum(chao1(item.counts), 1),
            formatNum(coverage(item.counts)),
            n >= rarefyN ? formatNum(expectedRichness(item.counts, rarefyN), 1) : "—"
          ];
        })
      }
    ]
  };
}

export function computeEvennessStats(layers) {
  const items = layerSets(layers, speciesKey);
  const rankRows = [];
  items.forEach((item) => {
    [...item.counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))
      .slice(0, 8)
      .forEach(([name, count], index) => {
        rankRows.push([item.label, index + 1, name, count]);
      });
  });
  return {
    hint: "Shannon (нат. логарифм), Simpson 1−Σp², Пилу J=H/ln(S). Ниже — до 8 доминантов слоя.",
    sections: [
      {
        title: "Индексы",
        columns: ["Слой", "S", "Shannon H", "Simpson", "Пилу J"],
        rows: items.map((item) => {
          const h = shannon(item.counts);
          return [
            item.label,
            item.counts.size,
            formatNum(h),
            formatNum(simpson(item.counts)),
            formatNum(pielou(h, item.counts.size))
          ];
        })
      },
      {
        title: "Доминанты",
        columns: ["Слой", "Ранг", "Вид", "Точек"],
        rows: rankRows.length ? rankRows : [["—", "—", "—", "—"]]
      }
    ]
  };
}

const MONTH_LABELS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII"
];

export function computePhenologyStats(layers) {
  const rows = layers.map((layer) => {
    const byMonth = Array.from({ length: 12 }, () => 0);
    let unknown = 0;
    (layer.features ?? []).forEach((feature) => {
      const month = getFoundMonth(feature);
      if (month == null) {
        unknown += 1;
        return;
      }
      byMonth[month - 1] += 1;
    });
    return [layer.label, ...byMonth, unknown];
  });
  return {
    hint: "Число точек по месяцу находки. Без месяца — отдельный столбец.",
    sections: [
      {
        title: "Месяцы",
        columns: ["Слой", ...MONTH_LABELS, "Нет месяца"],
        rows
      }
    ]
  };
}

export function computeYearStats(layers) {
  const summary = layers.map((layer) => {
    const years = [];
    (layer.features ?? []).forEach((feature) => {
      const year = Number(feature?.properties?.found_year);
      if (Number.isFinite(year) && year > 1500 && year < 2100) {
        years.push(year);
      }
    });
    years.sort((left, right) => left - right);
    const n = years.length;
    const mid = n ? years[Math.floor(n / 2)] : null;
    return [
      layer.label,
      n,
      n ? years[0] : "—",
      n ? mid : "—",
      n ? years[n - 1] : "—"
    ];
  });

  const yearSet = new Set();
  layers.forEach((layer) => {
    (layer.features ?? []).forEach((feature) => {
      const year = Number(feature?.properties?.found_year);
      if (Number.isFinite(year) && year > 1500 && year < 2100) {
        yearSet.add(year);
      }
    });
  });
  const years = [...yearSet].sort((left, right) => left - right);
  const recent = years.slice(-20);
  const histRows = recent.map((year) => [
    year,
    ...layers.map((layer) =>
      (layer.features ?? []).filter((feature) => Number(feature?.properties?.found_year) === year)
        .length
    )
  ]);

  return {
    hint: "Годы из found_year. Гистограмма — до 20 последних лет, в которых есть хотя бы одна точка.",
    sections: [
      {
        title: "Сводка",
        columns: ["Слой", "С годом", "Мин.", "Медиана", "Макс."],
        rows: summary
      },
      {
        title: "По годам",
        columns: ["Год", ...layers.map((layer) => layer.label)],
        rows: histRows.length ? histRows : [["—", ...layers.map(() => "—")]]
      }
    ]
  };
}

function redBookIndex() {
  const index = new Map();
  (getRedBookList()?.species ?? []).forEach((entry) => {
    const key = normalizeLatinName(entry?.name_latin);
    if (key) {
      index.set(key, entry.status || "None");
    }
  });
  return index;
}

export function computeConservationStats(layers) {
  const book = redBookIndex();
  const statusSet = new Set();
  const perLayer = layers.map((layer) => {
    const species = countByKey(layer.features, speciesKey);
    const byStatus = new Map();
    let listed = 0;
    species.forEach((_count, name) => {
      const status = book.get(name);
      if (!status) {
        return;
      }
      listed += 1;
      statusSet.add(status);
      byStatus.set(status, (byStatus.get(status) || 0) + 1);
    });
    return { label: layer.label, species: species.size, listed, byStatus };
  });
  const statuses = [...statusSet].sort((left, right) => left.localeCompare(right, "en"));
  return {
    hint: "Совпадение латинского названия с текущим списком красной книги проекта. Плюс поле status у точек (IUCN/локальный).",
    sections: [
      {
        title: "Красная книга",
        columns: ["Слой", "Видов", "В списке КК", ...statuses],
        rows: perLayer.map((item) => [
          item.label,
          item.species,
          item.listed,
          ...statuses.map((status) => item.byStatus.get(status) || 0)
        ])
      },
      {
        title: "Поле status у точек",
        columns: ["Слой", "С заполненным status", "Разных кодов"],
        rows: layers.map((layer) => {
          const codes = new Set();
          let filled = 0;
          (layer.features ?? []).forEach((feature) => {
            const status = String(feature?.properties?.status ?? "").trim();
            if (!status) {
              return;
            }
            filled += 1;
            codes.add(status);
          });
          return [layer.label, filled, codes.size];
        })
      }
    ]
  };
}

export function computeIndicatorStats(layers) {
  const totals = new Map();
  const perLayer = layers.map((layer) => countByKey(layer.features, speciesKey));
  perLayer.forEach((counts) => {
    counts.forEach((count, name) => {
      totals.set(name, (totals.get(name) || 0) + count);
    });
  });
  const rows = [];
  layers.forEach((layer, index) => {
    const scored = [];
    perLayer[index].forEach((count, name) => {
      const total = totals.get(name) || 0;
      const layersWith = perLayer.filter((counts) => counts.has(name)).length;
      const share = total > 0 ? count / total : 0;
      const indVal = share * (1 / layersWith) * 100;
      scored.push({ name, count, share, layersWith, indVal });
    });
    scored
      .sort((left, right) => right.indVal - left.indVal || right.count - left.count)
      .slice(0, 12)
      .forEach((item) => {
        rows.push([
          layer.label,
          item.name,
          item.count,
          formatNum(item.share),
          item.layersWith,
          formatNum(item.indVal, 1)
        ]);
      });
  });
  return {
    hint: "Упрощённый IndVal: доля обилия вида в слое × 1/(число слоёв с видом). Чем выше, тем сильнее вид связан со слоем.",
    sections: [
      {
        title: "Характерные виды (до 12 на слой)",
        columns: ["Слой", "Вид", "Точек в слое", "Доля обилия", "Слоёв с видом", "IndVal"],
        rows: rows.length ? rows : [["—", "—", "—", "—", "—", "—"]]
      }
    ]
  };
}

export function computeQualityStats(layers) {
  return {
    hint: "Доля заполненных полей и источники. Нужно, чтобы не сравнивать гербарий с «сырым» iNat как равные выборки.",
    sections: [
      {
        title: "Поля",
        columns: [
          "Слой",
          "Точек",
          "С видом",
          "С семейством",
          "С годом",
          "С месяцем",
          "С координатами"
        ],
        rows: layers.map((layer) => {
          const features = layer.features ?? [];
          const n = features.length;
          const withSpecies = features.filter((feature) => speciesKey(feature)).length;
          const withFamily = features.filter((feature) => familyKey(feature)).length;
          const withYear = features.filter((feature) => {
            const year = Number(feature?.properties?.found_year);
            return Number.isFinite(year) && year > 1500;
          }).length;
          const withMonth = features.filter((feature) => getFoundMonth(feature) != null).length;
          const withCoords = features.filter((feature) => getFeatureLonLat(feature)).length;
          return [
            layer.label,
            n,
            formatCountShare(withSpecies, n),
            formatCountShare(withFamily, n),
            formatCountShare(withYear, n),
            formatCountShare(withMonth, n),
            formatCountShare(withCoords, n)
          ];
        })
      },
      {
        title: "Источники",
        columns: ["Слой", "GBIF", "iNat", "Карта/прочие"],
        rows: layers.map((layer) => {
          let gbif = 0;
          let inat = 0;
          let other = 0;
          const features = layer.features ?? [];
          features.forEach((feature) => {
            const source = normalizeTempSource(
              feature?.properties?.temp_source || feature?.properties?.source
            );
            if (source === TEMP_SOURCE_IDS.INAT) {
              inat += 1;
            } else if (source === TEMP_SOURCE_IDS.GBIF) {
              gbif += 1;
            } else {
              other += 1;
            }
          });
          const total = features.length;
          return [
            layer.label,
            formatCountShare(gbif, total),
            formatCountShare(inat, total),
            formatCountShare(other, total)
          ];
        })
      }
    ]
  };
}

const COMPUTE_BY_ID = {
  overlap: computeOverlapStats,
  completeness: computeCompletenessStats,
  evenness: computeEvennessStats,
  phenology: computePhenologyStats,
  years: computeYearStats,
  conservation: computeConservationStats,
  indicators: computeIndicatorStats,
  quality: computeQualityStats
};

export function getCompareStatsTool(id) {
  return COMPARE_STATS_TOOLS.find((tool) => tool.id === id) || null;
}

export function computeCompareStats(kind, layers) {
  const compute = COMPUTE_BY_ID[kind];
  if (!compute) {
    return { hint: "", sections: [] };
  }
  return compute(layers ?? []);
}

export function formatCompareStatsCsv(report) {
  const lines = [];
  (report?.sections ?? []).forEach((section) => {
    if (section.title) {
      lines.push(csvCell(section.title));
    }
    lines.push((section.columns ?? []).map(csvCell).join(","));
    (section.rows ?? []).forEach((row) => {
      lines.push(row.map(csvCell).join(","));
    });
    lines.push("");
  });
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadCompareStatsCsv(report, kind) {
  const blob = new Blob([formatCompareStatsCsv(report)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `flora35-compare-${kind || "stats"}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
