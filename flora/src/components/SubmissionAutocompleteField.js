import React, { useEffect, useId, useMemo, useRef, useState } from "react";

export default function SubmissionAutocompleteField({
  label,
  value,
  onChange,
  onSuggestionSelect,
  suggestions = [],
  getSuggestionLabel,
  getSuggestionKey,
  placeholder,
  required = false,
  type = "text",
  min,
  max,
  step
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const listboxId = useId();

  const getLabel = getSuggestionLabel ?? ((item) => String(item));
  const getKey = getSuggestionKey ?? ((item, index) => `${getLabel(item)}-${index}`);

  const filteredSuggestions = useMemo(() => {
    if (!open || !String(value).trim()) {
      return [];
    }

    return suggestions;
  }, [open, suggestions, value]);

  useEffect(() => {
    setActiveIndex(filteredSuggestions.length > 0 ? 0 : -1);
  }, [filteredSuggestions]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  const handleInputChange = (event) => {
    onChange(event.target.value);
    setOpen(true);
  };

  const handleSelect = (suggestion) => {
    onSuggestionSelect?.(suggestion);
    onChange(getLabel(suggestion));
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

  return (
    <label className="user-submission-field user-submission-autocomplete">
      <span>{label}</span>
      <div className="user-submission-autocomplete-wrap" ref={containerRef}>
        <input
          type={type}
          value={value}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          step={step}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listboxId : undefined}
          aria-autocomplete="list"
        />

        {showSuggestions && (
          <ul
            id={listboxId}
            className="user-submission-suggestions"
            role="listbox"
          >
            {filteredSuggestions.map((suggestion, index) => (
              <li
                key={getKey(suggestion, index)}
                role="option"
                aria-selected={index === activeIndex}
                className={`user-submission-suggestion${
                  index === activeIndex ? " user-submission-suggestion--active" : ""
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => handleSelect(suggestion)}
              >
                {getLabel(suggestion)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </label>
  );
}
