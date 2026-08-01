# Validation notes

The generated project was checked as follows:

- All backend JavaScript files pass `node --check`.
- All React JavaScript/JSX files parse successfully with Babel's JSX parser.
- Every relative frontend import resolves to an existing source file.
- The backend SQL field names were aligned with `CIMS_COMPLETE_DATABASE_300_OSM.sql`.
- No Leaflet or Leaflet MarkerCluster imports remain in the application source.
- The database migration is included only as a reference/backup; the application uses the existing `cims_db` and does not recreate it on startup.

A production Vite build should be run on the target Windows machine using `START_CIMS.bat`, which installs platform-appropriate npm packages before building.
