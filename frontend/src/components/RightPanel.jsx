import React from "react";
import DonutChart from "./DonutChart.jsx";
import { Icon } from "./Icons.jsx";
import { formatDistance, formatDuration } from "../utils/geo.js";

function StatCard({ label, value, icon, accent }) {
  return (
    <div className="stat-card" style={{ "--stat-accent": accent }}>
      <span className="stat-icon"><Icon name={icon} size={17} /></span>
      <div><strong>{value ?? "—"}</strong><span>{label}</span></div>
    </div>
  );
}

export default function RightPanel({
  open,
  onClose,
  stats,
  filteredCount,
  selectedFacility,
  route,
  onRouteFacility,
  logs
}) {
  const summary = stats?.summary || {};
  const counts = stats?.facility_counts || [];
  const total = Number(summary.facilities || 0);
  const topTypes = counts.filter((item) => Number(item.total) > 0).sort((a, b) => Number(b.total) - Number(a.total)).slice(0, 6);
  const cities = stats?.city_counts || [];

  return (
    <aside className={`right-panel ${open ? "open" : ""}`}>
      <div className="panel-mobile-head mobile-only">
        <strong>City insights</strong>
        <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
      </div>

      <div className="right-panel-scroll">
        <section className="insight-section dashboard-overview">
          <div className="section-heading inline">
            <div><span className="eyebrow">LIVE DATABASE</span><h2>System overview</h2></div>
            <span className="live-badge"><span /> LIVE</span>
          </div>
          <div className="stats-grid">
            <StatCard label="Facilities" value={summary.facilities} icon="building" accent="#38bdf8" />
            <StatCard label="Visible" value={filteredCount} icon="map" accent="#22c55e" />
            <StatCard label="Zones" value={summary.zones} icon="layers" accent="#a78bfa" />
            <StatCard label="Analyses" value={summary.analyses} icon="chart" accent="#fb923c" />
          </div>
        </section>

        <section className="insight-section distribution-section">
          <div className="section-heading"><div><span className="eyebrow">PORTFOLIO</span><h2>Facility distribution</h2></div></div>
          <div className="distribution-content">
            <DonutChart data={counts} total={total} />
            <div className="distribution-legend">
              {topTypes.map((item) => (
                <div key={item.type}><span className="legend-dot" style={{ background: item.color }} /><span>{item.label}</span><strong>{item.total}</strong></div>
              ))}
            </div>
          </div>
        </section>

        <section className="insight-section city-section">
          <div className="section-heading"><div><span className="eyebrow">COVERAGE</span><h2>City split</h2></div></div>
          <div className="city-bars">
            {cities.map((item) => {
              const percentage = total ? Math.round((Number(item.total) / total) * 100) : 0;
              return (
                <div className="city-bar" key={item.city}>
                  <div><strong>{item.city}</strong><span>{item.total} · {percentage}%</span></div>
                  <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>

        <section className={`insight-section selection-section ${selectedFacility ? "has-selection" : ""}`}>
          <div className="section-heading"><div><span className="eyebrow">SELECTION</span><h2>Facility details</h2></div></div>
          {selectedFacility ? (
            <div className="selection-card">
              <div className="selection-title-row">
                <span className="selection-icon" style={{ "--category-color": selectedFacility.properties.type_color }}>{selectedFacility.properties.type_icon}</span>
                <div><h3>{selectedFacility.properties.name}</h3><p>{selectedFacility.properties.type_label} · {selectedFacility.properties.city}</p></div>
              </div>
              <dl>
                <div><dt>Address</dt><dd>{selectedFacility.properties.address || "Not available"}</dd></div>
                <div><dt>Category</dt><dd>{selectedFacility.properties.category || "General"}</dd></div>
                <div><dt>Data status</dt><dd><span className="verification-chip">{String(selectedFacility.properties.verification_status || "unknown").replaceAll("_", " ")}</span></dd></div>
                {selectedFacility.properties.data_quality_score != null && <div><dt>Quality score</dt><dd>{selectedFacility.properties.data_quality_score}/100</dd></div>}
              </dl>
              <button className="secondary-button" onClick={() => onRouteFacility(selectedFacility)}><Icon name="route" size={17} /> Route to facility</button>
            </div>
          ) : (
            <div className="empty-selection"><Icon name="pin" size={25} /><strong>Select a facility</strong><span>Click a point on the map or choose a record from Explore.</span></div>
          )}
        </section>

        {route && (
          <section className="insight-section route-summary">
            <div className="route-summary-icon"><Icon name="route" size={20} /></div>
            <div><span className="eyebrow">ACTIVE ROUTE</span><h3>{formatDistance(route.properties.distance_m)} · {formatDuration(route.properties.duration_s)}</h3><p>{route.properties.summary || `${route.properties.profile} route powered by Mapbox`}</p></div>
          </section>
        )}

        <section className="insight-section logs-section">
          <div className="section-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent analyses</h2></div></div>
          <div className="log-list">
            {logs.length ? logs.map((log) => (
              <div className="log-row" key={log.id}>
                <span className="log-icon"><Icon name="target" size={14} /></span>
                <div><strong>{String(log.analysis_type).replaceAll("_", " ")}</strong><small>{log.result_count ?? 0} result{Number(log.result_count) === 1 ? "" : "s"} · {new Date(log.created_at).toLocaleString()}</small></div>
              </div>
            )) : <div className="empty-log">Run an analysis to create the first log entry.</div>}
          </div>
        </section>
      </div>
    </aside>
  );
}
