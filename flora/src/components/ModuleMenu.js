import React from "react";
import { ReactComponent as MainLogo } from "../images/main_logo.svg";
import { DATA_SOURCE_OPTIONS } from "../locations/loadPoints";
import "../styles/ModuleMenu.css";

const HOME_URL = `${process.env.PUBLIC_URL || ""}/`;

export const MODULE_IDS = {
  STATUS: "status",
  MAP: "map",
  YEAR: "year",
  TIMELINE: "timeline",
  FEATURE: "feature",
  AREAL: "areal",
  // Совпадает с заголовком ## polygon в docs/moduleHelp.md.
  POLYGON: "polygon",
  // Совпадает с заголовком ## buffer в docs/moduleHelp.md.
  BUFFER: "buffer",
  // Совпадает с заголовком ## area в docs/moduleHelp.md.
  AREA: "area",
  // Экспериментальный модуль ввода пользовательских данных через Firebase.
  SUBMIT: "submit",
  ABOUT: "about"
};

const POINT_MODULE_ITEMS = [
  { id: MODULE_IDS.FEATURE, label: "Сведения о точке" },
  { id: MODULE_IDS.STATUS, label: "Статус МСОП" }
];

const TIME_MODULE_ITEMS = [
  { id: MODULE_IDS.YEAR, label: "Год находки", timeAccent: true },
  { id: MODULE_IDS.TIMELINE, label: "Таймлайн", timeAccent: true }
];

const MAP_MODULE_ITEMS = [
  { id: MODULE_IDS.MAP, label: "Группы точек", mapToolAccent: true },
  { id: MODULE_IDS.AREAL, label: "Радиус", mapToolAccent: true },
  { id: MODULE_IDS.BUFFER, label: "Буфер", mapToolAccent: true },
  { id: MODULE_IDS.POLYGON, label: "Полигон", mapToolAccent: true },
  { id: MODULE_IDS.AREA, label: "Область", mapToolAccent: true }
];

const TEST_MODULE_ITEMS = [
  { id: MODULE_IDS.SUBMIT, label: "Ввод данных о находке" }
];

const ABOUT_MODULE_ITEM = { id: MODULE_IDS.ABOUT, label: "О проекте" };

function isPointRequiredModule(id) {
  return id === MODULE_IDS.AREAL || id === MODULE_IDS.BUFFER;
}

const DISABLED_POINT_REQUIRED_TITLE = "Выберите точку";

function ModuleMenuButton({
  id,
  label,
  activeModule,
  onModuleSelect,
  className = "",
  timeAccent = false,
  mapToolAccent = false,
  // Некоторые модули (например, «Радиус») требуют предварительного выбора точки.
  disabled = false
}) {
  const button = (
    <button
      type="button"
      className={`module-menu-btn${activeModule === id ? " module-menu-btn--active" : ""}${timeAccent ? " module-menu-btn--time" : ""}${mapToolAccent ? " module-menu-btn--map-tool" : ""}${disabled ? " module-menu-btn--disabled" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => !disabled && onModuleSelect(id)}
      aria-pressed={activeModule === id}
      disabled={disabled}
    >
      {label}
    </button>
  );

  // У disabled-кнопок не срабатывает title, поэтому оборачиваем в span.
  if (disabled) {
    return (
      <span className="module-menu-btn-wrap" title={DISABLED_POINT_REQUIRED_TITLE}>
        {button}
      </span>
    );
  }

  return button;
}

export default function ModuleMenu({
  activeModule,
  onModuleSelect,
  pointSelected = false,
  hoverTooltipsDisabled = false,
  onHoverTooltipsDisabledChange,
  osmBasemapEnabled = false,
  onOsmBasemapEnabledChange,
  dataSourceMode,
  onDataSourceModeChange
}) {
  const renderModuleItem = ({ id, label, timeAccent = false, mapToolAccent = false }) => (
    <li key={id}>
      <ModuleMenuButton
        id={id}
        label={label}
        activeModule={activeModule}
        onModuleSelect={onModuleSelect}
        timeAccent={timeAccent}
        mapToolAccent={mapToolAccent}
        disabled={isPointRequiredModule(id) && !pointSelected}
      />
    </li>
  );

  return (
    <nav className="module-menu" aria-label="Модули приложения">
      <div className="module-menu-dock">
        <a
          href={HOME_URL}
          className="module-menu-logo-link"
          aria-label="На главную страницу"
          title="На главную страницу"
        >
          <MainLogo className="module-menu-logo" aria-hidden="true" focusable="false" />
        </a>
        <ul className="module-menu-list">
          {POINT_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator" aria-hidden="true" />
          {TIME_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator" aria-hidden="true" />
          {MAP_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator module-menu-separator--push-end" aria-hidden="true" />
          {TEST_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator" aria-hidden="true" />
          <li className="module-menu-toggle-item module-menu-data-source">
            <label className="module-menu-data-source-field" htmlFor="module-menu-data-source-select">
              <span className="module-menu-data-source-label">Точки</span>
              <select
                id="module-menu-data-source-select"
                className="module-menu-data-source-select"
                value={dataSourceMode}
                title={
                  DATA_SOURCE_OPTIONS.find(({ value }) => value === dataSourceMode)?.title
                }
                onChange={(event) => onDataSourceModeChange?.(event.target.value)}
              >
                {DATA_SOURCE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </li>
          <li className="module-menu-toggle-item">
            <label className="module-menu-switch" title="Использовать подложку OpenStreetMap вместо стандартной карты">
              <input
                type="checkbox"
                checked={osmBasemapEnabled}
                onChange={(event) => onOsmBasemapEnabledChange?.(event.target.checked)}
              />
              <span className="module-menu-switch-slider" aria-hidden="true" />
              <span className="module-menu-switch-label">OpenStreetMap</span>
            </label>
          </li>
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
