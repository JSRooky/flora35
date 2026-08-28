import mapboxgl from "mapbox-gl";
import { getRegnumLabel, REGNUM_ORDER } from "./featurePropertyLabels";
import { getPointColorForRegnum } from "./pointColors";

const POINT_TOOLTIP_FADE_MS = 120;
/** Максимум точек кластера, вытаскиваемых для подсказки при наведении (не весь кластер). */
const HOVER_CLUSTER_LEAVES_SAMPLE_LIMIT = 5000;

let hoverTooltipsEnabled = true;
let pointHoverPopup = null;
let pointHoverPopupHideTimer = null;
let clusterHoverRequestId = 0;

export function setHoverTooltipsEnabled(enabled) {
  hoverTooltipsEnabled = Boolean(enabled);
  if (!hoverTooltipsEnabled) {
    cancelClusterHoverRequest();
    removePointHoverPopup({ immediate: true });
  }
}

export function isHoverTooltipsEnabled() {
  return hoverTooltipsEnabled;
}

export function cancelClusterHoverRequest() {
  clusterHoverRequestId += 1;
}

function clearPointHoverHideTimer() {
  if (pointHoverPopupHideTimer) {
    clearTimeout(pointHoverPopupHideTimer);
    pointHoverPopupHideTimer = null;
  }
}

function setPointHoverPopupVisible(visible, popup = pointHoverPopup) {
  const popupElement = popup?.getElement();
  if (!popupElement) {
    return;
  }

  popupElement.classList.toggle("point-hover-tooltip--visible", visible);
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatClusterPointsCount(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} точка`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} точки`;
  }

  return `${count} точек`;
}

const SOURCE_TOOLTIP_ORDER = ["gbif", "inat"];
const SOURCE_TOOLTIP_LABELS = {
  gbif: "GBIF",
  inat: "iNat"
};
const SOURCE_TOOLTIP_COLORS = {
  gbif: "#3b82f6",
  inat: "#22c55e"
};

function getLeafSourceKey(leaf) {
  const properties = leaf?.properties ?? {};
  const raw = String(properties.temp_source || properties.source || "").toLowerCase();
  if (raw === "inaturalist" || raw === "inat") {
    return "inat";
  }
  if (raw === "gbif") {
    return "gbif";
  }
  if (properties.gbif_key != null && properties.gbif_key !== "") {
    return "gbif";
  }
  if (properties.inat_id != null && properties.inat_id !== "") {
    return "inat";
  }
  return "";
}

export function getSourceCountsFromLeaves(leaves) {
  const counts = new Map();
  (leaves ?? []).forEach((leaf) => {
    const key = getLeafSourceKey(leaf);
    if (!key) {
      return;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return counts;
}

export function getSourceCountsFromClusterProps(props = {}) {
  const counts = new Map();
  const gbif = Number(props.src_gbif) || 0;
  const inat = Number(props.src_inat) || 0;
  if (gbif > 0) {
    counts.set("gbif", gbif);
  }
  if (inat > 0) {
    counts.set("inat", inat);
  }
  return counts;
}

function buildSourceCountsHtml(sourceCounts) {
  if (!(sourceCounts instanceof Map) || sourceCounts.size === 0) {
    return "";
  }

  const items = SOURCE_TOOLTIP_ORDER.map((key) => {
    const count = sourceCounts.get(key) ?? 0;
    if (count <= 0) {
      return "";
    }
    const color = SOURCE_TOOLTIP_COLORS[key];
    const label = SOURCE_TOOLTIP_LABELS[key];
    return `<li class="cluster-tooltip-item"><span class="cluster-tooltip-species" style="color: ${color}">${label}</span> <span class="cluster-tooltip-count">— ${count}</span></li>`;
  }).filter(Boolean);

  if (!items.length) {
    return "";
  }

  return `<ul class="cluster-tooltip-list cluster-tooltip-list--sources">${items.join("")}</ul>`;
}
export function getRegnumCountsFromLeaves(leaves) {
  const counts = new Map();

  (leaves ?? []).forEach((leaf) => {
    const raw = leaf?.properties?.regnum;
    const normalized = raw ? String(raw).toLowerCase() : "";
    const key = normalized || "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return counts;
}

/** Считает точки по царствам из clusterProperties (pie-chart props). */
export function getRegnumCountsFromClusterProps(props = {}) {
  const counts = new Map();
  let knownTotal = 0;

  REGNUM_ORDER.forEach((regnum) => {
    const value = Number(props[regnum]) || 0;
    if (value > 0) {
      counts.set(regnum, value);
      knownTotal += value;
    }
  });

  const pointCount = Number(props.point_count) || 0;
  const other = pointCount - knownTotal;
  if (other > 0) {
    counts.set("", (counts.get("") ?? 0) + other);
  }

  return counts;
}

/** HTML-подсказка: базы и количество точек по царствам. */
export function buildClusterRegnumTooltipHtml(
  leavesOrCounts,
  totalOverride = null,
  sourceCountsOverride = null
) {
  const counts =
    leavesOrCounts instanceof Map
      ? leavesOrCounts
      : getRegnumCountsFromLeaves(leavesOrCounts);
  const sourceCounts =
    sourceCountsOverride instanceof Map
      ? sourceCountsOverride
      : leavesOrCounts instanceof Map
        ? null
        : getSourceCountsFromLeaves(leavesOrCounts);

  let total = totalOverride;
  if (total == null) {
    total = 0;
    counts.forEach((value) => {
      total += value;
    });
  }

  if (total <= 0 && counts.size === 0) {
    return `<div class="cluster-tooltip-title">${formatClusterPointsCount(0)}</div>`;
  }

  const orderedKeys = [
    ...REGNUM_ORDER.filter((key) => counts.has(key)),
    ...[...counts.keys()].filter((key) => key && !REGNUM_ORDER.includes(key)),
    ...(counts.has("") ? [""] : [])
  ];

  const items = orderedKeys
    .map((key) => {
      const count = counts.get(key) ?? 0;
      if (count <= 0) {
        return "";
      }
      const label = escapeHtml(getRegnumLabel(key || null));
      const color = getPointColorForRegnum(key || null);
      return `<li class="cluster-tooltip-item"><span class="cluster-tooltip-species" style="color: ${color}">${label}</span> <span class="cluster-tooltip-count">— ${count}</span></li>`;
    })
    .filter(Boolean)
    .join("");

  const kingdomList = items
    ? `<ul class="cluster-tooltip-list">${items}</ul>`
    : "";

  return `
    <div class="cluster-tooltip-title">${formatClusterPointsCount(total)}</div>
    ${buildSourceCountsHtml(sourceCounts)}
    ${kingdomList}
  `;
}

export function showPointHoverPopup(map, coordinates, html) {
  if (!hoverTooltipsEnabled) {
    return;
  }

  clearPointHoverHideTimer();

  if (!pointHoverPopup) {
    pointHoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: "point-hover-tooltip",
      offset: 10
    });
  }

  const isNewPopup = !pointHoverPopup.isOpen();

  pointHoverPopup.setLngLat(coordinates).setHTML(html).addTo(map);

  if (isNewPopup) {
    setPointHoverPopupVisible(false);
    requestAnimationFrame(() => {
      setPointHoverPopupVisible(true);
    });
    return;
  }

  setPointHoverPopupVisible(true);
}

export function removePointHoverPopup({ immediate = false } = {}) {
  clearPointHoverHideTimer();

  if (!pointHoverPopup) {
    return;
  }

  const popup = pointHoverPopup;

  if (immediate) {
    pointHoverPopup = null;
    popup.remove();
    return;
  }

  setPointHoverPopupVisible(false, popup);
  pointHoverPopupHideTimer = setTimeout(() => {
    pointHoverPopupHideTimer = null;
    if (pointHoverPopup === popup) {
      pointHoverPopup = null;
    }
    popup.remove();
  }, POINT_TOOLTIP_FADE_MS);
}

/**
 * Показать попап царств для кластера (обычный Mapbox или dense_pile).
 * @returns {number|null} requestId для асинхронного getClusterLeaves, иначе null
 */
export function showClusterRegnumHover(map, event, { getDensePileLeaves } = {}) {
  if (!hoverTooltipsEnabled) {
    return null;
  }

  const clusterFeature = event.features?.[0];
  const coordinates = clusterFeature?.geometry?.coordinates;

  if (!clusterFeature || !coordinates) {
    return null;
  }

  if (clusterFeature.properties?.dense_pile) {
    const leaves = getDensePileLeaves?.(clusterFeature) ?? [];
    if (leaves.length) {
      showPointHoverPopup(map, coordinates, buildClusterRegnumTooltipHtml(leaves));
    } else {
      const pointCount = Number(clusterFeature.properties?.point_count) || 0;
      showPointHoverPopup(
        map,
        coordinates,
        `<div class="cluster-tooltip-title">${formatClusterPointsCount(pointCount)}</div>`
      );
    }
    return null;
  }

  const props = clusterFeature.properties ?? {};
  const sourceFromProps = getSourceCountsFromClusterProps(props);
  const hasSourceProps = sourceFromProps.size > 0;
  const hasRegnumProps = REGNUM_ORDER.some((key) => Number(props[key]) > 0);
  if (hasRegnumProps || hasSourceProps) {
    showPointHoverPopup(
      map,
      coordinates,
      buildClusterRegnumTooltipHtml(
        hasRegnumProps ? getRegnumCountsFromClusterProps(props) : new Map(),
        Number(props.point_count) || null,
        hasSourceProps ? sourceFromProps : null
      )
    );
    if (hasRegnumProps) {
      return null;
    }
  }

  const clusterId = props.cluster_id;
  const sourceId = clusterFeature.source;
  const source = sourceId ? map.getSource(sourceId) : null;

  if (!source?.getClusterLeaves || clusterId === undefined) {
    return null;
  }

  const requestId = clusterHoverRequestId + 1;
  clusterHoverRequestId = requestId;

  // Infinity здесь означало вытаскивать ВСЕ точки кластера при каждом наведении
  // мыши — на кластере из сотен тысяч GBIF/iNat находок это вешает основной поток
  // (и способно уронить вкладку в OOM). Для подсказки достаточно представительной
  // выборки; реальный total берём из point_count кластера, а не из длины выборки.
  const totalPointCount = Number(props.point_count) || null;
  source.getClusterLeaves(
    clusterId,
    HOVER_CLUSTER_LEAVES_SAMPLE_LIMIT,
    0,
    (leavesErr, leaves) => {
      if (leavesErr || requestId !== clusterHoverRequestId || !leaves?.length) {
        return;
      }

      showPointHoverPopup(
        map,
        coordinates,
        buildClusterRegnumTooltipHtml(
          getRegnumCountsFromLeaves(leaves),
          totalPointCount
        )
      );
    }
  );

  return requestId;
}
