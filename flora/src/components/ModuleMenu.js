import React, { useCallback, useEffect, useRef, useState } from "react";
import { ReactComponent as MainLogo } from "../images/main_logo.svg";
import { DatabaseIcon, LayersArchiveIcon } from "../images/buttons";
import { DATA_SOURCE_OPTIONS, VISIBLE_DATA_SOURCE_OPTIONS } from "../locations/loadPoints";
import UserAccountControl from "./UserAccountControl";
import "../styles/ModuleMenu.css";

const HOME_URL = `${process.env.PUBLIC_URL || ""}/`;

export const MODULE_IDS = {
  STATUS: "status",
  REGNUM: "regnum",
  MAP: "map",
  YEAR: "year",
  TIMELINE: "timeline",
  SEASONALITY: "seasonality",
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
  // Плотные группы — раздел справки ## dense (кнопка «Обработка» в «Группы точек»).
  DENSE: "dense",
  // Модуль ввода пользовательских данных в Firestore.
  SUBMIT: "submit",
  // Модуль загрузки находок GBIF на отдельный слой карты.
  GBIF: "gbif",
  /** @deprecated Используйте DATA_SOURCES */
  GBIF_LEGACY: "gbif",
  DATA_SOURCES: "data-sources",
  TEMP_ARCHIVE: "temp-archive",
  EXTERNAL_PROCESSING: "external-processing",
  /** @deprecated Используйте EXTERNAL_PROCESSING */
  GBIF_PROCESSING: "external-processing",
  // Инструменты работы с внешними данными (меню «Инструменты»).
  DATA_WORK: "data-work",
  SEARCH: "search",
  // Поиск редких видов по пользовательскому списку (Красная книга).
  REDBOOK: "redbook",
  REGIONS: "regions",
  ABOUT: "about"
};

const POINT_MODULE_ITEMS = [
  { id: MODULE_IDS.FEATURE, label: "О точке" },
  { id: MODULE_IDS.STATUS, label: "Статус" }
];

const TIME_MODULE_ITEMS = [
  { id: MODULE_IDS.YEAR, label: "Год находки", timeAccent: true },
  { id: MODULE_IDS.TIMELINE, label: "Таймлайн", timeAccent: true },
  { id: MODULE_IDS.SEASONALITY, label: "Сезонность", timeAccent: true }
];

const MAP_DISPLAY_MODULE_ITEM = {
  id: MODULE_IDS.MAP,
  label: "Группы точек",
  mapToolAccent: true
};

/** Инструменты карты в выпадающем меню «Инструменты». */
const TOOL_MODULE_ITEMS = [
  { id: MODULE_IDS.SEARCH, label: "Поиск", mapToolAccent: true },
  { id: MODULE_IDS.AREAL, label: "Радиус", mapToolAccent: true },
  { id: MODULE_IDS.BUFFER, label: "Буфер", mapToolAccent: true },
  { id: MODULE_IDS.POLYGON, label: "Полигон", mapToolAccent: true },
  { id: MODULE_IDS.AREA, label: "Область", mapToolAccent: true },
  { id: MODULE_IDS.OOPT, label: "ООПТ", mapToolAccent: true },
  { id: MODULE_IDS.DATA_WORK, label: "Работа с данными", mapToolAccent: true }
];

const TOOL_MODULE_IDS = new Set([
  ...TOOL_MODULE_ITEMS.map((item) => item.id),
  MODULE_IDS.OOPT_FEATURE
]);

const TEST_MODULE_ITEMS = [
  { id: MODULE_IDS.SUBMIT, label: "Новая находка" }
];

const REDBOOK_MODULE_ITEM = { id: MODULE_IDS.REDBOOK, label: "Красная книга" };

const DATA_SOURCES_MODULE_ITEM = {
  id: MODULE_IDS.DATA_SOURCES,
  label: "Источники данных"
};

const TEMP_ARCHIVE_MODULE_ITEM = {
  id: MODULE_IDS.TEMP_ARCHIVE,
  label: "Архив слоёв"
};

const ABOUT_MODULE_ITEM = { id: MODULE_IDS.ABOUT, label: "О проекте" };

function isPointRequiredModule(id) {
  return id === MODULE_IDS.AREAL || id === MODULE_IDS.BUFFER;
}

function isToolModuleActive(activeModule) {
  return TOOL_MODULE_IDS.has(activeModule);
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
  icon = null,
  // Некоторые модули (например, «Радиус») требуют предварительного выбора точки.
  disabled = false,
  disabledTitle = DISABLED_POINT_REQUIRED_TITLE
}) {
  const iconOnly = Boolean(icon);
  const button = (
    <button
      type="button"
      className={`module-menu-btn${iconOnly ? " module-menu-btn--icon" : ""}${activeModule === id ? " module-menu-btn--active" : ""}${timeAccent ? " module-menu-btn--time" : ""}${mapToolAccent ? " module-menu-btn--map-tool" : ""}${disabled ? " module-menu-btn--disabled" : ""}${className ? ` ${className}` : ""}`}
      onClick={() => !disabled && onModuleSelect(id)}
      aria-pressed={activeModule === id}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      disabled={disabled}
    >
      {icon ?? label}
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

function getToolItemDisabledState(id, { pointSelected, arealBlocked, bufferBlocked }) {
  const pointRequired = isPointRequiredModule(id) && !pointSelected;
  const blockedByOtherTool =
    (id === MODULE_IDS.AREAL && arealBlocked) || (id === MODULE_IDS.BUFFER && bufferBlocked);
  const disabled = pointRequired || blockedByOtherTool;
  const disabledTitle = pointRequired
    ? DISABLED_POINT_REQUIRED_TITLE
    : id === MODULE_IDS.AREAL
      ? DISABLED_AREAL_BY_BUFFER_TITLE
      : DISABLED_BUFFER_BY_AREAL_TITLE;

  return { disabled, disabledTitle };
}

function ToolsDropdown({
  activeModule,
  onModuleSelect,
  pointSelected,
  arealBlocked,
  bufferBlocked
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const toolsActive = isToolModuleActive(activeModule);
  const activeToolLabel =
    TOOL_MODULE_ITEMS.find((item) => item.id === activeModule)?.label ||
    (activeModule === MODULE_IDS.OOPT_FEATURE ? "ООПТ" : null);

  const handleDocumentClick = useCallback(
    (event) => {
      if (!open) {
        return;
      }

      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
      }
    },
    [open]
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick, open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleSelect = (id) => {
    onModuleSelect(id);
    setOpen(false);
  };

  return (
    <div className="module-menu-tools" ref={wrapRef}>
      <button
        type="button"
        className={`module-menu-btn module-menu-btn--map-tool module-menu-tools-trigger${
          toolsActive ? " module-menu-btn--active" : ""
        }${open ? " module-menu-tools-trigger--open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={activeToolLabel ? `Инструменты · ${activeToolLabel}` : "Инструменты"}
      >
        <span>Инструменты</span>
        <span className="module-menu-tools-chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <ul className="module-menu-tools-dropdown" role="menu" aria-label="Инструменты карты">
          {TOOL_MODULE_ITEMS.map(({ id, label }) => {
            const { disabled, disabledTitle } = getToolItemDisabledState(id, {
              pointSelected,
              arealBlocked,
              bufferBlocked
            });
            const itemActive =
              activeModule === id ||
              (id === MODULE_IDS.OOPT && activeModule === MODULE_IDS.OOPT_FEATURE);

            const itemButton = (
              <button
                type="button"
                className={`module-menu-tools-item${
                  itemActive ? " module-menu-tools-item--active" : ""
                }${disabled ? " module-menu-tools-item--disabled" : ""}`}
                role="menuitem"
                disabled={disabled}
                aria-current={itemActive ? "true" : undefined}
                onClick={() => !disabled && handleSelect(id)}
              >
                {label}
              </button>
            );

            return (
              <li key={id} role="none">
                {disabled ? (
                  <span className="module-menu-btn-wrap" title={disabledTitle}>
                    {itemButton}
                  </span>
                ) : (
                  itemButton
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
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
  dataSourceMode,
  onDataSourceModeChange,
  dataSourcesPanelOpen = false,
  onDataSourcesPanelToggle,
  tempArchivePanelOpen = false,
  onTempArchivePanelToggle,
  accountUser = null,
  onAccountClick
}) {
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
          {renderModuleItem(MAP_DISPLAY_MODULE_ITEM)}
          <li>
            <ToolsDropdown
              activeModule={activeModule}
              onModuleSelect={onModuleSelect}
              pointSelected={pointSelected}
              arealBlocked={arealBlocked}
              bufferBlocked={bufferBlocked}
            />
          </li>
          <li className="module-menu-separator module-menu-separator--push-end" aria-hidden="true" />
          {TEST_MODULE_ITEMS.map(renderModuleItem)}
          <li className="module-menu-separator" aria-hidden="true" />
          {renderModuleItem(REDBOOK_MODULE_ITEM)}
          <li className="module-menu-separator" aria-hidden="true" />
          <li className="module-menu-toggle-item module-menu-data-source">
            <label className="module-menu-data-source-field" htmlFor="module-menu-data-source-select">
              <span className="module-menu-data-source-label">Слой данных</span>
              <select
                id="module-menu-data-source-select"
                className="module-menu-data-source-select"
                value={dataSourceMode}
                title={
                  DATA_SOURCE_OPTIONS.find(({ value }) => value === dataSourceMode)?.title
                }
                onChange={(event) => onDataSourceModeChange?.(event.target.value)}
              >
                {VISIBLE_DATA_SOURCE_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </li>
          <li>
            <ModuleMenuButton
              id={DATA_SOURCES_MODULE_ITEM.id}
              label={DATA_SOURCES_MODULE_ITEM.label}
              icon={<DatabaseIcon className="module-menu-btn-icon" aria-hidden="true" focusable="false" />}
              activeModule={
                dataSourcesPanelOpen ? MODULE_IDS.DATA_SOURCES : activeModule
              }
              onModuleSelect={onDataSourcesPanelToggle}
            />
          </li>
          <li>
            <ModuleMenuButton
              id={TEMP_ARCHIVE_MODULE_ITEM.id}
              label={TEMP_ARCHIVE_MODULE_ITEM.label}
              icon={<LayersArchiveIcon className="module-menu-btn-icon" aria-hidden="true" focusable="false" />}
              activeModule={
                tempArchivePanelOpen ? MODULE_IDS.TEMP_ARCHIVE : activeModule
              }
              onModuleSelect={onTempArchivePanelToggle}
            />
          </li>
          <li>
            <ModuleMenuButton
              id={MODULE_IDS.REGIONS}
              label="Регионы"
              mapToolAccent
              activeModule={activeModule}
              onModuleSelect={onModuleSelect}
            />
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
              icon={<span className="module-menu-btn-question" aria-hidden="true">?</span>}
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
