import React, { useState } from "react";
import { ModuleHelpButton, ModuleHelpPanel } from "./ModuleHelp";
import { MODULE_IDS } from "./ModuleMenu";
import PanelCloseButton from "./PanelCloseButton";
import PanelMinimizeButton from "./PanelMinimizeButton";
import "../styles/SeasonalityPanel.css";

const MONTH_LABELS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек"
];

/**
 * Панель сезонности: гистограмма находок по месяцам для вида выбранной точки.
 */
export default function SeasonalityPanel({
  nameLatin = null,
  nameRu = null,
  stats = null,
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

  const hasSpecies = Boolean(nameLatin);
  const maxCount = stats?.byMonth?.length
    ? Math.max(0, ...stats.byMonth)
    : 0;

  return (
    <aside
      className={`seasonality-panel ${collapsed ? "seasonality-panel--collapsed" : ""}`}
    >
      <div className="seasonality-panel-header">
        <h3 className="seasonality-panel-title">Сезонность</h3>
        <div className="popup-panel-header-actions">
          <ModuleHelpButton open={helpOpen} onClick={() => setHelpOpen((value) => !value)} />
          {onMinimize ? <PanelMinimizeButton onClick={onMinimize} /> : null}
          <button
            type="button"
            className="seasonality-panel-toggle"
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
        <div className="seasonality-panel-content">
          {!hasSpecies ? (
            <p className="seasonality-panel-empty">
              Выберите точку с латинским названием вида.
            </p>
          ) : (
            <>
              <div className="seasonality-panel-species">
                {nameRu ? (
                  <div className="seasonality-panel-species-ru">{nameRu}</div>
                ) : null}
                <div className="seasonality-panel-species-latin">{nameLatin}</div>
              </div>

              {stats && stats.total === 0 ? (
                <p className="seasonality-panel-empty">
                  Нет точек этого вида в текущей выборке карты.
                </p>
              ) : null}

              {stats && stats.total > 0 ? (
                <>
                  <div className="seasonality-panel-summary">
                    <span>Всего: {stats.total}</span>
                    <span>С месяцем: {stats.withMonth}</span>
                    <span>Без месяца: {stats.unknownMonth}</span>
                  </div>

                  <div
                    className="seasonality-chart"
                    role="img"
                    aria-label="Находки по месяцам"
                  >
                    {MONTH_LABELS.map((label, index) => {
                      const count = stats.byMonth[index] ?? 0;
                      const heightPct =
                        maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;

                      return (
                        <div key={label} className="seasonality-chart-col">
                          <div className="seasonality-chart-bar-wrap">
                            <div
                              className="seasonality-chart-bar"
                              style={{ height: `${heightPct}%` }}
                              title={`${label}: ${count}`}
                            />
                          </div>
                          <div className="seasonality-chart-count">{count}</div>
                          <div className="seasonality-chart-label">{label}</div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="seasonality-panel-hint">
                    Для полных данных по внешним источникам перезагрузите их после
                    обновления приложения (месяц сохраняется при загрузке).
                  </p>
                </>
              ) : null}
            </>
          )}
        </div>
      )}

      <ModuleHelpPanel sectionId={MODULE_IDS.SEASONALITY} open={helpOpen} />
    </aside>
  );
}
