import {
  REGION_BOUNDS_DISPLAY_SOURCES,
  REGION_OVERLAY_ROLES,
  ensureMapRegionBoundary,
  getRegionOverlayByKey,
  getVisibleTempLayerOverlays,
  findOsmOverlayFeatureByIso,
  getVisibleRegionOverlayEditState,
  ingestOsmAdminOverlays,
  listOsmOverlaySelectableIsos,
  listRegionLayerTree,
  listRegionOverlayPlaceNames,
  removeRegionOverlay,
  replaceTempLayers,
  serializeTempLayers,
  setRegionBoundsDisplaySource,
  setRegionBoundsContoursEnabled,
  setRegionOverlayVisible,
  setRegionsRootVisible,
  overlayFeatureIso,
  unloadTempLayerGeometries
} from "./tempLayerStore";

const square = {
  type: "Feature",
  properties: { iso: "RU.VO", name: "Вологодская область" },
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0]
      ]
    ]
  }
};

describe("region layer tree", () => {
  afterEach(() => {
    setRegionBoundsDisplaySource(REGION_BOUNDS_DISPLAY_SOURCES.DEFAULT);
    setRegionBoundsContoursEnabled(true);
    replaceTempLayers([]);
    try {
      localStorage.removeItem("flora35-region-bounds-display-source");
    } catch {
      // ignore
    }
  });

  it("nests districts under a map region but keeps their visibility independent", () => {
    ensureMapRegionBoundary({
      iso: "RU.VO",
      name: "Вологодская область",
      feature: square
    });
    ingestOsmAdminOverlays({
      mode: "districts",
      parent: {
        regionKey: "iso:RU.VO",
        label: "Вологодская область",
        sourceKind: "map"
      },
      collection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Вологодский район", OSM_ID: 1 },
            geometry: square.geometry
          }
        ]
      }
    });

    const tree = listRegionLayerTree();
    expect(tree.empty).toBe(false);
    expect(tree.items).toHaveLength(1);
    expect(tree.items[0].label).toBe("Вологодская область");
    expect(tree.items[0].hasDistricts).toBe(true);
    expect(tree.items[0].children[0].role).toBe(REGION_OVERLAY_ROLES.DISTRICTS);
    expect(listRegionOverlayPlaceNames(tree.items[0].children[0].id)).toEqual([
      expect.objectContaining({ name: "Вологодский район", iso: "osm:1" })
    ]);
    expect(findOsmOverlayFeatureByIso("osm:1")?.properties?.name).toBe("Вологодский район");
    expect(overlayFeatureIso({
      properties: {
        overlayRole: "districts",
        iso: "RU.VO",
        ISO3166_2: "RU-VLG",
        OSM_ID: 7,
        name: "Район"
      }
    })).toBe("osm:7");
    expect(listOsmOverlaySelectableIsos()).toEqual(expect.arrayContaining(["RU.VO", "osm:1"]));
    expect(getVisibleRegionOverlayEditState().active).toBe(false);

    ingestOsmAdminOverlays({
      mode: "districts",
      parent: {
        regionKey: "iso:RU.VO",
        label: "Вологодская область",
        sourceKind: "map"
      },
      collection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Кирилловский район", osm_id: 42 },
            geometry: square.geometry
          }
        ]
      }
    });
    expect(findOsmOverlayFeatureByIso("osm:42")?.properties?.name).toBe("Кирилловский район");
    setRegionBoundsDisplaySource(REGION_BOUNDS_DISPLAY_SOURCES.OSM);
    setRegionBoundsContoursEnabled(true);
    expect(getVisibleTempLayerOverlays()).toHaveLength(2);

    setRegionOverlayVisible(tree.items[0].id, false);
    const hidden = listRegionLayerTree();
    expect(hidden.items[0].effectiveVisible).toBe(false);
    expect(hidden.items[0].children[0].effectiveVisible).toBe(true);
    expect(getVisibleTempLayerOverlays()).toHaveLength(1);
    expect(getVisibleTempLayerOverlays()[0].role).toBe(REGION_OVERLAY_ROLES.DISTRICTS);

    setRegionOverlayVisible(tree.items[0].children[0].id, false);
    expect(getVisibleTempLayerOverlays()).toHaveLength(0);

    setRegionOverlayVisible(tree.items[0].id, true);
    setRegionOverlayVisible(tree.items[0].children[0].id, true);

    setRegionsRootVisible(false);
    expect(getVisibleTempLayerOverlays()).toHaveLength(0);
    expect(getRegionOverlayByKey("iso:RU.VO")?.label).toBe("Вологодская область");
  });

  it("keeps OSM overlays when point geometries are unloaded", () => {
    ingestOsmAdminOverlays({
      mode: "country",
      collection: { type: "FeatureCollection", features: [square] }
    });
    replaceTempLayers([
      ...serializeTempLayers(),
      {
        id: "points-1",
        kind: "points",
        source: "gbif",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: {}
          }
        ]
      }
    ]);
    unloadTempLayerGeometries();
    setRegionBoundsDisplaySource(REGION_BOUNDS_DISPLAY_SOURCES.OSM);
    setRegionBoundsContoursEnabled(true);
    expect(listRegionLayerTree().empty).toBe(false);
    expect(getVisibleTempLayerOverlays().length).toBeGreaterThan(0);
  });

  it("adds country and subject overlays as siblings under Регионы", () => {
    ingestOsmAdminOverlays({
      mode: "country",
      collection: { type: "FeatureCollection", features: [square] }
    });
    ingestOsmAdminOverlays({
      mode: "regions",
      collection: {
        type: "FeatureCollection",
        features: [
          {
            ...square,
            properties: { ISO3166_2: "RU-VLG", title: "Вологодская область" }
          }
        ]
      }
    });
    const tree = listRegionLayerTree();
    expect(tree.items.map((item) => item.role)).toEqual([
      REGION_OVERLAY_ROLES.COUNTRY,
      REGION_OVERLAY_ROLES.BOUNDARY
    ]);
  });

  it("removes a boundary overlay together with nested districts", () => {
    ensureMapRegionBoundary({
      iso: "RU.VO",
      name: "Вологодская область",
      feature: square
    });
    ingestOsmAdminOverlays({
      mode: "districts",
      parent: {
        regionKey: "iso:RU.VO",
        label: "Вологодская область",
        sourceKind: "map"
      },
      collection: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "Вологодский район", OSM_ID: 1 },
            geometry: square.geometry
          }
        ]
      }
    });
    const tree = listRegionLayerTree();
    removeRegionOverlay(tree.items[0].id);
    expect(listRegionLayerTree().empty).toBe(true);
  });
});
