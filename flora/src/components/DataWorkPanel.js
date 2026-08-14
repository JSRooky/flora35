import React, { useState } from "react";
import { DATA_WORK_TOOLS } from "../dataWork/dataWorkTools";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/DataWorkPanel.css";

/**
 * Хаб «Работа с данными»: список инструментов.
 * По нажатию открывается отдельное окно инструмента (через onOpenTool).
 */
export default function DataWorkPanel({
  collapsed: collapsedProp,
  onCollapsedChange,
  onMinimize,
  onClose,
  onOpenTool,
  activeToolId = null
}) {
  const [collapsedInternal, setCollapsedInternal] = useState(false);
  const isControlled = collapsedProp !== undefined;
  const collapsed = isControlled ? collapsedProp : collapsedInternal;
  const setCollapsed = onCollapsedChange ?? setCollapsedInternal;
  const toggleLabel = collapsed ? "Развернуть" : "Свернуть";
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <aside
      className={`data-work-panel${collapsed ? " data-work-panel--collapsed" : ""}`}
      aria-label="Работа с данными"
    >
      <div className="data-work-panel-header">
        <h3 className="data-work-panel-title">Работа с данными</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton
            mapToolAccent
            open={helpOpen}
            onClick={() => setHelpOpen((value) => !value)}
          />
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
        <p className="data-work-panel-summary">список инструментов</p>
      ) : (
        <div className="data-work-panel-content">
          <p className="data-work-panel-note">
            Выберите инструмент — он откроется в отдельном окне.
          </p>

          <ul className="data-work-tool-list">
            {DATA_WORK_TOOLS.map((tool) => {
              const isActive = activeToolId === tool.id;
              return (
                <li key={tool.id} className="data-work-tool-list-item">
                  <button
                    type="button"
                    className={`data-work-tool-button${
                      isActive ? " data-work-tool-button--active" : ""
                    }`}
                    aria-pressed={isActive}
                    onClick={() => onOpenTool?.(tool.id)}
                  >
                    <span className="data-work-tool-button-title">{tool.title}</span>
                    {tool.description ? (
                      <span className="data-work-tool-button-desc">{tool.description}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ModuleHelpPanel mapToolAccent sectionId={MODULE_IDS.DATA_WORK} open={helpOpen} />
    </aside>
  );
}
