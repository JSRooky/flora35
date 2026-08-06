import React, { useCallback, useEffect, useRef } from "react";

export default function MultiSpeciesEntryMenu({ open, disabled, onToggle, onSelectText, onSelectTable }) {
  const wrapRef = useRef(null);

  const handleDocumentClick = useCallback(
    (event) => {
      if (!open) {
        return;
      }

      if (!wrapRef.current?.contains(event.target)) {
        onToggle?.(false);
      }
    },
    [onToggle, open]
  );

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, [handleDocumentClick, open]);

  return (
    <div className="user-submission-multi-species-wrap" ref={wrapRef}>
      <button
        type="button"
        className="user-submission-multi-species"
        onClick={() => onToggle?.(!open)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Несколько видов
      </button>
      {open ? (
        <div className="user-submission-multi-species-menu" role="menu">
          <button
            type="button"
            className="user-submission-multi-species-menu-item"
            role="menuitem"
            onClick={onSelectText}
          >
            Строкой текста
          </button>
          <button
            type="button"
            className="user-submission-multi-species-menu-item"
            role="menuitem"
            onClick={onSelectTable}
          >
            Таблицей
          </button>
        </div>
      ) : null}
    </div>
  );
}
