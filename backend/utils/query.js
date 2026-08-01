function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerInRange(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function parseBbox(value) {
  if (!value) return null;
  const parts = String(value).split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    const error = new Error("Invalid bbox. Use west,south,east,north.");
    error.status = 400;
    throw error;
  }
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    const error = new Error("Invalid bbox order.");
    error.status = 400;
    throw error;
  }
  return { west, south, east, north };
}

function parseTypes(value) {
  if (!value) return [];
  return [...new Set(
    String(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )];
}

function assertCoordinates(lat, lon) {
  const latitude = numberOrNull(lat);
  const longitude = numberOrNull(lon);
  if (latitude === null || longitude === null) {
    const error = new Error("lat and lon are required and must be valid numbers.");
    error.status = 400;
    throw error;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    const error = new Error("Coordinates are outside valid latitude/longitude ranges.");
    error.status = 400;
    throw error;
  }
  return { latitude, longitude };
}

module.exports = {
  numberOrNull,
  integerInRange,
  parseBbox,
  parseTypes,
  assertCoordinates
};
