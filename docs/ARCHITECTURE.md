# CIMS 2.0 Architecture

## Request flow

1. React requests GeoJSON and dashboard statistics from `/api`.
2. Express validates query parameters and runs parameterized SQL.
3. PostgreSQL/PostGIS performs spatial filtering, distance and buffer operations.
4. The API returns GeoJSON FeatureCollections.
5. Mapbox GL JS renders clusters, points, zones, analysis geometry and routes.

## Frontend modules

- `App.jsx`: application state, loading, filters, analysis and routing orchestration.
- `MapView.jsx`: Mapbox map lifecycle, sources, layers, clustering, 3D and popups.
- `LeftPanel.jsx`: layers, categories, analysis tools and database explorer.
- `RightPanel.jsx`: statistics, facility details, route summary and analysis logs.
- `services/api.js`: typed request boundary for the Express and Mapbox APIs.
- `utils/geo.js`: GeoJSON and formatting helpers.

## Backend modules

- `routes/facilities.js`: filtered and searchable facility GeoJSON.
- `routes/meta.js`: dynamic facility-type catalogue and city metadata.
- `routes/analysis.js`: nearest, radius and buffer PostGIS operations.
- `routes/stats.js`: database and category summaries.
- `routes/zones.js`: analysis-zone GeoJSON.
- `routes/roads.js`: active road features only; legacy demo roads remain hidden.

## Security and reliability

- Parameterized SQL
- CORS allowlist
- API rate limiting
- Helmet security headers
- Response compression
- Database connection pooling
- Graceful shutdown
- Client-side error states and route fallback
