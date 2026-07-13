import React, { useEffect, useRef, useState } from "react";
import { initMap } from "./components/initMap";
import { addLocationsLayer } from "./components/addLocationsLayer";
import { FeaturePopup } from "./components/FeaturePopup";
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
        FeaturePopup(map.current, setPopupData);
      });
    }
  }, []);

  return (
    <>
      <div ref={ref} className="map-container" />


    </>
  );
}
