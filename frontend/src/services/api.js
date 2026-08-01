const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error || body.message || message;
    } catch {
      // Keep the HTTP error text.
    }
    throw new Error(message);
  }

  return response.json();
}

export async function loadDashboardData() {
  const [health, types, facilities, zones, stats, logs] = await Promise.all([
    request("/health"),
    request("/meta/facility-types"),
    request("/facilities?limit=5000"),
    request("/zones"),
    request("/stats"),
    request("/analysis/log?limit=8")
  ]);

  return {
    health,
    facilityTypes: types.facility_types || [],
    facilities,
    zones,
    stats,
    logs: logs.logs || []
  };
}

export const api = {
  health: () => request("/health"),
  facilities: (query = "") => request(`/facilities${query ? `?${query}` : ""}`),
  zones: () => request("/zones"),
  stats: () => request("/stats"),
  logs: () => request("/analysis/log?limit=8"),
  nearest: ({ lat, lon, type }) =>
    request(`/analysis/nearest?lat=${lat}&lon=${lon}&type=${encodeURIComponent(type)}`),
  radius: ({ lat, lon, radius, type }) =>
    request(`/analysis/radius?lat=${lat}&lon=${lon}&radius=${radius}&type=${encodeURIComponent(type)}`),
  buffer: ({ lat, lon, radius, type }) =>
    request(`/analysis/buffer?lat=${lat}&lon=${lon}&radius=${radius}&type=${encodeURIComponent(type)}`)
};

export async function getMapboxRoute({ origin, destination, profile = "driving" }) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) throw new Error("Mapbox token is missing.");

  const allowedProfiles = new Set(["driving", "walking", "cycling"]);
  const safeProfile = allowedProfiles.has(profile) ? profile : "driving";
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${safeProfile}/${coordinates}`);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("steps", "true");
  url.searchParams.set("access_token", token);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Mapbox routing failed (${response.status}).`);
  }

  const data = await response.json();
  const route = data.routes?.[0];
  if (!route) throw new Error(data.message || "No route was returned.");

  return {
    type: "Feature",
    geometry: route.geometry,
    properties: {
      distance_m: route.distance,
      duration_s: route.duration,
      profile: safeProfile,
      summary: route.legs?.map((leg) => leg.summary).filter(Boolean).join(" · ") || null
    }
  };
}
