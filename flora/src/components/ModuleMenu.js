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
  ABOUT: "about"
};

const MAIN_MODULE_ITEMS = [
  { id: MODULE_IDS.FEATURE, label: "Сведения о точке" },
  { id: MODULE_IDS.AREAL, label: "Ареал" },
  { id: MODULE_IDS.POLYGON, label: "Полигон" },
  { id: MODULE_IDS.BUFFER, label: "Буфер" },
  { id: MODULE_IDS.YEAR, label: "Год находки" },
  { id: MODULE_IDS.STATUS, label: "Статус МСОП" },
  { id: MODULE_IDS.MAP, label: "Операции с картой" }
];

const ABOUT_MODULE_ITEM = { id: MODULE_IDS.ABOUT, label: "О проекте" };

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

export default function ModuleMenu({ activeModule, onModuleSelect, pointSelected = false }) {
  return (
    <nav className="module-menu" aria-label="Модули приложения">
      <div className="module-menu-dock">
        <ul className="module-menu-list">
          {MAIN_MODULE_ITEMS.map(({ id, label }) => (
            <li key={id}>
              <ModuleMenuButton
                id={id}
                label={label}
                activeModule={activeModule}
                onModuleSelect={onModuleSelect}
                // «Полигон» и «Буфер» доступны только при выбранной точке на карте.
                disabled={
                  (id === MODULE_IDS.POLYGON || id === MODULE_IDS.BUFFER) && !pointSelected
                }
              />
            </li>
          ))}
          <li className="module-menu-separator" aria-hidden="true" />
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
