import React, { useEffect, useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  LayersIcon,
  ListIcon,
  PlusIcon,
  TrashIcon
} from "../images/buttons";
import {
  REGION_OVERLAY_ROLES,
  listRegionLayerTree,
  listRegionOverlayPlaceNames,
  setRegionOverlayVisible,
  setRegionsRootVisible,
  subscribeTempLayers
} from "../tempLayers/tempLayerStore";
import "../styles/RegionLayersPanel.css";

function VisibilityButton({ on, disabled, label, onClick }) {
  const Icon = on ? EyeIcon : EyeOffIcon;
  return (
    <button
      type="button"
      className={`region-layers-eye${on ? "" : " region-layers-eye--off"}`}
      disabled={disabled}
      title={on ? `Скрыть: ${label}` : `Показать: ${label}`}
      aria-label={on ? `Скрыть «${label}»` : `Показать «${label}»`}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <Icon className="region-layers-eye-icon" aria-hidden="true" focusable="false" />
    </button>
  );
}

function TreeRow({
  item,
  depth,
  selectedKey,
  selectedPlaceIso,
  listOpenId,
  onSelect,
  onSelectPlace,
  onToggle,
  onLoadDistricts,
  onToggleList,
  onRemove,
  loadingKey,
  loading
}) {
  const selected = selectedKey === item.regionKey;
  const canLoadDistricts =
    item.role === REGION_OVERLAY_ROLES.BOUNDARY && !item.hasDistricts;
  const canListPlaces =
    item.role === REGION_OVERLAY_ROLES.DISTRICTS && item.featureCount > 0;
  const listOpen = listOpenId === item.id;
  const places = listOpen ? listRegionOverlayPlaceNames(item.id) : [];
  const rowLoading = Boolean(loading && loadingKey && loadingKey === item.regionKey);

  return (
    <>
      <div
        className={`region-layers-row${selected ? " region-layers-row--selected" : ""}${
          item.effectiveVisible ? "" : " region-layers-row--hidden"
        }`}
        style={{ paddingLeft: 8 + depth * 14 }}
        role="treeitem"
        aria-selected={selected}
        onClick={() => onSelect?.(item)}
      >
        <VisibilityButton
          on={item.visible}
          disabled={!onToggle}
          label={item.label}
          onClick={() => onToggle?.(item)}
        />
        <span className="region-layers-row-name" title={item.label}>
          {item.label}
        </span>
        {rowLoading ? (
          <span
            className="region-layers-spinner"
            role="status"
            aria-label={`Загрузка «${item.label}»`}
            title="Загрузка границ…"
          />
        ) : (
          <span className="region-layers-row-count">{item.featureCount}</span>
        )}
        {canLoadDistricts ? (
          <button
            type="button"
            className="region-layers-add"
            title="Дозагрузить административное деление"
            aria-label={`Дозагрузить адм. деление «${item.label}»`}
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              onLoadDistricts?.(item);
            }}
          >
            <PlusIcon className="region-layers-add-icon" aria-hidden="true" focusable="false" />
          </button>
        ) : null}
        {canListPlaces ? (
          <button
            type="button"
            className={`region-layers-list${listOpen ? " region-layers-list--on" : ""}`}
            title={listOpen ? "Скрыть список районов" : "Список районов"}
            aria-label={
              listOpen ? `Скрыть список «${item.label}»` : `Список районов «${item.label}»`
            }
            aria-expanded={listOpen}
            onClick={(event) => {
              event.stopPropagation();
              onToggleList?.(item);
            }}
          >
            <ListIcon className="region-layers-list-icon" aria-hidden="true" focusable="false" />
          </button>
        ) : null}
        <button
          type="button"
          className="region-layers-remove"
          title={`Удалить «${item.label}»`}
          aria-label={`Удалить «${item.label}»`}
          disabled={loading}
          onClick={(event) => {
            event.stopPropagation();
            onRemove?.(item);
          }}
        >
          <TrashIcon className="region-layers-remove-icon" aria-hidden="true" focusable="false" />
        </button>
      </div>
      {listOpen ? (
        <ul
          className="region-layers-places"
          style={{ paddingLeft: 30 + depth * 14 }}
          aria-label={`Районы: ${item.label}`}
        >
          {places.length ? (
            places.map((place) => (
              <li key={place.id} className="region-layers-place">
                <button
                  type="button"
                  className={`region-layers-place-btn${
                    selectedPlaceIso && place.iso === selectedPlaceIso
                      ? " region-layers-place-btn--selected"
                      : ""
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectPlace?.(place);
                  }}
                >
                  {place.name}
                </button>
              </li>
            ))
          ) : (
            <li className="region-layers-place region-layers-place--empty">Нет названий</li>
          )}
        </ul>
      ) : null}
      {item.children?.map((child) => (
        <TreeRow
          key={child.id}
          item={child}
          depth={depth + 1}
          selectedKey={selectedKey}
          selectedPlaceIso={selectedPlaceIso}
          listOpenId={listOpenId}
          onSelect={onSelect}
          onSelectPlace={onSelectPlace}
          onToggle={onToggle}
          onLoadDistricts={onLoadDistricts}
          onToggleList={onToggleList}
          onRemove={onRemove}
          loadingKey={loadingKey}
          loading={loading}
        />
      ))}
    </>
  );
}

/** Правая панель подслоёв регионов (дерево как в Photoshop). */
export default function RegionLayersPanel({
  open = true,
  selectedRegionKey = null,
  selectedPlaceIso = null,
  loading = false,
  loadingKey = "",
  loadingStatus = "",
  onSelectRegion,
  onSelectPlace,
  onLoadDistricts,
  onRemove,
  onRemoveAll,
  onTreeChange,
  onClose
}) {
  const [tree, setTree] = useState(() => listRegionLayerTree());
  const [listOpenId, setListOpenId] = useState(null);

  useEffect(() => {
    return subscribeTempLayers(() => {
      setTree(listRegionLayerTree());
    });
  }, []);

  if (!open || (tree.empty && !loading)) {
    return null;
  }

  const handleRootToggle = () => {
    setRegionsRootVisible(!tree.visible);
    onTreeChange?.();
  };

  const handleToggle = (item) => {
    setRegionOverlayVisible(item.id, !item.visible);
    onTreeChange?.();
  };

  const handleToggleList = (item) => {
    setListOpenId((current) => (current === item.id ? null : item.id));
  };

  return (
    <aside className="region-layers-panel" aria-label="Слои регионов">
      <div className="region-layers-header">
        <LayersIcon className="region-layers-header-icon" aria-hidden="true" focusable="false" />
        <h3 className="region-layers-title">Слои</h3>
        {onClose ? (
          <button
            type="button"
            className="region-layers-close"
            onClick={onClose}
            aria-label="Скрыть панель слоёв"
            title="Скрыть"
          >
            ×
          </button>
        ) : null}
      </div>
      {loading ? (
        <div className="region-layers-progress" role="status" aria-live="polite">
          <span className="region-layers-spinner" aria-hidden="true" />
          <span className="region-layers-progress-text">
            {loadingStatus || "Загрузка границ OSM…"}
          </span>
        </div>
      ) : null}
      <div className="region-layers-tree" role="tree">
        <div
          className={`region-layers-row region-layers-row--root${
            tree.visible ? "" : " region-layers-row--hidden"
          }`}
        >
          <VisibilityButton
            on={tree.visible}
            label="Регионы"
            onClick={handleRootToggle}
            disabled={tree.empty}
          />
          <span className="region-layers-row-name">Регионы</span>
          {onRemoveAll && !tree.empty ? (
            <button
              type="button"
              className="region-layers-remove"
              title="Удалить все слои границ"
              aria-label="Удалить все слои границ"
              disabled={loading}
              onClick={onRemoveAll}
            >
              <TrashIcon className="region-layers-remove-icon" aria-hidden="true" focusable="false" />
            </button>
          ) : null}
        </div>
        {tree.items.map((item) => (
          <TreeRow
            key={item.id}
            item={item}
            depth={1}
            selectedKey={selectedRegionKey}
            selectedPlaceIso={selectedPlaceIso}
            listOpenId={listOpenId}
            onSelect={onSelectRegion}
            onSelectPlace={onSelectPlace}
            onToggle={handleToggle}
            onLoadDistricts={onLoadDistricts}
            onToggleList={handleToggleList}
            onRemove={onRemove}
            loadingKey={loadingKey}
            loading={loading}
          />
        ))}
      </div>
    </aside>
  );
}
