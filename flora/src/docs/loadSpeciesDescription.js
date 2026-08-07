// Webpack-контекст: заранее собирает все .md-файлы из ./species, чтобы получить их URL после сборки.
const speciesDescriptions = require.context("./species", false, /\.md$/);

// Ключи контекста имеют вид "./name.md" — убираем префикс "./", чтобы сопоставить с description_md.
const urlByPath = new Map(
  speciesDescriptions.keys().map((key) => [`species/${key.slice(2)}`, speciesDescriptions(key)])
);

// Кэш загруженного текста и промисов "в процессе", чтобы не грузить один файл повторно параллельно.
const contentCache = new Map();
const loadPromises = new Map();

function resolveSpeciesDescriptionUrl(relativePath) {
  return urlByPath.get(relativePath) ?? null;
}

/** Загружает markdown-описание вида по пути из properties.description_md. */
export function loadSpeciesDescription(relativePath) {
  if (!relativePath) {
    return Promise.reject(new Error("Missing species description path"));
  }

  if (contentCache.has(relativePath)) {
    return Promise.resolve(contentCache.get(relativePath));
  }

  if (loadPromises.has(relativePath)) {
    return loadPromises.get(relativePath);
  }

  const url = resolveSpeciesDescriptionUrl(relativePath);
  if (!url) {
    return Promise.reject(new Error(`Unknown species description: ${relativePath}`));
  }

  const loadPromise = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${relativePath}`);
      }

      return response.text();
    })
    .then((text) => {
      contentCache.set(relativePath, text);
      loadPromises.delete(relativePath);
      return text;
    })
    .catch((error) => {
      loadPromises.delete(relativePath);
      throw error;
    });

  loadPromises.set(relativePath, loadPromise);
  return loadPromise;
}
