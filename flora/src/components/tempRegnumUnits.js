import { getPointColorForRegnum } from "./pointColors";
import { partitionMapFeaturesByRegnum } from "./mapPerformance";

const TEMP_REGNUM_KEYS = ["plantae", "animalia", "fungi", "protozoa"];

/** Отдельная группа на каждое указанное царство. Точки без regnum остаются в исходной группе. */
export function splitTempUnitsByRegnum(units, enabled) {
  if (!enabled) {
    return units;
  }
  const out = [];
  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i];
    const features = unit.features ?? [];
    const { groups, other } = partitionMapFeaturesByRegnum(features, TEMP_REGNUM_KEYS);
    let added = false;
    for (let k = 0; k < TEMP_REGNUM_KEYS.length; k += 1) {
      const regnum = TEMP_REGNUM_KEYS[k];
      const bucket = groups.get(regnum) ?? [];
      if (bucket.length === 0) {
        continue;
      }
      added = true;
      out.push({
        ...unit,
        id: `${unit.id}--${regnum}`,
        markerColor: getPointColorForRegnum(regnum),
        features: bucket
      });
    }
    if (!added) {
      out.push(unit);
    } else if (other.length > 0) {
      out.push({
        ...unit,
        id: `${unit.id}--other`,
        features: other
      });
    }
  }
  return out;
}
