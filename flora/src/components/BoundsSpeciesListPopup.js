import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSpeciesRegnumFamilyTree,
  formatSpeciesCount
} from "./featurePropertyLabels";
import "../styles/FeaturePopup.css";
import "../styles/ArealPopup.css";
import "../styles/BoundsSpeciesListPopup.css";

function getSpeciesLabel(species, speciesList) {
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

function TreeToggle({ expanded, label, count, onToggle, level = "regnum" }) {
  return (
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
  );
}

function SpeciesRegnumFamilyTree({ tree, onSpeciesSelect, expandedNodes, onToggleNode }) {
  return (
    <ul className="bounds-species-tree">
      {tree.map(({ regnum, label, families, speciesCount }) => {
        const regnumKey = getRegnumNodeKey(regnum);
        const regnumExpanded = expandedNodes.has(regnumKey);

        return (
          <li key={regnumKey} className="bounds-species-tree-node bounds-species-tree-node--regnum">
            <TreeToggle
              expanded={regnumExpanded}
              label={label}
              count={speciesCount}
              level="regnum"
              onToggle={() => onToggleNode(regnumKey)}
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
                            <li key={entry.nameLatin || entry.nameRu}>
                              <button
                                type="button"
                                className="areal-contained-points-item bounds-species-tree-species-item"
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

/** Плавающее окно со списком видов внутри полигона ООПТ или заповедника. */
export default function BoundsSpeciesListPopup({
  open = false,
  onClose,
  territoryHeading = null,
  speciesSummary = null,
  onSpeciesSelect
}) {
  const [groupByRegnumEnabled, setGroupByRegnumEnabled] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState(() => new Set());

  const species = useMemo(() => speciesSummary?.species ?? [], [speciesSummary?.species]);
  const hasSpecies = species.length > 0;
  const speciesTree = useMemo(
    () => (groupByRegnumEnabled ? buildSpeciesRegnumFamilyTree(species) : []),
    [groupByRegnumEnabled, species]
  );
  const treeNodeKeys = useMemo(() => collectTreeNodeKeys(speciesTree), [speciesTree]);

  useEffect(() => {
    setExpandedNodes(new Set(treeNodeKeys));
  }, [treeNodeKeys]);

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

  if (!open) {
    return null;
  }

  const closeLabel = "Закрыть";
  const territoryCategory = territoryHeading?.category ?? "";
  const territoryTitle = territoryHeading?.title ?? "";
  const hasTerritoryHeading = Boolean(territoryCategory || territoryTitle);

  return (
    <div className="bounds-species-list-popup-stack">
      <aside
        className="feature-popup bounds-species-list-popup"
        aria-label="Виды внутри выбранной ООПТ"
        role="dialog"
      >
        <div className="feature-popup-header">
          <h3 className="feature-popup-title">Виды внутри выбранной ООПТ</h3>
          <div className="popup-panel-header-actions">
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
                Найдено: <strong>{formatSpeciesCount(speciesSummary?.count ?? 0)}</strong>
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
      </aside>
    </div>
  );
}
