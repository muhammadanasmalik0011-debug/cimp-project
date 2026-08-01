# CIMS 2.0 Changes

- Replaced Leaflet and MarkerCluster with Mapbox GL JS.
- Rebuilt the frontend as a component-based React/Vite application.
- Added a professional operations-dashboard layout inspired by the supplied NYC GeoTwin reference.
- Removed the custom blue database-road overlay from the UI.
- Added Mapbox basemap switching, built-in clustering, heatmap and 3D buildings.
- Added dynamic support for all categories stored in `facility_types`.
- Upgraded backend routes for the 300-facility schema and metadata fields.
- Added route profiles and animated Mapbox Directions routes.
- Added responsive panels, loading skeleton, onboarding and accessible controls.
- Preserved the existing PostgreSQL/PostGIS database and analysis log.
