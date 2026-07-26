import React, { useCallback, useEffect, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import {
  addLocationsLayer,
  applyLocationsFilter,
  setClusterByRegnum,
  setClusteringEnabled,
  setMarkersVisible
} from "./components/addLocationsLayer";
import {
  addHeatmapLayer,
  setHeatmapEnabled
} from "./components/addHeatmapLayer";
import {
  addArealLayer,
  clearArealLayer,
  refreshArealDisplay
} from "./components/addArealLayer";
import FeaturePopup from "./components/FeaturePopup";
import ArealPopup from "./components/ArealPopup";
import StatusFilterPanel from "./components/StatusFilterPanel";
import MapDisplayPanel from "./components/MapDisplayPanel";
import AboutProject from "./components/AboutProject";
import "./MapView.css";

const DEFAULT_CLUSTERING_ENABLED = true;
const DEFAULT_CLUSTER_BY_REGNUM = true;
const DEFAULT_MARKERS_VISIBLE = true;

export default function MapView() {
  const ref = useRef(null);
  const map = useRef(null);

  const [popupData, setPopupData] = useState(null);
  const [propertyFilters, setPropertyFilters] = useState({});
  const [statusFilters, setStatusFilters] = useState([]);
  const [clusterByRegnum, setClusterByRegnumState] = useState(DEFAULT_CLUSTER_BY_REGNUM);
  const [clusteringEnabled, setClusteringEnabledState] = useState(DEFAULT_CLUSTERING_ENABLED);
  const [markersVisible, setMarkersVisibleState] = useState(DEFAULT_MARKERS_VISIBLE);
  const [mapReady, setMapReady] = useState(false);
  const [heatmapEnabled, setHeatmapEnabledState] = useState(false);
  const [featurePopupCollapsed, setFeaturePopupCollapsed] = useState(true);
  const [arealPopupCollapsed, setArealPopupCollapsed] = useState(true);
  const [arealEnabled, setArealEnabled] = useState(false);
  const [arealAllMarkers, setArealAllMarkers] = useState(false);
  const [arealRadius, setArealRadius] = useState(5);

  const arealStateRef = useRef({});
  arealStateRef.current = {
    popupData,
    arealEnabled,
    arealAllMarkers,
    arealRadius,
    propertyFilters,
    statusFilters
  };

  const expandedLeavesRef = useRef(null);

  const refreshAreal = useCallback(() => {
    const mapInstance = map.current;
    const {
      popupData: feature,
      arealEnabled: enabled,
      arealAllMarkers: allMarkers,
      arealRadius: radiusKm,
      propertyFilters: filters,
      statusFilters: selectedStatuses
    } = arealStateRef.current;

    if (!mapInstance || !feature) {
      return;
    }

    const combinedFilters = { ...filters };
    if (selectedStatuses.length > 0) {
      combinedFilters.status = selectedStatuses;
    }

    refreshArealDisplay(mapInstance, {
      allMarkers,
      enabled,
      feature,
      radiusKm,
      filters: combinedFilters,
      expandedLeaves: expandedLeavesRef.current
    });

    expandedLeavesRef.current = null;
  }, []);

  const refreshArealRef = useRef(refreshAreal);
  refreshArealRef.current = refreshAreal;

  const arealRefreshScheduledRef = useRef(false);

  const scheduleArealRefresh = useCallback(() => {
    const mapInstance = map.current;
    // zoomend/moveend/sourcedata often fire together for a single gesture;
    // avoid stacking multiple "idle" listeners that would refresh twice.
    if (!mapInstance || arealRefreshScheduledRef.current) {
      return;
    }

    arealRefreshScheduledRef.current = true;
    mapInstance.once("idle", () => {
      arealRefreshScheduledRef.current = false;
      refreshArealRef.current();
    });
  }, []);

  const buildLocationFilters = useCallback(() => {
    const filters = { ...propertyFilters };

    if (statusFilters.length > 0) {
      filters.status = statusFilters;
    }

    return filters;
  }, [propertyFilters, statusFilters]);

  useEffect(() => {
    if (!map.current) {
      return;
    }

    applyLocationsFilter(map.current, buildLocationFilters());
  }, [buildLocationFilters]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setMarkersVisible(map.current, markersVisible);
  }, [markersVisible, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady) {
      return;
    }

    setClusteringEnabled(map.current, clusteringEnabled);
  }, [clusteringEnabled, mapReady]);

  useEffect(() => {
    if (!map.current || !mapReady || !clusteringEnabled) {
      return;
    }

    setClusterByRegnum(map.current, clusterByRegnum);
  }, [clusterByRegnum, clusteringEnabled, mapReady]);

  useEffect(() => {
    if (!map.current) {
      return;
    }

    setHeatmapEnabled(map.current, heatmapEnabled, buildLocationFilters());
  }, [heatmapEnabled, buildLocationFilters]);

  useEffect(() => {
    refreshAreal();
  }, [popupData, arealEnabled, arealAllMarkers, arealRadius, propertyFilters, statusFilters, refreshAreal]);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || !popupData) {
      return;
    }

    if (!arealEnabled && !arealAllMarkers) {
      return;
    }

    const handleMapChange = () => scheduleArealRefresh();
    const handleSourceData = (event) => {
      if (
        event.isSourceLoaded &&
        (event.sourceId === "locations" || event.sourceId.startsWith("locations-"))
      ) {
        scheduleArealRefresh();
      }
    };

    mapInstance.on("zoomend", handleMapChange);
    mapInstance.on("moveend", handleMapChange);
    mapInstance.on("sourcedata", handleSourceData);

    return () => {
      mapInstance.off("zoomend", handleMapChange);
      mapInstance.off("moveend", handleMapChange);
      mapInstance.off("sourcedata", handleSourceData);
    };
  }, [popupData, arealEnabled, arealAllMarkers, scheduleArealRefresh]);

  const handlePropertyFilterChange = (key, value, enabled) => {
    setPropertyFilters((prev) => {
      const next = { ...prev };
      if (enabled) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleStatusFilterChange = (status, enabled) => {
    setStatusFilters((prev) => {
      if (enabled) {
        return prev.includes(status) ? prev : [...prev, status];
      }

      return prev.filter((value) => value !== status);
    });
  };

  const clearPointSelection = useCallback(() => {
    if (map.current) {
      clearArealLayer(map.current);
    }

    setPopupData(null);
    setPropertyFilters({});
    setArealEnabled(false);
    setArealAllMarkers(false);
    setFeaturePopupCollapsed(true);
  }, []);

  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", () => {
        addLocationsLayer(map.current, {
          onClusterExpanded: (leaves) => {
            const { arealEnabled: enabled, arealAllMarkers: allMarkers } =
              arealStateRef.current;
            if (!enabled && !allMarkers) {
              return;
            }
            expandedLeavesRef.current = leaves;
            refreshArealRef.current();
          },
          onPointClick: (feature) => {
            setPopupData(feature);
            setFeaturePopupCollapsed(false);
          },
          onMapBackgroundClick: () => {
            clearPointSelection();
          },
          clusteringEnabled: DEFAULT_CLUSTERING_ENABLED,
          clusterByRegnum: DEFAULT_CLUSTER_BY_REGNUM,
          markersVisible: DEFAULT_MARKERS_VISIBLE
        });
        addArealLayer(map.current);
        addHeatmapLayer(map.current);
        setMapReady(true);
      });
    }

    return () => {
      setMapReady(false);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [clearPointSelection]);

  return (
    <>
      <div ref={ref} className="map-container" />
      <div className="right-panel-stack">
        <StatusFilterPanel
          activeStatusFilters={statusFilters}
          onStatusFilterChange={handleStatusFilterChange}
        />
        <MapDisplayPanel
          markersVisible={markersVisible}
          onMarkersVisibleChange={setMarkersVisibleState}
          heatmapEnabled={heatmapEnabled}
          onHeatmapEnabledChange={setHeatmapEnabledState}
          clusteringEnabled={clusteringEnabled}
          onClusteringEnabledChange={setClusteringEnabledState}
          clusterByRegnum={clusterByRegnum}
          onClusterByRegnumChange={setClusterByRegnumState}
        />
      </div>
      <div className="popup-stack">
        <FeaturePopup
          feature={popupData}
          collapsed={featurePopupCollapsed}
          onCollapsedChange={setFeaturePopupCollapsed}
          activeFilters={propertyFilters}
          onFilterChange={handlePropertyFilterChange}
          activeStatusFilters={statusFilters}
          onStatusFilterChange={handleStatusFilterChange}
        />
        <ArealPopup
          enabled={arealEnabled}
          allMarkers={arealAllMarkers}
          radius={arealRadius}
          onEnabledChange={setArealEnabled}
          onAllMarkersChange={setArealAllMarkers}
          onRadiusChange={setArealRadius}
          collapsed={arealPopupCollapsed}
          onCollapsedChange={setArealPopupCollapsed}
        />
      </div>
      <AboutProject />
    </>
  );
}
