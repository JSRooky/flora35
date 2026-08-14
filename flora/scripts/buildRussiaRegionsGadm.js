const fs = require('fs');
const inPath = 'C:/Users/Sirius/Documents/VSC/flora35/flora/scripts/gadm/gadm41_RUS_1.json';
const outPath = 'C:/Users/Sirius/Documents/VSC/flora35/flora/src/externalSources/russiaRegionsGadm.json';

const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const features = data.features || [];

function fixNlName(s) {
  if (!s || typeof s !== 'string') return s;
  let t = s;
  // insert space before capital Cyrillic/Latin after lowercase
  t = t.replace(/([а-яёa-z])([А-ЯЁA-Z])/g, '$1 $2');
  // after Республика/край/область/округ when glued
  const prefixes = ['Республика', 'край', 'область', 'округ', 'автономная', 'автономный'];
  for (const p of prefixes) {
    const re = new RegExp('(' + p + ')(?=[А-ЯЁA-Zа-яёa-z])', 'g');
    t = t.replace(re, '$1 ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function slugFromEnglish(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
}

const items = features.map((f) => {
  const p = f.properties || {};
  const nameEn = p.NAME_1 || '';
  const nlFixed = p.NL_NAME_1 ? fixNlName(p.NL_NAME_1) : null;
  return {
    id: slugFromEnglish(nameEn),
    label: nlFixed || nameEn,
    labelEn: nameEn,
    gbif: { gadmGid: p.GID_1 },
    inaturalist: { placeId: null },
    _gid: p.GID_1,
    _hasc: p.HASC_1,
    _nlRaw: p.NL_NAME_1,
  };
});

const collator = new Intl.Collator('ru');
items.sort((a, b) => collator.compare(a.label, b.label));

// detect duplicate slugs
const slugCounts = {};
for (const it of items) slugCounts[it.id] = (slugCounts[it.id] || 0) + 1;
const dupSlugs = Object.entries(slugCounts).filter(([, c]) => c > 1);

const volMatches = items.filter(
  (x) =>
    /vologda/i.test(x.labelEn) ||
    /Вологод/i.test(x.label) ||
    /Вологод/i.test(String(x._nlRaw || ''))
);
const rus78 = items.find((x) => x._gid === 'RUS.78_1');

const out = items.map(({ id, label, labelEn, gbif, inaturalist }) => ({
  id, label, labelEn, gbif, inaturalist,
}));

fs.mkdirSync(require('path').dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n', 'utf8');

const summary = {
  featureCount: features.length,
  outCount: out.length,
  dupSlugs,
  vologda: volMatches.map((x) => ({ gid: x._gid, label: x.label, labelEn: x.labelEn, hasc: x._hasc, id: x.id })),
  rus78: rus78 ? { gid: rus78._gid, label: rus78.label, labelEn: rus78.labelEn, hasc: rus78._hasc, id: rus78.id } : null,
  sampleFixes: items
    .filter((x) => x._nlRaw && x._nlRaw !== x.label)
    .slice(0, 25)
    .map((x) => ({ from: x._nlRaw, to: x.label })),
};
fs.writeFileSync(
  'C:/Users/Sirius/.cursor/projects/c-Users-Sirius-Documents-VSC-flora35/agent-tools/gadm-summary.json',
  JSON.stringify(summary, null, 2),
  'utf8'
);
console.log(JSON.stringify(summary, null, 2));
