import {
  buildMapConfigDocument,
  parseMapConfigDocument,
  MAP_CONFIG_KIND
} from "./mapConfigDocument";

describe("mapConfigDocument", () => {
  test("round-trips kind and layer flags", () => {
    const doc = buildMapConfigDocument({
      layers: { markersVisible: false, heatmapEnabled: true, dataSourceMode: "temp" },
      filters: { regnumFilters: ["plantae"] },
      colors: { compactGrid: { color: "#112233", cellsPerTile: 16, pointLimit: 20000 } },
      tempLayers: [{ id: "a", label: "A", visible: true, pointCount: 12 }]
    });
    expect(doc.kind).toBe(MAP_CONFIG_KIND);
    const parsed = parseMapConfigDocument(JSON.stringify(doc));
    expect(parsed.layers.markersVisible).toBe(false);
    expect(parsed.layers.heatmapEnabled).toBe(true);
    expect(parsed.filters.regnumFilters).toEqual(["plantae"]);
    expect(parsed.tempLayers[0]).toMatchObject({ id: "a", label: "A", pointCount: 12 });
    expect(parsed.tempLayers[0].features).toBeUndefined();
    expect(parsed.colors.compactGrid.color).toBe("#112233");
  });

  test("rejects a different kind", () => {
    expect(() =>
      parseMapConfigDocument({ kind: "flora35-heatmap-settings", layers: {} })
    ).toThrow(/не файл конфигурации/i);
  });

  test("strips feature payloads from older config files", () => {
    const parsed = parseMapConfigDocument({
      kind: MAP_CONFIG_KIND,
      tempLayers: [
        {
          id: "a",
          label: "A",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: [0, 0] }
            }
          ]
        }
      ]
    });
    expect(parsed.tempLayers[0].pointCount).toBe(1);
    expect(parsed.tempLayers[0].features).toBeUndefined();
  });
});
