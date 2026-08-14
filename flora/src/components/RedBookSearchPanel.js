import React, { useCallback, useEffect, useRef, useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import RedBookSpeciesTablePopup from "./RedBookSpeciesTablePopup";
import { matchRedBookOccurrences } from "../redbook/matchRedBookOccurrences";
import { parseRedBookListAuto } from "../redbook/parseRedBookList";
import {
  clearRedBookMatches,
  downloadJsonFile,
  getRedBookList,
  getRedBookListDocument,
  getRedBookMatches,
  getRedBookMatchStats,
  setRedBookList,
  setRedBookMatches,
  setRedBookLastSearchResult
} from "../redbook/redBookStore";
import { getGbifFeatureCount } from "../gbif/gbifStore";
import { getInatFeatureCount } from "../inaturalist/inatStore";
import "../styles/RedBookSearchPanel.css";

/**
 * Панель «Поиск редких видов»: загрузка списка латынь+статус и поиск в GBIF/iNat.
 */
export default function RedBookSearchPanel({
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose,
  onMatchesReady,
  onShowMatchesLayer,
  onAddSpeciesToLayer
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);

  const [listText, setListText] = useState("");
  const [species, setSpecies] = useState(() => getRedBookList().species ?? []);
  const [parseErrors, setParseErrors] = useState([]);
  const [parseSkipped, setParseSkipped] = useState([]);
  const [matchStats, setMatchStats] = useState(() => getRedBookMatchStats());
  const [matchCount, setMatchCount] = useState(
    () => getRedBookMatches()?.features?.length ?? 0
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [tableOpen, setTableOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const current = getRedBookList();
    setSpecies(current.species ?? []);
  }, []);

  const sourceCounts = {
    gbif: getGbifFeatureCount(),
    inat: getInatFeatureCount()
  };

  const applyParsedList = useCallback((parsed) => {
    setParseErrors(parsed.errors ?? []);
    setParseSkipped(parsed.skipped ?? []);
    setSpecies(parsed.species ?? []);
    setRedBookList(parsed);
    setMatchStats(null);
    setTableOpen(false);
    setMessage(
      parsed.species?.length
        ? `В списке ${parsed.species.length} вид(ов)`
        : "Список пуст"
    );
  }, []);

  const handleParseText = useCallback(() => {
    const parsed = parseRedBookListAuto(listText);
    applyParsedList(parsed);
  }, [applyParsedList, listText]);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        setListText(text);
        const parsed = parseRedBookListAuto(text);
        applyParsedList(parsed);
      } catch (error) {
        setMessage(`Не удалось прочитать файл: ${error?.message || "error"}`);
      }
    },
    [applyParsedList]
  );

  const applyMatchResult = useCallback(
    (collection, stats) => {
      setMatchStats(stats);
      setMatchCount(collection?.features?.length ?? 0);
      onMatchesReady?.(collection, stats);
    },
    [onMatchesReady]
  );

  const handleMatch = useCallback(() => {
    if (!species.length) {
      setMessage("Сначала загрузите или разберите список видов");
      return;
    }

    setBusy(true);
    setMessage(null);

    window.setTimeout(() => {
      try {
        const list = getRedBookList();
        const { collection, stats } = matchRedBookOccurrences(list);
        setRedBookLastSearchResult(collection, stats);
        setRedBookMatches(collection, { stats });
        applyMatchResult(collection, stats);
        setMessage(
          stats.pointCount > 0
            ? `Найдено ${stats.pointCount} точек (${stats.matchedSpeciesCount} видов)`
            : "Совпадений в загруженных GBIF/iNat нет"
        );
      } catch (error) {
        setMessage(`Ошибка поиска: ${error?.message || "error"}`);
      } finally {
        setBusy(false);
      }
    }, 0);
  }, [applyMatchResult, species.length]);

  const handleTableSearchComplete = useCallback((stats) => {
    setMatchStats(stats ?? null);
    setMessage(
      stats?.pointCount > 0
        ? `Найдено ${stats.pointCount} точек (${stats.matchedSpeciesCount} видов). Добавьте виды в слой из таблицы.`
        : "Совпадений в загруженных GBIF/iNat нет"
    );
  }, []);

  const handleAddSpeciesToLayer = useCallback(
    (features) => {
      const result = onAddSpeciesToLayer?.(features);
      const collection = result?.collection ?? getRedBookMatches();
      setMatchCount(collection?.features?.length ?? 0);
      return result;
    },
    [onAddSpeciesToLayer]
  );

  const handleClearMatches = useCallback(() => {
    clearRedBookMatches();
    setMatchStats(null);
    setMatchCount(0);
    onMatchesReady?.({ type: "FeatureCollection", features: [] }, null);
    setMessage("Слой совпадений очищен");
  }, [onMatchesReady]);

  const handleDownloadList = useCallback(() => {
    downloadJsonFile("redBookList.json", getRedBookListDocument());
  }, []);

  const handleDownloadMatches = useCallback(() => {
    downloadJsonFile("redBookMatches.json", getRedBookMatches());
  }, []);

  const showInlinePreview = species.length === 1;
  const showTableButton = species.length > 1;

  return (
    <>
      <aside
        className={`redbook-search-panel${collapsed ? " redbook-search-panel--collapsed" : ""}`}
        aria-label="Поиск редких видов"
      >
        <div className="redbook-search-panel-header">
          <h3 className="redbook-search-panel-title">Поиск редких видов</h3>
          <div className="popup-panel-header-actions">
            <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
            {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => setCollapsed(!collapsed)}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {collapsed ? "▾" : "▴"}
            </button>
            {onClose ? <PanelCloseButton onClick={onClose} /> : null}
          </div>
        </div>

        {collapsed ? (
          <p className="redbook-search-panel-summary">
            {species.length
              ? `${species.length} вид. · ${matchCount} точ.`
              : "список не загружен"}
          </p>
        ) : (
          <div className="redbook-search-panel-content">
            <p className="redbook-search-panel-note">
              Загрузите список латинских названий (и статус, если есть). Поиск идёт
              только по уже загруженным точкам GBIF и iNaturalist.
            </p>

            <div className="redbook-search-sources">
              <span>GBIF: {sourceCounts.gbif}</span>
              <span>iNat: {sourceCounts.inat}</span>
            </div>

            <label className="redbook-search-label" htmlFor="redbook-list-text">
              Список видов (TXT / JSON)
            </label>
            <textarea
              id="redbook-list-text"
              className="redbook-search-textarea"
              rows={8}
              value={listText}
              onChange={(event) => setListText(event.target.value)}
              placeholder={"Cypripedium calceolus; EN\nDrosera anglica\n..."}
              spellCheck={false}
            />

            <div className="redbook-search-actions">
              <button type="button" className="redbook-search-btn" onClick={handleParseText}>
                Разобрать список
              </button>
              <button
                type="button"
                className="redbook-search-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                Файл…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.json,.csv,text/plain,application/json"
                hidden
                onChange={handleFileChange}
              />
            </div>

            {parseErrors.length > 0 ? (
              <p className="redbook-search-error" role="alert">
                {parseErrors.join("; ")}
              </p>
            ) : null}

            {showInlinePreview ? (
              <div className="redbook-search-preview">
                <div className="redbook-search-preview-head">
                  <strong>Виды в списке: 1</strong>
                  {parseSkipped.length > 0 ? (
                    <span className="redbook-search-muted">
                      пропущено: {parseSkipped.length}
                    </span>
                  ) : null}
                </div>
                <ul className="redbook-search-species-list">
                  <li key={species[0].name_latin_norm || species[0].name_latin}>
                    <span className="redbook-search-species-latin">
                      {species[0].name_latin}
                    </span>
                    <span className="redbook-search-species-status">
                      {species[0].status}
                    </span>
                  </li>
                </ul>
              </div>
            ) : null}

            {showTableButton ? (
              <div className="redbook-search-preview redbook-search-preview--table-cta">
                <div className="redbook-search-preview-head">
                  <strong>Видов в списке: {species.length}</strong>
                  {parseSkipped.length > 0 ? (
                    <span className="redbook-search-muted">
                      пропущено: {parseSkipped.length}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="redbook-search-btn redbook-search-btn--table"
                  onClick={() => setTableOpen(true)}
                >
                  Таблица видов
                </button>
              </div>
            ) : null}

            <div className="redbook-search-actions">
              <button
                type="button"
                className="redbook-search-btn redbook-search-btn--primary"
                onClick={handleMatch}
                disabled={busy || species.length === 0}
              >
                {busy ? "Поиск…" : "Найти в GBIF / iNat"}
              </button>
              <button
                type="button"
                className="redbook-search-btn"
                onClick={() => onShowMatchesLayer?.()}
                disabled={matchCount === 0}
              >
                Показать слой
              </button>
            </div>

            {matchStats ? (
              <div className="redbook-search-stats" role="status">
                <p>
                  Совпало видов: {matchStats.matchedSpeciesCount} из {matchStats.listCount}
                </p>
                <p>
                  Точек: {matchStats.pointCount} (GBIF {matchStats.gbifPointCount}, iNat{" "}
                  {matchStats.inatPointCount})
                </p>
                {matchStats.unmatchedSpeciesCount > 0 ? (
                  <details className="redbook-search-unmatched">
                    <summary>
                      Без находок: {matchStats.unmatchedSpeciesCount}
                    </summary>
                    <ul>
                      {matchStats.unmatchedSpecies.slice(0, 30).map((item) => (
                        <li key={item.name_latin}>
                          {item.name_latin}{" "}
                          <span className="redbook-search-muted">({item.status})</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : null}

            <div className="redbook-search-actions redbook-search-actions--secondary">
              <button type="button" className="redbook-search-btn" onClick={handleDownloadList}>
                Скачать список JSON
              </button>
              <button
                type="button"
                className="redbook-search-btn"
                onClick={handleDownloadMatches}
                disabled={matchCount === 0}
              >
                Скачать совпадения
              </button>
              <button
                type="button"
                className="redbook-search-btn"
                onClick={handleClearMatches}
                disabled={matchCount === 0}
              >
                Очистить слой
              </button>
            </div>

            {message ? (
              <p className="redbook-search-message" role="status">
                {message}
              </p>
            ) : null}
          </div>
        )}

        <ModuleHelpPanel sectionId={MODULE_IDS.REDBOOK} open={helpOpen} />
      </aside>

      <RedBookSpeciesTablePopup
        open={tableOpen}
        species={species}
        initialCounts={matchStats?.speciesCounts ?? null}
        layerPointCount={matchCount}
        onClose={() => setTableOpen(false)}
        onSearchComplete={handleTableSearchComplete}
        onAddSpeciesToLayer={handleAddSpeciesToLayer}
      />
    </>
  );
}
