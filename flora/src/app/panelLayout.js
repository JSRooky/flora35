/**
 * Раскладка панелей: правило «одна раскрытая панель».
 *
 * Чистые функции без React и без побочных эффектов — чтобы правило можно было
 * проверить тестами и переиспользовать вне домена.
 */
import { PANEL_IDS } from "./panelConstants";

/**
 * Панели-инструменты, которые док-ятся к «Сведениям о точке» и могут быть
 * развёрнуты вместе с ней (радиус, буфер, полигон).
 */
export const DOCKED_TOOL_PANEL_IDS = [PANEL_IDS.AREAL, PANEL_IDS.BUFFER, PANEL_IDS.POLYGON];

/** Все идентификаторы панелей без алиасов (`GBIF` — это `DATA_SOURCES`). */
const UNIQUE_PANEL_IDS = Array.from(new Set(Object.values(PANEL_IDS)));

/**
 * Сворачивает все панели, кроме `keepPanelId`, до заголовка.
 *
 * Панели не закрываются и не уходят в таскбар — они остаются в стеке свёрнутыми.
 * Док-инструменты не трогаем: иначе нельзя работать с радиусом/буфером/полигоном
 * при открытых «Сведениях о точке».
 *
 * @param {Record<string, boolean>} panelCollapsed — состояние «свёрнута» по панелям
 * @param {string} keepPanelId — панель, которая остаётся развёрнутой
 * @returns {Record<string, boolean>} новое состояние (или тот же объект, если менять нечего)
 */
export function collapseOtherPanels(panelCollapsed, keepPanelId) {
  const state = panelCollapsed ?? {};
  const next = { ...state, [keepPanelId]: false };
  let changed = state[keepPanelId] !== false;
  // Док-инструмент разворачивают из «Сведений о точке» — их панель сворачивать нельзя,
  // иначе инструмент останется без родительского контекста.
  const keepFeatureExpanded = DOCKED_TOOL_PANEL_IDS.includes(keepPanelId);

  UNIQUE_PANEL_IDS.forEach((panelId) => {
    if (panelId === keepPanelId || DOCKED_TOOL_PANEL_IDS.includes(panelId)) {
      return;
    }

    if (keepFeatureExpanded && panelId === PANEL_IDS.FEATURE) {
      return;
    }

    if (next[panelId] !== true) {
      next[panelId] = true;
      changed = true;
    }
  });

  return changed ? next : state;
}

/** Панель считается развёрнутой, если она не свёрнута и не убрана в таскбар. */
export function isPanelExpanded(panelCollapsed, panelMinimized, panelId) {
  if (panelMinimized?.[panelId]) {
    return false;
  }

  return (panelCollapsed ?? {})[panelId] !== true;
}

/**
 * Выбирает панель, которую нужно развернуть, когда на экране появилась новая.
 *
 * Правило «одна раскрытая»: новая панель разворачивается, ранее развёрнутые
 * сворачиваются в полоску. Панели, убранные в док, не разворачиваем — их
 * показывать в стеке не просили.
 *
 * @param {string[]} previousOpenIds — открытые панели до изменения
 * @param {string[]} openIds — открытые панели сейчас
 * @param {Record<string, boolean>} panelMinimized
 * @returns {string|null} id панели для разворота или null
 */
export function pickPanelToExpand(previousOpenIds, openIds, panelMinimized) {
  const previous = new Set(previousOpenIds ?? []);
  const added = (openIds ?? []).filter((panelId) => !previous.has(panelId));

  for (let i = added.length - 1; i >= 0; i -= 1) {
    const panelId = added[i];
    if (!panelMinimized?.[panelId]) {
      return panelId;
    }
  }

  return null;
}
