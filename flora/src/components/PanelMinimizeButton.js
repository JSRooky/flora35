import React from "react";
import "../styles/PanelMinimizeButton.css";

/** Кнопка «В панель задач» в шапке плавающей панели. */
export default function PanelMinimizeButton({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="popup-panel-toggle panel-minimize-btn"
      onClick={onClick}
      disabled={disabled || !onClick}
      aria-label="В панель задач"
      title="В панель задач"
    >
      <svg
        className="panel-minimize-btn-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M4 18h16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M12 4v10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 10l4 4 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
