import React, { useMemo } from "react";
import { getPanelTaskbarMeta } from "../panelTaskbarRegistry";
import "../styles/PanelTaskbar.css";
import { AreaIcon, BufferIcon, ClustersIcon, DatabaseIcon, DenseIcon, GlobeIcon, ListIcon, OoptIcon, PointIcon, PolygonIcon, RadiusIcon, StatusIcon, SubmitIcon, YearIcon } from "../images/buttons";

const TASKBAR_ICONS = {
  radius: RadiusIcon,
  buffer: BufferIcon,
  polygon: PolygonIcon,
  area: AreaIcon,
  status: StatusIcon,
  clusters: ClustersIcon,
  dense: DenseIcon,
  year: YearIcon,
  oopt: OoptIcon,
  ooptFeature: OoptIcon,
  submit: SubmitIcon,
  gbif: GlobeIcon,
  gbifProcessing: GlobeIcon,
  dataWork: DatabaseIcon,
  speciesList: ListIcon,
  point: PointIcon
};

function TaskbarIcon({ name }) {
  const Icon = TASKBAR_ICONS[name] || PointIcon;
  return <Icon className="panel-taskbar-icon" aria-hidden="true" focusable="false" />;
}

/** Нижняя панель задач: свёрнутые панели + подсветка активной. */
export default function PanelTaskbar({
  items = [],
  activeIds = [],
  loadingIds = [],
  onActivate,
  bottomOccupyPx = 0
}) {
  const activeSet = useMemo(() => new Set(activeIds), [activeIds]);
  const loadingSet = useMemo(() => new Set(loadingIds), [loadingIds]);

  if (!items.length) {
    return null;
  }

  return (
    <div
      className="panel-taskbar"
      style={
        bottomOccupyPx > 0
          ? { bottom: `${bottomOccupyPx}px` }
          : undefined
      }
      aria-label="Панель задач"
    >
      <div className="panel-taskbar-bar" role="toolbar" aria-label="Панели">
        {items.map((panelId) => {
          const meta = getPanelTaskbarMeta(panelId);
          const isActive = activeSet.has(panelId);
          const isLoading = loadingSet.has(panelId);

          return (
            <button
              key={panelId}
              type="button"
              className={`panel-taskbar-btn${isActive ? " panel-taskbar-btn--active" : ""}${
                isLoading ? " panel-taskbar-btn--loading" : ""
              }`}
              onClick={() => onActivate?.(panelId)}
              title={isLoading ? `${meta.title} (загрузка…)` : meta.title}
              aria-pressed={isActive}
              aria-busy={isLoading || undefined}
              aria-label={
                isActive
                  ? `Свернуть: ${meta.title}`
                  : isLoading
                    ? `Развернуть: ${meta.title} (идёт загрузка)`
                    : `Развернуть: ${meta.title}`
              }
            >
              <TaskbarIcon name={meta.icon} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
