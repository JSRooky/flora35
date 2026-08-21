import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelHint from "./PanelHint";
import PanelMinimizeButton from "./PanelMinimizeButton";
import { REGNUM_ORDER, getRegnumLabel } from "./featurePropertyLabels";
import { getPointColorForRegnum } from "./pointColors";
import "../styles/RegnumFilterPanel.css";

/** Значение фильтра для точек без поля regnum. */
export const REGNUM_FILTER_NONE = "";

/** Опции селектора царств (порядок как в списках видов). */
export const REGNUM_FILTER_OPTIONS = [
  ...REGNUM_ORDER.map((code) => ({
    code,
    label: getRegnumLabel(code)
  })),
  { code: REGNUM_FILTER_NONE, label: getRegnumLabel(null) }
];

/** Панель фильтра точек по царству (одно или несколько). */
export default function RegnumFilterPanel({
  activeRegnumFilters = [],
  onRegnumFilterChange,
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(true);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <aside
      className={`regnum-filter-panel ${collapsed ? "regnum-filter-panel--collapsed" : ""}`}
    >
      <div className="regnum-filter-panel-header">
        <h3 className="regnum-filter-panel-title">Царство</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="regnum-filter-panel-toggle"
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

      {!collapsed && (
        <div className="regnum-filter-panel-content">
          <PanelHint>
            Отметьте одно или несколько царств. Без отметок показываются все точки.
          </PanelHint>
          <div className="regnum-filter-list">
            {REGNUM_FILTER_OPTIONS.map(({ code, label }) => {
              const color = getPointColorForRegnum(code || null);
              return (
                <label key={code || "__none__"} className="regnum-filter-item">
                  <input
                    type="checkbox"
                    checked={activeRegnumFilters.includes(code)}
                    onChange={(e) => onRegnumFilterChange?.(code, e.target.checked)}
                  />
                  <span
                    className="regnum-filter-swatch"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="regnum-filter-label">{label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.REGNUM} open={helpOpen} />
    </aside>
  );
}
