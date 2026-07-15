import React, { useEffect, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import { addLocationsLayer } from "./components/addLocationsLayer";
import FeaturePopup from "./components/FeaturePopup";
import "./MapView.css";

export default function MapView() {
  const ref = useRef(null);
  const map = useRef(null);

  const [popupData, setPopupData] = useState(null);

  useEffect(() => {
    if (!map.current && ref.current) {
      map.current = initMap(ref.current);

      map.current.on("load", () => {
        addLocationsLayer(map.current);

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
        <FeaturePopup
          feature={popupData}
          onClose={() => setPopupData(null)}
        />
      )}
    </>
  );
}
