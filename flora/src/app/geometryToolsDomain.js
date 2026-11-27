/** app/geometryToolsDomain.js — домен, вынесенный из App.js механически (без изменения поведения). */
import { useEffect } from "react";
import { isPolygonToolActive } from "../components/getToolWithinFeature";
import { MODULE_IDS } from "../components/ModuleMenu";
import { POLYGON_BUILD_MODES, syncSpeciesPolygonLayer, updateSpeciesPolygonIntersectionLayer, clearSpeciesPolygonIntersectionLayer } from "../components/addSpeciesPolygonLayer";
import { buildArealDynamicsSlices, filterSlicesUpToYear } from "../components/buildArealDynamicsSlices";
import { syncArealDynamicsLayer, clearArealDynamicsLayer } from "../components/addArealDynamicsLayer";
import { updateAreaSelectionLayer, clearAreaSelectionLayer, stopActiveAreaDrawing, startAreaDrawing, updateAreaSelectionPreview, applyAreaGeometryOperation, AREA_OPERATION_MODES } from "../components/addAreaSelectionLayer";

/**
 * @param {object} deps — значения из App.js, захваченные замыканиями вынесенного кода.
 */
export function useGeometryToolsDomain({
  activeModule,
  areaDrawTool,
  areaDrawingActive,
  areaGeometry,
  areaOperationMode,
  arealDynamicsBuildMode,
  arealDynamicsEnabled,
  arealDynamicsFeature,
  arealDynamicsSlices,
  builtSpeciesPolygons,
  clearIntersectionState,
  computeIntersectionFromSelection,
  intersectionLockedPair,
  intersectionOnlyMode,
  intersectionPinned,
  intersectionResult,
  map,
  mapReady,
  polygonDockedWithFeature,
  popupData,
  setAreaDrawingActive,
  setAreaGeometry,
  setAreaOperationMode,
  setArealDynamicsBuildMode,
  setArealDynamicsComputing,
  setArealDynamicsEnabled,
  setArealDynamicsFeature,
  setArealDynamicsHideOthers,
  setArealDynamicsSlices,
  setIntersectionLockedPair,
  setIntersectionOnlyMode,
  setIntersectionResult,
  setIntersectionSpeciesA,
  setIntersectionSpeciesB,
  setPolygonAddMode,
  speciesPolygons,
  timelineYear,
}) {
  useEffect(() => {
    if (!isPolygonToolActive(activeModule, polygonDockedWithFeature)) {
      setPolygonAddMode(false);
      clearIntersectionState();
    }
  }, [activeModule, clearIntersectionState, polygonDockedWithFeature, setPolygonAddMode]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.TIMELINE) {
      setArealDynamicsEnabled(false);
      setArealDynamicsFeature(null);
      setArealDynamicsSlices([]);
      setArealDynamicsComputing(false);
      setArealDynamicsHideOthers(false);
      setArealDynamicsBuildMode(POLYGON_BUILD_MODES.CONVEX);
    }
  }, [
    activeModule,
    setArealDynamicsEnabled,
    setArealDynamicsFeature,
    setArealDynamicsSlices,
    setArealDynamicsComputing,
    setArealDynamicsHideOthers,
    setArealDynamicsBuildMode
  ]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.TIMELINE || !arealDynamicsEnabled || !popupData) {
      return;
    }

    setArealDynamicsFeature(popupData);
  }, [activeModule, arealDynamicsEnabled, popupData, setArealDynamicsFeature]);

  useEffect(() => {
    if (!arealDynamicsEnabled || !arealDynamicsFeature) {
      setArealDynamicsSlices([]);
      setArealDynamicsComputing(false);
      return undefined;
    }

    setArealDynamicsComputing(true);
    const timer = window.setTimeout(() => {
      setArealDynamicsSlices(
        buildArealDynamicsSlices(arealDynamicsFeature, arealDynamicsBuildMode)
      );
      setArealDynamicsComputing(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    arealDynamicsEnabled,
    arealDynamicsFeature,
    arealDynamicsBuildMode,
    setArealDynamicsSlices,
    setArealDynamicsComputing
  ]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    let polygonsToSync = speciesPolygons;

    if (
      activeModule === MODULE_IDS.TIMELINE &&
      arealDynamicsEnabled &&
      arealDynamicsFeature?.properties?.name_latin
    ) {
      const activeLatin = arealDynamicsFeature.properties.name_latin;
      polygonsToSync = speciesPolygons.map((entry) =>
        entry.nameLatin === activeLatin ? { ...entry, hidden: true } : entry
      );
    } else if (
      intersectionOnlyMode &&
      intersectionResult?.hasIntersection &&
      intersectionResult.speciesA &&
      intersectionResult.speciesB
    ) {
      const hiddenLatins = new Set([
        intersectionResult.speciesA.nameLatin,
        intersectionResult.speciesB.nameLatin
      ]);

      polygonsToSync = speciesPolygons.map((entry) =>
        hiddenLatins.has(entry.nameLatin) ? { ...entry, hidden: true } : entry
      );
    }

    syncSpeciesPolygonLayer(map.current, polygonsToSync);
  }, [
    speciesPolygons,
    mapReady,
    activeModule,
    arealDynamicsEnabled,
    arealDynamicsFeature,
    intersectionOnlyMode,
    intersectionResult,
    map
  ]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (
      activeModule === MODULE_IDS.TIMELINE &&
      arealDynamicsEnabled &&
      arealDynamicsSlices.length > 0
    ) {
      syncArealDynamicsLayer(
        map.current,
        filterSlicesUpToYear(arealDynamicsSlices, timelineYear)
      );
      return;
    }

    clearArealDynamicsLayer(map.current);
  }, [
    activeModule,
    arealDynamicsEnabled,
    arealDynamicsSlices,
    timelineYear,
    mapReady,
    map
  ]);

  useEffect(() => {
    if (!intersectionLockedPair) {
      return;
    }

    const hasA = builtSpeciesPolygons.some(
      (entry) => entry.nameLatin === intersectionLockedPair.latinA
    );
    const hasB = builtSpeciesPolygons.some(
      (entry) => entry.nameLatin === intersectionLockedPair.latinB
    );

    if (!hasA || !hasB) {
      setIntersectionLockedPair(null);
    }
  }, [intersectionLockedPair, builtSpeciesPolygons, setIntersectionLockedPair]);

  useEffect(() => {
    if (intersectionResult) {
      setPolygonAddMode(false);
    }
  }, [intersectionResult, setPolygonAddMode]);

  useEffect(() => {
    if (!intersectionResult?.hasIntersection) {
      setIntersectionOnlyMode(false);
    }
  }, [intersectionResult, setIntersectionOnlyMode]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (intersectionResult?.hasIntersection && intersectionResult.feature) {
      updateSpeciesPolygonIntersectionLayer(map.current, intersectionResult.feature);
      return;
    }

    clearSpeciesPolygonIntersectionLayer(map.current);
  }, [intersectionResult, mapReady, map]);

  useEffect(() => {
    if (builtSpeciesPolygons.length < 2) {
      setIntersectionSpeciesA(null);
      setIntersectionSpeciesB(null);
      clearIntersectionState();
      return;
    }

    setIntersectionSpeciesA((current) => {
      if (current && builtSpeciesPolygons.some((entry) => entry.nameLatin === current)) {
        return current;
      }

      return builtSpeciesPolygons[0]?.nameLatin ?? null;
    });

    setIntersectionSpeciesB((current) => {
      if (current && builtSpeciesPolygons.some((entry) => entry.nameLatin === current)) {
        return current;
      }

      return builtSpeciesPolygons[1]?.nameLatin ?? null;
    });
  }, [
    builtSpeciesPolygons,
    clearIntersectionState,
    setIntersectionSpeciesA,
    setIntersectionSpeciesB
  ]);

  useEffect(() => {
    if (!intersectionPinned) {
      return;
    }

    const nextResult = computeIntersectionFromSelection();

    if (!nextResult) {
      clearIntersectionState();
      return;
    }

    setIntersectionResult(nextResult);
  }, [
    speciesPolygons,
    intersectionPinned,
    computeIntersectionFromSelection,
    clearIntersectionState,
    setIntersectionResult
  ]);

  useEffect(() => {
    if (activeModule !== MODULE_IDS.AREA) {
      setAreaDrawingActive(false);
    }
  }, [activeModule, setAreaDrawingActive]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    if (areaGeometry) {
      updateAreaSelectionLayer(map.current, areaGeometry);
    } else {
      clearAreaSelectionLayer(map.current);
    }
  }, [areaGeometry, mapReady, map]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !mapReady || activeModule !== MODULE_IDS.AREA || !areaDrawingActive) {
      stopActiveAreaDrawing();
      return;
    }

    startAreaDrawing(mapInstance, areaDrawTool, {
      onPreview: (coordinates) => {
        updateAreaSelectionPreview(mapInstance, coordinates);
      },
      onComplete: (ringCoordinates) => {
        setAreaGeometry((current) =>
          applyAreaGeometryOperation(current, ringCoordinates, areaOperationMode)
        );
        setAreaDrawingActive(false);
      },
      onCancel: () => {
        setAreaDrawingActive(false);
        updateAreaSelectionPreview(mapInstance, []);
      }
    });

    return () => {
      stopActiveAreaDrawing();
    };
  }, [
    areaDrawingActive,
    areaDrawTool,
    areaOperationMode,
    activeModule,
    mapReady,
    map,
    setAreaGeometry,
    setAreaDrawingActive
  ]);

  useEffect(() => {
    if (!areaGeometry && areaOperationMode === AREA_OPERATION_MODES.SUBTRACT) {
      setAreaOperationMode(AREA_OPERATION_MODES.ADD);
    }
  }, [areaGeometry, areaOperationMode, setAreaOperationMode]);

  return {};
}
