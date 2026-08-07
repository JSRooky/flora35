import React from "react";

/** Подпись поля формы находки с индикатором обязательности и заполненности. */
export default function SubmissionFieldLabel({
  children,
  filled = false,
  required = false,
  className = ""
}) {
  if (!required) {
    return <span className={`user-submission-field-label${className ? ` ${className}` : ""}`}>{children}</span>;
  }

  return (
    <span className={`user-submission-field-label${className ? ` ${className}` : ""}`}>
      <span
        className={`user-submission-field-marker user-submission-field-marker--${
          filled ? "filled" : "empty"
        }`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
