import React, { useCallback, useEffect, useRef, useState } from "react";
import { UserAccountIcon } from "../images/buttons";
import "../styles/UserAccountControl.css";

/**
 * Слот аккаунта в верхней панели.
 * По наведению открывает меню пользовательских настроек карты.
 */
export default function UserAccountControl({
  user = null,
  onSaveUserSettings,
  onLoadUserSettings,
  disabled = false
}) {
  const signedIn = Boolean(user?.id || user?.vkId);
  const displayName = user?.displayName?.trim() || "";
  const photoUrl = user?.photoUrl || "";
  const initials = (user?.initials || deriveInitials(displayName)).slice(0, 2);
  const fileInputRef = useRef(null);
  const hideTimerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const title = signedIn ? displayName || "Аккаунт VK" : "Вход через VK";
  const ariaLabel = signedIn
    ? `Аккаунт${displayName ? `: ${displayName}` : ""}`
    : "Вход через VK";

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearHideTimer();
    setMenuOpen(true);
  }, [clearHideTimer]);

  const closeMenuSoon = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setMenuOpen(false);
      hideTimerRef.current = null;
    }, 180);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  return (
    <div
      className="user-account-wrap"
      onMouseEnter={openMenu}
      onMouseLeave={closeMenuSoon}
      onFocus={openMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeMenuSoon();
        }
      }}
    >
      <button
        type="button"
        className={`user-account-control${signedIn ? " user-account-control--signed-in" : ""}${
          disabled ? " user-account-control--disabled" : ""
        }`}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        disabled={disabled}
        onClick={openMenu}
      >
        {photoUrl ? (
          <img className="user-account-control-photo" src={photoUrl} alt="" />
        ) : signedIn && initials ? (
          <span className="user-account-control-initials" aria-hidden="true">
            {initials}
          </span>
        ) : (
          <UserAccountIcon className="user-account-control-icon" focusable="false" />
        )}
      </button>
      {menuOpen ? (
        <div className="user-account-menu" role="menu" aria-label="Настройки пользователя">
          <p className="user-account-menu-title">Настройки пользователя</p>
          <button
            type="button"
            className="user-account-menu-item"
            role="menuitem"
            onClick={() => {
              setStatusMessage("");
              Promise.resolve(onSaveUserSettings?.())
                .then(() => setStatusMessage("Настройки сохранены"))
                .catch(() => setStatusMessage("Не удалось сохранить настройки"));
            }}
          >
            Сохранить
          </button>
          <button
            type="button"
            className="user-account-menu-item"
            role="menuitem"
            onClick={() => fileInputRef.current?.click()}
          >
            Загрузить
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) {
                return;
              }
              setStatusMessage("");
              try {
                const applied = await onLoadUserSettings?.(file);
                if (applied) {
                  setStatusMessage("Настройки загружены");
                }
              } catch {
                setStatusMessage("Не удалось прочитать файл настроек");
              }
            }}
          />
          {statusMessage ? <p className="user-account-menu-status">{statusMessage}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function deriveInitials(displayName) {
  if (!displayName) {
    return "";
  }

  const parts = displayName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}
