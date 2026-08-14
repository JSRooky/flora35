import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Считает фиксированные координаты списка подсказок для рендера через портал (иначе он обрежется overflow родителя). */
function usePortalDropdownStyle(open, containerRef, placement, value, suggestions) {
  const [style, setStyle] = useState(null);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) {
      setStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const input = containerRef.current?.querySelector("input");
      if (!input) {
        return;
      }

      const rect = input.getBoundingClientRect();
      // Не даём списку схлопнуться у узких полей.
      const width = Math.max(rect.width, 180);

      if (placement === "drop-up") {
        setStyle({
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top - 4}px`,
          width: `${width}px`,
          transform: "translateY(-100%)",
          zIndex: 1200
        });
        return;
      }

      setStyle({
        position: "fixed",
        left: `${rect.left}px`,
        top: `${rect.bottom + 4}px`,
        width: `${width}px`,
        zIndex: 1200
      });
    };

    updatePosition();
    // capture: true, чтобы ловить скролл во вложенных контейнерах, а не только document.
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [containerRef, open, placement, suggestions, value]);

  return style;
}

/** Текстовое поле с выпадающим списком подсказок (используется как в форме, так и в таблице находок). */
export default function SubmissionAutocompleteInput({
  value,
  onChange,
  onSuggestionSelect,
  suggestions = [],
  getSuggestionLabel,
  getSuggestionKey,
  renderSuggestion,
  className = "",
  wrapClassName = "submission-autocomplete-wrap",
  listClassName = "submission-autocomplete-suggestions",
  listClassNameActive = "submission-autocomplete-suggestion--active",
  disabled = false,
  type = "text",
  min,
  max,
  step,
  placement = "drop-down",
  usePortal = false,
  placeholder,
  "aria-label": ariaLabel
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxId = useId();

  const getLabel = getSuggestionLabel ?? ((item) => String(item));
  const getKey = getSuggestionKey ?? ((item, index) => `${getLabel(item)}-${index}`);

  // Подсказки показываем только при непустом вводе и открытом списке.
  const filteredSuggestions = useMemo(() => {
    if (!open || !String(value).trim()) {
      return [];
    }

    return suggestions;
  }, [open, suggestions, value]);

  const portalStyle = usePortalDropdownStyle(
    open && usePortal,
    containerRef,
    placement,
    value,
    filteredSuggestions
  );

  useEffect(() => {
    setActiveIndex(filteredSuggestions.length > 0 ? 0 : -1);
  }, [filteredSuggestions]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        // Список подсказок может рендериться в портале вне containerRef, поэтому проверяем его отдельно.
        const listNode = document.getElementById(listboxId);
        if (listNode?.contains(event.target)) {
          return;
        }

        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [listboxId, open]);

  const handleInputChange = (event) => {
    onChange(event.target.value);
    setOpen(true);
  };

  const handleSelect = (suggestion) => {
    onChange(getLabel(suggestion));
    onSuggestionSelect?.(suggestion);
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (!open || filteredSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % filteredSuggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? filteredSuggestions.length - 1 : index - 1
      );
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(filteredSuggestions[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showSuggestions = open && filteredSuggestions.length > 0;
  const listPlacementClass =
    placement === "drop-up" ? " submission-autocomplete-suggestions--drop-up" : "";
  const portalClass = usePortal ? " submission-autocomplete-suggestions--portal" : "";

  const suggestionsList = showSuggestions ? (
    <ul
      id={listboxId}
      className={`${listClassName}${listPlacementClass}${portalClass}`}
      style={usePortal ? portalStyle ?? undefined : undefined}
      role="listbox"
    >
      {filteredSuggestions.map((suggestion, index) => (
        <li
          key={getKey(suggestion, index)}
          role="option"
          aria-selected={index === activeIndex}
          className={`submission-autocomplete-suggestion${
            index === activeIndex ? ` ${listClassNameActive}` : ""
          }`}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActiveIndex(index)}
          onClick={() => handleSelect(suggestion)}
        >
          {renderSuggestion
            ? renderSuggestion(suggestion)
            : getLabel(suggestion)}
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div className={wrapClassName} ref={containerRef}>
      <input
        type={type}
        className={className}
        value={value}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel}
      />

      {usePortal && suggestionsList
        ? createPortal(suggestionsList, document.body)
        : suggestionsList}
    </div>
  );
}
