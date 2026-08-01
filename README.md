# CIMS 2.0 — City Infrastructure Intelligence

A professional PERN Web GIS for Islamabad and Rawalpindi.

## Stack

- PostgreSQL 18 + PostGIS
- Express / Node.js API
- React + Vite frontend
- Mapbox GL JS mapping and clustering
- Mapbox Directions API for driving, walking and cycling routes
- Native SVG dashboard charts and responsive CSS

## Database

This code works with the existing `cims_db` database that already contains approximately 300 facilities, 10 zones and the existing roads table. Do not delete or recreate the database for this frontend upgrade.

## Requirements

- Node.js 20.19 or newer; Node.js 22 LTS is recommended.
- PostgreSQL/PostGIS with the existing working `cims_db`.

## First run

1. Open `backend/.env`.
2. Copy the working PostgreSQL values from your current CIMS project, especially `DB_PASSWORD`.
3. The public Mapbox token is already configured in `frontend/.env`.
4. Double-click `START_CIMS.bat`.
5. Open `http://localhost:3005`.

The start script installs dependencies, builds the Vite frontend and runs the Express server on one URL.

## Development mode

Double-click `START_CIMS_DEV.bat`.

- React/Vite: `http://localhost:5173`
- Express API: `http://localhost:3005/api`

Vite proxies `/api` requests to the Express backend.

## Main features

- Mapbox Streets, Dark, Light and Satellite basemaps
- Built-in Mapbox point clustering
- Dynamic facility categories loaded from the `facility_types` table
- Search, city filtering and category filtering
- Density heatmap, PostGIS zones and optional 3D buildings
- Nearest-facility analysis
- Radius search
- True PostGIS buffer analysis
- Mapbox driving, walking and cycling routes
- Animated route drawing with origin and destination markers
- Facility data-quality and verification details
- Database statistics and city coverage
- Analysis audit log
- Responsive desktop/tablet/mobile interface
- Loading skeleton, first-run onboarding and notifications

## Important configuration

### Backend

`backend/.env`

```env
DB_USER=postgres
DB_PASSWORD=YOUR_REAL_PASSWORD
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cims_db
PORT=3005
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:3005
```

### Frontend

`frontend/.env`

```env
VITE_MAPBOX_TOKEN=YOUR_PUBLIC_MAPBOX_TOKEN
VITE_API_BASE=/api
```

Restrict the public token in the Mapbox dashboard to your localhost URL during development and to the deployed domain later.

## API endpoints

- `GET /api/health`
- `GET /api/meta/facility-types`
- `GET /api/facilities`
- `GET /api/facilities/:id`
- `GET /api/zones`
- `GET /api/stats`
- `GET /api/analysis/nearest`
- `GET /api/analysis/radius`
- `GET /api/analysis/buffer`
- `GET /api/analysis/log`

## Production deployment

Run:

```powershell
cd frontend
npm install
npm run build
cd ..\backend
npm install
npm start
```

Express automatically serves `frontend/dist` at port 3005.
