import React, { useEffect, useRef } from "react";
import { EXPERIMENTAL_FEATURES } from "../config/experimentalFeatures";
import "../styles/ExperimentalFeatureDialog.css";

/** Предупреждение при первом открытии экспериментальной функции. */
export default function ExperimentalFeatureDialog({ featureId, onContinue, onCancel }) {
  const continueRef = useRef(null);
  const feature = EXPERIMENTAL_FEATURES[featureId];

  useEffect(() => {
    if (!feature) {
      return undefined;
    }

    continueRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [feature, onCancel]);

  if (!feature) {
    return null;
  }

  return (
    <div className="experimental-feature-overlay" onClick={onCancel}>
      <div
        className="experimental-feature-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="experimental-feature-title"
        aria-describedby="experimental-feature-message"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="experimental-feature-title" className="experimental-feature-title">
          Экспериментальная функция
        </h2>
        <p id="experimental-feature-message" className="experimental-feature-message">
          {feature.message}
        </p>
        <div className="experimental-feature-actions">
          <button type="button" className="experimental-feature-cancel" onClick={onCancel}>
            Отмена
          </button>
          <button
            ref={continueRef}
            type="button"
            className="experimental-feature-continue"
            onClick={onContinue}
          >
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}
