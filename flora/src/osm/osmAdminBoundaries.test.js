import {
  buildOverpassGeomQuery,
  buildOverpassQuery,
  loadOsmAdminFeatureCollection,
  normalizeAdminLevels,
  osmJsonToAdminFeatureCollection,
  parseBbox,
  toOsmIso3166_2
} from "./osmAdminBoundaries";

function way(role, points) {
  return {
    type: "way",
    role,
    geometry: points.map(([lon, lat]) => ({ lon, lat }))
  };
}

describe("osmAdminBoundaries", () => {
  it("builds queries for country, regions, and district modes", () => {
    const country = buildOverpassQuery({ mode: "country" });
    expect(country).toContain('["ISO3166-1"="RU"]');
    expect(country).toContain('["admin_level"="2"]');

    const regions = buildOverpassQuery({ mode: "regions" });
    expect(regions).toContain('["admin_level"="4"]');
    expect(regions).toContain('["ISO3166-2"~"^RU-"]');

    const districts = buildOverpassQuery({
      mode: "districts",
      regionName: "Вологодская область"
    });
    expect(districts).toContain('area["name"="Вологодская область"]["admin_level"="4"]');
    expect(districts).toContain('["admin_level"~"^(6|5)$"]');
    expect(
      buildOverpassQuery({
        mode: "districts",
        regionName: "Вологодская область",
        districtsStyle: "mapToArea"
      })
    ).toContain("map_to_area -> .reg;");
    expect(toOsmIso3166_2("RU.VLG")).toBe("RU-VLG");
    expect(toOsmIso3166_2("RU.VO")).toBe("");
    expect(
      buildOverpassQuery({
        mode: "districts",
        regionName: "Вологодская область",
        output: "ids"
      })
    ).toContain("out tags;");
    expect(() => buildOverpassQuery({ mode: "districts" })).toThrow(/регион/);
    expect(buildOverpassGeomQuery([17698, 17698])).toContain("rel(id:17698);");
  });

  it("builds an Overpass query for bbox and admin levels", () => {
    const query = buildOverpassQuery({
      bbox: [35.5, 57.35, 45.6, 61.85],
      adminLevels: [4, 6],
      name: "Вологда"
    });

    expect(query).toContain("[out:json]");
    expect(query).toContain('(57.35,35.5,61.85,45.6)');
    expect(query).toContain('["admin_level"~"^(4|6)$"]');
    expect(query).toContain('["name"~"Вологда",i]');
    expect(query).toContain("out geom;");
  });

  it("parses bbox and admin levels", () => {
    expect(parseBbox("35.5, 57.35, 45.6, 61.85")).toEqual([35.5, 57.35, 45.6, 61.85]);
    expect(normalizeAdminLevels("4,8")).toEqual(["4", "8"]);
    expect(() => parseBbox("1,2,3")).toThrow();
  });

  it("assembles a closed outer way into a Polygon feature", () => {
    const collection = osmJsonToAdminFeatureCollection({
      elements: [
        {
          type: "relation",
          id: 17698,
          tags: {
            name: "Вологодская область",
            "name:en": "Vologda Oblast",
            admin_level: "4",
            boundary: "administrative",
            "ISO3166-2": "RU-VLG"
          },
          members: [
            way("outer", [
              [37, 59],
              [40, 59],
              [40, 61],
              [37, 61],
              [37, 59]
            ])
          ]
        }
      ]
    });

    expect(collection.features).toHaveLength(1);
    const feature = collection.features[0];
    expect(feature.geometry.type).toBe("Polygon");
    expect(feature.properties.OSM_ID).toBe(17698);
    expect(feature.properties.title).toBe("Вологодская область");
    expect(feature.properties.ISO3166_2).toBe("RU-VLG");
    expect(feature.geometry.coordinates[0]).toHaveLength(5);
  });

  it("joins split outer ways and attaches an inner hole", () => {
    const collection = osmJsonToAdminFeatureCollection({
      elements: [
        {
          type: "relation",
          id: 1,
          tags: { name: "Район", admin_level: "6", boundary: "administrative" },
          members: [
            way("outer", [
              [0, 0],
              [4, 0]
            ]),
            way("outer", [
              [4, 0],
              [4, 4],
              [0, 4],
              [0, 0]
            ]),
            way("inner", [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
              [1, 1]
            ])
          ]
        }
      ]
    });

    const geometry = collection.features[0].geometry;
    expect(geometry.type).toBe("Polygon");
    expect(geometry.coordinates).toHaveLength(2);
    expect(geometry.coordinates[1][0]).toEqual([1, 1]);
  });

  it("retries a 504 Overpass mirror and splits geom batches", async () => {
    const idsBody = {
      elements: [
        { type: "relation", id: 11, tags: { name: "А", admin_level: "6" } },
        { type: "relation", id: 12, tags: { name: "Б", admin_level: "6" } }
      ]
    };
    const geomFor = (id) => ({
      type: "relation",
      id,
      tags: { name: id === 11 ? "А" : "Б", admin_level: "6" },
      members: [
        way("outer", [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ])
      ]
    });

    let idsCalls = 0;
    let geomCalls = 0;
    const fetchImpl = async (url, init) => {
      const query = overpassQueryFromRequest(url, init);
      if (query.includes("out tags;")) {
        idsCalls += 1;
        return {
          ok: true,
          json: async () => idsBody
        };
      }
      geomCalls += 1;
      if (query.includes("id:11,12")) {
        return {
          ok: false,
          status: 504,
          text: async () => "gateway timeout"
        };
      }
      const idMatch = query.match(/rel\(id:(\d+)/);
      const id = Number(idMatch?.[1]);
      return {
        ok: true,
        json: async () => ({ elements: [geomFor(id)] })
      };
    };

    const collection = await loadOsmAdminFeatureCollection({
      mode: "districts",
      regionName: "Вологодская область",
      retryDelayMs: 0,
      overpassUrls: [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.example/api/interpreter"
      ],
      fetchImpl
    });

    expect(idsCalls).toBe(1);
    expect(geomCalls).toBeGreaterThan(1);
    expect(collection.features).toHaveLength(2);
  });

  it("falls back to Nominatim when Overpass is unreachable", async () => {
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ]
    };
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.includes("overpass")) {
        throw new TypeError("Failed to fetch");
      }
      if (href.includes("/search")) {
        if (href.includes("viewbox")) {
          return {
            ok: true,
            json: async () => [
              {
                osm_type: "relation",
                osm_id: 11,
                extratags: { admin_level: "6" }
              },
              {
                osm_type: "relation",
                osm_id: 12,
                extratags: { admin_level: "6" }
              }
            ]
          };
        }
        return {
          ok: true,
          json: async () => [
            {
              osm_type: "relation",
              osm_id: 17698,
              class: "boundary",
              extratags: { admin_level: "4" },
              boundingbox: ["58", "61", "34", "47"]
            }
          ]
        };
      }
      if (href.includes("/lookup")) {
        return {
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { osm_id: 11, name: "А", extratags: { admin_level: "6" } },
                geometry: polygon
              },
              {
                type: "Feature",
                properties: { osm_id: 12, name: "Б", extratags: { admin_level: "6" } },
                geometry: polygon
              }
            ]
          })
        };
      }
      throw new Error(href);
    };

    const collection = await loadOsmAdminFeatureCollection({
      mode: "districts",
      regionName: "Вологодская область",
      retryDelayMs: 0,
      overpassUrls: ["https://overpass-api.de/api/interpreter"],
      fetchImpl
    });

    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].geometry.type).toBe("Polygon");
  });
});

function overpassQueryFromRequest(url, init) {
  const body = String(init?.body || "");
  if (body.startsWith("data=")) {
    return decodeURIComponent(body.slice(5));
  }
  if (init?.method === "POST" && body && !body.startsWith("data=")) {
    return body;
  }
  const encoded = String(url).split("data=")[1] || "";
  return decodeURIComponent(encoded);
}
