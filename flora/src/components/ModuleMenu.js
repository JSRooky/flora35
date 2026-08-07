import React from "react";
import { ReactComponent as MainLogo } from "../images/main_logo.svg";
import { DATA_SOURCE_OPTIONS } from "../locations/loadPoints";
import { BASEMAP_MODES, BASEMAP_OPTIONS } from "../config/basemapOptions";
import { isYandexMapsApiKeyConfigured } from "./addYandexBasemapLayer";
import UserAccountControl from "./UserAccountControl";
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
  OOPT: "oopt",
  // Совпадает с заголовком ## oopt-feature в docs/moduleHelp.md.
  OOPT_FEATURE: "oopt-feature",
  // Модуль ввода пользовательских данных в Firestore.
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
  { id: MODULE_IDS.AREA, label: "Область", mapToolAccent: true },
  { id: MODULE_IDS.OOPT, label: "ООПТ", mapToolAccent: true }
];

const TEST_MODULE_ITEMS = [
  { id: MODULE_IDS.SUBMIT, label: "Новая находка" }
];

const ABOUT_MODULE_ITEM = { id: MODULE_IDS.ABOUT, label: "О проекте" };

function isPointRequiredModule(id) {
  return id === MODULE_IDS.AREAL || id === MODULE_IDS.BUFFER;
}

const DISABLED_POINT_REQUIRED_TITLE = "Выберите точку";
const DISABLED_AREAL_BY_BUFFER_TITLE = 'Сначала сбросьте инструмент «Буфер»';
const DISABLED_BUFFER_BY_AREAL_TITLE = 'Сначала сбросьте инструмент «Радиус»';

function ModuleMenuButton({
  id,
  label,
  activeModule,
  onModuleSelect,
  className = "",
  timeAccent = false,
  mapToolAccent = false,
  // Некоторые модули (например, «Радиус») требуют предварительного выбора точки.
  disabled = false,
  disabledTitle = DISABLED_POINT_REQUIRED_TITLE
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
      <span className="module-menu-btn-wrap" title={disabledTitle}>
        {button}
      </span>
    );
  }

  return button;
}

/** Верхнее меню модулей приложения: выбор активного модуля и общие переключатели карты. */
export default function ModuleMenu({
  activeModule,
  onModuleSelect,
  pointSelected = false,
  arealBlocked = false,
  bufferBlocked = false,
  hoverTooltipsDisabled = false,
  onHoverTooltipsDisabledChange,
  basemapMode = BASEMAP_MODES.MAPBOX,
  onBasemapModeChange,
  dataSourceMode,
  onDataSourceModeChange,
  accountUser = null,
  onAccountClick
}) {
  const yandexAvailable = isYandexMapsApiKeyConfigured();

  const renderModuleItem = ({ id, label, timeAccent = false, mapToolAccent = false }) => {
    const pointRequired = isPointRequiredModule(id) && !pointSelected;
    // Радиус и Буфер — взаимоисключающие инструменты карты, активный блокирует другой.
    const blockedByOtherTool =
      (id === MODULE_IDS.AREAL && arealBlocked) || (id === MODULE_IDS.BUFFER && bufferBlocked);
    const disabled = pointRequired || blockedByOtherTool;
    const disabledTitle = pointRequired
      ? DISABLED_POINT_REQUIRED_TITLE
      : id === MODULE_IDS.AREAL
        ? DISABLED_AREAL_BY_BUFFER_TITLE
        : DISABLED_BUFFER_BY_AREAL_TITLE;

    return (
      <li key={id}>
        <ModuleMenuButton
          id={id}
          label={label}
          activeModule={activeModule}
          onModuleSelect={onModuleSelect}
          timeAccent={timeAccent}
          mapToolAccent={mapToolAccent}
          disabled={disabled}
          disabledTitle={disabledTitle}
        />
      </li>
    );
  };

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
          <li className="module-menu-toggle-item module-menu-data-source">
            <label className="module-menu-data-source-field" htmlFor="module-menu-basemap-select">
              <span className="module-menu-data-source-label">Карты</span>
              <select
                id="module-menu-basemap-select"
                className="module-menu-data-source-select"
                value={basemapMode}
                title={
                  BASEMAP_OPTIONS.find(({ value }) => value === basemapMode)?.title
                }
                onChange={(event) => onBasemapModeChange?.(event.target.value)}
              >
                {BASEMAP_OPTIONS.map(({ value, label, title }) => {
                  const disabled = value === BASEMAP_MODES.YANDEX && !yandexAvailable;
                  return (
                    <option
                      key={value}
                      value={value}
                      disabled={disabled}
                      title={
                        disabled
                          ? "Задайте REACT_APP_YANDEX_MAPS_API_KEY в .env.local"
                          : title
                      }
                    >
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
          </li>
          <li className="module-menu-toggle-item">
            <label className="module-menu-switch" title="Показывать подсказки при наведении на точки и кластеры">
              <input
                type="checkbox"
                checked={!hoverTooltipsDisabled}
                onChange={(event) => onHoverTooltipsDisabledChange?.(!event.target.checked)}
              />
              <span className="module-menu-switch-slider" aria-hidden="true" />
              <span className="module-menu-switch-label">Подсказки</span>
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
          <li className="module-menu-separator" aria-hidden="true" />
          <li className="module-menu-account-item">
            <UserAccountControl user={accountUser} onAccountClick={onAccountClick} />
          </li>
        </ul>
      </div>
    </nav>
  );
}
