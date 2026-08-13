import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/StatusFilterPanel.css";

/** Коды и подписи категорий МСОП (IUCN Red List) + None для списка без статуса. */
export const STATUS_OPTIONS = [
  { code: "EX", label: "Исчезнувший" },
  { code: "EW", label: "Исчезнувший в дикой природе" },
  { code: "CR", label: "Находящийся на грани исчезновения" },
  { code: "EN", label: "Находящийся под угрозой исчезновения" },
  { code: "VU", label: "Уязвимый" },
  { code: "NT", label: "Близкий к уязвимому положению" },
  { code: "LC", label: "Вызывающий наименьшие опасения" },
  { code: "None", label: "Без статуса" }
];

/** Панель фильтра точек по природоохранному статусу (МСОП). */
export default function StatusFilterPanel({
  activeStatusFilters = [],
  onStatusFilterChange,
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
  const [helpOpen, setHelpOpen] = useState(false); // раздел ## status в docs/moduleHelp.md

  return (
    <aside
      className={`status-filter-panel ${collapsed ? "status-filter-panel--collapsed" : ""}`}
    >
      <div className="status-filter-panel-header">
        <h3 className="status-filter-panel-title">Статус</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="status-filter-panel-toggle"
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
        <div className="status-filter-panel-content">
          <div className="status-filter-list">
            {STATUS_OPTIONS.map(({ code, label }) => (
              <label key={code} className="status-filter-item">
                <input
                  type="checkbox"
                  checked={activeStatusFilters.includes(code)}
                  onChange={(e) => onStatusFilterChange?.(code, e.target.checked)}
                />
                <span className="status-filter-code">{code}</span>
                <span className="status-filter-label">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <ModuleHelpPanel sectionId={MODULE_IDS.STATUS} open={helpOpen} />
    </aside>
  );
}
