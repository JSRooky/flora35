import React, { useEffect, useState } from "react";
import aboutProjectUrl from "../docs/aboutProject.md";
import { renderMarkdown } from "../docs/renderMarkdown";
import "../styles/AboutProject.css";

/**
 * Импорт .md через webpack уже возвращает готовый публичный URL
 * (с учётом homepage/PUBLIC_URL, например "/flora35/static/media/...").
 * Повторно добавлять PUBLIC_URL нельзя — получится двойной префикс и 404.
 */
function resolveMarkdownUrl(source) {
  return source;
}

export default function AboutProject({ open: openProp, onOpenChange }) {
  const [openInternal, setOpenInternal] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  // Загружаем markdown только при открытии диалога, а не при монтировании карты.
  useEffect(() => {
    if (!open) {
      return;
    }

    // Защита от setState после закрытия диалога или размонтирования компонента.
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
          // Запасной текст, если файл недоступен (сеть, деплой, неверный путь).
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
      {open && (
        // Клик по затемнению закрывает диалог.
        <div className="about-project-overlay" onClick={() => setOpen(false)}>
          <div
            className="about-project-dialog"
            role="dialog"
            aria-label="О проекте"
            aria-modal="true"
            // Клик внутри окна не должен всплывать на overlay.
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
              {/* loading ещё false в первом кадре после open — проверяем и content */}
              {loading || !content ? <p>Загрузка...</p> : renderMarkdown(content)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
