import { PolygonHullIcon, PolygonStarIcon } from "../images/buttons";

/** Иконка режима: выпуклая оболочка (пятиугольник) или все точки (звезда). */
export default function PolygonModeIcon({ allPoints = false, className = "" }) {
  const Icon = allPoints ? PolygonStarIcon : PolygonHullIcon;
  return <Icon className={className} aria-hidden="true" focusable="false" />;
}
