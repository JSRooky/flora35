import React from "react";
import { MinimizeIcon } from "../images/buttons";
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
      <MinimizeIcon className="panel-minimize-btn-icon" aria-hidden="true" focusable="false" />
    </button>
  );
}
