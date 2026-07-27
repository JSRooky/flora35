import React from "react";
import "../styles/ModuleMenu.css";

export const MODULE_IDS = {
  STATUS: "status",
  MAP: "map",
  YEAR: "year",
  FEATURE: "feature",
  AREAL: "areal",
  // Совпадает с заголовком ## polygon в docs/moduleHelp.md.
  POLYGON: "polygon",
  // Совпадает с заголовком ## buffer в docs/moduleHelp.md.
  BUFFER: "buffer",
  // Совпадает с заголовком ## area в docs/moduleHelp.md.
  AREA: "area",
  ABOUT: "about"
};

const FILTER_MODULE_ITEMS = [
  { id: MODULE_IDS.FEATURE, label: "Сведения о точке" },
  { id: MODULE_IDS.YEAR, label: "Год находки" },
  { id: MODULE_IDS.STATUS, label: "Статус МСОП" }
];

const MAP_MODULE_ITEMS = [
  { id: MODULE_IDS.MAP, label: "Группы точек" },
  { id: MODULE_IDS.AREAL, label: "Ареал" },
  { id: MODULE_IDS.POLYGON, label: "Полигон" },
  { id: MODULE_IDS.BUFFER, label: "Буфер" },
  { id: MODULE_IDS.AREA, label: "Область" }
];

const ABOUT_MODULE_ITEM = { id: MODULE_IDS.ABOUT, label: "О проекте" };

function isPointRequiredModule(id) {
  return (
    id === MODULE_IDS.AREAL || id === MODULE_IDS.POLYGON || id === MODULE_IDS.BUFFER
  );
}

function ModuleMenuButton({
  id,
  label,
  activeModule,
  onModuleSelect,
  className = "",
  // Некоторые модули (например, «Полигон») требуют предварительного выбора точки.
  disabled = false
}) {
  return (
    <button
      type="button"
      className={`module-menu-btn${activeModule === id ? " module-menu-btn--active" : ""}${disabled ? " module-menu-btn--disabled" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => !disabled && onModuleSelect(id)}
      aria-pressed={activeModule === id}
      disabled={disabled}
    >
      {label}
    </button>
  );
}

export default function ModuleMenu({
  activeModule,
  onModuleSelect,
  pointSelected = false,
  hoverTooltipsDisabled = false,
  onHoverTooltipsDisabledChange
}) {
  const renderModuleItem = ({ id, label }) => (
    <li key={id}>
      <ModuleMenuButton
        id={id}
        label={label}
        activeModule={activeModule}
        onModuleSelect={onModuleSelect}
        disabled={isPointRequiredModule(id) && !pointSelected}
      />
    </li>
  );

  return (
    <nav className="module-menu" aria-label="Модули приложения">
      <div className="module-menu-dock">
        <ul className="module-menu-list">
          {FILTER_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator" aria-hidden="true" />
          {MAP_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator module-menu-separator--push-end" aria-hidden="true" />
          <li className="module-menu-toggle-item">
            <label className="module-menu-switch" title="Отключить подсказки при наведении на точки и кластеры">
              <input
                type="checkbox"
                checked={hoverTooltipsDisabled}
                onChange={(event) => onHoverTooltipsDisabledChange?.(event.target.checked)}
              />
              <span className="module-menu-switch-slider" aria-hidden="true" />
              <span className="module-menu-switch-label">Отключить подсказки</span>
            </label>
          </li>
          <li>
            <ModuleMenuButton
              id={ABOUT_MODULE_ITEM.id}
              label={ABOUT_MODULE_ITEM.label}
              activeModule={activeModule}
              onModuleSelect={onModuleSelect}
            />
          </li>
        </ul>
      </div>
    </nav>
  );
}
