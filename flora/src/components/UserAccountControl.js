import React from "react";
import { ReactComponent as UserAccountIcon } from "../images/user_account.svg";
import "../styles/UserAccountControl.css";

/**
 * Слот аккаунта в верхней панели.
 * Пока без VK ID: показывает заглушку; пропсы готовы к подключению авторизации.
 */
export default function UserAccountControl({
  user = null,
  onAccountClick,
  disabled = false
}) {
  const signedIn = Boolean(user?.id || user?.vkId);
  const displayName = user?.displayName?.trim() || "";
  const photoUrl = user?.photoUrl || "";
  const initials = (user?.initials || deriveInitials(displayName)).slice(0, 2);

  const title = signedIn
    ? displayName || "Аккаунт VK"
    : "Вход через VK";
  const ariaLabel = signedIn
    ? `Аккаунт${displayName ? `: ${displayName}` : ""}`
    : "Вход через VK";

  return (
    <button
      type="button"
      className={`user-account-control${signedIn ? " user-account-control--signed-in" : ""}${disabled ? " user-account-control--disabled" : ""}`}
      title={title}
      aria-label={ariaLabel}
      aria-haspopup="menu"
      disabled={disabled || !onAccountClick}
      onClick={() => onAccountClick?.()}
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
