import moduleHelpUrl from "./moduleHelp.md";
import { extractMarkdownSection } from "./extractMarkdownSection";

let cachedMarkdown = null;
let loadPromise = null;

function fetchModuleHelpMarkdown() {
  if (cachedMarkdown) {
    return Promise.resolve(cachedMarkdown);
  }

  if (!loadPromise) {
    loadPromise = fetch(moduleHelpUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load moduleHelp.md");
        }

        return response.text();
      })
      .then((text) => {
        cachedMarkdown = text;
        return text;
      })
      .catch(() => {
        loadPromise = null;
        throw new Error("Failed to load moduleHelp.md");
      });
  }

  return loadPromise;
}

export function loadModuleHelpSection(sectionId) {
  return fetchModuleHelpMarkdown().then((markdown) => {
    const section = extractMarkdownSection(markdown, sectionId);
    return section || "Раздел справки для этого модуля пока не заполнен.";
  });
}
