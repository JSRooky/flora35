import React from "react";
import "../styles/ModuleMenu.css";

export const MODULE_IDS = {
  STATUS: "status",
  MAP: "map",
  YEAR: "year",
  FEATURE: "feature",
  AREAL: "areal",
  ABOUT: "about"
};

const MAIN_MODULE_ITEMS = [
  { id: MODULE_IDS.FEATURE, label: "Сведения о точке" },
  { id: MODULE_IDS.AREAL, label: "Ареал" },
  { id: MODULE_IDS.YEAR, label: "Год находки" },
  { id: MODULE_IDS.STATUS, label: "Статус МСОП" },
  { id: MODULE_IDS.MAP, label: "Операции с картой" }
];

const ABOUT_MODULE_ITEM = { id: MODULE_IDS.ABOUT, label: "О проекте" };

function ModuleMenuButton({ id, label, activeModule, onModuleSelect, className = "" }) {
  return (
    <button
      type="button"
      className={`module-menu-btn${activeModule === id ? " module-menu-btn--active" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => onModuleSelect(id)}
      aria-pressed={activeModule === id}
    >
      {label}
    </button>
  );
}

export default function ModuleMenu({ activeModule, onModuleSelect }) {
  return (
    <nav className="module-menu" aria-label="Модули приложения">
      <ul className="module-menu-list">
        {MAIN_MODULE_ITEMS.map(({ id, label }) => (
          <li key={id}>
            <ModuleMenuButton
              id={id}
              label={label}
              activeModule={activeModule}
              onModuleSelect={onModuleSelect}
            />
          </li>
        ))}
        <li className="module-menu-item--about">
          <ModuleMenuButton
            id={ABOUT_MODULE_ITEM.id}
            label={ABOUT_MODULE_ITEM.label}
            activeModule={activeModule}
            onModuleSelect={onModuleSelect}
          />
        </li>
      </ul>
    </nav>
  );
}
