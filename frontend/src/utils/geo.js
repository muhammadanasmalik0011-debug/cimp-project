export const EMPTY_FEATURE_COLLECTION = {
  type: "FeatureCollection",
  features: []
};

export function featureCollection(features = []) {
  return { type: "FeatureCollection", features: features.filter(Boolean) };
}

export function makePointFeature(lng, lat, properties = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties
  };
}

export function makeCircleFeature(center, radiusMeters, steps = 96) {
  const [longitude, latitude] = center;
  const earthRadius = 6_371_008.8;
  const angularDistance = radiusMeters / earthRadius;
  const latRad = latitude * Math.PI / 180;
  const lonRad = longitude * Math.PI / 180;
  const coordinates = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (index / steps) * Math.PI * 2;
    const destinationLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const destinationLon = lonRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(destinationLat)
    );
    coordinates.push([
      destinationLon * 180 / Math.PI,
      destinationLat * 180 / Math.PI
    ]);
  }

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [coordinates] },
    properties: { radius_m: radiusMeters }
  };
}

export function getFeatureCoordinates(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return { lng: Number(coordinates[0]), lat: Number(coordinates[1]) };
}

export function getGeoJsonBounds(geojson) {
  const points = [];

  function visit(coordinates) {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
      points.push(coordinates);
      return;
    }
    coordinates.forEach(visit);
  }

  if (geojson?.type === "FeatureCollection") {
    geojson.features?.forEach((feature) => visit(feature.geometry?.coordinates));
  } else if (geojson?.type === "Feature") {
    visit(geojson.geometry?.coordinates);
  } else {
    visit(geojson?.coordinates);
  }

  if (!points.length) return null;
  let west = points[0][0];
  let east = points[0][0];
  let south = points[0][1];
  let north = points[0][1];
  points.forEach(([lng, lat]) => {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  });
  return [[west, south], [east, north]];
}

export function formatDistance(meters) {
  const value = Number(meters || 0);
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${Math.round(value)} m`;
}

export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(Number(seconds || 0) / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
