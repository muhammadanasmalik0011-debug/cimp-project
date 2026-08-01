-- =========================================================
-- CIMS Spatial Queries Demonstration
-- These queries satisfy Spatial Database course requirements.
-- Run after schema + seed data.
-- =========================================================

-- 1) Find nearest hospital to a selected point
SELECT
    id,
    name,
    type,
    ROUND(ST_Distance(geom::geography, ST_SetSRID(ST_Point(73.0600, 33.5950), 4326)::geography)::numeric, 2) AS distance_m
FROM facilities
WHERE type = 'hospital'
ORDER BY geom <-> ST_SetSRID(ST_Point(73.0600, 33.5950), 4326)
LIMIT 1;

-- 2) Find all facilities within 1500 meters of a point
SELECT
    id,
    name,
    type,
    ROUND(ST_Distance(geom::geography, ST_SetSRID(ST_Point(73.0600, 33.5950), 4326)::geography)::numeric, 2) AS distance_m
FROM facilities
WHERE ST_DWithin(
    geom::geography,
    ST_SetSRID(ST_Point(73.0600, 33.5950), 4326)::geography,
    1500
)
ORDER BY distance_m;

-- 3) Count facilities by type inside each zone
SELECT
    z.name AS zone_name,
    z.zone_type,
    f.type AS facility_type,
    COUNT(*) AS total_facilities
FROM zones z
JOIN facilities f ON ST_Within(f.geom, z.geom)
GROUP BY z.name, z.zone_type, f.type
ORDER BY z.name, f.type;

-- 4) Calculate zone areas from geometry
SELECT
    name,
    zone_type,
    ROUND((ST_Area(geom::geography) / 1000000)::numeric, 4) AS area_sqkm
FROM zones
ORDER BY area_sqkm DESC;

-- 5) Create a 500 meter buffer around Holy Family Hospital
SELECT
    name,
    ST_AsGeoJSON(ST_Buffer(geom::geography, 500)::geometry) AS buffer_geojson
FROM facilities
WHERE name = 'Holy Family Hospital';

-- 6) Check which zone contains a selected coordinate
SELECT
    name,
    zone_type
FROM zones
WHERE ST_Contains(geom, ST_SetSRID(ST_Point(73.0600, 33.5950), 4326));

-- 7) Distance between two facilities
SELECT
    a.name AS facility_1,
    b.name AS facility_2,
    ROUND(ST_Distance(a.geom::geography, b.geom::geography)::numeric, 2) AS distance_m
FROM facilities a
JOIN facilities b ON a.id < b.id
WHERE a.name = 'Holy Family Hospital'
  AND b.name = 'Ayub National Park';

-- 8) Facilities inside a map bounding box
SELECT id, name, type
FROM facilities
WHERE ST_Intersects(
    geom,
    ST_MakeEnvelope(73.0400, 33.5800, 73.0850, 33.6100, 4326)
)
ORDER BY type, name;

-- 9) Road-zone intersections
SELECT
    r.name AS road_name,
    z.name AS zone_name,
    z.zone_type
FROM roads r
JOIN zones z ON ST_Intersects(r.geom, z.geom)
ORDER BY r.name, z.name;

-- 10) Export facilities as GeoJSON FeatureCollection
SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(json_agg(json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(geom)::json,
        'properties', json_build_object(
            'id', id,
            'name', name,
            'type', type,
            'address', address,
            'rating', rating
        )
    )), '[]'::json)
) AS geojson
FROM facilities;
