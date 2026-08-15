import React, { useEffect, useState } from "react";
import { HelpIcon } from "../images/buttons";
import { loadModuleHelpSection } from "../docs/loadModuleHelp";
import {
  getModuleHelpPageUrl,
  getModuleHelpSectionLabel,
  hasModuleHelpFullSection
} from "../docs/moduleHelpUrls";
import { renderMarkdown } from "../docs/renderMarkdown";
import "../styles/ModuleHelp.css";

/** Кнопка «?» в заголовке панели модуля; переключает блок справки ниже. */
export function ModuleHelpButton({ open, onClick, className = "", mapToolAccent = false }) {
  return (
    <button
      type="button"
      className={`module-help-btn${open ? " module-help-btn--active" : ""}${mapToolAccent ? " module-help-btn--map-tool" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-expanded={open}
      aria-label="Помощь"
      title="Помощь"
    >
      <HelpIcon className="module-help-btn-icon" aria-hidden="true" focusable="false" />
    </button>
  );
}

/**
 * Блок справки под панелью модуля.
 * sectionId должен совпадать с заголовком ## sectionId в docs/moduleHelp.md.
 */
export function ModuleHelpPanel({ sectionId, open, mapToolAccent = false }) {
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
    <aside className={`module-help-panel${mapToolAccent ? " module-help-panel--map-tool" : ""}`} aria-label="Справка по модулю">
      {loading ? (
        <p className="module-help-panel-loading">Загрузка...</p>
      ) : error ? (
        <p className="module-help-panel-error">Не удалось загрузить справку.</p>
      ) : (
        <>
          <div className="module-help-panel-content">{renderMarkdown(content)}</div>
          {hasModuleHelpFullSection(sectionId) && (
            <p className="module-help-panel-full-link-wrap">
              <a
                className="module-help-panel-full-link"
                href={getModuleHelpPageUrl(sectionId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Подробная справка: {getModuleHelpSectionLabel(sectionId)}
              </a>
            </p>
          )}
        </>
      )}
    </aside>
  );
}
