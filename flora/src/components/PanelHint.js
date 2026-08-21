import React, { useState } from "react";
import "../styles/PanelHint.css";

/**
 * Короткая подсказка панели: свёрнута по умолчанию, чтобы не занимать место.
 */
export default function PanelHint({ children, defaultOpen = false, className = "" }) {
  const [open, setOpen] = useState(defaultOpen);

  if (children == null || children === false) {
    return null;
  }

  return (
    <div
      className={`panel-hint${open ? " panel-hint--open" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="panel-hint-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>Подсказка</span>
        <span className="panel-hint-chevron" aria-hidden="true">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open ? <div className="panel-hint-body">{children}</div> : null}
    </div>
  );
}
