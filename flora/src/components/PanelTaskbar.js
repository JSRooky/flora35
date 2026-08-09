import React, { useMemo } from "react";
import { getPanelTaskbarMeta } from "../panelTaskbarRegistry";
import "../styles/PanelTaskbar.css";

function TaskbarIcon({ name }) {
  const common = {
    className: "panel-taskbar-icon",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
    focusable: false
  };

  switch (name) {
    case "radius":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "buffer":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.55" />
        </svg>
      );
    case "polygon":
      return (
        <svg {...common}>
          <path
            d="M7 4l10 3 3 10-9 4-7-7z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "area":
      return (
        <svg {...common}>
          <rect
            x="5"
            y="5"
            width="14"
            height="14"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case "status":
      return (
        <svg {...common}>
          <path
            d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "clusters":
      return (
        <svg {...common}>
          <circle cx="9" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="9" r="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="14" cy="16" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "dense":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2" fill="currentColor" />
          <circle cx="12" cy="8" r="2" fill="currentColor" />
          <circle cx="16" cy="8" r="2" fill="currentColor" />
          <circle cx="8" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="16" cy="12" r="2" fill="currentColor" />
          <circle cx="10" cy="16" r="2" fill="currentColor" />
          <circle cx="14" cy="16" r="2" fill="currentColor" />
        </svg>
      );
    case "year":
      return (
        <svg {...common}>
          <rect
            x="4"
            y="5"
            width="16"
            height="15"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M8 3v4M16 3v4M4 10h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "oopt":
    case "ooptFeature":
      return (
        <svg {...common}>
          <path
            d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "submit":
      return (
        <svg {...common}>
          <path d="M12 5v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 9l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 19h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "gbif":
    case "gbifProcessing":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M4 12h16M12 4c2.5 2.8 2.5 13.2 0 16M12 4c-2.5 2.8-2.5 13.2 0 16" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "speciesList":
      return (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="4" cy="6" r="1.2" fill="currentColor" />
          <circle cx="4" cy="12" r="1.2" fill="currentColor" />
          <circle cx="4" cy="18" r="1.2" fill="currentColor" />
        </svg>
      );
    case "point":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

/** Нижняя панель задач: свёрнутые панели + подсветка активной. */
export default function PanelTaskbar({
  items = [],
  activeIds = [],
  onActivate,
  bottomOccupyPx = 0
}) {
  const activeSet = useMemo(() => new Set(activeIds), [activeIds]);

  if (!items.length) {
    return null;
  }

  return (
    <div
      className="panel-taskbar"
      style={
        bottomOccupyPx > 0
          ? { bottom: `${bottomOccupyPx}px` }
          : undefined
      }
      aria-label="Панель задач"
    >
      <div className="panel-taskbar-bar" role="toolbar" aria-label="Панели">
        {items.map((panelId) => {
          const meta = getPanelTaskbarMeta(panelId);
          const isActive = activeSet.has(panelId);

          return (
            <button
              key={panelId}
              type="button"
              className={`panel-taskbar-btn${isActive ? " panel-taskbar-btn--active" : ""}`}
              onClick={() => onActivate?.(panelId)}
              title={meta.title}
              aria-pressed={isActive}
              aria-label={isActive ? `Свернуть: ${meta.title}` : `Развернуть: ${meta.title}`}
            >
              <TaskbarIcon name={meta.icon} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
