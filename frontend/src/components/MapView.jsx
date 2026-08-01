import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Icon } from "./Icons.jsx";
import {
  EMPTY_FEATURE_COLLECTION,
  featureCollection,
  getFeatureCoordinates,
  getGeoJsonBounds,
  makePointFeature
} from "../utils/geo.js";

const STYLE_URLS = {
  streets: "mapbox://styles/mapbox/streets-v12",
  dark: "mapbox://styles/mapbox/dark-v11",
  light: "mapbox://styles/mapbox/light-v11",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12"
};

function setSourceData(map, sourceId, data) {
  const source = map.getSource(sourceId);
  if (source?.setData) source.setData(data || EMPTY_FEATURE_COLLECTION);
}

function setVisibility(map, layerId, visible) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  }
}

function createPopupNode(feature, onRoute) {
  const properties = feature.properties || {};
  const wrapper = document.createElement("div");
  wrapper.className = "map-popup";

  const heading = document.createElement("div");
  heading.className = "map-popup-heading";

  const badge = document.createElement("span");
  badge.className = "map-popup-badge";
  badge.textContent = properties.type_icon || "•";
  badge.style.setProperty("--popup-color", properties.type_color || "#38bdf8");

  const titleWrap = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = properties.name || "Facility";
  const subtitle = document.createElement("p");
  subtitle.textContent = `${properties.type_label || properties.type || "Facility"} · ${properties.city || ""}`;
  titleWrap.append(title, subtitle);
  heading.append(badge, titleWrap);

  const details = document.createElement("div");
  details.className = "map-popup-details";
  [
    ["Address", properties.address || "Not available"],
    ["Category", properties.category || "General"],
    ["Quality", properties.data_quality_score != null ? `${properties.data_quality_score}/100` : "Not scored"]
  ].forEach(([label, value]) => {
    const row = document.createElement("div");
    const labelElement = document.createElement("span");
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    details.append(row);
  });

  const button = document.createElement("button");
  button.type = "button";
  button.className = "map-popup-route";
  button.textContent = "Route to this facility";
  button.addEventListener("click", () => onRoute(feature));

  wrapper.append(heading, details, button);
  return wrapper;
}

export default function MapView({
  facilities,
  zones,
  layers,
  basemap,
  selectedPoint,
  selectedFacility,
  analysisGeometry,
  analysisFacilities,
  route,
  onMapPointSelect,
  onFacilitySelect,
  onRouteFacility,
  onMapApi,
  theme
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const propsRef = useRef({});
  const animationRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [viewState, setViewState] = useState({ zoom: 10.6, pitch: 25 });

  propsRef.current = {
    facilities,
    zones,
    layers,
    selectedPoint,
    selectedFacility,
    analysisGeometry,
    analysisFacilities,
    route,
    onMapPointSelect,
    onFacilitySelect,
    onRouteFacility
  };

  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!mapboxgl.accessToken) return undefined;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STYLE_URLS[basemap] || STYLE_URLS.streets,
      center: [73.0479, 33.6844],
      zoom: 10.6,
      pitch: 25,
      bearing: -8,
      antialias: true,
      attributionControl: true
    });

    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.FullscreenControl(), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");

    function addDashboardLayers() {
      if (!map.isStyleLoaded()) return;

      if (!map.getSource("cims-facilities")) {
        map.addSource("cims-facilities", {
          type: "geojson",
          data: propsRef.current.facilities || EMPTY_FEATURE_COLLECTION,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 46,
          clusterMinPoints: 2
        });
      }

      if (!map.getLayer("cims-facility-heatmap")) {
        map.addLayer({
          id: "cims-facility-heatmap",
          type: "heatmap",
          source: "cims-facilities",
          maxzoom: 14,
          layout: { visibility: "none" },
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 1.8],
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(14,165,233,0)",
              0.2, "rgba(56,189,248,0.35)",
              0.45, "rgba(34,197,94,0.55)",
              0.7, "rgba(250,204,21,0.72)",
              1, "rgba(239,68,68,0.9)"
            ],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 8, 18, 14, 34],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 15, 0]
          }
        });
      }

      if (!map.getLayer("cims-clusters")) {
        map.addLayer({
          id: "cims-clusters",
          type: "circle",
          source: "cims-facilities",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": [
              "step", ["get", "point_count"],
              "#0ea5e9", 20, "#2563eb", 60, "#7c3aed", 120, "#db2777"
            ],
            "circle-radius": ["step", ["get", "point_count"], 18, 20, 22, 60, 27, 120, 32],
            "circle-stroke-width": 3,
            "circle-stroke-color": "rgba(255,255,255,0.9)",
            "circle-opacity": 0.92
          }
        });
      }

      if (!map.getLayer("cims-cluster-count")) {
        map.addLayer({
          id: "cims-cluster-count",
          type: "symbol",
          source: "cims-facilities",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 12,
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Bold"]
          },
          paint: { "text-color": "#ffffff" }
        });
      }

      if (!map.getLayer("cims-facility-points")) {
        map.addLayer({
          id: "cims-facility-points",
          type: "circle",
          source: "cims-facilities",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 13, 8, 16, 11],
            "circle-color": ["coalesce", ["get", "type_color"], "#38bdf8"],
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 15, 2.5],
            "circle-stroke-color": "#ffffff",
            "circle-opacity": 0.96
          }
        });
      }

      if (!map.getLayer("cims-facility-icons")) {
        map.addLayer({
          id: "cims-facility-icons",
          type: "symbol",
          source: "cims-facilities",
          filter: ["!", ["has", "point_count"]],
          minzoom: 11,
          layout: {
            "text-field": ["coalesce", ["get", "type_icon"], "•"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, 8, 15, 11],
            "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"],
            "text-allow-overlap": true,
            "text-ignore-placement": true
          },
          paint: { "text-color": "#ffffff" }
        });
      }

      if (!map.getSource("cims-zones")) {
        map.addSource("cims-zones", { type: "geojson", data: propsRef.current.zones || EMPTY_FEATURE_COLLECTION });
      }
      if (!map.getLayer("cims-zones-fill")) {
        map.addLayer({
          id: "cims-zones-fill",
          type: "fill",
          source: "cims-zones",
          layout: { visibility: "none" },
          paint: {
            "fill-color": [
              "match", ["get", "zone_type"],
              "residential", "#38bdf8",
              "commercial", "#f59e0b",
              "industrial", "#64748b",
              "green", "#22c55e",
              "educational", "#8b5cf6",
              "#ec4899"
            ],
            "fill-opacity": 0.16
          }
        });
      }
      if (!map.getLayer("cims-zones-line")) {
        map.addLayer({
          id: "cims-zones-line",
          type: "line",
          source: "cims-zones",
          layout: { visibility: "none" },
          paint: {
            "line-color": [
              "match", ["get", "zone_type"],
              "residential", "#38bdf8",
              "commercial", "#f59e0b",
              "industrial", "#94a3b8",
              "green", "#22c55e",
              "educational", "#a78bfa",
              "#f472b6"
            ],
            "line-width": 2,
            "line-dasharray": [2, 1]
          }
        });
      }
      if (!map.getLayer("cims-zones-label")) {
        map.addLayer({
          id: "cims-zones-label",
          type: "symbol",
          source: "cims-zones",
          layout: {
            visibility: "none",
            "text-field": ["get", "name"],
            "text-size": 11,
            "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"]
          },
          paint: { "text-color": "#ffffff", "text-halo-color": "rgba(2,6,23,0.85)", "text-halo-width": 1.5 }
        });
      }

      const simpleSources = [
        ["cims-selected-origin", "Point"],
        ["cims-selected-facility", "Point"],
        ["cims-analysis-geometry", "Polygon"],
        ["cims-analysis-points", "Point"],
        ["cims-route", "LineString"],
        ["cims-route-endpoints", "Point"]
      ];
      simpleSources.forEach(([sourceId]) => {
        if (!map.getSource(sourceId)) map.addSource(sourceId, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
      });

      if (!map.getLayer("cims-analysis-fill")) {
        map.addLayer({
          id: "cims-analysis-fill",
          type: "fill",
          source: "cims-analysis-geometry",
          paint: { "fill-color": "#22d3ee", "fill-opacity": 0.14 }
        });
        map.addLayer({
          id: "cims-analysis-line",
          type: "line",
          source: "cims-analysis-geometry",
          paint: { "line-color": "#22d3ee", "line-width": 3, "line-dasharray": [2, 1] }
        });
      }

      if (!map.getLayer("cims-analysis-points")) {
        map.addLayer({
          id: "cims-analysis-points",
          type: "circle",
          source: "cims-analysis-points",
          paint: {
            "circle-radius": 10,
            "circle-color": ["coalesce", ["get", "type_color"], "#facc15"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3
          }
        });
      }

      if (!map.getLayer("cims-selected-origin-ring")) {
        map.addLayer({
          id: "cims-selected-origin-ring",
          type: "circle",
          source: "cims-selected-origin",
          paint: { "circle-radius": 16, "circle-color": "rgba(34,211,238,0.18)", "circle-stroke-color": "#22d3ee", "circle-stroke-width": 2 }
        });
        map.addLayer({
          id: "cims-selected-origin-dot",
          type: "circle",
          source: "cims-selected-origin",
          paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#0891b2", "circle-stroke-width": 3 }
        });
      }

      if (!map.getLayer("cims-selected-facility-ring")) {
        map.addLayer({
          id: "cims-selected-facility-ring",
          type: "circle",
          source: "cims-selected-facility",
          paint: { "circle-radius": 16, "circle-color": "rgba(250,204,21,0.18)", "circle-stroke-color": "#facc15", "circle-stroke-width": 3 }
        });
      }

      if (!map.getLayer("cims-route-halo")) {
        map.addLayer({
          id: "cims-route-halo",
          type: "line",
          source: "cims-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "rgba(255,255,255,0.95)", "line-width": 10, "line-opacity": 0.9 }
        });
        map.addLayer({
          id: "cims-route-line",
          type: "line",
          source: "cims-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#0ea5e9",
            "line-width": 6,
            "line-opacity": 1
          }
        });
      }

      if (!map.getLayer("cims-route-endpoints")) {
        map.addLayer({
          id: "cims-route-endpoints",
          type: "circle",
          source: "cims-route-endpoints",
          paint: {
            "circle-radius": 11,
            "circle-color": ["match", ["get", "kind"], "origin", "#22c55e", "#ef4444"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 3
          }
        });
        map.addLayer({
          id: "cims-route-endpoint-labels",
          type: "symbol",
          source: "cims-route-endpoints",
          layout: {
            "text-field": ["match", ["get", "kind"], "origin", "O", "D"],
            "text-size": 11,
            "text-font": ["DIN Offc Pro Bold", "Arial Unicode MS Bold"]
          },
          paint: { "text-color": "#ffffff" }
        });
      }

      const style = map.getStyle();
      if (style?.sources?.composite && !map.getLayer("cims-3d-buildings")) {
        const labelLayer = style.layers?.find((layer) => layer.type === "symbol" && layer.layout?.["text-field"]);
        try {
          map.addLayer({
            id: "cims-3d-buildings",
            source: "composite",
            "source-layer": "building",
            filter: ["==", "extrude", "true"],
            type: "fill-extrusion",
            minzoom: 14,
            layout: { visibility: "none" },
            paint: {
              "fill-extrusion-color": theme === "dark" ? "#334155" : "#cbd5e1",
              "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.3, ["get", "height"]],
              "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 14.3, ["get", "min_height"]],
              "fill-extrusion-opacity": 0.72
            }
          }, labelLayer?.id);
        } catch (error) {
          console.debug("3D building layer unavailable for this style:", error.message);
        }
      }

      refreshDataAndVisibility();
    }

    function refreshDataAndVisibility() {
      const current = propsRef.current;
      setSourceData(map, "cims-facilities", current.facilities);
      setSourceData(map, "cims-zones", current.zones);
      setSourceData(
        map,
        "cims-selected-origin",
        current.selectedPoint
          ? featureCollection([makePointFeature(current.selectedPoint.lng, current.selectedPoint.lat, { kind: "origin" })])
          : EMPTY_FEATURE_COLLECTION
      );
      setSourceData(
        map,
        "cims-selected-facility",
        current.selectedFacility ? featureCollection([current.selectedFacility]) : EMPTY_FEATURE_COLLECTION
      );
      setSourceData(
        map,
        "cims-analysis-geometry",
        current.analysisGeometry
          ? (current.analysisGeometry.type === "FeatureCollection" ? current.analysisGeometry : featureCollection([current.analysisGeometry]))
          : EMPTY_FEATURE_COLLECTION
      );
      setSourceData(map, "cims-analysis-points", current.analysisFacilities || EMPTY_FEATURE_COLLECTION);
      if (current.route?.geometry?.coordinates?.length) {
        const coordinates = current.route.geometry.coordinates;
        const origin = coordinates[0];
        const destination = coordinates[coordinates.length - 1];
        setSourceData(map, "cims-route", featureCollection([current.route]));
        setSourceData(map, "cims-route-endpoints", featureCollection([
          makePointFeature(origin[0], origin[1], { kind: "origin" }),
          makePointFeature(destination[0], destination[1], { kind: "destination" })
        ]));
      } else {
        setSourceData(map, "cims-route", EMPTY_FEATURE_COLLECTION);
        setSourceData(map, "cims-route-endpoints", EMPTY_FEATURE_COLLECTION);
      }

      setVisibility(map, "cims-clusters", current.layers.facilities);
      setVisibility(map, "cims-cluster-count", current.layers.facilities);
      setVisibility(map, "cims-facility-points", current.layers.facilities);
      setVisibility(map, "cims-facility-icons", current.layers.facilities);
      setVisibility(map, "cims-facility-heatmap", current.layers.heatmap);
      ["cims-zones-fill", "cims-zones-line", "cims-zones-label"].forEach((id) => setVisibility(map, id, current.layers.zones));
      setVisibility(map, "cims-3d-buildings", current.layers.buildings3d);
    }

    map.on("load", () => {
      addDashboardLayers();
      setMapReady(true);
    });
    map.on("style.load", addDashboardLayers);

    map.on("move", () => {
      setViewState({ zoom: map.getZoom(), pitch: map.getPitch() });
    });

    map.on("click", "cims-clusters", async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["cims-clusters"] })[0];
      const clusterId = feature?.properties?.cluster_id;
      const source = map.getSource("cims-facilities");
      if (clusterId === undefined || !source?.getClusterExpansionZoom) return;
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: feature.geometry.coordinates, zoom });
      } catch (error) {
        console.debug("Cluster expansion failed:", error.message);
      }
    });

    map.on("click", "cims-facility-points", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const normalized = {
        type: "Feature",
        id: feature.id || feature.properties?.id,
        geometry: feature.geometry,
        properties: { ...feature.properties }
      };
      propsRef.current.onFacilitySelect(normalized);
      popupRef.current?.remove();
      popupRef.current = new mapboxgl.Popup({ offset: 18, maxWidth: "330px", closeButton: true })
        .setLngLat(feature.geometry.coordinates)
        .setDOMContent(createPopupNode(normalized, propsRef.current.onRouteFacility))
        .addTo(map);
    });

    map.on("mouseenter", "cims-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "cims-clusters", () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseenter", "cims-facility-points", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "cims-facility-points", () => { map.getCanvas().style.cursor = ""; });

    map.on("click", (event) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: ["cims-clusters", "cims-facility-points"].filter((id) => map.getLayer(id))
      });
      if (hits.length) return;
      popupRef.current?.remove();
      propsRef.current.onMapPointSelect({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });

    onMapApi({
      locate() {
        if (!navigator.geolocation) throw new Error("Geolocation is not supported by this browser.");
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const point = { lng: position.coords.longitude, lat: position.coords.latitude };
            map.flyTo({ center: [point.lng, point.lat], zoom: 14.5, pitch: 35, duration: 1500 });
            propsRef.current.onMapPointSelect(point);
          },
          () => window.dispatchEvent(new CustomEvent("cims-toast", { detail: { message: "Location permission was denied.", tone: "error" } })),
          { enableHighAccuracy: true, timeout: 10_000 }
        );
      },
      reset() {
        map.flyTo({ center: [73.0479, 33.6844], zoom: 10.6, pitch: 25, bearing: -8, duration: 1300 });
      },
      flyToFeature(feature, zoom = 15) {
        const coordinates = getFeatureCoordinates(feature);
        if (coordinates) map.flyTo({ center: [coordinates.lng, coordinates.lat], zoom, pitch: 45, duration: 1200 });
      },
      fitGeoJson(geojson, options = {}) {
        const bounds = getGeoJsonBounds(geojson);
        if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1100, ...options });
      }
    });

    return () => {
      cancelAnimationFrame(animationRef.current);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const style = STYLE_URLS[basemap] || STYLE_URLS.streets;
    if (map.getStyle()?.sprite?.includes?.(basemap)) return;
    map.setStyle(style);
  }, [basemap, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;
    setSourceData(map, "cims-facilities", facilities);
    setSourceData(map, "cims-zones", zones);
    setSourceData(
      map,
      "cims-selected-origin",
      selectedPoint ? featureCollection([makePointFeature(selectedPoint.lng, selectedPoint.lat, { kind: "origin" })]) : EMPTY_FEATURE_COLLECTION
    );
    setSourceData(map, "cims-selected-facility", selectedFacility ? featureCollection([selectedFacility]) : EMPTY_FEATURE_COLLECTION);
    setSourceData(map, "cims-analysis-geometry", analysisGeometry ? (analysisGeometry.type === "FeatureCollection" ? analysisGeometry : featureCollection([analysisGeometry])) : EMPTY_FEATURE_COLLECTION);
    setSourceData(map, "cims-analysis-points", analysisFacilities || EMPTY_FEATURE_COLLECTION);

    setVisibility(map, "cims-clusters", layers.facilities);
    setVisibility(map, "cims-cluster-count", layers.facilities);
    setVisibility(map, "cims-facility-points", layers.facilities);
    setVisibility(map, "cims-facility-icons", layers.facilities);
    setVisibility(map, "cims-facility-heatmap", layers.heatmap);
    ["cims-zones-fill", "cims-zones-line", "cims-zones-label"].forEach((id) => setVisibility(map, id, layers.zones));
    setVisibility(map, "cims-3d-buildings", layers.buildings3d);

    if (layers.buildings3d && map.getZoom() < 14) {
      map.easeTo({ pitch: 48, zoom: 14.2, duration: 900 });
    } else if (!layers.buildings3d && map.getPitch() > 40) {
      map.easeTo({ pitch: 25, duration: 500 });
    }
  }, [facilities, zones, layers, selectedPoint, selectedFacility, analysisGeometry, analysisFacilities, mapReady, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getSource("cims-route")) return;
    cancelAnimationFrame(animationRef.current);

    if (!route?.geometry?.coordinates?.length) {
      setSourceData(map, "cims-route", EMPTY_FEATURE_COLLECTION);
      setSourceData(map, "cims-route-endpoints", EMPTY_FEATURE_COLLECTION);
      return;
    }

    const coordinates = route.geometry.coordinates;
    const origin = coordinates[0];
    const destination = coordinates[coordinates.length - 1];
    setSourceData(map, "cims-route-endpoints", featureCollection([
      makePointFeature(origin[0], origin[1], { kind: "origin" }),
      makePointFeature(destination[0], destination[1], { kind: "destination" })
    ]));

    const startTime = performance.now();
    const duration = Math.min(1600, Math.max(700, coordinates.length * 3));
    const animate = (time) => {
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const endIndex = Math.max(2, Math.ceil(eased * coordinates.length));
      setSourceData(map, "cims-route", {
        type: "FeatureCollection",
        features: [{ ...route, geometry: { ...route.geometry, coordinates: coordinates.slice(0, endIndex) } }]
      });
      if (progress < 1) animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
  }, [route, mapReady, basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedFacility) return;
    const coordinates = getFeatureCoordinates(selectedFacility);
    if (coordinates) map.easeTo({ center: [coordinates.lng, coordinates.lat], zoom: Math.max(map.getZoom(), 13.8), duration: 900 });
  }, [selectedFacility, mapReady]);

  return (
    <main className="map-stage">
      <div ref={containerRef} className={`map-container ${mapReady ? "ready" : "loading"}`} />
      {!mapReady && <div className="map-loading"><span className="map-loading-ring" /><strong>Initializing Mapbox</strong><small>Loading spatial layers and map tiles</small></div>}

      <div className="map-status-bar">
        <span><span className="status-dot online" /> Mapbox GL</span>
        <span>Zoom {viewState.zoom.toFixed(1)}</span>
        <span>Pitch {Math.round(viewState.pitch)}°</span>
        <span>{facilities.features?.length || 0} visible</span>
      </div>

      <div className="map-hint">
        <Icon name="target" size={15} />
        Click the map to set an analysis origin
      </div>
    </main>
  );
}
