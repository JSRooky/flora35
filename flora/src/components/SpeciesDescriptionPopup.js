import React, { useEffect, useState } from "react";
import { loadSpeciesDescription } from "../docs/loadSpeciesDescription";
import { renderMarkdown } from "../docs/renderMarkdown";
import "../styles/SpeciesDescriptionPopup.css";

/** Модальное окно с описанием вида из markdown-файла. */
export default function SpeciesDescriptionPopup({ descriptionPath, onClose }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!descriptionPath) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setContent("");

    loadSpeciesDescription(descriptionPath)
      .then((text) => {
        if (!cancelled) {
          setContent(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [descriptionPath]);

  if (!descriptionPath) {
    return null;
  }

  return (
    <div className="species-description-overlay" onClick={onClose}>
      <div
        className="species-description-dialog"
        role="dialog"
        aria-label="О виде"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="species-description-close"
          onClick={onClose}
          aria-label="Закрыть"
        >
          ×
        </button>

        <div className="species-description-content">
          {loading ? (
            <p>Загрузка...</p>
          ) : error ? (
            <p>Не удалось загрузить описание вида.</p>
          ) : (
            renderMarkdown(content)
          )}
        </div>
      </div>
    </div>
  );
}
