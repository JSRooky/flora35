import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSpeciesRegnumFamilyTree,
  formatSpeciesCount
} from "./featurePropertyLabels";
import "../styles/FeaturePopup.css";
import "../styles/ArealPopup.css";
import "../styles/BoundsSpeciesListPopup.css";

// Добавляем латинское название, если русское имя повторяется среди видов списка.
// Если русского нет — показываем только латынь.
function getSpeciesLabel(species, speciesList) {
  if (!species.nameRu) {
    return species.nameLatin || "Без названия";
  }

  const hasDuplicateName = speciesList.filter((item) => item.nameRu === species.nameRu).length > 1;

  if (hasDuplicateName && species.nameLatin) {
    return `${species.nameRu} (${species.nameLatin})`;
  }

  return species.nameRu;
}

function SpeciesList({ species, onSpeciesSelect }) {
  return (
    <ul className="areal-contained-points-list bounds-species-list-popup-list">
      {species.map((entry) => (
        <li key={entry.nameLatin || entry.nameRu}>
          <button
            type="button"
            className="areal-contained-points-item"
            onClick={() => onSpeciesSelect?.(entry.point)}
          >
            {getSpeciesLabel(entry, species)}
          </button>
        </li>
      ))}
    </ul>
  );
}

function getRegnumNodeKey(regnum) {
  return `regnum:${regnum || "__unknown__"}`;
}

function getFamilyNodeKey(regnum, family) {
  return `family:${regnum || "__unknown__"}:${family || "__unknown__"}`;
}

function EyeIcon({ hidden = false }) {
  if (hidden) {
    return (
      <svg
        className="bounds-species-tree-eye-svg"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="1"
          y1="1"
          x2="23"
          y2="23"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className="bounds-species-tree-eye-svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function collectTreeNodeKeys(tree) {
  const keys = [];

  tree.forEach(({ regnum, families }) => {
    keys.push(getRegnumNodeKey(regnum));
    families.forEach(({ family }) => {
      keys.push(getFamilyNodeKey(regnum, family));
    });
  });

  return keys;
}

function TreeToggle({
  expanded,
  label,
  count,
  onToggle,
  level = "regnum",
  visibilitySwitch = null
}) {
  return (
    <div className={`bounds-species-tree-row bounds-species-tree-row--${level}`}>
      <button
        type="button"
        className={`bounds-species-tree-toggle bounds-species-tree-toggle--${level}`}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className="bounds-species-tree-chevron" aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className="bounds-species-tree-label">{label}</span>
        <span className="bounds-species-tree-count">{formatSpeciesCount(count)}</span>
      </button>

      {visibilitySwitch}
    </div>
  );
}

function SpeciesRegnumFamilyTree({
  tree,
  onSpeciesSelect,
  expandedNodes,
  onToggleNode,
  regnumVisibility,
  onRegnumVisibilityChange
}) {
  return (
    <ul className="bounds-species-tree">
      {tree.map(({ regnum, label, families, speciesCount }) => {
        const regnumKey = getRegnumNodeKey(regnum);
        const regnumExpanded = expandedNodes.has(regnumKey);
        const markersVisible = regnumVisibility[regnum] !== false;

        return (
          <li key={regnumKey} className="bounds-species-tree-node bounds-species-tree-node--regnum">
            <TreeToggle
              expanded={regnumExpanded}
              label={label}
              count={speciesCount}
              level="regnum"
              onToggle={() => onToggleNode(regnumKey)}
              visibilitySwitch={
                onRegnumVisibilityChange ? (
                <button
                  type="button"
                  className={`bounds-species-tree-eye-btn${
                    markersVisible ? "" : " bounds-species-tree-eye-btn--hidden"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRegnumVisibilityChange?.(regnum, !markersVisible);
                  }}
                  aria-pressed={!markersVisible}
                  aria-label={
                    markersVisible ? "Скрыть эту группу" : "Показать эту группу"
                  }
                  title={
                    markersVisible ? "Скрыть эту группу" : "Показать эту группу"
                  }
                >
                  <EyeIcon hidden={!markersVisible} />
                </button>
                ) : null
              }
            />

            {regnumExpanded ? (
              <ul className="bounds-species-tree-children">
                {families.map(({ family, label: familyLabel, species }) => {
                  const familyKey = getFamilyNodeKey(regnum, family);
                  const familyExpanded = expandedNodes.has(familyKey);

                  return (
                    <li
                      key={familyKey}
                      className="bounds-species-tree-node bounds-species-tree-node--family"
                    >
                      <TreeToggle
                        expanded={familyExpanded}
                        label={familyLabel}
                        count={species.length}
                        level="family"
                        onToggle={() => onToggleNode(familyKey)}
                      />

                      {familyExpanded ? (
                        <ul className="bounds-species-tree-children bounds-species-tree-species-list">
                          {species.map((entry) => (
                            <li
                              key={entry.nameLatin || entry.nameRu}
                              className="bounds-species-tree-node bounds-species-tree-node--species"
                            >
                              <button
                                type="button"
                                className="bounds-species-tree-species-btn"
                                onClick={() => onSpeciesSelect?.(entry.point)}
                              >
                                {getSpeciesLabel(entry, species)}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Плавающее окно со списком видов (ООПТ, плотная группа и т.п.). */
export default function BoundsSpeciesListPopup({
  open = false,
  onClose,
  title = "Виды внутри выбранной ООПТ",
  ariaLabel = null,
  territoryHeading = null,
  speciesSummary = null,
  onSpeciesSelect,
  onRegnumVisibilityChange = null
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [groupByRegnumEnabled, setGroupByRegnumEnabled] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set());
  const [regnumVisibility, setRegnumVisibility] = useState({});

  const species = useMemo(() => speciesSummary?.species ?? [], [speciesSummary?.species]);
  const hasSpecies = species.length > 0;
  const speciesTree = useMemo(
    () => (groupByRegnumEnabled ? buildSpeciesRegnumFamilyTree(species) : []),
    [groupByRegnumEnabled, species]
  );
  const treeNodeKeys = useMemo(() => collectTreeNodeKeys(speciesTree), [speciesTree]);
  const treeRegnums = useMemo(
    () => speciesTree.map(({ regnum }) => regnum).filter(Boolean),
    [speciesTree]
  );

  // Наружу передаём null, если видимы все царства, иначе — список видимых.
  const publishRegnumVisibility = useCallback(
    (nextVisibility) => {
      if (!groupByRegnumEnabled || treeRegnums.length === 0) {
        onRegnumVisibilityChange?.(null);
        return;
      }

      const enabledRegnums = treeRegnums.filter((regnum) => nextVisibility[regnum] !== false);

      if (enabledRegnums.length === treeRegnums.length) {
        onRegnumVisibilityChange?.(null);
        return;
      }

      onRegnumVisibilityChange?.(enabledRegnums);
    },
    [groupByRegnumEnabled, onRegnumVisibilityChange, treeRegnums]
  );

  // При пересчёте дерева (новые данные, смена группировки) разворачиваем все узлы заново.
  useEffect(() => {
    setExpandedNodes(new Set(treeNodeKeys));
  }, [treeNodeKeys]);

  // Сбрасываем фильтр видимости по царствам при каждом открытии и закрытии панели.
  useEffect(() => {
    if (!open) {
      setRegnumVisibility({});
      onRegnumVisibilityChange?.(null);
      return;
    }

    setCollapsed(false);
    setRegnumVisibility({});
    onRegnumVisibilityChange?.(null);
  }, [open, onRegnumVisibilityChange]);

  // Без группировки по царству индивидуальный фильтр видимости не имеет смысла.
  useEffect(() => {
    if (!open || groupByRegnumEnabled) {
      return;
    }

    onRegnumVisibilityChange?.(null);
  }, [groupByRegnumEnabled, open, onRegnumVisibilityChange]);

  const handleToggleNode = useCallback((nodeKey) => {
    setExpandedNodes((current) => {
      const next = new Set(current);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  }, []);

  const handleRegnumVisibilityChange = useCallback(
    (regnum, visible) => {
      setRegnumVisibility((current) => {
        const next = {
          ...current,
          [regnum]: visible
        };
        publishRegnumVisibility(next);
        return next;
      });
    },
    [publishRegnumVisibility]
  );

  if (!open) {
    return null;
  }

  const closeLabel = "Закрыть";
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const speciesCount = speciesSummary?.count ?? 0;
  const territoryCategory = territoryHeading?.category ?? "";
  const territoryTitle = territoryHeading?.title ?? "";
  const hasTerritoryHeading = Boolean(territoryCategory || territoryTitle);
  const collapsedSummaryParts = [];

  if (hasTerritoryHeading) {
    collapsedSummaryParts.push([territoryCategory, territoryTitle].filter(Boolean).join(" — "));
  }

  collapsedSummaryParts.push(formatSpeciesCount(speciesCount));

  return (
    <div className="bounds-species-list-popup-stack">
      <aside
        className={`feature-popup bounds-species-list-popup${
          collapsed ? " feature-popup--collapsed bounds-species-list-popup--collapsed" : ""
        }`}
        aria-label={ariaLabel || title}
        role="dialog"
      >
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">{title}</h3>
          <div className="popup-panel-header-actions">
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-label={toggleLabel}
              title={toggleLabel}
            >
              {collapsed ? "▾" : "▴"}
            </button>
            <button
              type="button"
              className="popup-panel-toggle"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
            >
              ×
            </button>
          </div>
        </div>

        {collapsed ? (
          <p className="popup-collapsed-summary">{collapsedSummaryParts.join(", ")}</p>
        ) : (
          <div className="popup-content bounds-species-list-popup-content">
            {hasTerritoryHeading ? (
              <p className="bounds-species-list-popup-subtitle">
                {territoryCategory ? (
                  <>
                    {territoryCategory}
                    {territoryTitle ? " " : null}
                  </>
                ) : null}
                {territoryTitle ? (
                  <strong className="bounds-species-list-popup-subtitle-title">{territoryTitle}</strong>
                ) : null}
              </p>
            ) : null}

            <div className="areal-contained-points bounds-species-list-popup-section">
              <div className="bounds-species-list-popup-toolbar">
                <p className="areal-contained-points-title">
                  Найдено: <strong>{formatSpeciesCount(speciesCount)}</strong>
                </p>

                {hasSpecies ? (
                  <label
                    className="property-switch bounds-species-list-popup-group-switch"
                    title="Показать дерево: царство → семейство → вид"
                  >
                    <input
                      type="checkbox"
                      checked={groupByRegnumEnabled}
                      onChange={(event) => setGroupByRegnumEnabled(event.target.checked)}
                    />
                    <span className="property-switch-slider" />
                    <span className="bounds-species-list-popup-group-switch-label">По царству</span>
                  </label>
                ) : null}
              </div>

              {hasSpecies ? (
                groupByRegnumEnabled ? (
                  <div className="bounds-species-list-popup-tree">
                    <SpeciesRegnumFamilyTree
                      tree={speciesTree}
                      onSpeciesSelect={onSpeciesSelect}
                      expandedNodes={expandedNodes}
                      onToggleNode={handleToggleNode}
                      regnumVisibility={regnumVisibility}
                      onRegnumVisibilityChange={
                        onRegnumVisibilityChange ? handleRegnumVisibilityChange : null
                      }
                    />
                  </div>
                ) : (
                  <SpeciesList species={species} onSpeciesSelect={onSpeciesSelect} />
                )
              ) : (
                <p className="popup-empty-state">Ни одного вида не найдено.</p>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
