import React from "react";
import { Icon } from "./Icons.jsx";

export default function Header({
  health,
  search,
  setSearch,
  onLocate,
  onRefresh,
  onClear,
  theme,
  onToggleTheme,
  onToggleLeft,
  onToggleRight
}) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <button className="icon-button mobile-only" onClick={onToggleLeft} aria-label="Open controls">
          <Icon name="menu" />
        </button>
        <div className="brand-symbol" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="brand-copy">
          <div className="brand-title">CIMS</div>
          <div className="brand-subtitle">City Infrastructure Intelligence</div>
        </div>
        <div className={`system-pill ${health?.ok ? "online" : "offline"}`}>
          <span className="status-dot" />
          {health?.ok ? "PostGIS live" : "API offline"}
        </div>
      </div>

      <div className="header-search">
        <Icon name="search" size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search 300 facilities, categories, or cities…"
          aria-label="Search facilities"
        />
        {search && (
          <button onClick={() => setSearch("")} aria-label="Clear search">
            <Icon name="close" size={15} />
          </button>
        )}
        <kbd>/</kbd>
      </div>

      <div className="header-actions">
        <button className="header-action" onClick={onLocate} title="Use my location">
          <Icon name="locate" />
          <span>Locate</span>
        </button>
        <button className="header-action" onClick={onRefresh} title="Refresh database data">
          <Icon name="refresh" />
          <span>Refresh</span>
        </button>
        <button className="header-action" onClick={onClear} title="Clear analysis">
          <Icon name="trash" />
          <span>Clear</span>
        </button>
        <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme">
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
        <button className="icon-button mobile-only" onClick={onToggleRight} aria-label="Open insights">
          <Icon name="panel" />
        </button>
      </div>
    </header>
  );
}
