import React, { useState } from "react";
import "../styles/FeatureImagesPopup.css";

export default function FeatureImagesPopup({ images, onClose }) {
  if (!images || images.length === 0) return null;

  const [index, setIndex] = useState(0);
  const [imagePopupData, setImagePopupData] = useState(null);

  const next = () => setIndex((i) => (i + 1) % images.length);
  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);

  React.createElement(FeatureImagesPopup, {
  images: imagePopupData,
  onClose: () => setImagePopupData(null)
})


  return React.createElement(
    "div",
    { className: "img-popup" },

    // Кнопка закрытия
    React.createElement(
      "button",
      { className: "img-popup-close", onClick: onClose },
      "×"
    ),

    // Контент галереи
    React.createElement(
      "div",
      { className: "img-popup-content" },

      // Текущее изображение
      React.createElement("img", {
        src: images[index],
        alt: "species",
        className: "img-popup-image"
      }),

      // Пагинация
      images.length > 1 &&
        React.createElement(
          "div",
          { className: "img-popup-controls" },

          React.createElement(
            "button",
            { className: "img-popup-btn", onClick: prev },
            "←"
          ),

          React.createElement(
            "span",
            { className: "img-popup-counter" },
            `${index + 1} / ${images.length}`
          ),

          React.createElement(
            "button",
            { className: "img-popup-btn", onClick: next },
            "→"
          )
        )
    )
  );
}
