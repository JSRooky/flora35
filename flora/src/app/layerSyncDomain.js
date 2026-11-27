/** app/layerSyncDomain.js — домен, вынесенный из App.js механически (без изменения поведения). */
import { useEffect, useCallback } from "react";
import { setHiddenPointKeysForFilter, applyLocationsFilter, applyGbifLocationsFilter, applyInatLocationsFilter, setHoverTooltipsEnabled } from "../components/addLocationsLayer";
import { loadPointAttributionsFromFirestore } from "../firebase/loadPointAttributionsFromFirestore";
import { loadMergedPointsFromFirestore } from "../firebase/loadMergedPointsFromFirestore";
import { setMergedData } from "../components/addMergedLayer";
import { hydrateRegionOverlaysFromPersistence, persistTempLayers } from "../tempLayers/tempLayerPersistence";
import { getRegionBoundsDisplaySource, REGION_BOUNDS_DISPLAY_SOURCES, setRegionBoundsDisplaySource, setRegionBoundsContoursEnabled, getVisibleRegionOverlayEditState, listOsmOverlaySelectableIsos, listTempLayerPlaques, appendRegionPolygonToTempPlaque } from "../tempLayers/tempLayerStore";
import { setTempLayerOverlaysData, applyTempRegionOverlayPaint, setTempOverlaySelectedIsos } from "../components/addTempLayerOverlaysLayer";
import { DATA_SOURCE_MODES } from "../locations/loadPoints";
import { listLoadedRegionCatalogIsos } from "../map/regionLoadSummary";
import { setRegionBoundsEnabled, applyRegionBoundsPaintSettings, applyRegionBoundsIsoFilter, setRegionBoundsSelectedIsos, setRegionBoundsLoadedIsos, updateRegionSelectionBuffer, loadRegionBoundsGeoJSON, buildRegionCatalog, setRegionBoundsSelectHandler, showRegionActionPopup, hideRegionActionPopup, getRegionEntryByIso } from "../components/addRegionBoundsLayer";
import { loadRegionBoundsSettingsFromStorage, createSubtleRegionColorMap } from "../components/regionBoundsSettings";
import { BASEMAP_MODES } from "../config/basemapOptions";
import { setOsmBasemapEnabled } from "../components/addOsmBasemapLayer";
import { setYandexBasemapEnabled } from "../components/addYandexBasemapLayer";
import { clearSpeciesPolygonLayer } from "../components/addSpeciesPolygonLayer";
import { DEFAULT_AREAL_RADIUS_KM } from "../components/ArealPopup";
import { DEFAULT_BUFFER_RADII_KM } from "../components/addBufferLayer";

/**
 * @param {object} deps — значения из App.js, захваченные замыканиями вынесенного кода.
 */
export function useLayerSyncDomain({
  basemapMode,
  bumpPointsDataRevision,
  dataSourceMode,
  effectiveHiddenPointKeys,
  hiddenRegionIsoSet,
  hiddenRegionIsos,
  hiddenRegionIsosRef,
  hoverTooltipsDisabled,
  locationFilters,
  map,
  mapReady,
  overlayRegionBufferKm,
  overlayRegionEdit,
  overlayRegionModeRef,
  pointsDataRevision,
  regionAddModeRef,
  regionBoundsDisplaySource,
  regionBoundsEnabled,
  regionBoundsSettings,
  regionBufferKm,
  regionCatalog,
  regionCatalogRef,
  regionFeatureColors,
  selectedRegionIsos,
  selectedRegionIsosRef,
  setActivePolygonId,
  setArealAllMarkers,
  setArealEnabled,
  setArealRadius,
  setBufferEnabled,
  setBufferRadii,
  setBufferSelectedPoints,
  setBufferSelectionMode,
  setHiddenRegionIsos,
  setIntersectionLockedPair,
  setIntersectionOnlyMode,
  setIntersectionResult,
  setIntersectionSpeciesA,
  setIntersectionSpeciesB,
  setMergeHiddenKeys,
  setOverlayRegionBufferKm,
  setPolygonAddMode,
  setRegionAddMode,
  setRegionBoundsDisplaySourceState,
  setRegionBoundsSettings,
  setRegionCatalog,
  setRegionFeatureColors,
  setRegionOverlaysHydrated,
  setSelectedRegionIsos,
  setSpeciesPolygons,
  setTempLayersRevision,
  tempLayersRevision,
}) {
  useEffect(() => {
    setHiddenPointKeysForFilter(effectiveHiddenPointKeys);
  }, [effectiveHiddenPointKeys]);

  useEffect(() => {
    if (!mapReady || !map.current) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        await loadPointAttributionsFromFirestore();
        if (cancelled || !map.current) {
          return;
        }

        applyLocationsFilter(map.current, locationFilters);
        applyGbifLocationsFilter(map.current, locationFilters);
        applyInatLocationsFilter(map.current, locationFilters);
        bumpPointsDataRevision();
      } catch (error) {
        console.warn("Failed to load point attributions:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Только при готовности карты: locationFilters подхватит оверлей через apply* ниже.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, bumpPointsDataRevision]);

  useEffect(() => {
    if (!mapReady || !map.current) {
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await loadMergedPointsFromFirestore();
        if (cancelled || !map.current) {
          return;
        }

        setMergedData(map.current, result.collection);

        if (result.hiddenKeys.length > 0) {
          setMergeHiddenKeys((current) => {
            const nextSet = new Set(current);
            result.hiddenKeys.forEach((key) => {
              if (key) {
                nextSet.add(String(key));
              }
            });
            return [...nextSet];
          });
          bumpPointsDataRevision();
        }
      } catch (error) {
        console.warn("Failed to load merged points:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mapReady, bumpPointsDataRevision, map, setMergeHiddenKeys]);

  useEffect(() => {
    setHoverTooltipsEnabled(!hoverTooltipsDisabled);
  }, [hoverTooltipsDisabled]);

  useEffect(() => {
    if (!mapReady) {
      return undefined;
    }
    let cancelled = false;
    void hydrateRegionOverlaysFromPersistence().then(() => {
      if (cancelled) {
        return;
      }
      setRegionBoundsDisplaySourceState(getRegionBoundsDisplaySource());
      setTempLayersRevision((value) => value + 1);
      setRegionOverlaysHydrated(true);
      if (map.current) {
        setTempLayerOverlaysData(map.current);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [mapReady, setRegionBoundsDisplaySourceState, setTempLayersRevision, setRegionOverlaysHydrated, map]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }
    const loadedIsos =
      overlayRegionEdit.active || dataSourceMode === DATA_SOURCE_MODES.NONE
        ? []
        : listLoadedRegionCatalogIsos(regionCatalog).filter((iso) => !hiddenRegionIsoSet.has(iso));
    const useOsmContours =
      regionBoundsDisplaySource === REGION_BOUNDS_DISPLAY_SOURCES.OSM;
    setRegionBoundsDisplaySource(regionBoundsDisplaySource);
    setRegionBoundsContoursEnabled(regionBoundsEnabled);
    const showRegionBounds =
      !useOsmContours && (regionBoundsEnabled || loadedIsos.length > 0);
    setRegionBoundsEnabled(map.current, showRegionBounds);
    if (!overlayRegionEdit.active) {
      applyRegionBoundsPaintSettings(map.current, regionBoundsSettings, regionFeatureColors);
    } else {
      const overlayEdit = getVisibleRegionOverlayEditState();
      applyTempRegionOverlayPaint(map.current, {
        settings: overlayEdit.style || regionBoundsSettings,
        featureColors: overlayEdit.featureColors
      });
    }

    const allVisible = hiddenRegionIsos.length === 0;
    const catalogVisibleIsos = allVisible
      ? null
      : regionCatalog
          .map((entry) => entry.iso)
          .filter((iso) => !hiddenRegionIsoSet.has(iso));
    const visibleIsos =
      !regionBoundsEnabled && loadedIsos.length > 0 ? loadedIsos : catalogVisibleIsos;
    applyRegionBoundsIsoFilter(map.current, visibleIsos);
    setRegionBoundsSelectedIsos(map.current, selectedRegionIsos);
    setRegionBoundsLoadedIsos(map.current, loadedIsos);
    setTempLayerOverlaysData(map.current, { hiddenIsos: hiddenRegionIsos });
    setTempOverlaySelectedIsos(map.current, selectedRegionIsos);
  }, [
    mapReady,
    regionBoundsEnabled,
    regionBoundsDisplaySource,
    regionBoundsSettings,
    regionFeatureColors,
    hiddenRegionIsos,
    hiddenRegionIsoSet,
    regionCatalog,
    selectedRegionIsos,
    overlayRegionEdit,
    pointsDataRevision,
    tempLayersRevision,
    dataSourceMode,
    map
  ]);

  useEffect(() => {
    if (overlayRegionEdit.active && !overlayRegionModeRef.current) {
      setOverlayRegionBufferKm(overlayRegionEdit.bufferKm);
      if (overlayRegionEdit.style) {
        setRegionBoundsSettings(overlayRegionEdit.style);
      }
    } else if (!overlayRegionEdit.active && overlayRegionModeRef.current) {
      setRegionBoundsSettings(loadRegionBoundsSettingsFromStorage());
    }
    overlayRegionModeRef.current = overlayRegionEdit.active;
  }, [
    overlayRegionEdit.active,
    overlayRegionEdit.bufferKm,
    overlayRegionEdit.style,
    overlayRegionModeRef,
    setOverlayRegionBufferKm,
    setRegionBoundsSettings
  ]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (overlayRegionEdit.active) {
      updateRegionSelectionBuffer(
        map.current,
        overlayRegionEdit.features,
        overlayRegionBufferKm
      );
      return;
    }

    const features = regionBoundsEnabled
      ? selectedRegionIsos
          .map((iso) => regionCatalog.find((entry) => entry.iso === iso)?.feature)
          .filter(Boolean)
      : [];
    updateRegionSelectionBuffer(map.current, features, regionBufferKm);
  }, [
    mapReady,
    overlayRegionEdit,
    overlayRegionBufferKm,
    regionBoundsEnabled,
    regionCatalog,
    selectedRegionIsos,
    regionBufferKm,
    map
  ]);

  useEffect(() => {
    if (!mapReady) {
      return undefined;
    }

    let cancelled = false;
    loadRegionBoundsGeoJSON()
      .then((data) => {
        if (!cancelled) {
          setRegionCatalog(buildRegionCatalog(data));
        }
      })
      .catch((error) => {
        console.error("Не удалось загрузить каталог регионов", error);
      });

    return () => {
      cancelled = true;
    };
  }, [mapReady, setRegionCatalog]);

  useEffect(() => {
    if (!regionCatalog.length) {
      return;
    }
    setRegionFeatureColors((current) => {
      if (current && Object.keys(current).length > 0) {
        return current;
      }
      return createSubtleRegionColorMap(
        regionCatalog.map((entry) => entry.iso),
        regionBoundsSettings.fillColor
      );
    });
  }, [regionCatalog, regionBoundsSettings.fillColor, setRegionFeatureColors]);

  useEffect(() => {
    setRegionBoundsSelectHandler((entry, lngLat) => {
      if (!entry?.iso || !map.current) {
        return;
      }

      const alreadySelected = selectedRegionIsosRef.current.includes(entry.iso);
      const nextSelection = alreadySelected
        ? selectedRegionIsosRef.current
        : regionAddModeRef.current
          ? [...selectedRegionIsosRef.current, entry.iso]
          : [entry.iso];

      selectedRegionIsosRef.current = nextSelection;
      setSelectedRegionIsos(nextSelection);

      showRegionActionPopup(map.current, {
        title: entry.name,
        lngLat,
        selected: alreadySelected,
        onAdd: () => {
          regionAddModeRef.current = true;
          setRegionAddMode(true);
          if (hiddenRegionIsosRef.current.length > 0) {
            hiddenRegionIsosRef.current = [];
            setHiddenRegionIsos([]);
          }
          hideRegionActionPopup();
        },
        onRemove: () => {
          const next = selectedRegionIsosRef.current.filter((iso) => iso !== entry.iso);
          selectedRegionIsosRef.current = next;
          setSelectedRegionIsos(next);
          if (next.length === 0) {
            regionAddModeRef.current = false;
            setRegionAddMode(false);
          }
          hideRegionActionPopup();
        },
        onIsolate: () => {
          const keep = new Set(selectedRegionIsosRef.current);
          const hidden = [
            ...regionCatalogRef.current.map((item) => item.iso).filter((iso) => !keep.has(iso)),
            ...listOsmOverlaySelectableIsos().filter((iso) => !keep.has(iso))
          ];
          hiddenRegionIsosRef.current = hidden;
          setHiddenRegionIsos(hidden);
          regionAddModeRef.current = false;
          setRegionAddMode(false);
          hideRegionActionPopup();
        },
        getTempLayerChoices: () =>
          listTempLayerPlaques().map((plaque) => ({
            key: plaque.key,
            label: plaque.label || plaque.taxonName || "Слой"
          })),
        onAddToLayer: (plaqueKey) => {
          const catalogFeature = getRegionEntryByIso(entry.iso)?.feature;
          const feature = catalogFeature || entry.feature;
          const result = appendRegionPolygonToTempPlaque(plaqueKey, {
            iso: entry.iso,
            feature,
            name: entry.name
          });
          if (result?.ok) {
            persistTempLayers().catch(() => {});
          }
          hideRegionActionPopup();
        }
      });
    });
    return () => setRegionBoundsSelectHandler(null);
  }, [
    hiddenRegionIsosRef,
    map,
    regionAddModeRef,
    regionCatalogRef,
    selectedRegionIsosRef,
    setHiddenRegionIsos,
    setRegionAddMode,
    setSelectedRegionIsos
  ]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (basemapMode === BASEMAP_MODES.YANDEX) {
      setOsmBasemapEnabled(map.current, false);
      setYandexBasemapEnabled(map.current, true);
      return;
    }

    setYandexBasemapEnabled(map.current, false);

    if (basemapMode === BASEMAP_MODES.OSM) {
      setOsmBasemapEnabled(map.current, true);
      return;
    }

    setOsmBasemapEnabled(map.current, false);
  }, [basemapMode, mapReady, map]);

  const handleSpeciesPolygonResetAll = useCallback(() => {
    setSpeciesPolygons([]);
    setActivePolygonId(null);
    setPolygonAddMode(false);
    setIntersectionSpeciesA(null);
    setIntersectionSpeciesB(null);
    setIntersectionResult(null);
    setIntersectionOnlyMode(false);
    setIntersectionLockedPair(null);

    if (map.current) {
      clearSpeciesPolygonLayer(map.current);
    }
  }, [
    map,
    setActivePolygonId,
    setIntersectionLockedPair,
    setIntersectionOnlyMode,
    setIntersectionResult,
    setIntersectionSpeciesA,
    setIntersectionSpeciesB,
    setPolygonAddMode,
    setSpeciesPolygons
  ]);

  const handleArealReset = useCallback(() => {
    setArealEnabled(false);
    setArealAllMarkers(false);
    setArealRadius(DEFAULT_AREAL_RADIUS_KM);
  }, [setArealAllMarkers, setArealEnabled, setArealRadius]);

  const handleBufferReset = useCallback(() => {
    setBufferEnabled(false);
    setBufferRadii(DEFAULT_BUFFER_RADII_KM);
    setBufferSelectedPoints([]);
    setBufferSelectionMode(false);
  }, [
    setBufferEnabled,
    setBufferRadii,
    setBufferSelectedPoints,
    setBufferSelectionMode
  ]);

  return { handleArealReset, handleBufferReset, handleSpeciesPolygonResetAll };
}
