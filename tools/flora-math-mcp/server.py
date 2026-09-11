"""Независимые эталоны математики Flora35 (SciPy/NumPy) для проверки JS-алгоритмов."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from mcp.server import MCPServer
from scipy.spatial import ConvexHull
from scipy.stats import kendalltau, norm, pearsonr

mcp = MCPServer("flora-math")

KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LON_EQUATOR = 111.32
AOO_CELL_KM = 2.0
Z_95 = 1.96


def _finite(values: list[float]) -> list[float]:
    return [float(value) for value in values if value is not None and math.isfinite(float(value))]


def _json(value: Any) -> Any:
    if isinstance(value, (np.floating, np.integer)):
        value = value.item()
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, dict):
        return {str(key): _json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json(item) for item in value]
    return value


def _singleton_doubleton(counts: list[int]) -> tuple[int, int]:
    f1 = sum(1 for value in counts if value == 1)
    f2 = sum(1 for value in counts if value == 2)
    return f1, f2


@mcp.resource("flora-math://algorithms")
def algorithms_catalog() -> str:
    """Какие JS-модули Flora35 сверять какими инструментами MCP."""
    return """
Flora35 math verification map

- Chao1 / rarefaction CI
  JS: flora/src/dataWork/analysis/accumulation.js, compare/compareExtraStats.js (chao1)
  MCP: chao1_reference

- Mann–Kendall + Theil–Sen
  JS: flora/src/dataWork/analysis/yearTrend.js (mannKendall)
  MCP: mann_kendall_reference

- Pearson r / R²
  JS: flora/src/dataWork/compare/similarityByLayers.js (pearsonR)
  MCP: pearson_r_reference

- Shannon, Simpson 1-D, Pielou
  JS: flora/src/dataWork/compare/compareExtraStats.js
  MCP: diversity_reference

- Jaccard / Sørensen
  JS: flora/src/dataWork/compare/compareExtraStats.js
  MCP: set_similarity_reference

- EOO (convex hull) / AOO (2 km cells)
  JS: flora/src/dataWork/analysis/eooAoo.js
  MCP: eoo_aoo_reference
  Note: JS uses Turf geodesic area; MCP uses local equirectangular km. Small relative diffs are expected.

- KDE Scott bandwidth
  JS: flora/src/dataWork/analysis/kde.js (scottBandwidthKm)
  MCP: kde_bandwidth_reference

- Normal CDF used in MK p-values
  JS: yearTrend.js (Abramowitz–Stegun approximation)
  MCP: normal_cdf_reference (SciPy)

Workflow: run the JS function on a fixture, call the matching MCP tool with the same input, then compare_js_to_reference.
""".strip()


@mcp.tool()
def chao1_reference(abundances: list[int]) -> dict[str, Any]:
    """Chao1 (Colwell/Chao 1987) and lognormal 95% CI, independent of Flora JS."""
    counts = [int(value) for value in abundances if int(value) > 0]
    s_obs = len(counts)
    n = sum(counts)
    f1, f2 = _singleton_doubleton(counts)
    if s_obs == 0:
        estimate = 0.0
    elif f2 > 0:
        estimate = s_obs + (f1 * f1) / (2 * f2)
    else:
        estimate = s_obs + (f1 * (f1 - 1)) / 2

    variance = 0.0
    if n > 1 and s_obs > 0:
        k = (n - 1) / n
        if f2 > 0:
            ratio = f1 / f2
            variance = f2 * (
                (0.5 * k * ratio * ratio) ** 2
                + k * k * ratio**3
                + 0.5 * k * k * ratio * ratio
            )
        else:
            variance = k * f1 * (f1 - 1) / 2 + (k * k * f1 * (2 * f1 - 1) ** 2) / 4

    phi = estimate - s_obs
    if phi > 0 and variance > 0:
        t = math.exp(Z_95 * math.sqrt(math.log(1 + variance / (phi * phi))))
        lower = s_obs + phi / t
        upper = s_obs + phi * t
    else:
        se = math.sqrt(max(0.0, variance))
        lower = max(s_obs, estimate - Z_95 * se)
        upper = estimate + Z_95 * se

    coverage = max(0.0, min(1.0, 1 - f1 / n)) if n > 0 else None
    return _json(
        {
            "sObs": s_obs,
            "n": n,
            "f1": f1,
            "f2": f2,
            "estimate": estimate,
            "variance": variance,
            "lower": lower,
            "upper": upper,
            "coverage": coverage,
        }
    )


@mcp.tool()
def mann_kendall_reference(values: list[float]) -> dict[str, Any]:
    """Mann–Kendall S/tau/z/p and Theil–Sen slope; SciPy kendalltau as a second check."""
    series = _finite(values)
    n = len(series)
    if n < 3:
        return _json({"n": n, "s": 0, "tau": None, "z": None, "p": None, "slope": None, "trend": "insufficient"})

    s = 0
    slopes: list[float] = []
    freq: dict[float, int] = {}
    for value in series:
        freq[value] = freq.get(value, 0) + 1
    for i in range(n - 1):
        for j in range(i + 1, n):
            diff = series[j] - series[i]
            s += 0 if diff == 0 else (1 if diff > 0 else -1)
            slopes.append(diff / (j - i))

    tie_term = sum(c * (c - 1) * (2 * c + 5) for c in freq.values() if c > 1)
    var_s = max(0.0, (n * (n - 1) * (2 * n + 5) - tie_term) / 18)
    z = 0.0
    if var_s > 0:
        if s > 0:
            z = (s - 1) / math.sqrt(var_s)
        elif s < 0:
            z = (s + 1) / math.sqrt(var_s)
    p = float(2 * (1 - norm.cdf(abs(z)))) if var_s > 0 else 1.0
    tau_denom = n * (n - 1) / 2
    tau = s / tau_denom if tau_denom else None
    slope = float(np.median(slopes)) if slopes else None
    trend = "none"
    if p < 0.05:
        trend = "increase" if s > 0 else "decrease" if s < 0 else "none"

    scipy_tau, scipy_p = kendalltau(list(range(n)), series, variant="b")
    return _json(
        {
            "n": n,
            "s": s,
            "tau": tau,
            "z": z,
            "p": p,
            "slope": slope,
            "trend": trend,
            "scipyKendallTau": float(scipy_tau) if scipy_tau is not None else None,
            "scipyKendallP": float(scipy_p) if scipy_p is not None else None,
            "note": "JS tau is S / C(n,2) (Kendall a). SciPy variant=b may differ when ties exist.",
        }
    )


@mcp.tool()
def pearson_r_reference(xs: list[float], ys: list[float]) -> dict[str, Any]:
    """Pearson r via SciPy; also the same zero-variance convention as Flora JS."""
    n = min(len(xs), len(ys))
    x = [float(xs[i]) if xs[i] is not None else 0.0 for i in range(n)]
    y = [float(ys[i]) if ys[i] is not None else 0.0 for i in range(n)]
    if n < 2:
        return _json({"n": n, "r": None, "r2": None, "scipyR": None})

    equal = x == y
    arr_x = np.asarray(x, dtype=float)
    arr_y = np.asarray(y, dtype=float)
    var_x = float(np.var(arr_x, ddof=0))
    var_y = float(np.var(arr_y, ddof=0))
    if var_x <= 0 or var_y <= 0:
        r_js = 1.0 if equal else 0.0
        scipy_r = None
    else:
        scipy_r, _p = pearsonr(arr_x, arr_y)
        r_js = float(np.clip(scipy_r, -1, 1))
    return _json({"n": n, "r": r_js, "r2": None if r_js is None else r_js * r_js, "scipyR": scipy_r})


@mcp.tool()
def diversity_reference(abundances: list[int]) -> dict[str, Any]:
    """Shannon H' (nat), Simpson 1-D, Pielou evenness from abundance counts."""
    counts = [int(value) for value in abundances if int(value) > 0]
    total = sum(counts)
    richness = len(counts)
    if total <= 0:
        return _json({"richness": 0, "shannon": None, "simpson": None, "pielou": None})
    probs = np.asarray(counts, dtype=float) / total
    shannon = float(-(probs * np.log(probs)).sum())
    simpson = float(1 - np.sum(probs * probs))
    pielou = shannon / math.log(richness) if richness >= 2 else None
    return _json({"richness": richness, "n": total, "shannon": shannon, "simpson": simpson, "pielou": pielou})


@mcp.tool()
def set_similarity_reference(left: list[str], right: list[str]) -> dict[str, Any]:
    """Jaccard and Sorensen-Dice on two string sets."""
    a = set(str(item) for item in left if str(item))
    b = set(str(item) for item in right if str(item))
    intersection = len(a & b)
    union = len(a | b)
    denom = len(a) + len(b)
    return _json(
        {
            "leftSize": len(a),
            "rightSize": len(b),
            "intersection": intersection,
            "jaccard": None if union == 0 else intersection / union,
            "sorensen": None if denom == 0 else (2 * intersection) / denom,
        }
    )


@mcp.tool()
def eoo_aoo_reference(coords: list[list[float]], cell_km: float = AOO_CELL_KM) -> dict[str, Any]:
    """EOO convex hull (local km) and AOO occupied 2 km cells. coords are [lon, lat]."""
    points = []
    seen: set[str] = set()
    for pair in coords:
        if len(pair) < 2:
            continue
        lon, lat = float(pair[0]), float(pair[1])
        key = f"{lon:.5f},{lat:.5f}"
        if key in seen:
            continue
        seen.add(key)
        points.append((lon, lat))

    cells: set[str] = set()
    for lon, lat in points:
        km_lon = KM_PER_DEG_LON_EQUATOR * math.cos(math.radians(lat))
        gx = math.floor((lon * max(km_lon, 1e-6)) / cell_km)
        gy = math.floor((lat * KM_PER_DEG_LAT) / cell_km)
        cells.add(f"{gx}:{gy}")
    aoo = {
        "cellKm": cell_km,
        "occupiedCells": len(cells),
        "areaKm2": len(cells) * cell_km * cell_km,
    }

    if len(points) < 3:
        return _json(
            {
                "uniqueLocalities": len(points),
                "eoo": {"areaKm2": None, "vertexCount": 0, "reason": "need_three_points"},
                "aoo": aoo,
            }
        )

    origin_lon = sum(p[0] for p in points) / len(points)
    origin_lat = sum(p[1] for p in points) / len(points)
    km_lon = max(KM_PER_DEG_LON_EQUATOR * math.cos(math.radians(origin_lat)), 1e-6)
    xy = np.array(
        [[(lon - origin_lon) * km_lon, (lat - origin_lat) * KM_PER_DEG_LAT] for lon, lat in points],
        dtype=float,
    )
    try:
        hull = ConvexHull(xy)
    except Exception as error:  # noqa: BLE001 — return reason to the agent
        return _json(
            {
                "uniqueLocalities": len(points),
                "eoo": {"areaKm2": None, "vertexCount": 0, "reason": f"hull_failed:{error}"},
                "aoo": aoo,
            }
        )
    return _json(
        {
            "uniqueLocalities": len(points),
            "eoo": {
                "areaKm2": float(hull.volume),
                "vertexCount": int(len(hull.vertices)),
                "reason": None,
                "projection": "local_equirectangular_km",
            },
            "aoo": aoo,
        }
    )


@mcp.tool()
def kde_bandwidth_reference(coords: list[list[float]]) -> dict[str, Any]:
    """Isotropic Scott/Silverman bandwidth in km, d=2: h = n^(-1/6) * σ. coords [lon, lat]."""
    if len(coords) < 2:
        return _json({"n": len(coords), "bandwidthKm": None, "reason": "need_two_points"})
    origin_lon = sum(float(p[0]) for p in coords) / len(coords)
    origin_lat = sum(float(p[1]) for p in coords) / len(coords)
    km_lon = max(KM_PER_DEG_LON_EQUATOR * math.cos(math.radians(origin_lat)), 1e-6)
    xs = np.array([(float(p[0]) - origin_lon) * km_lon for p in coords], dtype=float)
    ys = np.array([(float(p[1]) - origin_lat) * KM_PER_DEG_LAT for p in coords], dtype=float)
    if len(xs) < 2:
        sigma = 0.0
    else:
        sigma = math.sqrt(((float(xs.std(ddof=1)) ** 2) + (float(ys.std(ddof=1)) ** 2)) / 2)
    n = len(coords)
    if not math.isfinite(sigma) or sigma <= 0:
        h = 0.25
    else:
        h = max(0.25, sigma * n ** (-1 / 6))
    return _json({"n": n, "sigmaKm": sigma, "bandwidthKm": h})


@mcp.tool()
def normal_cdf_reference(z: float) -> dict[str, Any]:
    """SciPy Φ(z). Compare with the Abramowitz–Stegun approximation in yearTrend.js."""
    return _json({"z": z, "cdf": float(norm.cdf(z)), "sf": float(norm.sf(z))})


@mcp.tool()
def compare_js_to_reference(
    js: dict[str, Any],
    reference: dict[str, Any],
    abs_tol: float = 1e-9,
    rel_tol: float = 1e-6,
) -> dict[str, Any]:
    """Compare nested numeric JS output against an MCP reference dict."""

    mismatches: list[dict[str, Any]] = []
    checked = 0

    def walk(path: str, left: Any, right: Any) -> None:
        nonlocal checked
        if isinstance(left, dict) and isinstance(right, dict):
            for key in left:
                if key not in right:
                    continue
                walk(f"{path}.{key}" if path else key, left[key], right[key])
            return
        if isinstance(left, (int, float)) and isinstance(right, (int, float)):
            checked += 1
            lf = float(left)
            rf = float(right)
            if math.isclose(lf, rf, rel_tol=rel_tol, abs_tol=abs_tol):
                return
            mismatches.append(
                {
                    "path": path,
                    "js": lf,
                    "reference": rf,
                    "absDiff": abs(lf - rf),
                    "reason": "numeric_mismatch",
                }
            )
            return
        if left != right and not (left is None and right is None):
            mismatches.append({"path": path, "js": left, "reference": right, "reason": "value_mismatch"})

    walk("", js, reference)
    return _json({"ok": len(mismatches) == 0, "checkedNumbers": checked, "mismatches": mismatches})


@mcp.prompt()
def verify_flora_algorithm(algorithm: str) -> str:
    """Ask the agent to verify a Flora35 math algorithm against SciPy/NumPy references."""
    return f"""Verify Flora35 algorithm «{algorithm}».

1. Read flora-math://algorithms and the matching JS module.
2. Pick a small fixture (from existing tests if possible).
3. Compute the JS result (from tests or by running the function).
4. Call the matching flora-math MCP tool with the same input.
5. Call compare_js_to_reference.
6. Report matches, mismatches, and whether a difference is geodesic vs planar (EOO) or Kendall-a vs Kendall-b.
"""


if __name__ == "__main__":
    mcp.run(transport="stdio")
