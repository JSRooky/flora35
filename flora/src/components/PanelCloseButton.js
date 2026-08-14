import React from "react";
import "../styles/PanelCloseButton.css";

/** Кнопка полного закрытия плавающей панели (не в панель задач). */
export default function PanelCloseButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="popup-panel-toggle panel-close-btn"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label="Закрыть"
      title="Закрыть"
    >
      ×
    </button>
  );
}
