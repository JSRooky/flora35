/** Иконка режима: выпуклая оболочка (пятиугольник) или все точки (звезда). */
export default function PolygonModeIcon({ allPoints = false, className = "" }) {
  if (allPoints) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <polygon
          points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        points="12,4 20,9 17,19 7,19 4,9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
