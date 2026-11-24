# Производительность отображения точек и UI: бэклог

Документ фиксирует результаты аудита и порядок работ по двум задачам:

1. максимально быстрое отображение и отрисовка точек при как можно большем их числе;
2. разгрузка интерфейса — и по скорости работы, и по пользовательской логике.

Ссылки вида `flora/src/...:NNN` — точки входа в код. Оценки эффекта даны по
сложности операций и объёмам аллокаций; инструментальных замеров в браузере на
этом этапе не было (см. раздел «Как измерять»).

---

## 1. Сделано в этой итерации

Все изменения — без изменения поведения; проверка: `npm run build` + `npm test`.

| Изменение | Где | Что даёт |
|---|---|---|
| Один проход фильтрации вместо 6 последовательных `.filter` по всему массиву | `flora/src/components/addLocationsLayer.js` (`filterFeatures`) | −5 копий массива на 100k+ точек на каждое применение фильтра |
| Предикаты фильтров компилируются один раз на фильтр | там же (`compilePropertyFilterTests`, `compileWithinFeatureTest`) | нормализация `regnum`/`status`, множества значений и bbox полигона больше не пересчитываются для каждой точки |
| bbox-пречек перед `booleanPointInPolygon` | там же | turf вызывается только для точек рядом с полигоном, а не для всей выборки |
| Нормализация поиска по виду один раз на фильтр | `flora/src/locations/speciesSearchFilter.js` (`createSpeciesSearchPredicate`) | убирает `trim`/`toLowerCase` на каждую точку |
| Allowlist видов через `Set` вместо `.some(speciesDisplayKey)` | `flora/src/locations/regionSpeciesAllowlist.js` (`createRegionSpeciesAllowlistPredicate`) | снимает 10⁷–10⁸ строковых операций (N точек × M видов) |
| Наложение атрибуций пропускается, если сохранённых атрибуций нет | `flora/src/dataWork/pointAttributionOverlay.js` | убирает O(n) проход и вычисление ключа точки на каждый фильтр в обычном режиме |
| Повторное применение скрытых ключей не пересобирает источник | `addGbifLayer.js`, `addInatLayer.js`, `addTempLayersLayer.js` | клик по точке/булавке больше не вызывает полный `setData` + перестройку Supercluster (для временных слоёв — ещё и teardown всех слоёв) |
| `getPointsForSpecies` и сортировка свойств не считаются в теле рендера | `flora/src/components/FeaturePopup.js` | панель «О точке» больше не проходит по всей выборке при каждом локальном `setState` (раскрытие details, «Найти», «Поделиться») |

---

## 1.1 Сделано: раскладка панелей и режим слабых ПК

| Изменение | Где | Что даёт |
|---|---|---|
| Единая ширина панелей через токен `--flora-panel-width` | `flora/src/styles/panelMetrics.css`, `flora/src/App.js` | панели больше не «прыгают» по ширине (было 280–480px), стек выглядит ровно; на узких экранах ширина ограничена вьюпортом |
| Несколько развёрнутых панелей одновременно | `flora/src/app/panelDomain.js` | открытие панели (из меню, из дока, кликом по карте) не закрывает и не сворачивает уже открытые; снято сворачивание соседних панелей при открытии «Сведений о точке», обработки плотных групп и пары «Источники/Обработка внешних данных» |
| Панель не привязана к активному модулю | `flora/src/app/panelDomain.js` (`openPanelIds`), `flora/src/App.js` (`MODULE_PANEL_IDS`) | открыл «Год», переключился на «Сезонность» — обе панели остались на экране и в доке; крестик закрывает панель окончательно и снимает подсветку модуля |
| Док собирает все открытые панели | `flora/src/app/taskbarDomain.js`, `flora/src/App.js` | в доке видны развёрнутые, свёрнутые в полоску и убранные панели; клик по иконке разворачивает/возвращает панель, повторный клик убирает её в док; `restorePanel` больше не уводит остальные панели в док; покрыто тестами `taskbarDomain.test.js` |
| Открытие панелей из меню | `flora/src/App.js` (`openComparePanel`, `openAnalysisPanel`, `handleReportPanelToggle`, `handleOpenTempArchive`) | панель сразу разворачивается, но уже открытые панели не закрываются и не сворачиваются |
| Режим «для слабых ПК» | `flora/src/config/performanceMode.js`, переключатель в «Группах точек» | отключает `backdrop-filter`, анимации/переходы, тени панелей и подсказки при наведении; выбор сохраняется в `localStorage` |
| Выравнивание «подпись — значение» и перенос длинных названий | `flora/src/styles/FeaturePopup.css`, `panelMetrics.css` | значения в «О точке» стоят на одной вертикали, латинские названия переносятся вместо распирания панели |
| Общий примитив разметки панелей | `flora/src/components/panel/PanelPrimitives.js`, `flora/src/styles/panelUi.css` | `PanelSection` / `PanelSwitch` / `PanelField` / `PanelActions` / `PanelEmpty` вместо копирования разметки в каждом файле; покрыто RTL-тестами |
| Удалён дубль «Скрыть точки» в панели ООПТ | `flora/src/components/OoptPanel.js` | один канонический переключатель — в «Группах точек» |
| Удалены неиспользуемые панели | `flora/src/components/GbifPanel.js`, `GbifProcessingPanel.js` | минус ~730 строк мёртвого кода в бандле |

Режим слабых ПК реализован так, чтобы не менять данные: JS только переключает
атрибут `data-flora-perf="low"` на `<html>` и перестаёт включать hover-подсказки.



## 2. Рендер точек: следующие шаги

### P0 — самый большой эффект

1. **`feature-state` вместо пересборки данных для выделения/скрытия.**
   `addLocationsLayer.js:1188`, `:1198` (`updateSelectedPointHighlight`),
   `:1046` (`removeSharedPointPinMarker`), `:889` (`applyUnclusteredLayerFilters`).
   Сейчас смена выделения дёргает все четыре источника. Нужен
   `promoteId`/уникальный `id` в источниках + `setFeatureState` и `setFilter`.
   Образец уже есть в проекте: Красная книга меняет данные через `setFilter`
   (`addRedBookLayer.js:110`).
   *Риск: средний (нужны уникальные id во всех источниках).*

2. **Один rebuild на тик вместо 2–3.**
   `applyLocationsFilter` (`addLocationsLayer.js:3115`) вызывает
   `applyUnclusteredLayerFilters` (внутри — GBIF/iNat/redbook/temp), а затем
   повторно `applyGbifLocationsFilter`/`applyInatLocationsFilter`/
   `applyTempLayersLocationsFilter`. Поверх — эффект в `App.js:3643` с
   `refreshExternalUnifiedMapLayers` и три отдельных таймера по 90 мс
   (`App.js:3791`, `:3812`, `:3850`). Нужен один планировщик с «грязными»
   флагами по источникам и один `requestAnimationFrame`.
   *Риск: средний. Проверка: счётчики вызовов `setGbifData`/`setInatData`/
   `setTempLayersData` на одно движение слайдера — должно быть 1/1/1.*

3. **`clusterProperties` для `regnum` включать всегда.**
   `addLocationsLayer.js:2071`, `addGbifLayer.js:878`, `addInatLayer.js:832`.
   Сейчас они считаются только при включённых диаграммах, иначе hover по
   кластеру тянет до 5000 листьев (`pointHoverTooltips.js:380`).
   *Риск: низкий.*

### P1 — заметно, но локально

4. **Диаграммы кластеров: переиспользовать маркер и ограничить запрос.**
   `addLocationsLayer.js:682` (remove + новый `Marker`), `:606`
   (`querySourceFeatures` без фильтра и лимита), `:960`, `:3123` — синхронные
   вызовы вне общего debounce.
   *Риск: низкий.*

5. **Кэш ключа точки.** `addLocationsLayer.js:1661` — фолбэк через
   `JSON.stringify(properties)`; ключ считается в `filterFeatures` и снова в
   `enrichFeatures…`. Решение: `WeakMap` от объекта feature к ключу.
   *Риск: низкий.*

6. **`slimMapFeatures` без лишних аллокаций.** `mapPerformance.js:31` —
   на каждый `setData` создаётся новый `properties` на точку и трижды
   перечисляются ключи. Если данные уже в колоночном «тонком» виде
   (`gbifRowToSlimFeature`), проход избыточен.
   *Риск: низкий.*

7. **Подписи кластеров.** `addLocationsLayer.js:1612`, `addGbifLayer.js:677`,
   `addInatLayer.js:631`, `densePiles.js:455` — `symbol`-слой на каждый
   источник без `minzoom`/`text-optional`; текст — самая дорогая часть
   размещения. Добавить `minzoom`, `text-optional`, единый `text-font`.
   *Риск: низкий, но меняет внешний вид.*

### P2 — гигиена

8. `addLocationsLayer.js:1597` — два слоя компактной сетки добавляются всегда,
   даже когда режим выключен (фильтр `compact_density == true` отсекает всё).
9. `addRegionLoadSummaryLayer.js:96` — `syncAllPlaqueScales` на каждый кадр
   пана (`project()` + `classList.toggle` по всем плашкам) → перенести на
   `moveend`/`idle`.
10. `App.js:4085` — `refreshAreal()` на каждый шаг `TimelineSlider` без
    debounce/rAF.

---

## 3. UI: следующие шаги

### P0

1. **Мемоизация панелей.** Во всём `src` нет ни одного `React.memo`
   (`featurePopup`, `AnalysisPanel`, `SeasonalityPanel` и др. перерисовываются
   на любое изменение корневого состояния). Сначала нужно стабилизировать
   пропсы: `App.js` создаёт ~100 новых функций за рендер —
   20 `handlePanelCollapsedChange(...)`, 31 `handleMinimizePanel(...)`,
   24 `handleClosePanel(...)` плюс inline-стрелки.
   Порядок: (а) убрать каррирование через `panelId`-пропсы, (б) `React.memo`
   на 10–15 самых дорогих панелей.
   *Риск: средний (пропущенная зависимость → устаревшие данные).*

2. **Код-сплиттинг панелей.** `React.lazy` сейчас только у `UserSubmissionPanel`
   (`App.js:359`). Тяжёлые панели (`ComparePanel`, `AnalysisPanel`,
   `ReportExportPanel`, `TempLayerArchivePanel`, `DataSourcesPanel`,
   `ExternalProcessingPanel`) грузятся в основной бандл. Ленивая загрузка
   уменьшит стартовый бандл; нужен `Suspense` с аккуратным фолбэком.
   *Риск: низкий.*

3. **Один вход — одна панель.** Открытие `Compare/Report/Analysis/DataSources/
   TempArchive` из меню не сворачивает остальные: одновременно может быть до
   12 панелей, часть — с `backdrop-filter: blur`. Проводить такие открытия
   через `stashVisiblePanelsToTaskbar` (`app/taskbarDomain.js`), оставляя 2–3
   видимых.
   *Требует продуктового решения.*

### P1

4. **«Сравнение» = 12 действий в одной панели** (`components/ComparePanel.js:358`):
   сгруппировать «Сравнение слоёв» и «Статистика», оставить 2 уровня вложенности.
5. **Дубли контролов:**
   - «Скрыть точки» есть в `MapDisplayPanel.js:345` и `OoptPanel.js:272`, и он
     не работает при активном фильтре ООПТ (`App.js:2952`);
   - пять поверхностей фильтров (свойства в «О точке», `StatusFilterPanel`,
     `YearFilterPanel`, `SeasonalityPanel`, `RegnumFilterPicker`) плюс сводка в
     `MapCornerControls.js:146`;
   - три независимых поиска видов (`SpeciesSearchPanel`,
     `RedBookSearchPanel`, `RegionSpeciesListPanel`).
6. **«О точке» перегружена** (`FeaturePopup.js:466`): 24 пропса, 3 вложенных
   попапа, свойства + источники + инструменты в одной колонке. Нужны группы
   «Свойства / Источники / Инструменты» с прогрессивным раскрытием.
7. **Дерево видов ООПТ разворачивается целиком** (`BoundsSpeciesListPopup.js:286`),
   плюс O(n²)-подписи: счётчики видов пересчитываются на каждую строку
   (`BoundsSpeciesListPopup.js:24`, `RegionSpeciesListPanel.js:16`,
   `SpeciesSearchPanel.js:11`) → предварительный `Map` счётчиков.
8. **Список плотных групп** (`DenseClustersPanel.js:247`) без ограничения
   и виртуализации.
9. **Мёртвый код:** `GbifPanel.js` (538 строк) и `GbifProcessingPanel.js`
   нигде не импортируются; в `panelTaskbarRegistry.js:55` два id схлопываются
   в один («Источники данных» и «Обработка внешних данных»).

### P2

10. **CSS-стоимость:** 64 `backdrop-filter` в 46 файлах, 135 `box-shadow`,
    114 `transition`. Размытие панелей над WebGL-канвасом дорого при скролле
    (5–7 слоёв). Оставить blur только у меню и панели задач.
11. **Индикация загрузки:** `App.js:5749` — инициализация данных до
    `mapReady`, но спиннера/скелетона нет (`App.js:6377`).
12. **Сохранение состояния UI:** открытые/свёрнутые панели и порядок в панели
    задач не персистятся (в `localStorage` только настройки карты/тепловой карты).

---

## 4. Требуют продуктового решения

Не делаю без согласования, потому что меняется поведение/внешний вид:

- **Параметры кластеризации** (`addLocationsLayer.js:134`): `clusterMaxZoom: 14`,
  `clusterRadius: 50`, без `clusterMinPoints`. `clusterMinPoints: 4–5` убирает
  кластеры из 2–3 точек (меньше подписей и кругов), но одиночные точки станут
  видны иначе.
- **Авто-растровый режим** (`mapPerformance.js:157`): пороги 60k/40k; при
  превышении точки заменяются тепловой картой.
- **Убрать `backdrop-filter`** у панелей (визуально «плоские» панели).
- **Лимит одновременных панелей** (см. UI P0.3).

---

## 5. Как измерять

Пока замеров в браузере не было — это главный пробел. Минимальный набор:

1. **Синтетика.** Загрузить 50k / 100k / 200k точек (GBIF по области или
   сгенерированный GeoJSON) и замерить: время применения фильтра, время
   `setData`, FPS при пане и зуме.
2. **Инструменты.** Chrome Performance (Main + GPU) на сценариях: «применить
   фильтр», «клик по точке», «открыть/закрыть панель», «drag таймлайна».
   React Profiler — число коммитов и время commit при вводе в поиск.
3. **Счётчики.** Временные `console.count` в `setGbifData`, `setInatData`,
   `setTempLayersData`, `setLocationsData`, `runAnalysis` — показывают лишние
   пересборки лучше, чем профиль.
4. **Бюджеты.** Целевые ориентиры: применение фильтра ≤ 100 мс на 100k,
   один rebuild на одно действие пользователя, commit React ≤ 16 мс при
   вводе в поиск.