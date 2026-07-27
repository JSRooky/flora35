/**
 * Извлекает текст раздела markdown по идентификатору заголовка второго уровня.
 * Ожидается формат: ## sectionId
 */
export function extractMarkdownSection(markdown, sectionId) {
  if (!markdown || !sectionId) {
    return "";
  }

  const normalized = markdown.replace(/\r\n/g, "\n");
  const sectionPattern = new RegExp(`^##\\s+${sectionId}\\s*$`, "m");
  const match = normalized.match(sectionPattern);

  if (!match || match.index === undefined) {
    return "";
  }

  const sectionStart = match.index + match[0].length;
  const rest = normalized.slice(sectionStart);
  const nextSectionMatch = rest.match(/^##\s+/m);
  const sectionBody = nextSectionMatch
    ? rest.slice(0, nextSectionMatch.index)
    : rest;

  return sectionBody.trim();
}
