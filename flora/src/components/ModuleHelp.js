import React, { useEffect, useState } from "react";
import { loadModuleHelpSection } from "../docs/loadModuleHelp";
import { renderMarkdown } from "../docs/renderMarkdown";
import "../styles/ModuleHelp.css";

export function ModuleHelpButton({ open, onClick, className = "" }) {
  return (
    <button
      type="button"
      className={`module-help-btn${open ? " module-help-btn--active" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label="Помощь"
      title="Помощь"
    >
      ?
    </button>
  );
}

export function ModuleHelpPanel({ sectionId, open }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open || !sectionId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);

    loadModuleHelpSection(sectionId)
      .then((sectionMarkdown) => {
        if (!cancelled) {
          setContent(sectionMarkdown);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setContent("");
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
  }, [open, sectionId]);

  if (!open) {
    return null;
  }

  return (
    <aside className="module-help-panel" aria-label="Справка по модулю">
      {loading ? (
        <p className="module-help-panel-loading">Загрузка...</p>
      ) : error ? (
        <p className="module-help-panel-error">Не удалось загрузить справку.</p>
      ) : (
        <div className="module-help-panel-content">{renderMarkdown(content)}</div>
      )}
    </aside>
  );
}
