import React, { useEffect, useState } from "react";
import aboutProjectUrl from "../docs/aboutProject.md";
import { renderMarkdown } from "../docs/renderMarkdown";
import "../styles/AboutProject.css";

function resolveMarkdownUrl(source) {
  // Webpack's asset import already resolves `source` to a fully-qualified
  // public URL (including PUBLIC_URL/homepage, e.g. "/flora35/static/media/...").
  // Prepending PUBLIC_URL again would double it up and 404, so just use it as-is.
  return source;
}

export default function AboutProject() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(resolveMarkdownUrl(aboutProjectUrl))
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load aboutProject.md");
        }

        return response.text();
      })
      .then((text) => {
        if (!cancelled) {
          setContent(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent("# О проекте\n\nНе удалось загрузить описание проекта.");
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
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="about-project-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        О проекте
      </button>

      {open && (
        <div className="about-project-overlay" onClick={() => setOpen(false)}>
          <div
            className="about-project-dialog"
            role="dialog"
            aria-label="О проекте"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="about-project-dialog-header">
              <button
                type="button"
                className="about-project-close"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </div>

            <div className="about-project-dialog-content">
              {loading || !content ? <p>Загрузка...</p> : renderMarkdown(content)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
