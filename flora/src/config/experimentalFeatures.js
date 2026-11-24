const STORAGE_PREFIX = "flora35-experimental-ack-";

export const EXPERIMENTAL_FEATURE_IDS = {
  COMPARE: "compare",
  ANALYSIS: "analysis"
};

export const EXPERIMENTAL_FEATURES = {
  [EXPERIMENTAL_FEATURE_IDS.COMPARE]: {
    id: EXPERIMENTAL_FEATURE_IDS.COMPARE,
    title: "Сравнение",
    message:
      "Функция «Сравнение» экспериментальная и находится в разработке. Инструмент может работать с ошибками."
  },
  [EXPERIMENTAL_FEATURE_IDS.ANALYSIS]: {
    id: EXPERIMENTAL_FEATURE_IDS.ANALYSIS,
    title: "Анализ",
    message:
      "Функция «Анализ» экспериментальная и находится в разработке. Инструмент может работать с ошибками."
  }
};

export function experimentalAckStorageKey(id) {
  return `${STORAGE_PREFIX}${id}`;
}

export function hasAcknowledgedExperimentalFeature(id) {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    return window.localStorage.getItem(experimentalAckStorageKey(id)) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeExperimentalFeature(id) {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.setItem(experimentalAckStorageKey(id), "1");
  } catch {
    // localStorage может быть недоступен — предупреждение покажется снова.
  }
}
