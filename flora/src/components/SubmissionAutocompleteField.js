import React from "react";
import SubmissionAutocompleteInput from "./SubmissionAutocompleteInput";
import SubmissionFieldLabel from "./SubmissionFieldLabel";
import "../styles/SubmissionAutocomplete.css";

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
  filled = false,
  type = "text",
  min,
  max,
  step
}) {
  return (
    <label className="user-submission-field user-submission-autocomplete">
      <SubmissionFieldLabel required={required} filled={filled}>
        {label}
      </SubmissionFieldLabel>
      <SubmissionAutocompleteInput
        value={value}
        onChange={onChange}
        onSuggestionSelect={onSuggestionSelect}
        suggestions={suggestions}
        getSuggestionLabel={getSuggestionLabel}
        getSuggestionKey={getSuggestionKey}
        type={type}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
      />
    </label>
  );
}
