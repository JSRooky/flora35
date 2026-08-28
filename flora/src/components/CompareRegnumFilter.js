import React, { useCallback, useMemo, useState } from "react";
import {
  DIVERSITY_REGNUM_NONE,
  listDiversityRegnumKeys
} from "../dataWork/compare/countSpeciesByLayers";
import { getRegnumLabel } from "./featurePropertyLabels";
import { getPointColorForRegnum } from "./pointColors";
import "../styles/CompareRegnumFilter.css";

export function useCompareRegnumFilter(plaques) {
  const [regnumOn, setRegnumOn] = useState({});
  const presentRegnums = useMemo(() => listDiversityRegnumKeys(plaques), [plaques]);
  const selectedRegnums = useMemo(
    () => presentRegnums.filter((key) => regnumOn[key] === true),
    [presentRegnums, regnumOn]
  );
  const allRegnumsOn =
    presentRegnums.length > 0 && selectedRegnums.length === presentRegnums.length;
  const noneRegnumsOn = selectedRegnums.length === 0;
  const allowedRegnums = useMemo(() => {
    if (presentRegnums.length === 0 || noneRegnumsOn || allRegnumsOn) {
      return null;
    }
    return new Set(selectedRegnums);
  }, [allRegnumsOn, noneRegnumsOn, presentRegnums.length, selectedRegnums]);

  const handleSelectAllRegnums = useCallback(() => {
    setRegnumOn(Object.fromEntries(presentRegnums.map((key) => [key, true])));
  }, [presentRegnums]);

  const handleResetRegnums = useCallback(() => {
    setRegnumOn({});
  }, []);

  const handleToggleRegnum = useCallback((key) => {
    setRegnumOn((current) => ({ ...current, [key]: current[key] !== true }));
  }, []);

  return {
    presentRegnums,
    allRegnumsOn,
    noneRegnumsOn,
    allowedRegnums,
    handleSelectAllRegnums,
    handleResetRegnums,
    handleToggleRegnum,
    isRegnumOn: (key) => regnumOn[key] === true
  };
}

export default function CompareRegnumFilter({
  presentRegnums,
  isRegnumOn,
  allRegnumsOn,
  noneRegnumsOn,
  onSelectAll,
  onReset,
  onToggleRegnum
}) {
  if (!presentRegnums?.length) {
    return null;
  }

  return (
    <div className="compare-regnum-filter" role="toolbar" aria-label="Царства">
      <span className="compare-regnum-filter-label">Царства</span>
      <div className="compare-regnum-filter-group" role="group" aria-label="Царства">
        <button
          type="button"
          className={`compare-regnum-filter-btn${
            allRegnumsOn ? " compare-regnum-filter-btn--on" : ""
          }`}
          aria-pressed={allRegnumsOn}
          onClick={onSelectAll}
        >
          Все
        </button>
        {presentRegnums.map((key) => {
          const isOn = isRegnumOn(key);
          const color = getPointColorForRegnum(key === DIVERSITY_REGNUM_NONE ? null : key);
          return (
            <button
              key={key}
              type="button"
              className={`compare-regnum-filter-btn${
                isOn ? " compare-regnum-filter-btn--on" : ""
              }`}
              style={isOn ? { color, background: `${color}22` } : undefined}
              aria-pressed={isOn}
              onClick={() => onToggleRegnum(key)}
            >
              {getRegnumLabel(key === DIVERSITY_REGNUM_NONE ? null : key)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="compare-regnum-filter-reset"
        disabled={noneRegnumsOn}
        onClick={onReset}
      >
        Сброс
      </button>
    </div>
  );
}
