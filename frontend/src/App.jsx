import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header.jsx";
import LeftPanel from "./components/LeftPanel.jsx";
import MapView from "./components/MapView.jsx";
import RightPanel from "./components/RightPanel.jsx";
import Skeleton from "./components/Skeleton.jsx";
import Toast from "./components/Toast.jsx";
import Onboarding from "./components/Onboarding.jsx";
import { api, getMapboxRoute, loadDashboardData } from "./services/api.js";
import {
  EMPTY_FEATURE_COLLECTION,
  featureCollection,
  getFeatureCoordinates,
  makeCircleFeature
} from "./utils/geo.js";

const DEFAULT_LAYERS = {
  facilities: true,
  heatmap: false,
  zones: false,
  buildings3d: false
};

const DEFAULT_ANALYSIS = {
  mode: "nearest",
  type: "hospital",
  radius: 1500
};

function straightRoute(origin, destination, profile) {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]]
    },
    properties: {
      distance_m: 0,
      duration_s: 0,
      profile,
      summary: "Straight-line fallback — Mapbox Directions was unavailable"
    }
  };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [health, setHealth] = useState(null);
  const [facilityTypes, setFacilityTypes] = useState([]);
  const [facilities, setFacilities] = useState(EMPTY_FEATURE_COLLECTION);
  const [zones, setZones] = useState(EMPTY_FEATURE_COLLECTION);
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [activeTypes, setActiveTypes] = useState(new Set());
  const [city, setCity] = useState("all");
  const [search, setSearch] = useState("");
  const [layers, setLayers] = useState(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState("dark");
  const [theme, setTheme] = useState(() => localStorage.getItem("cims-theme") || "dark");
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [selectedFacility, setSelectedFacility] = useState(null);
  const [analysis, setAnalysis] = useState(DEFAULT_ANALYSIS);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisGeometry, setAnalysisGeometry] = useState(null);
  const [analysisFacilities, setAnalysisFacilities] = useState(EMPTY_FEATURE_COLLECTION);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeProfile, setRouteProfile] = useState("driving");
  const [toast, setToast] = useState(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem("cims-onboarding-complete-v2") !== "true");
  const mapApiRef = useRef(null);
  const toastTimerRef = useRef(null);

  const notify = useCallback((message, tone = "info") => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ message, tone });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3800);
  }, []);

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await loadDashboardData();
      setHealth(data.health);
      setFacilityTypes(data.facilityTypes);
      setFacilities(data.facilities);
      setZones(data.zones);
      setStats(data.stats);
      setLogs(data.logs);
      setActiveTypes((current) => {
        if (current.size) return current;
        return new Set(data.facilityTypes.map((item) => item.code));
      });
      if (!quiet) notify(`${data.facilities.features?.length || 0} facilities loaded from PostGIS.`, "success");
    } catch (loadError) {
      setError(loadError.message);
      setHealth({ ok: false });
      notify(loadError.message, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cims-theme", theme);
  }, [theme]);

  useEffect(() => {
    const handler = (event) => notify(event.detail?.message || "CIMS notification", event.detail?.tone || "info");
    window.addEventListener("cims-toast", handler);
    return () => window.removeEventListener("cims-toast", handler);
  }, [notify]);

  useEffect(() => {
    const handleKeydown = (event) => {
      if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        document.querySelector(".header-search input")?.focus();
      }
      if (event.key === "Escape") {
        setSelectedFacility(null);
        setRoute(null);
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  const filteredFacilities = useMemo(() => {
    const query = search.trim().toLowerCase();
    const features = (facilities.features || []).filter((feature) => {
      const properties = feature.properties || {};
      if (!activeTypes.has(properties.type)) return false;
      if (city !== "all" && properties.city !== city) return false;
      if (!query) return true;
      const haystack = [
        properties.name,
        properties.type,
        properties.type_label,
        properties.category,
        properties.address,
        properties.city
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(query);
    });
    return featureCollection(features);
  }, [facilities, activeTypes, city, search]);

  const handleToggleType = (type) => {
    setActiveTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleSelectAllTypes = () => {
    setActiveTypes((current) => current.size === facilityTypes.length
      ? new Set()
      : new Set(facilityTypes.map((item) => item.code)));
  };

  const handleFacilitySelect = (feature) => {
    setSelectedFacility(feature);
    mapApiRef.current?.flyToFeature(feature);
  };

  const refreshInsights = async () => {
    try {
      const [nextStats, nextLogs] = await Promise.all([api.stats(), api.logs()]);
      setStats(nextStats);
      setLogs(nextLogs.logs || []);
    } catch {
      // The analysis result itself is still valid if the optional refresh fails.
    }
  };

  const routeToFacility = useCallback(async (feature) => {
    if (!selectedPoint) {
      notify("Click the map or use Locate before creating a route.", "error");
      return;
    }
    const destination = getFeatureCoordinates(feature);
    if (!destination) {
      notify("This facility does not have valid coordinates.", "error");
      return;
    }
    setSelectedFacility(feature);
    notify(`Calculating ${routeProfile} route…`, "info");
    try {
      const routeFeature = await getMapboxRoute({ origin: selectedPoint, destination, profile: routeProfile });
      setRoute(routeFeature);
      setAnalysisResult((current) => ({
        ...(current || { title: "Route generated" }),
        distance_m: routeFeature.properties.distance_m,
        duration_s: routeFeature.properties.duration_s,
        message: routeFeature.properties.summary || `Mapbox ${routeProfile} route`
      }));
      mapApiRef.current?.fitGeoJson(routeFeature, { padding: 100 });
      notify("Mapbox route generated.", "success");
    } catch (routeError) {
      setRoute(straightRoute(selectedPoint, destination, routeProfile));
      notify(`${routeError.message} A straight-line fallback is displayed.`, "error");
    }
  }, [notify, routeProfile, selectedPoint]);

  const runAnalysis = async () => {
    if (!selectedPoint) {
      notify("Select an origin point on the map first.", "error");
      return;
    }
    setAnalysisBusy(true);
    setRoute(null);
    setAnalysisGeometry(null);
    setAnalysisFacilities(EMPTY_FEATURE_COLLECTION);
    setAnalysisResult(null);

    try {
      if (analysis.mode === "nearest") {
        const response = await api.nearest({ lat: selectedPoint.lat, lon: selectedPoint.lng, type: analysis.type });
        const feature = response.result;
        if (!feature) throw new Error(`No ${analysis.type.replaceAll("_", " ")} was found.`);
        setSelectedFacility(feature);
        setAnalysisFacilities(featureCollection([feature]));
        setAnalysisResult({
          title: `Nearest ${feature.properties.type_label || analysis.type}`,
          count: 1,
          distance_m: feature.properties.distance_m,
          message: feature.properties.name
        });
        mapApiRef.current?.fitGeoJson(featureCollection([
          feature,
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [selectedPoint.lng, selectedPoint.lat] },
            properties: {}
          }
        ]), { maxZoom: 14.5 });
        await routeToFacility(feature);
      }

      if (analysis.mode === "radius") {
        const response = await api.radius({ lat: selectedPoint.lat, lon: selectedPoint.lng, radius: analysis.radius, type: analysis.type });
        const circle = makeCircleFeature([selectedPoint.lng, selectedPoint.lat], analysis.radius);
        setAnalysisGeometry(circle);
        setAnalysisFacilities(response.geojson || EMPTY_FEATURE_COLLECTION);
        setAnalysisResult({
          title: "Radius search",
          count: response.total,
          distance_m: analysis.radius,
          message: `${response.total} facilities found inside the selected radius.`
        });
        mapApiRef.current?.fitGeoJson(circle);
      }

      if (analysis.mode === "buffer") {
        const response = await api.buffer({ lat: selectedPoint.lat, lon: selectedPoint.lng, radius: analysis.radius, type: analysis.type });
        setAnalysisGeometry(response.feature);
        setAnalysisFacilities(response.geojson || EMPTY_FEATURE_COLLECTION);
        setAnalysisResult({
          title: "PostGIS buffer",
          count: response.total,
          distance_m: analysis.radius,
          message: `${response.total} facilities are spatially contained by this buffer.`
        });
        mapApiRef.current?.fitGeoJson(response.feature);
      }

      await refreshInsights();
      notify("Spatial analysis completed.", "success");
    } catch (analysisError) {
      notify(analysisError.message, "error");
      setAnalysisResult({ title: "Analysis failed", message: analysisError.message });
    } finally {
      setAnalysisBusy(false);
    }
  };

  const clearWorkspace = () => {
    setSelectedPoint(null);
    setSelectedFacility(null);
    setAnalysisGeometry(null);
    setAnalysisFacilities(EMPTY_FEATURE_COLLECTION);
    setAnalysisResult(null);
    setRoute(null);
    setSearch("");
    notify("Analysis workspace cleared.", "success");
  };

  const completeOnboarding = () => {
    localStorage.setItem("cims-onboarding-complete-v2", "true");
    setShowOnboarding(false);
  };

  if (loading && !facilities.features?.length) return <Skeleton />;

  return (
    <div className="cims-app">
      <Header
        health={health}
        search={search}
        setSearch={setSearch}
        onLocate={() => mapApiRef.current?.locate()}
        onRefresh={() => loadData({ quiet: true }).then(() => notify("Database data refreshed.", "success"))}
        onClear={clearWorkspace}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        onToggleLeft={() => setLeftOpen(true)}
        onToggleRight={() => setRightOpen(true)}
      />

      <div className="workspace">
        {(leftOpen || rightOpen) && <button className="mobile-scrim mobile-only" onClick={() => { setLeftOpen(false); setRightOpen(false); }} aria-label="Close panels" />}
        <LeftPanel
          open={leftOpen}
          onClose={() => setLeftOpen(false)}
          facilityTypes={facilityTypes}
          activeTypes={activeTypes}
          onToggleType={handleToggleType}
          onSelectAllTypes={handleSelectAllTypes}
          city={city}
          setCity={setCity}
          layers={layers}
          setLayers={setLayers}
          basemap={basemap}
          setBasemap={setBasemap}
          analysis={analysis}
          setAnalysis={setAnalysis}
          selectedPoint={selectedPoint}
          onRunAnalysis={runAnalysis}
          analysisBusy={analysisBusy}
          analysisResult={analysisResult}
          filteredFacilities={filteredFacilities}
          selectedFacility={selectedFacility}
          onSelectFacility={handleFacilitySelect}
          onRouteFacility={routeToFacility}
          routeProfile={routeProfile}
          setRouteProfile={setRouteProfile}
        />

        <MapView
          facilities={filteredFacilities}
          zones={zones}
          layers={layers}
          basemap={basemap}
          selectedPoint={selectedPoint}
          selectedFacility={selectedFacility}
          analysisGeometry={analysisGeometry}
          analysisFacilities={analysisFacilities}
          route={route}
          onMapPointSelect={(point) => {
            setSelectedPoint(point);
            setRoute(null);
            notify("Analysis origin selected.", "success");
          }}
          onFacilitySelect={handleFacilitySelect}
          onRouteFacility={routeToFacility}
          onMapApi={(apiObject) => { mapApiRef.current = apiObject; }}
          theme={theme}
        />

        <RightPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          stats={stats}
          filteredCount={filteredFacilities.features.length}
          selectedFacility={selectedFacility}
          route={route}
          onRouteFacility={routeToFacility}
          logs={logs}
        />
      </div>

      {error && (
        <div className="connection-banner">
          <strong>Database connection problem</strong>
          <span>{error}</span>
          <button onClick={() => loadData()}>Retry</button>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
      {showOnboarding && <Onboarding onComplete={completeOnboarding} />}
    </div>
  );
}
