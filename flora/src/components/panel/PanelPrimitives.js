import React from "react";
import "../../styles/panelUi.css";

/**
 * Базовый примитив разметки панелей.
 *
 * Одинаковые отступы, типографика и поведение у всех панелей вместо
 * копирования разметки в каждом файле. Панель — это набор PanelSection,
 * внутри которых лежат PanelSwitch / PanelField / PanelActions.
 */

/** Заголовок раздела панели с необязательными действиями справа. */
export function PanelSection({ title, hint, actions = null, children, className = "" }) {
  return (
    <section className={`panel-section${className ? ` ${className}` : ""}`}>
      {(title || actions) && (
        <div className="panel-section-header">
          {title ? <h4 className="panel-section-title">{title}</h4> : <span />}
          {actions ? <div className="panel-section-actions">{actions}</div> : null}
        </div>
      )}
      {hint ? <p className="panel-section-hint">{hint}</p> : null}
      <div className="panel-section-body">{children}</div>
    </section>
  );
}

/**
 * Переключатель «подпись + значение» в стиле панелей.
 * @param {object} props
 * @param {string} props.label — текст переключателя
 * @param {boolean} props.checked
 * @param {(checked: boolean) => void} [props.onChange]
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint] — всплывающая подсказка (title)
 * @param {boolean} [props.nested] — вложенный уровень (отступ слева)
 */
export function PanelSwitch({
  label,
  checked = false,
  onChange,
  disabled = false,
  hint,
  nested = false,
  id,
  className = ""
}) {
  const classes = [
    "panel-switch",
    nested ? "panel-switch--nested" : "",
    disabled ? "panel-switch--disabled" : "",
    className
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes} title={hint || undefined}>
      <input
        type="checkbox"
        id={id}
        checked={Boolean(checked)}
        disabled={Boolean(disabled)}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className="panel-switch-slider" aria-hidden="true" />
      <span className="panel-switch-label">{label}</span>
    </label>
  );
}

/**
 * Строка «подпись — контрол»: подпись в своей колонке, контрол занимает остаток.
 * Значение-подсказка выводится рядом с подписью.
 */
export function PanelField({ label, value, hint, htmlFor, children, className = "" }) {
  return (
    <label className={`panel-field${className ? ` ${className}` : ""}`} htmlFor={htmlFor}>
      <span className="panel-field-label">
        <span className="panel-field-label-text">{label}</span>
        {value != null && value !== "" ? <span className="panel-field-value">{value}</span> : null}
      </span>
      {children ? <span className="panel-field-control">{children}</span> : null}
      {hint ? <span className="panel-field-hint">{hint}</span> : null}
    </label>
  );
}

/** Ряд кнопок действий внизу раздела. */
export function PanelActions({ children, className = "" }) {
  return <div className={`panel-actions${className ? ` ${className}` : ""}`}>{children}</div>;
}

/** Пустое состояние: «пока нет данных», «выберите точку» и т.п. */
export function PanelEmpty({ children, className = "" }) {
  return <p className={`panel-empty${className ? ` ${className}` : ""}`}>{children}</p>;
}

/** Пояснение под контролом (мелкий серый текст). */
export function PanelHint({ children, className = "" }) {
  return <p className={`panel-hint${className ? ` ${className}` : ""}`}>{children}</p>;
}
