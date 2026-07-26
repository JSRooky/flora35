import React, { useCallback, useEffect, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import {
  addLocationsLayer,
  applyLocationsFilter,
  clearLocationsFilter
} from "./components/addLocationsLayer";
import {
  addArealLayer,
  clearArealLayer,
  refreshArealDisplay
} from "./components/addArealLayer";
import FeaturePopup from "./components/FeaturePopup";
import ArealPopup from "./components/ArealPopup";
import "./MapView.css";

export default function MapView() {
  const ref = useRef(null);
  const map = useRef(null);

  const [popupData, setPopupData] = useState(null);
  const [propertyFilters, setPropertyFilters] = useState({});
  const [arealEnabled, setArealEnabled] = useState(false);
  const [arealAllMarkers, setArealAllMarkers] = useState(false);
  const [arealRadius, setArealRadius] = useState(5);

  const arealStateRef = useRef({});
  arealStateRef.current = {
    popupData,
    arealEnabled,
    arealAllMarkers,
    arealRadius,
    propertyFilters
  };

  const expandedLeavesRef = useRef(null);

  const refreshAreal = useCallback(() => {
    const mapInstance = map.current;
    const {
      popupData: feature,
      arealEnabled: enabled,
      arealAllMarkers: allMarkers,
      arealRadius: radiusKm,
      propertyFilters: filters
    } = arealStateRef.current;

    if (!mapInstance || !feature) {
      return;
    }

    refreshArealDisplay(mapInstance, {
      allMarkers,
      enabled,
      feature,
      radiusKm,
      filters,
      expandedLeaves: expandedLeavesRef.current
    });

    expandedLeavesRef.current = null;
  }, []);

  const refreshArealRef = useRef(refreshAreal);
  refreshArealRef.current = refreshAreal;

  const scheduleArealRefresh = useCallback(() => {
    const mapInstance = map.current;
    if (!mapInstance) {
      return;
    }

    mapInstance.once("idle", () => {
      refreshArealRef.current();
    });
  }, []);

  useEffect(() => {
    if (!map.current) {
      return;
    }

    applyLocationsFilter(map.current, propertyFilters);
  }, [propertyFilters]);

  useEffect(() => {
    refreshAreal();
  }, [popupData, arealEnabled, arealAllMarkers, arealRadius, propertyFilters, refreshAreal]);

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
      if (event.sourceId === "locations" && event.isSourceLoaded) {
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

  const handleClosePopup = () => {
    if (map.current) {
      clearArealLayer(map.current);
      clearLocationsFilter(map.current);
    }
    setPopupData(null);
    setPropertyFilters({});
    setArealEnabled(false);
    setArealAllMarkers(false);
  };

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
          }
        });
        addArealLayer(map.current);

        map.current.on("click", "unclustered-point", (e) => {
          const feature = e.features?.[0];
          if (feature) {
            setPopupData(feature);
          }
        });

        map.current.on("mouseenter", "unclustered-point", () => {
          map.current.getCanvas().style.cursor = "pointer";
        });

        map.current.on("mouseleave", "unclustered-point", () => {
          map.current.getCanvas().style.cursor = "";
        });
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  return (
    <>
      <div ref={ref} className="map-container" />
      {popupData && (
        <div className="popup-stack">
          <FeaturePopup
            feature={popupData}
            onClose={handleClosePopup}
            activeFilters={propertyFilters}
            onFilterChange={handlePropertyFilterChange}
          />
          <ArealPopup
            enabled={arealEnabled}
            allMarkers={arealAllMarkers}
            radius={arealRadius}
            onEnabledChange={setArealEnabled}
            onAllMarkersChange={setArealAllMarkers}
            onRadiusChange={setArealRadius}
          />
        </div>
      )}
    </>
  );
}
