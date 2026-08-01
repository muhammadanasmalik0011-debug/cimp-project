import React, { useMemo, useState } from "react";
import { Icon } from "./Icons.jsx";
import { formatDistance, formatDuration } from "../utils/geo.js";

const BASEMAPS = [
  { id: "streets", label: "Streets", description: "Detailed navigation map", style: "mapbox://styles/mapbox/streets-v12" },
  { id: "dark", label: "Dark", description: "Operations dashboard", style: "mapbox://styles/mapbox/dark-v11" },
  { id: "light", label: "Light", description: "Clean analytical canvas", style: "mapbox://styles/mapbox/light-v11" },
  { id: "satellite", label: "Satellite", description: "Imagery with labels", style: "mapbox://styles/mapbox/satellite-streets-v12" }
];

function Toggle({ checked, onChange, label, description, swatch }) {
  return (
    <button className={`toggle-row ${checked ? "active" : ""}`} onClick={() => onChange(!checked)} type="button">
      <span className="toggle-label-wrap">
        {swatch && <span className="layer-swatch" style={{ background: swatch }} />}
        <span>
          <strong>{label}</strong>
          {description && <small>{description}</small>}
        </span>
      </span>
      <span className={`switch ${checked ? "on" : ""}`}><span /></span>
    </button>
  );
}

export default function LeftPanel({
  open,
  onClose,
  facilityTypes,
  activeTypes,
  onToggleType,
  onSelectAllTypes,
  city,
  setCity,
  layers,
  setLayers,
  basemap,
  setBasemap,
  analysis,
  setAnalysis,
  selectedPoint,
  onRunAnalysis,
  analysisBusy,
  analysisResult,
  filteredFacilities,
  selectedFacility,
  onSelectFacility,
  onRouteFacility,
  routeProfile,
  setRouteProfile
}) {
  const [tab, setTab] = useState("layers");
  const selectedCount = activeTypes.size;
  const filteredList = useMemo(() => filteredFacilities.features.slice(0, 150), [filteredFacilities]);

  return (
    <aside className={`left-panel ${open ? "open" : ""}`}>
      <div className="panel-mobile-head mobile-only">
        <strong>Workspace controls</strong>
        <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
      </div>

      <div className="rail-tabs" role="tablist">
        <button className={tab === "layers" ? "active" : ""} onClick={() => setTab("layers")}>
          <Icon name="layers" /><span>Layers</span>
        </button>
        <button className={tab === "analysis" ? "active" : ""} onClick={() => setTab("analysis")}>
          <Icon name="target" /><span>Analyze</span>
        </button>
        <button className={tab === "explore" ? "active" : ""} onClick={() => setTab("explore")}>
          <Icon name="search" /><span>Explore</span>
        </button>
      </div>

      <div className="left-panel-scroll">
        {tab === "layers" && (
          <div className="tab-content">
            <section className="panel-section">
              <div className="section-heading">
                <div><span className="eyebrow">MAP STYLE</span><h2>Basemap</h2></div>
              </div>
              <div className="basemap-grid">
                {BASEMAPS.map((item) => (
                  <button
                    key={item.id}
                    className={`basemap-card basemap-${item.id} ${basemap === item.id ? "active" : ""}`}
                    onClick={() => setBasemap(item.id)}
                  >
                    <span className="basemap-preview" />
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                    {basemap === item.id && <Icon name="check" size={15} />}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel-section">
              <div className="section-heading">
                <div><span className="eyebrow">DATA LAYERS</span><h2>Map content</h2></div>
              </div>
              <div className="toggle-stack">
                <Toggle
                  checked={layers.facilities}
                  onChange={(value) => setLayers((current) => ({ ...current, facilities: value }))}
                  label="Facility points"
                  description="Clustered PostGIS locations"
                  swatch="#38bdf8"
                />
                <Toggle
                  checked={layers.heatmap}
                  onChange={(value) => setLayers((current) => ({ ...current, heatmap: value }))}
                  label="Density heatmap"
                  description="Infrastructure concentration"
                  swatch="#f97316"
                />
                <Toggle
                  checked={layers.zones}
                  onChange={(value) => setLayers((current) => ({ ...current, zones: value }))}
                  label="Planning zones"
                  description="10 PostGIS analysis areas"
                  swatch="#8b5cf6"
                />
                <Toggle
                  checked={layers.buildings3d}
                  onChange={(value) => setLayers((current) => ({ ...current, buildings3d: value }))}
                  label="3D buildings"
                  description="Available at street-level zoom"
                  swatch="#94a3b8"
                />
              </div>
            </section>

            <section className="panel-section">
              <div className="section-heading inline">
                <div><span className="eyebrow">FACILITY TYPES</span><h2>Categories</h2></div>
                <button className="text-button" onClick={onSelectAllTypes}>
                  {selectedCount === facilityTypes.length ? "Clear" : "All"}
                </button>
              </div>
              <div className="category-list">
                {facilityTypes.map((type) => {
                  const active = activeTypes.has(type.code);
                  return (
                    <button
                      key={type.code}
                      className={`category-row ${active ? "active" : ""}`}
                      onClick={() => onToggleType(type.code)}
                    >
                      <span className="category-icon" style={{ "--category-color": type.color }}>{type.icon || type.label?.[0]}</span>
                      <span className="category-copy"><strong>{type.label}</strong><small>{type.description}</small></span>
                      <span className="category-count">{type.total}</span>
                      <span className={`category-check ${active ? "checked" : ""}`}>{active && <Icon name="check" size={12} />}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {tab === "analysis" && (
          <div className="tab-content">
            <section className="analysis-hero">
              <div className="analysis-hero-icon"><Icon name="target" size={22} /></div>
              <div>
                <span className="eyebrow">SPATIAL WORKBENCH</span>
                <h2>Run a PostGIS analysis</h2>
                <p>Choose a tool, select a point on the map, and calculate results from the live database.</p>
              </div>
            </section>

            <section className="panel-section compact">
              <span className="field-label">Selected origin</span>
              <div className={`coordinate-card ${selectedPoint ? "ready" : ""}`}>
                <Icon name="pin" size={18} />
                {selectedPoint ? (
                  <div><strong>{selectedPoint.lat.toFixed(5)}, {selectedPoint.lng.toFixed(5)}</strong><small>Click elsewhere to update</small></div>
                ) : (
                  <div><strong>No point selected</strong><small>Click anywhere on the map</small></div>
                )}
              </div>
            </section>

            <section className="panel-section compact">
              <span className="field-label">Analysis tool</span>
              <div className="segmented-control three">
                {["nearest", "radius", "buffer"].map((mode) => (
                  <button key={mode} className={analysis.mode === mode ? "active" : ""} onClick={() => setAnalysis((current) => ({ ...current, mode }))}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </section>

            <section className="panel-section compact form-stack">
              <label>
                <span className="field-label">Facility category</span>
                <select value={analysis.type} onChange={(event) => setAnalysis((current) => ({ ...current, type: event.target.value }))}>
                  {analysis.mode !== "nearest" && <option value="all">All facility types</option>}
                  {facilityTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}
                </select>
              </label>

              {analysis.mode !== "nearest" && (
                <label>
                  <span className="field-label split"><span>Distance</span><strong>{analysis.radius >= 1000 ? `${(analysis.radius / 1000).toFixed(1)} km` : `${analysis.radius} m`}</strong></span>
                  <input
                    className="range-input"
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={analysis.radius}
                    onChange={(event) => setAnalysis((current) => ({ ...current, radius: Number(event.target.value) }))}
                  />
                  <div className="range-labels"><span>100 m</span><span>10 km</span></div>
                </label>
              )}

              {analysis.mode === "nearest" && (
                <label>
                  <span className="field-label">Route mode</span>
                  <div className="segmented-control">
                    {["driving", "walking", "cycling"].map((profile) => (
                      <button key={profile} className={routeProfile === profile ? "active" : ""} onClick={() => setRouteProfile(profile)} type="button">
                        {profile[0].toUpperCase() + profile.slice(1)}
                      </button>
                    ))}
                  </div>
                </label>
              )}

              <button className="primary-button" onClick={onRunAnalysis} disabled={!selectedPoint || analysisBusy}>
                {analysisBusy ? <span className="button-spinner" /> : <Icon name="play" size={17} />}
                {analysisBusy ? "Calculating…" : `Run ${analysis.mode} analysis`}
              </button>
            </section>

            {analysisResult && (
              <section className="result-card">
                <div className="result-card-head"><span className="success-icon"><Icon name="check" size={15} /></span><div><span className="eyebrow">ANALYSIS COMPLETE</span><h3>{analysisResult.title}</h3></div></div>
                <div className="result-metrics">
                  {analysisResult.count !== undefined && <div><strong>{analysisResult.count}</strong><span>results</span></div>}
                  {analysisResult.distance_m !== undefined && <div><strong>{formatDistance(analysisResult.distance_m)}</strong><span>distance</span></div>}
                  {analysisResult.duration_s !== undefined && <div><strong>{formatDuration(analysisResult.duration_s)}</strong><span>travel time</span></div>}
                </div>
                {analysisResult.message && <p>{analysisResult.message}</p>}
              </section>
            )}
          </div>
        )}

        {tab === "explore" && (
          <div className="tab-content explore-tab">
            <section className="panel-section compact">
              <div className="section-heading"><div><span className="eyebrow">DATABASE EXPLORER</span><h2>{filteredFacilities.features.length} visible facilities</h2></div></div>
              <div className="segmented-control city-filter">
                {["all", "Islamabad", "Rawalpindi"].map((item) => (
                  <button key={item} className={city === item ? "active" : ""} onClick={() => setCity(item)}>{item === "all" ? "Both" : item}</button>
                ))}
              </div>
            </section>

            <div className="facility-list">
              {filteredList.map((feature) => {
                const properties = feature.properties || {};
                return (
                  <button
                    key={properties.id}
                    className={`facility-list-item ${selectedFacility?.properties?.id === properties.id ? "selected" : ""}`}
                    onClick={() => onSelectFacility(feature)}
                  >
                    <span className="facility-list-icon" style={{ "--category-color": properties.type_color }}>{properties.type_icon || properties.type_label?.[0]}</span>
                    <span className="facility-list-copy"><strong>{properties.name}</strong><small>{properties.type_label} · {properties.city}</small></span>
                    <Icon name="chevron" size={15} />
                  </button>
                );
              })}
              {!filteredList.length && <div className="empty-state"><Icon name="search" size={28} /><strong>No facilities match</strong><span>Adjust your search, city, or category filters.</span></div>}
            </div>

            {selectedFacility && (
              <button className="sticky-route-button" onClick={() => onRouteFacility(selectedFacility)}>
                <Icon name="route" /> Route from selected point
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export { BASEMAPS };
