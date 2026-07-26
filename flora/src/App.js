import React, { useEffect, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import { addLocationsLayer } from "./components/addLocationsLayer";
import {
  addArealLayer,
  updateArealLayer,
  updateArealLayerForAll,
  clearArealLayer
} from "./components/addArealLayer";
import FeaturePopup from "./components/FeaturePopup";
import ArealPopup from "./components/ArealPopup";
import "./MapView.css";

export default function MapView() {
  const ref = useRef(null);
  const map = useRef(null);

  const [popupData, setPopupData] = useState(null);
  const [arealEnabled, setArealEnabled] = useState(false);
  const [arealAllMarkers, setArealAllMarkers] = useState(false);
  const [arealRadius, setArealRadius] = useState(5);

  useEffect(() => {
    if (!map.current || !popupData) {
      return;
    }

    if (arealAllMarkers) {
      updateArealLayerForAll(map.current, arealRadius);
    } else if (arealEnabled) {
      const [lng, lat] = popupData.geometry.coordinates;
      updateArealLayer(map.current, [lng, lat], arealRadius);
    } else {
      clearArealLayer(map.current);
    }
  }, [popupData, arealEnabled, arealAllMarkers, arealRadius]);

  const handleClosePopup = () => {
    if (map.current) {
      clearArealLayer(map.current);
    }
    setPopupData(null);
    setArealEnabled(false);
    setArealAllMarkers(false);
  };

  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", () => {
        addLocationsLayer(map.current);
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
          <FeaturePopup feature={popupData} onClose={handleClosePopup} />
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
