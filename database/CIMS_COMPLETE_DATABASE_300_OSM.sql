-- ============================================================================
-- CIMS COMPLETE DATABASE BUILD
-- Islamabad + Rawalpindi | Legacy facilities + live OpenStreetMap facilities
-- Target: approximately 300 named facilities in total
-- PostgreSQL 18 + PostGIS | Intended for pgAdmin Query Tool on database cims_db
-- ============================================================================
-- IMPORTANT
-- 1. Run this WHOLE file while connected to cims_db as the postgres superuser.
-- 2. Do not run a separate DROP script first. This file performs the reset inside
--    one transaction, so a failed OSM download rolls the old database back.
-- 3. The import uses Windows PowerShell through COPY FROM PROGRAM to request
--    named OpenStreetMap objects from public Overpass API endpoints.
-- 4. No views, stored procedures, stored functions, triggers, or verification
--    SELECT result queries are created by this file.
-- 5. Internal INSERT ... SELECT statements are used only to transform OSM JSON.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;

-- --------------------------------------------------------------------------
-- Remove every known object from the original and prior upgraded CIMS schema.
-- --------------------------------------------------------------------------
DROP VIEW IF EXISTS v_facility_data_quality CASCADE;
DROP VIEW IF EXISTS v_facility_counts CASCADE;
DROP VIEW IF EXISTS v_zone_area_check CASCADE;

DROP FUNCTION IF EXISTS set_facilities_updated_at() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;

DROP TABLE IF EXISTS facility_data_archive CASCADE;
DROP TABLE IF EXISTS facility_import_runs CASCADE;
DROP TABLE IF EXISTS analysis_log CASCADE;
DROP TABLE IF EXISTS roads CASCADE;
DROP TABLE IF EXISTS zones CASCADE;
DROP TABLE IF EXISTS facilities CASCADE;
DROP TABLE IF EXISTS facility_types CASCADE;
DROP TABLE IF EXISTS data_sources CASCADE;

-- --------------------------------------------------------------------------
-- Source catalogue: preserves provenance and licensing information.
-- --------------------------------------------------------------------------
CREATE TABLE data_sources (
    code             VARCHAR(50) PRIMARY KEY,
    provider_name    VARCHAR(160) NOT NULL,
    source_url       TEXT,
    licence_name     VARCHAR(100),
    attribution_text TEXT,
    retrieved_at     TIMESTAMPTZ,
    notes            TEXT
);

INSERT INTO data_sources
    (code, provider_name, source_url, licence_name, attribution_text, retrieved_at, notes)
VALUES
    ('legacy_seed',
     'Original CIMS project seed dataset',
     NULL,
     'Project seed data',
     'CIMS legacy seed data',
     NOW(),
     'Retained because the project owner requested the old facilities. These rows are not automatically treated as OSM-verified.'),
    ('openstreetmap',
     'OpenStreetMap contributors',
     'https://www.openstreetmap.org/copyright',
     'Open Database License (ODbL) 1.0',
     '© OpenStreetMap contributors',
     NOW(),
     'Current named infrastructure objects requested through Overpass API when this SQL file is executed.');

-- --------------------------------------------------------------------------
-- Facility-type catalogue for later frontend filters, legends and styling.
-- --------------------------------------------------------------------------
CREATE TABLE facility_types (
    code          VARCHAR(50) PRIMARY KEY,
    display_name  VARCHAR(100) NOT NULL,
    description   TEXT,
    default_color VARCHAR(20),
    marker_letter VARCHAR(3),
    sort_order    SMALLINT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO facility_types
    (code, display_name, description, default_color, marker_letter, sort_order)
VALUES
('hospital',          'Hospital',                  'Emergency and inpatient healthcare',       '#ef4444', 'H',  10),
('clinic',            'Clinic / Doctor',           'Outpatient healthcare and medical clinics', '#fb7185', 'C',  20),
('pharmacy',          'Pharmacy',                  'Medicine and pharmacy services',             '#e11d48', 'P',  30),
('school',            'School',                    'Primary and secondary education',             '#2563eb', 'S',  40),
('college',           'College',                   'College-level education',                     '#7c3aed', 'C',  50),
('university',        'University',                'University and higher education',             '#4f46e5', 'U',  60),
('govt',              'Government Facility',       'Government office, civic building or court', '#475569', 'G',  70),
('mosque',            'Mosque',                    'Muslim place of worship',                     '#f97316', 'M',  80),
('park',              'Park',                      'Public park and green open space',            '#22c55e', 'P',  90),
('police',            'Police Station',            'Police and public-safety facility',          '#1e3a8a', 'P', 100),
('fire',              'Fire Station',              'Fire and rescue facility',                   '#dc2626', 'F', 110),
('ambulance',         'Ambulance / Rescue',        'Ambulance and emergency-response station',   '#0891b2', 'A', 120),
('red_metro',         'Metrobus Station',          'Islamabad-Rawalpindi Metrobus station',      '#be123c', 'R', 130),
('transit_station',   'Transit Station',           'Other named public-transport station',       '#0f766e', 'T', 140),
('library',           'Library',                   'Public or institutional library',             '#a16207', 'L', 150),
('post_office',       'Post Office',               'Postal service facility',                    '#ca8a04', 'O', 160),
('community_center',  'Community Centre',          'Community and civic activity centre',        '#9333ea', 'C', 170),
('sports_center',     'Sports Centre',             'Sports and recreation facility',             '#059669', 'S', 180),
('playground',        'Playground',                'Public playground',                          '#65a30d', 'P', 190);

-- --------------------------------------------------------------------------
-- Main point infrastructure table.
-- --------------------------------------------------------------------------
CREATE TABLE facilities (
    id                   BIGSERIAL PRIMARY KEY,
    name                 VARCHAR(250) NOT NULL,
    type                 VARCHAR(50) NOT NULL REFERENCES facility_types(code),
    category             VARCHAR(100),
    address              TEXT,
    city                 VARCHAR(100) NOT NULL,
    phone                VARCHAR(80),
    capacity             INTEGER,
    rating               NUMERIC(2,1),
    geom                 GEOMETRY(Point, 4326) NOT NULL,
    source               VARCHAR(50) NOT NULL DEFAULT 'legacy_seed' REFERENCES data_sources(code),
    source_id            VARCHAR(150),
    source_url           TEXT,
    osm_element_type     VARCHAR(20),
    osm_id               BIGINT,
    tags                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    verification_status  VARCHAR(30) NOT NULL DEFAULT 'legacy_unverified',
    verification_notes   TEXT,
    data_quality_score   SMALLINT,
    imported_at          TIMESTAMPTZ,
    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_facility_rating
        CHECK (rating IS NULL OR rating BETWEEN 0 AND 5),
    CONSTRAINT chk_facility_capacity
        CHECK (capacity IS NULL OR capacity >= 0),
    CONSTRAINT chk_facility_quality
        CHECK (data_quality_score IS NULL OR data_quality_score BETWEEN 0 AND 100),
    CONSTRAINT chk_facility_verification
        CHECK (verification_status IN
            ('legacy_unverified','osm_imported','needs_review','manually_verified','rejected')),
    CONSTRAINT chk_facility_osm_element
        CHECK (osm_element_type IS NULL OR osm_element_type IN ('node','way','relation')),
    CONSTRAINT chk_facility_city
        CHECK (city IN ('Islamabad','Rawalpindi')),
    CONSTRAINT uq_facility_source_id
        UNIQUE (source, source_id)
);

CREATE INDEX idx_facilities_geom
    ON facilities USING GIST (geom);
CREATE INDEX idx_facilities_type
    ON facilities (type);
CREATE INDEX idx_facilities_city
    ON facilities (city);
CREATE INDEX idx_facilities_type_city
    ON facilities (type, city);
CREATE INDEX idx_facilities_name_lower
    ON facilities (LOWER(name));
CREATE INDEX idx_facilities_source
    ON facilities (source);
CREATE INDEX idx_facilities_verification
    ON facilities (verification_status);
CREATE INDEX idx_facilities_quality
    ON facilities (data_quality_score DESC NULLS LAST);
CREATE INDEX idx_facilities_tags
    ON facilities USING GIN (tags);
CREATE INDEX idx_facilities_active
    ON facilities (is_active);

-- --------------------------------------------------------------------------
-- Analysis zones retained for compatibility with the existing CIMS backend.
-- --------------------------------------------------------------------------
CREATE TABLE zones (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(160) NOT NULL,
    zone_type           VARCHAR(50),
    population          INTEGER,
    area_sqkm           NUMERIC(12,4),
    geom                GEOMETRY(Polygon, 4326) NOT NULL,
    source              VARCHAR(50) NOT NULL DEFAULT 'legacy_seed' REFERENCES data_sources(code),
    verification_status VARCHAR(30) NOT NULL DEFAULT 'legacy_unverified',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_zone_type
        CHECK (zone_type IS NULL OR zone_type IN
            ('residential','commercial','industrial','green','mixed','educational')),
    CONSTRAINT chk_zone_population
        CHECK (population IS NULL OR population >= 0),
    CONSTRAINT chk_zone_area
        CHECK (area_sqkm IS NULL OR area_sqkm >= 0)
);

CREATE INDEX idx_zones_geom
    ON zones USING GIST (geom);
CREATE INDEX idx_zones_type
    ON zones (zone_type);
CREATE INDEX idx_zones_active
    ON zones (is_active);

-- --------------------------------------------------------------------------
-- Road table retained for API compatibility. Legacy demo roads are marked
-- inactive because the map now uses the normal OpenStreetMap basemap.
-- --------------------------------------------------------------------------
CREATE TABLE roads (
    id                  BIGSERIAL PRIMARY KEY,
    name                VARCHAR(250),
    road_type           VARCHAR(50),
    surface             VARCHAR(50),
    lanes               SMALLINT,
    geom                GEOMETRY(LineString, 4326) NOT NULL,
    source              VARCHAR(50) NOT NULL DEFAULT 'legacy_seed' REFERENCES data_sources(code),
    source_id           VARCHAR(150),
    source_url          TEXT,
    tags                JSONB NOT NULL DEFAULT '{}'::jsonb,
    verification_status VARCHAR(30) NOT NULL DEFAULT 'legacy_unverified',
    is_active           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_road_lanes
        CHECK (lanes IS NULL OR lanes > 0),
    CONSTRAINT chk_road_type
        CHECK (road_type IS NULL OR road_type IN
            ('motorway','trunk','primary','secondary','tertiary',
             'residential','service','unclassified')),
    CONSTRAINT uq_road_source_id
        UNIQUE (source, source_id)
);

CREATE INDEX idx_roads_geom
    ON roads USING GIST (geom);
CREATE INDEX idx_roads_type
    ON roads (road_type);
CREATE INDEX idx_roads_active
    ON roads (is_active);

-- --------------------------------------------------------------------------
-- Analysis log begins empty. The application will add genuine analysis runs.
-- --------------------------------------------------------------------------
CREATE TABLE analysis_log (
    id             BIGSERIAL PRIMARY KEY,
    analysis_type  VARCHAR(100) NOT NULL,
    input_geom     GEOMETRY(Point, 4326),
    radius_m       INTEGER,
    result_count   INTEGER,
    result_geojson JSONB,
    user_note      TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_analysis_radius
        CHECK (radius_m IS NULL OR radius_m >= 0),
    CONSTRAINT chk_analysis_result_count
        CHECK (result_count IS NULL OR result_count >= 0)
);

CREATE INDEX idx_analysis_log_geom
    ON analysis_log USING GIST (input_geom);
CREATE INDEX idx_analysis_log_type
    ON analysis_log (analysis_type);
CREATE INDEX idx_analysis_log_created
    ON analysis_log (created_at DESC);

-- ============================================================================
-- LEGACY CIMS ZONES
-- ============================================================================
INSERT INTO zones (name, zone_type, population, area_sqkm, geom) VALUES

-- 1. Westridge — large western residential belt
('Westridge Residential Zone',  'residential', 95000,  4.20,
 ST_GeomFromText('POLYGON((
   73.0280 33.5960, 73.0570 33.5960,
   73.0570 33.6155, 73.0280 33.6155,
   73.0280 33.5960))', 4326)),

-- 2. Satellite Town — core northern residential colony
('Satellite Town Residential Zone', 'residential', 135000, 5.10,
 ST_GeomFromText('POLYGON((
   73.0560 33.5940, 73.0890 33.5940,
   73.0890 33.6170, 73.0560 33.6170,
   73.0560 33.5940))', 4326)),

-- 3. Saddar — central commercial hub
('Saddar Commercial Zone', 'commercial', 90000, 2.80,
 ST_GeomFromText('POLYGON((
   73.0440 33.5790, 73.0700 33.5790,
   73.0700 33.5965, 73.0440 33.5965,
   73.0440 33.5790))', 4326)),

-- 4. Ayub Park — primary green belt
('Ayub Park Green Zone', 'green', 18000, 3.20,
 ST_GeomFromText('POLYGON((
   73.0660 33.5600, 73.0910 33.5600,
   73.0910 33.5860, 73.0660 33.5860,
   73.0660 33.5600))', 4326)),

-- 5. Chaklala — military/civilian mixed zone
('Chaklala Mixed Zone', 'mixed', 110000, 5.80,
 ST_GeomFromText('POLYGON((
   73.0870 33.5780, 73.1225 33.5780,
   73.1225 33.6080, 73.0870 33.6080,
   73.0870 33.5780))', 4326)),

-- 6. South Rawalpindi — govt & civic commercial strip
('South Rawalpindi Commercial Zone', 'commercial', 55000, 2.20,
 ST_GeomFromText('POLYGON((
   73.0430 33.5600, 73.0680 33.5600,
   73.0680 33.5800, 73.0430 33.5800,
   73.0430 33.5600))', 4326)),

-- 7. Rawalpindi Industrial Estate — western industrial belt
('Rawalpindi Industrial Estate', 'industrial', 40000, 6.50,
 ST_GeomFromText('POLYGON((
   73.0000 33.5380, 73.0450 33.5380,
   73.0450 33.5720, 73.0000 33.5720,
   73.0000 33.5380))', 4326)),

-- 8. Gulzar-e-Quaid — south-east residential area
('Gulzar-e-Quaid Residential Zone', 'residential', 75000, 3.80,
 ST_GeomFromText('POLYGON((
   73.0870 33.5560, 73.1225 33.5560,
   73.1225 33.5790, 73.0870 33.5790,
   73.0870 33.5560))', 4326)),

-- 9. Islamabad G-Sectors — Islamabad residential sectors
('Islamabad G-Sectors Residential', 'residential', 92000, 6.80,
 ST_GeomFromText('POLYGON((
   73.0380 33.6920, 73.0900 33.6920,
   73.0900 33.7340, 73.0380 33.7340,
   73.0380 33.6920))', 4326)),

-- 10. Blue Area — Islamabad's primary commercial CBD
('Blue Area Commercial Zone', 'commercial', 35000, 2.40,
 ST_GeomFromText('POLYGON((
   73.0430 33.7140, 73.0900 33.7140,
   73.0900 33.7380, 73.0430 33.7380,
   73.0430 33.7140))', 4326));


-- ============================================================================
-- LEGACY CIMS FACILITIES (60)
-- Retained exactly as requested, but marked legacy_unverified rather than OSM
-- verified. The live OSM import below avoids close name/type duplicates.
-- ============================================================================
INSERT INTO facilities
  (name, type, category, address, city, phone, capacity, rating, geom)
VALUES

-- ======================== HOSPITALS (12) ========================

-- Zone 3: Saddar
('Holy Family Hospital',
 'hospital','public','Satellite Town Road, Rawalpindi','Rawalpindi',
 '051-9290321', 900, 4.4,
 ST_SetSRID(ST_Point(73.0551, 33.5937), 4326)),

('Combined Military Hospital (CMH)',
 'hospital','public','The Mall, Rawalpindi Cantonment','Rawalpindi',
 '051-5613413', 1200, 4.6,
 ST_SetSRID(ST_Point(73.0543, 33.5904), 4326)),

-- Zone 2: Satellite Town
('Benazir Bhutto Hospital (BBH)',
 'hospital','public','Murree Road, Rawalpindi','Rawalpindi',
 '051-9280301', 750, 4.2,
 ST_SetSRID(ST_Point(73.0820, 33.6150), 4326)),

('District Headquarters Hospital (DHQ)',
 'hospital','public','Liaquat Road, Rawalpindi','Rawalpindi',
 '051-5556311', 600, 4.1,
 ST_SetSRID(ST_Point(73.0601, 33.6035), 4326)),

('Rawalpindi Institute of Cardiology',
 'hospital','public','Rawal Road, Rawalpindi','Rawalpindi',
 '051-9270500', 350, 4.3,
 ST_SetSRID(ST_Point(73.0671, 33.5960), 4326)),

('Al-Shifa Trust Eye Hospital',
 'hospital','private','Satellite Town, Rawalpindi','Rawalpindi',
 '051-4486000', 280, 4.5,
 ST_SetSRID(ST_Point(73.0620, 33.5975), 4326)),

-- Zone 1: Westridge
('Railway Hospital Rawalpindi',
 'hospital','public','Westridge, Rawalpindi','Rawalpindi',
 '051-9270834', 350, 3.9,
 ST_SetSRID(ST_Point(73.0408, 33.6029), 4326)),

('Services Hospital Rawalpindi',
 'hospital','public','Bank Road, Westridge, Rawalpindi','Rawalpindi',
 '051-9270200', 400, 4.0,
 ST_SetSRID(ST_Point(73.0490, 33.6020), 4326)),

-- Zone 5: Chaklala
('Ali Medical Centre',
 'hospital','private','Chaklala Scheme I, Rawalpindi','Rawalpindi',
 '051-4570000', 180, 4.2,
 ST_SetSRID(ST_Point(73.0892, 33.5940), 4326)),

-- Zone 7: Industrial
('Fauji Foundation Hospital',
 'hospital','private','Jhelum Road, Rawalpindi','Rawalpindi',
 '051-5951821', 700, 4.5,
 ST_SetSRID(ST_Point(73.0362, 33.5541), 4326)),

('POF Base Hospital',
 'hospital','public','Havelian Road, Rawalpindi','Rawalpindi',
 '051-9310100', 250, 3.8,
 ST_SetSRID(ST_Point(73.0320, 33.5560), 4326)),

-- Zone 9: Islamabad
('Shifa International Hospital',
 'hospital','private','H-8/4, Islamabad','Islamabad',
 '051-8464646', 1000, 4.7,
 ST_SetSRID(ST_Point(73.0573, 33.7076), 4326)),


-- ======================== SCHOOLS (12) ========================

-- Zone 1: Westridge
('Army Public School Westridge',
 'school','public','Westridge, Rawalpindi','Rawalpindi',
 '051-5160001', 2000, 4.3,
 ST_SetSRID(ST_Point(73.0450, 33.6020), 4326)),

('Army Burn Hall College',
 'school','public','Abid Majeed Road, Westridge','Rawalpindi',
 '051-5788700', 1800, 4.4,
 ST_SetSRID(ST_Point(73.0398, 33.6097), 4326)),

('Jamia Mosque Railway Colony School',
 'school','public','Railway Colony, Rawalpindi','Rawalpindi',
 '051-9270900', 800, 3.8,
 ST_SetSRID(ST_Point(73.0468, 33.6012), 4326)),

-- Zone 2: Satellite Town
('Beaconhouse School Satellite Town',
 'school','private','Satellite Town, Rawalpindi','Rawalpindi',
 '051-4452100', 1500, 4.2,
 ST_SetSRID(ST_Point(73.0625, 33.5967), 4326)),

('Government Gordon College',
 'school','public','Liaquat Road, Rawalpindi','Rawalpindi',
 '051-5771183', 3000, 4.1,
 ST_SetSRID(ST_Point(73.0642, 33.5994), 4326)),

('Roots Millennium Schools',
 'school','private','Commercial Market, Rawalpindi','Rawalpindi',
 '051-4850111', 1200, 4.4,
 ST_SetSRID(ST_Point(73.0702, 33.6011), 4326)),

('St. Mary''s Cambridge School',
 'school','private','Satellite Town, Rawalpindi','Rawalpindi',
 '051-4454700', 1100, 4.3,
 ST_SetSRID(ST_Point(73.0711, 33.5960), 4326)),

('Punjab Model School Satellite Town',
 'school','public','Satellite Town G-Block, Rawalpindi','Rawalpindi',
 '051-9290400', 900, 3.9,
 ST_SetSRID(ST_Point(73.0625, 33.5985), 4326)),

-- Zone 3: Saddar
('FG Public School Saddar',
 'school','public','Saddar, Rawalpindi','Rawalpindi',
 '051-5587219', 1800, 4.0,
 ST_SetSRID(ST_Point(73.0572, 33.5912), 4326)),

-- Zone 8: Gulzar-e-Quaid
('SLS Montessori & School (PWD)',
 'school','private','PWD Road, Rawalpindi','Rawalpindi',
 '051-5152201', 1000, 4.0,
 ST_SetSRID(ST_Point(73.0907, 33.5665), 4326)),

('The City School Rawalpindi',
 'school','private','Gulzar Colony, Rawalpindi','Rawalpindi',
 '051-4480100', 1300, 4.2,
 ST_SetSRID(ST_Point(73.0900, 33.5680), 4326)),

-- Zone 9: Islamabad
('Froebel''s International School',
 'school','private','F-7/2, Islamabad','Islamabad',
 '051-2650100', 1400, 4.6,
 ST_SetSRID(ST_Point(73.0642, 33.7204), 4326)),


-- ======================== PARKS (12) ========================

-- Zone 4: Ayub Park Green
('Ayub National Park',
 'park','public','Jhelum Road, Rawalpindi','Rawalpindi',
 NULL, NULL, 4.6,
 ST_SetSRID(ST_Point(73.0783, 33.5750), 4326)),

-- Zone 2: Satellite Town
('Nawaz Sharif Park',
 'park','public','Murree Road, Rawalpindi','Rawalpindi',
 NULL, NULL, 4.2,
 ST_SetSRID(ST_Point(73.0765, 33.6113), 4326)),

('Liaquat Bagh',
 'park','public','Liaquat Road, Rawalpindi','Rawalpindi',
 NULL, NULL, 4.1,
 ST_SetSRID(ST_Point(73.0681, 33.6024), 4326)),

('Commercial Market Mini Park',
 'park','public','Commercial Market, Satellite Town','Rawalpindi',
 NULL, NULL, 3.9,
 ST_SetSRID(ST_Point(73.0714, 33.5992), 4326)),

('Nilor Park',
 'park','public','Satellite Town D-Block, Rawalpindi','Rawalpindi',
 NULL, NULL, 4.0,
 ST_SetSRID(ST_Point(73.0855, 33.6048), 4326)),

-- Zone 1: Westridge
('Race Course Park',
 'park','public','Westridge, Rawalpindi','Rawalpindi',
 NULL, NULL, 4.3,
 ST_SetSRID(ST_Point(73.0442, 33.6081), 4326)),

-- Zone 6: South Rawalpindi
('Jinnah Park Rawalpindi',
 'park','public','Kacheri Chowk, Rawalpindi','Rawalpindi',
 NULL, NULL, 4.5,
 ST_SetSRID(ST_Point(73.0527, 33.5713), 4326)),

-- Zone 5: Chaklala
('Rehman Abad Community Park',
 'park','public','Chaklala Scheme III, Rawalpindi','Rawalpindi',
 NULL, NULL, 3.8,
 ST_SetSRID(ST_Point(73.0971, 33.5889), 4326)),

('Gulzar-e-Quaid Open Park',
 'park','public','Gulzar Colony, Rawalpindi','Rawalpindi',
 NULL, NULL, 3.9,
 ST_SetSRID(ST_Point(73.1022, 33.5836), 4326)),

('Pir Wadhai Green Area',
 'park','public','Pir Wadhai, Rawalpindi','Rawalpindi',
 NULL, NULL, 3.7,
 ST_SetSRID(ST_Point(73.0965, 33.6021), 4326)),

-- Zone 7: Industrial
('Jhelum Road Green Strip',
 'park','public','Jhelum Road, Rawalpindi','Rawalpindi',
 NULL, NULL, 3.5,
 ST_SetSRID(ST_Point(73.0310, 33.5580), 4326)),

-- Zone 9: Islamabad
('Fatima Jinnah Park (F-9 Park)',
 'park','public','F-9, Islamabad','Islamabad',
 NULL, NULL, 4.8,
 ST_SetSRID(ST_Point(73.0607, 33.7286), 4326)),


-- ======================== GOVT OFFICES (12) ========================

-- Zone 2: Satellite Town
('Rawalpindi Development Authority (RDA)',
 'govt','public','Murree Road, Rawalpindi','Rawalpindi',
 '051-5555490', NULL, 3.8,
 ST_SetSRID(ST_Point(73.0667, 33.6047), 4326)),

('Rawalpindi Press Club',
 'govt','public','Liaquat Road, Rawalpindi','Rawalpindi',
 '051-5774250', NULL, 4.0,
 ST_SetSRID(ST_Point(73.0679, 33.5980), 4326)),

('NADRA Regional Office Rawalpindi',
 'govt','public','Satellite Town, Rawalpindi','Rawalpindi',
 '051-9049000', NULL, 3.7,
 ST_SetSRID(ST_Point(73.0668, 33.5952), 4326)),

('PTCL Regional HQ Rawalpindi',
 'govt','public','Commercial Market, Rawalpindi','Rawalpindi',
 '051-9270100', NULL, 3.6,
 ST_SetSRID(ST_Point(73.0698, 33.5998), 4326)),

-- Zone 3: Saddar
('Rawalpindi Cantonment Board (RCB)',
 'govt','public','Saddar, Rawalpindi Cantonment','Rawalpindi',
 '051-9274400', NULL, 3.7,
 ST_SetSRID(ST_Point(73.0553, 33.5876), 4326)),

('City Traffic Police Rawalpindi',
 'govt','public','Mall Road, Rawalpindi','Rawalpindi',
 '051-9272616', NULL, 3.9,
 ST_SetSRID(ST_Point(73.0532, 33.5848), 4326)),

('Rescue 1122 Rawalpindi HQ',
 'govt','public','Saddar, Rawalpindi','Rawalpindi',
 '1122', NULL, 4.5,
 ST_SetSRID(ST_Point(73.0580, 33.5905), 4326)),

-- Zone 1: Westridge
('Rawalpindi Railway Station',
 'govt','public','Station Road, Rawalpindi','Rawalpindi',
 '117', NULL, 4.0,
 ST_SetSRID(ST_Point(73.0521, 33.6007), 4326)),

-- Zone 6: South Rawalpindi
('Commissioner Office Rawalpindi',
 'govt','public','Kacheri Chowk, Rawalpindi','Rawalpindi',
 '051-9292501', NULL, 3.8,
 ST_SetSRID(ST_Point(73.0491, 33.5718), 4326)),

('Punjab Police Office Rawalpindi',
 'govt','public','Civil Lines, Rawalpindi','Rawalpindi',
 '051-9290600', NULL, 3.6,
 ST_SetSRID(ST_Point(73.0512, 33.5750), 4326)),

('Revenue Division Rawalpindi',
 'govt','public','Kacheri Road, Rawalpindi','Rawalpindi',
 '051-9290700', NULL, 3.5,
 ST_SetSRID(ST_Point(73.0634, 33.5725), 4326)),

-- Zone 9: Islamabad
('FBR House Islamabad',
 'govt','public','Constitution Avenue, Islamabad','Islamabad',
 '051-9208200', NULL, 3.8,
 ST_SetSRID(ST_Point(73.0764, 33.7149), 4326)),


-- ======================== MOSQUES (12) ========================

-- Zone 3: Saddar
('Lal Kurti Mosque',
 'mosque','public','Saddar, Rawalpindi','Rawalpindi',
 NULL, 500, 4.4,
 ST_SetSRID(ST_Point(73.0620, 33.5920), 4326)),

('Masjid-e-Aqsa Saddar',
 'mosque','public','Haider Road, Saddar, Rawalpindi','Rawalpindi',
 NULL, 400, 4.2,
 ST_SetSRID(ST_Point(73.0588, 33.5880), 4326)),

-- Zone 2: Satellite Town
('Jamia Masjid Raja Bazaar',
 'mosque','public','Raja Bazaar, Rawalpindi','Rawalpindi',
 NULL, 1200, 4.5,
 ST_SetSRID(ST_Point(73.0612, 33.6042), 4326)),

('Jamia Masjid Satellite Town',
 'mosque','public','Satellite Town, Rawalpindi','Rawalpindi',
 NULL, 800, 4.3,
 ST_SetSRID(ST_Point(73.0689, 33.5979), 4326)),

-- Zone 1: Westridge
('Jamia Masjid Westridge',
 'mosque','public','Westridge, Rawalpindi','Rawalpindi',
 NULL, 700, 4.2,
 ST_SetSRID(ST_Point(73.0435, 33.6048), 4326)),

('Jamia Masjid Dhok Kala Khan',
 'mosque','public','Dhok Kala Khan, Rawalpindi','Rawalpindi',
 NULL, 600, 4.1,
 ST_SetSRID(ST_Point(73.0320, 33.6052), 4326)),

('Masjid-e-Noor Railway Colony',
 'mosque','public','Railway Colony, Rawalpindi','Rawalpindi',
 NULL, 350, 4.0,
 ST_SetSRID(ST_Point(73.0468, 33.6012), 4326)),

-- Zone 5: Chaklala
('Jamia Masjid Gulzar-e-Quaid',
 'mosque','public','Gulzar-e-Quaid, Rawalpindi','Rawalpindi',
 NULL, 750, 4.2,
 ST_SetSRID(ST_Point(73.1129, 33.5831), 4326)),

('Jamia Masjid Chaklala Scheme III',
 'mosque','public','Chaklala Scheme III, Rawalpindi','Rawalpindi',
 NULL, 750, 4.2,
 ST_SetSRID(ST_Point(73.0898, 33.5872), 4326)),

('Jamia Masjid Pir Wadhai',
 'mosque','public','Pir Wadhai, Rawalpindi','Rawalpindi',
 NULL, 900, 4.3,
 ST_SetSRID(ST_Point(73.0961, 33.6029), 4326)),

-- Zone 7: Industrial
('Jamia Masjid Industrial Area',
 'mosque','public','Rawalpindi Industrial Estate','Rawalpindi',
 NULL, 600, 3.9,
 ST_SetSRID(ST_Point(73.0212, 33.5549), 4326)),

-- Zone 9: Islamabad
('Faisal Mosque',
 'mosque','public','Shah Faisal Avenue, Islamabad','Islamabad',
 NULL, 10000, 4.9,
 ST_SetSRID(ST_Point(73.0480, 33.7298), 4326));



UPDATE facilities
SET source = 'legacy_seed',
    source_id = 'legacy/' || id::text,
    verification_status = 'legacy_unverified',
    verification_notes = 'Original CIMS project record retained for continuity; review before treating as authoritative.',
    data_quality_score = 40,
    imported_at = NOW(),
    updated_at = NOW()
WHERE source = 'legacy_seed';

-- ============================================================================
-- LEGACY DEMO ROADS (25)
-- Retained for API compatibility only and disabled from map display.
-- ============================================================================
INSERT INTO roads (name, road_type, surface, lanes, geom) VALUES

-- =================== PRIMARY ROADS (6) ===================

('Murree Road',
 'primary','asphalt', 6,
 ST_GeomFromText('LINESTRING(
   73.0440 33.6040, 73.0580 33.6042,
   73.0655 33.6048, 73.0730 33.6090,
   73.0820 33.6150, 73.0900 33.6170)', 4326)),

('The Mall Road',
 'primary','asphalt', 4,
 ST_GeomFromText('LINESTRING(
   73.0460 33.5850, 73.0543 33.5890,
   73.0610 33.5920, 73.0655 33.5930)', 4326)),

('Airport Road (GT Road)',
 'primary','asphalt', 6,
 ST_GeomFromText('LINESTRING(
   73.0430 33.5700, 73.0580 33.5740,
   73.0750 33.5760, 73.0900 33.5840,
   73.1060 33.5870, 73.1160 33.5900)', 4326)),

('Jhelum Road',
 'primary','asphalt', 4,
 ST_GeomFromText('LINESTRING(
   73.0760 33.5760, 73.0620 33.5680,
   73.0480 33.5620, 73.0350 33.5540)', 4326)),

('Peshawar Road',
 'primary','asphalt', 4,
 ST_GeomFromText('LINESTRING(
   73.0440 33.6040, 73.0360 33.6080,
   73.0270 33.6120, 73.0150 33.6180)', 4326)),

('Islamabad Expressway',
 'primary','asphalt', 8,
 ST_GeomFromText('LINESTRING(
   73.0200 33.6500, 73.0450 33.6650,
   73.0590 33.6820, 73.0680 33.6950)', 4326)),

-- =================== SECONDARY ROADS (9) ===================

('Saddar Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0490 33.5900, 73.0545 33.5910,
   73.0580 33.5915, 73.0645 33.5925)', 4326)),

('Westridge Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0310 33.6020, 73.0390 33.6035,
   73.0460 33.6050, 73.0520 33.6060)', 4326)),

('Commercial Market Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0640 33.5980, 73.0700 33.5995,
   73.0755 33.6010, 73.0800 33.6030)', 4326)),

('Kacheri Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0460 33.5700, 73.0520 33.5720,
   73.0560 33.5738, 73.0610 33.5760)', 4326)),

('Chaklala Cantonment Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0870 33.5980, 73.0940 33.5960,
   73.1020 33.5940, 73.1100 33.5930)', 4326)),

('Liaquat Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0640 33.5998, 73.0660 33.6010,
   73.0675 33.6025, 73.0690 33.6055)', 4326)),

('PWD / Gulzar Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0870 33.5640, 73.0940 33.5680,
   73.1010 33.5720, 73.1090 33.5760)', 4326)),

('Kashmir Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0550 33.5980, 73.0590 33.6000,
   73.0620 33.6020, 73.0655 33.6038)', 4326)),

('Jarrar Camp Road',
 'secondary','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.0420 33.6130, 73.0520 33.6132,
   73.0620 33.6140, 73.0730 33.6155)', 4326)),

-- =================== RESIDENTIAL ROADS (7) ===================

('Raja Bazaar Street',
 'residential','concrete', 1,
 ST_GeomFromText('LINESTRING(
   73.0575 33.6025, 73.0615 33.6042,
   73.0650 33.6055)', 4326)),

('Satellite Town Internal Street',
 'residential','concrete', 1,
 ST_GeomFromText('LINESTRING(
   73.0600 33.5945, 73.0650 33.5965,
   73.0710 33.5982)', 4326)),

('Dhok Kala Khan Road',
 'residential','concrete', 1,
 ST_GeomFromText('LINESTRING(
   73.0310 33.6030, 73.0350 33.6045,
   73.0390 33.6060, 73.0435 33.6065)', 4326)),

('Gulzar Colony Internal Road',
 'residential','concrete', 1,
 ST_GeomFromText('LINESTRING(
   73.0900 33.5575, 73.0960 33.5600,
   73.1020 33.5630, 73.1080 33.5660)', 4326)),

('Industrial Estate Internal Road',
 'residential','asphalt', 1,
 ST_GeomFromText('LINESTRING(
   73.0150 33.5480, 73.0200 33.5510,
   73.0260 33.5540, 73.0320 33.5565)', 4326)),

('Ayub Park Internal Road',
 'residential','asphalt', 1,
 ST_GeomFromText('LINESTRING(
   73.0680 33.5640, 73.0730 33.5680,
   73.0780 33.5720, 73.0820 33.5760)', 4326)),

('Chaklala Scheme III Street',
 'residential','concrete', 1,
 ST_GeomFromText('LINESTRING(
   73.0890 33.5810, 73.0940 33.5830,
   73.0990 33.5845, 73.1040 33.5855)', 4326)),

-- =================== SERVICE ROADS (3) ===================

('Holy Family Hospital Access Road',
 'service','asphalt', 1,
 ST_GeomFromText('LINESTRING(
   73.0520 33.5930, 73.0535 33.5935,
   73.0551 33.5937)', 4326)),

('Rawalpindi Railway Station Access Road',
 'service','concrete', 1,
 ST_GeomFromText('LINESTRING(
   73.0490 33.6000, 73.0506 33.6005,
   73.0521 33.6007)', 4326)),

('Airport Terminal Service Road',
 'service','asphalt', 2,
 ST_GeomFromText('LINESTRING(
   73.1100 33.5870, 73.1130 33.5885,
   73.1160 33.5900)', 4326));



UPDATE roads
SET source = 'legacy_seed',
    source_id = 'legacy/' || id::text,
    verification_status = 'legacy_unverified',
    is_active = FALSE
WHERE source = 'legacy_seed';

-- ============================================================================
-- LIVE OPENSTREETMAP FACILITY IMPORT
-- This block retrieves current named features within the Islamabad-Rawalpindi
-- urban bounding box, classifies them, deduplicates them, balances the two
-- cities and facility categories, and fills the table toward 300 total rows.
-- ============================================================================
CREATE TEMP TABLE _osm_api_payload (
    payload_base64 TEXT NOT NULL
) ON COMMIT DROP;

COPY _osm_api_payload (payload_base64)
FROM PROGRAM 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand JABFAHIAcgBvAHIAQQBjAHQAaQBvAG4AUAByAGUAZgBlAHIAZQBuAGMAZQAgAD0AIAAnAFMAdABvAHAAJwAKACQAUAByAG8AZwByAGUAcwBzAFAAcgBlAGYAZQByAGUAbgBjAGUAIAA9ACAAJwBTAGkAbABlAG4AdABsAHkAQwBvAG4AdABpAG4AdQBlACcACgBbAE4AZQB0AC4AUwBlAHIAdgBpAGMAZQBQAG8AaQBuAHQATQBhAG4AYQBnAGUAcgBdADoAOgBTAGUAYwB1AHIAaQB0AHkAUAByAG8AdABvAGMAbwBsACAAPQAgAFsATgBlAHQALgBTAGUAYwB1AHIAaQB0AHkAUAByAG8AdABvAGMAbwBsAFQAeQBwAGUAXQA6ADoAVABsAHMAMQAyAAoAJABxACAAPQAgAEAAJwAKAFsAbwB1AHQAOgBqAHMAbwBuAF0AWwB0AGkAbQBlAG8AdQB0ADoAMgA0ADAAXQBbAG0AYQB4AHMAaQB6AGUAOgA1ADMANgA4ADcAMAA5ADEAMgBdADsAIAAoACAAbgB3AHIAWwAiAG4AYQBtAGUAIgBdAFsAIgBhAG0AZQBuAGkAdAB5ACIAfgAiAF4AKABoAG8AcwBwAGkAdABhAGwAfABjAGwAaQBuAGkAYwB8AGQAbwBjAHQAbwByAHMAfABwAGgAYQByAG0AYQBjAHkAfABzAGMAaABvAG8AbAB8AGMAbwBsAGwAZQBnAGUAfAB1AG4AaQB2AGUAcgBzAGkAdAB5AHwAcABsAGEAYwBlAF8AbwBmAF8AdwBvAHIAcwBoAGkAcAB8AHAAbwBsAGkAYwBlAHwAZgBpAHIAZQBfAHMAdABhAHQAaQBvAG4AfABhAG0AYgB1AGwAYQBuAGMAZQBfAHMAdABhAHQAaQBvAG4AfAB0AG8AdwBuAGgAYQBsAGwAfABjAG8AdQByAHQAaABvAHUAcwBlAHwAYwBvAG0AbQB1AG4AaQB0AHkAXwBjAGUAbgB0AHIAZQB8AGwAaQBiAHIAYQByAHkAfABwAG8AcwB0AF8AbwBmAGYAaQBjAGUAfABiAHUAcwBfAHMAdABhAHQAaQBvAG4AKQAkACIAXQAoADMAMwAuADQANQAsADcAMgAuADgAOAAsADMAMwAuADgAMgAsADcAMwAuADIAOAApADsAIABuAHcAcgBbACIAbgBhAG0AZQAiAF0AWwAiAGgAZQBhAGwAdABoAGMAYQByAGUAIgB+ACIAXgAoAGgAbwBzAHAAaQB0AGEAbAB8AGMAbABpAG4AaQBjAHwAZABvAGMAdABvAHIAfABkAG8AYwB0AG8AcgBzACkAJAAiAF0AKAAzADMALgA0ADUALAA3ADIALgA4ADgALAAzADMALgA4ADIALAA3ADMALgAyADgAKQA7ACAAbgB3AHIAWwAiAG4AYQBtAGUAIgBdAFsAIgBvAGYAZgBpAGMAZQAiAD0AIgBnAG8AdgBlAHIAbgBtAGUAbgB0ACIAXQAoADMAMwAuADQANQAsADcAMgAuADgAOAAsADMAMwAuADgAMgAsADcAMwAuADIAOAApADsAIABuAHcAcgBbACIAbgBhAG0AZQAiAF0AWwAiAGcAbwB2AGUAcgBuAG0AZQBuAHQAIgBdACgAMwAzAC4ANAA1ACwANwAyAC4AOAA4ACwAMwAzAC4AOAAyACwANwAzAC4AMgA4ACkAOwAgAG4AdwByAFsAIgBuAGEAbQBlACIAXQBbACIAYgB1AGkAbABkAGkAbgBnACIAPQAiAGcAbwB2AGUAcgBuAG0AZQBuAHQAIgBdACgAMwAzAC4ANAA1ACwANwAyAC4AOAA4ACwAMwAzAC4AOAAyACwANwAzAC4AMgA4ACkAOwAgAG4AdwByAFsAIgBuAGEAbQBlACIAXQBbACIAbABlAGkAcwB1AHIAZQAiAH4AIgBeACgAcABhAHIAawB8AHMAcABvAHIAdABzAF8AYwBlAG4AdAByAGUAfABwAGwAYQB5AGcAcgBvAHUAbgBkACkAJAAiAF0AKAAzADMALgA0ADUALAA3ADIALgA4ADgALAAzADMALgA4ADIALAA3ADMALgAyADgAKQA7ACAAbgB3AHIAWwAiAG4AYQBtAGUAIgBdAFsAIgBwAHUAYgBsAGkAYwBfAHQAcgBhAG4AcwBwAG8AcgB0ACIAfgAiAF4AKABzAHQAYQB0AGkAbwBuAHwAcABsAGEAdABmAG8AcgBtAHwAcwB0AG8AcABfAHAAbwBzAGkAdABpAG8AbgApACQAIgBdACgAMwAzAC4ANAA1ACwANwAyAC4AOAA4ACwAMwAzAC4AOAAyACwANwAzAC4AMgA4ACkAOwAgAG4AdwByAFsAIgBuAGEAbQBlACIAXQBbACIAcgBhAGkAbAB3AGEAeQAiAH4AIgBeACgAcwB0AGEAdABpAG8AbgB8AGgAYQBsAHQAfABzAHUAYgB3AGEAeQBfAGUAbgB0AHIAYQBuAGMAZQApACQAIgBdACgAMwAzAC4ANAA1ACwANwAyAC4AOAA4ACwAMwAzAC4AOAAyACwANwAzAC4AMgA4ACkAOwAgAG4AdwByAFsAIgBuAGEAbQBlACIAXQBbACIAaABpAGcAaAB3AGEAeQAiAD0AIgBiAHUAcwBfAHMAdABvAHAAIgBdACgAMwAzAC4ANAA1ACwANwAyAC4AOAA4ACwAMwAzAC4AOAAyACwANwAzAC4AMgA4ACkAOwAgAG4AdwByAFsAIgBuAGEAbQBlACIAXQBbACIAZQBtAGUAcgBnAGUAbgBjAHkAIgB+ACIAXgAoAGEAbQBiAHUAbABhAG4AYwBlAF8AcwB0AGEAdABpAG8AbgB8AGYAaQByAGUAXwBzAHQAYQB0AGkAbwBuACkAJAAiAF0AKAAzADMALgA0ADUALAA3ADIALgA4ADgALAAzADMALgA4ADIALAA3ADMALgAyADgAKQA7ACAAKQA7ACAAbwB1AHQAIABjAGUAbgB0AGUAcgAgAHQAYQBnAHMAOwAKACcAQAAKACQAdQByAGwAcwAgAD0AIABAACgACgAgACAAJwBoAHQAdABwAHMAOgAvAC8AbwB2AGUAcgBwAGEAcwBzAC0AYQBwAGkALgBkAGUALwBhAHAAaQAvAGkAbgB0AGUAcgBwAHIAZQB0AGUAcgAnACwACgAgACAAJwBoAHQAdABwAHMAOgAvAC8AbwB2AGUAcgBwAGEAcwBzAC4AcAByAGkAdgBhAHQAZQAuAGMAbwBmAGYAZQBlAC8AYQBwAGkALwBpAG4AdABlAHIAcAByAGUAdABlAHIAJwAsAAoAIAAgACcAaAB0AHQAcABzADoALwAvAG0AYQBwAHMALgBtAGEAaQBsAC4AcgB1AC8AbwBzAG0ALwB0AG8AbwBsAHMALwBvAHYAZQByAHAAYQBzAHMALwBhAHAAaQAvAGkAbgB0AGUAcgBwAHIAZQB0AGUAcgAnAAoAKQAKACQAaABlAGEAZABlAHIAcwAgAD0AIABAAHsACgAgACAAJwBVAHMAZQByAC0AQQBnAGUAbgB0ACcAIAA9ACAAJwBDAEkATQBTAC0AUABnAEEAZABtAGkAbgAtAEkAbQBwAG8AcgB0AGUAcgAvADMALgAwACAAKABJAHMAbABhAG0AYQBiAGEAZAAtAFIAYQB3AGEAbABwAGkAbgBkAGkAIABlAGQAdQBjAGEAdABpAG8AbgBhAGwAIABwAHIAbwBqAGUAYwB0ACkAJwAKACAAIAAnAFIAZQBmAGUAcgBlAHIAJwAgAD0AIAAnAGgAdAB0AHAAOgAvAC8AbABvAGMAYQBsAGgAbwBzAHQAOgAzADAAMAA1AC8AJwAKACAAIAAnAEEAYwBjAGUAcAB0ACcAIAA9ACAAJwBhAHAAcABsAGkAYwBhAHQAaQBvAG4ALwBqAHMAbwBuACcACgB9AAoAJABjAG8AbgB0AGUAbgB0ACAAPQAgACQAbgB1AGwAbAAKACQAbABhAHMAdABFAHIAcgBvAHIAIAA9ACAAJABuAHUAbABsAAoAZgBvAHIAZQBhAGMAaAAgACgAJAB1AHIAbAAgAGkAbgAgACQAdQByAGwAcwApACAAewAKACAAIAB0AHIAeQAgAHsACgAgACAAIAAgACQAcgBlAHMAcABvAG4AcwBlACAAPQAgAEkAbgB2AG8AawBlAC0AVwBlAGIAUgBlAHEAdQBlAHMAdAAgAC0AVQBzAGUAQgBhAHMAaQBjAFAAYQByAHMAaQBuAGcAIAAtAFUAcgBpACAAJAB1AHIAbAAgAC0ATQBlAHQAaABvAGQAIABQAG8AcwB0ACAALQBIAGUAYQBkAGUAcgBzACAAJABoAGUAYQBkAGUAcgBzACAALQBDAG8AbgB0AGUAbgB0AFQAeQBwAGUAIAAnAGEAcABwAGwAaQBjAGEAdABpAG8AbgAvAHgALQB3AHcAdwAtAGYAbwByAG0ALQB1AHIAbABlAG4AYwBvAGQAZQBkADsAIABjAGgAYQByAHMAZQB0AD0AVQBUAEYALQA4ACcAIAAtAEIAbwBkAHkAIABAAHsAIABkAGEAdABhACAAPQAgACQAcQAgAH0AIAAtAFQAaQBtAGUAbwB1AHQAUwBlAGMAIAAzADAAMAAKACAAIAAgACAAaQBmACAAKAAkAHIAZQBzAHAAbwBuAHMAZQAuAFMAdABhAHQAdQBzAEMAbwBkAGUAIAAtAGUAcQAgADIAMAAwACAALQBhAG4AZAAgAC0AbgBvAHQAIABbAHMAdAByAGkAbgBnAF0AOgA6AEkAcwBOAHUAbABsAE8AcgBXAGgAaQB0AGUAUwBwAGEAYwBlACgAJAByAGUAcwBwAG8AbgBzAGUALgBDAG8AbgB0AGUAbgB0ACkAKQAgAHsACgAgACAAIAAgACAAIAAkAGMAbwBuAHQAZQBuAHQAIAA9ACAAJAByAGUAcwBwAG8AbgBzAGUALgBDAG8AbgB0AGUAbgB0AAoAIAAgACAAIAAgACAAYgByAGUAYQBrAAoAIAAgACAAIAB9AAoAIAAgAH0AIABjAGEAdABjAGgAIAB7AAoAIAAgACAAIAAkAGwAYQBzAHQARQByAHIAbwByACAAPQAgACQAXwAuAEUAeABjAGUAcAB0AGkAbwBuAC4ATQBlAHMAcwBhAGcAZQAKACAAIAB9AAoAfQAKAGkAZgAgACgAWwBzAHQAcgBpAG4AZwBdADoAOgBJAHMATgB1AGwAbABPAHIAVwBoAGkAdABlAFMAcABhAGMAZQAoACQAYwBvAG4AdABlAG4AdAApACkAIAB7AAoAIAAgAFsAQwBvAG4AcwBvAGwAZQBdADoAOgBFAHIAcgBvAHIALgBXAHIAaQB0AGUATABpAG4AZQAoACcAQQBsAGwAIABPAHYAZQByAHAAYQBzAHMAIABlAG4AZABwAG8AaQBuAHQAcwAgAGYAYQBpAGwAZQBkAC4AIAAnACAAKwAgACQAbABhAHMAdABFAHIAcgBvAHIAKQAKACAAIABlAHgAaQB0ACAAMQAKAH0ACgAkAGIAeQB0AGUAcwAgAD0AIABbAFQAZQB4AHQALgBFAG4AYwBvAGQAaQBuAGcAXQA6ADoAVQBUAEYAOAAuAEcAZQB0AEIAeQB0AGUAcwAoACQAYwBvAG4AdABlAG4AdAApAAoAWwBDAG8AbgBzAG8AbABlAF0AOgA6AE8AdQB0AC4AVwByAGkAdABlAEwAaQBuAGUAKABbAEMAbwBuAHYAZQByAHQAXQA6ADoAVABvAEIAYQBzAGUANgA0AFMAdAByAGkAbgBnACgAJABiAHkAdABlAHMAKQApAAoA';

CREATE TEMP TABLE _osm_document (
    document JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _osm_document (document)
SELECT convert_from(
           decode(string_agg(payload_base64, ''), 'base64'),
           'UTF8'
       )::jsonb
FROM _osm_api_payload;

CREATE TEMP TABLE _osm_candidates (
    source_id            VARCHAR(150) PRIMARY KEY,
    source_url           TEXT NOT NULL,
    osm_element_type     VARCHAR(20) NOT NULL,
    osm_id               BIGINT NOT NULL,
    name                 VARCHAR(250) NOT NULL,
    type                 VARCHAR(50) NOT NULL,
    category             VARCHAR(100),
    address              TEXT,
    city                 VARCHAR(100) NOT NULL,
    phone                VARCHAR(80),
    capacity             INTEGER,
    tags                 JSONB NOT NULL,
    data_quality_score   SMALLINT NOT NULL,
    geom                 GEOMETRY(Point, 4326) NOT NULL
) ON COMMIT DROP;

WITH elements AS (
    SELECT jsonb_array_elements(document -> 'elements') AS element
    FROM _osm_document
),
raw_objects AS (
    SELECT
        element,
        COALESCE(element -> 'tags', '{}'::jsonb) AS tags,
        element ->> 'type' AS element_type,
        NULLIF(element ->> 'id', '')::BIGINT AS osm_id,
        COALESCE(
            NULLIF(element ->> 'lat', '')::DOUBLE PRECISION,
            NULLIF(element -> 'center' ->> 'lat', '')::DOUBLE PRECISION
        ) AS latitude,
        COALESCE(
            NULLIF(element ->> 'lon', '')::DOUBLE PRECISION,
            NULLIF(element -> 'center' ->> 'lon', '')::DOUBLE PRECISION
        ) AS longitude,
        COALESCE(
            NULLIF(BTRIM(element -> 'tags' ->> 'name'), ''),
            NULLIF(BTRIM(element -> 'tags' ->> 'name:en'), ''),
            NULLIF(BTRIM(element -> 'tags' ->> 'official_name'), ''),
            NULLIF(BTRIM(element -> 'tags' ->> 'short_name'), ''),
            NULLIF(BTRIM(element -> 'tags' ->> 'brand'), '')
        ) AS facility_name
    FROM elements
),
typed_objects AS (
    SELECT
        raw_objects.*,
        CASE
            WHEN tags ->> 'amenity' = 'hospital'
              OR tags ->> 'healthcare' = 'hospital' THEN 'hospital'
            WHEN tags ->> 'amenity' IN ('clinic','doctors')
              OR tags ->> 'healthcare' IN ('clinic','doctor','doctors') THEN 'clinic'
            WHEN tags ->> 'amenity' = 'pharmacy' THEN 'pharmacy'
            WHEN tags ->> 'amenity' = 'school' THEN 'school'
            WHEN tags ->> 'amenity' = 'college' THEN 'college'
            WHEN tags ->> 'amenity' = 'university' THEN 'university'
            WHEN tags ->> 'amenity' = 'police' THEN 'police'
            WHEN tags ->> 'amenity' = 'fire_station'
              OR tags ->> 'emergency' = 'fire_station' THEN 'fire'
            WHEN tags ->> 'amenity' = 'ambulance_station'
              OR tags ->> 'emergency' = 'ambulance_station' THEN 'ambulance'
            WHEN tags ->> 'amenity' = 'library' THEN 'library'
            WHEN tags ->> 'amenity' = 'post_office' THEN 'post_office'
            WHEN tags ->> 'amenity' = 'community_centre' THEN 'community_center'
            WHEN tags ->> 'amenity' = 'place_of_worship'
             AND LOWER(CONCAT_WS(' ',
                    tags ->> 'religion',
                    tags ->> 'denomination',
                    facility_name
                 )) ~ '(muslim|islam|mosque|masjid|jamia|imambargah)'
              THEN 'mosque'
            WHEN tags ->> 'amenity' IN ('townhall','courthouse')
              OR tags ->> 'office' = 'government'
              OR tags ? 'government'
              OR tags ->> 'building' = 'government' THEN 'govt'
            WHEN tags ->> 'leisure' = 'park' THEN 'park'
            WHEN tags ->> 'leisure' = 'sports_centre' THEN 'sports_center'
            WHEN tags ->> 'leisure' = 'playground' THEN 'playground'
            WHEN (
                    tags ->> 'amenity' = 'bus_station'
                 OR tags ? 'public_transport'
                 OR tags ? 'railway'
                 OR tags ->> 'highway' = 'bus_stop'
                 )
             AND LOWER(CONCAT_WS(' ',
                    facility_name,
                    tags ->> 'network',
                    tags ->> 'operator',
                    tags ->> 'route',
                    tags ->> 'description',
                    tags ->> 'name:en'
                 )) ~ '(metro|metrobus|rawalpindi.islamabad metro|red line)'
              THEN 'red_metro'
            WHEN tags ->> 'amenity' = 'bus_station'
              OR tags ? 'public_transport'
              OR tags ? 'railway'
              OR tags ->> 'highway' = 'bus_stop' THEN 'transit_station'
            ELSE NULL
        END AS facility_type,
        COALESCE(
            NULLIF(tags ->> 'amenity', ''),
            NULLIF(tags ->> 'healthcare', ''),
            NULLIF(tags ->> 'office', ''),
            NULLIF(tags ->> 'government', ''),
            NULLIF(tags ->> 'building', ''),
            NULLIF(tags ->> 'leisure', ''),
            NULLIF(tags ->> 'public_transport', ''),
            NULLIF(tags ->> 'railway', ''),
            NULLIF(tags ->> 'emergency', ''),
            NULLIF(tags ->> 'highway', '')
        ) AS facility_category
    FROM raw_objects
    WHERE facility_name IS NOT NULL
      AND latitude BETWEEN 33.45 AND 33.82
      AND longitude BETWEEN 72.88 AND 73.28
      AND element_type IN ('node','way','relation')
      AND osm_id IS NOT NULL
),
city_objects AS (
    SELECT
        typed_objects.*,
        CASE
            WHEN LOWER(CONCAT_WS(' ',
                    tags ->> 'addr:city',
                    tags ->> 'is_in:city',
                    tags ->> 'is_in'
                 )) LIKE '%rawalpindi%' THEN 'Rawalpindi'
            WHEN LOWER(CONCAT_WS(' ',
                    tags ->> 'addr:city',
                    tags ->> 'is_in:city',
                    tags ->> 'is_in'
                 )) LIKE '%islamabad%' THEN 'Islamabad'
            WHEN ST_DistanceSphere(
                    ST_SetSRID(ST_Point(longitude, latitude), 4326),
                    ST_SetSRID(ST_Point(73.0479, 33.6844), 4326)
                 )
               <= ST_DistanceSphere(
                    ST_SetSRID(ST_Point(longitude, latitude), 4326),
                    ST_SetSRID(ST_Point(73.0169, 33.5651), 4326)
                 ) THEN 'Islamabad'
            ELSE 'Rawalpindi'
        END AS inferred_city
    FROM typed_objects
    WHERE facility_type IS NOT NULL
),
addressed_objects AS (
    SELECT
        city_objects.*,
        NULLIF(CONCAT_WS(', ',
            NULLIF(BTRIM(CONCAT_WS(' ',
                tags ->> 'addr:housenumber',
                tags ->> 'addr:street'
            )), ''),
            NULLIF(BTRIM(tags ->> 'addr:place'), ''),
            NULLIF(BTRIM(tags ->> 'addr:suburb'), ''),
            NULLIF(BTRIM(tags ->> 'addr:quarter'), ''),
            NULLIF(BTRIM(tags ->> 'addr:district'), ''),
            NULLIF(BTRIM(tags ->> 'addr:postcode'), ''),
            inferred_city
        ), '') AS full_address,
        COALESCE(
            NULLIF(BTRIM(tags ->> 'phone'), ''),
            NULLIF(BTRIM(tags ->> 'contact:phone'), '')
        ) AS contact_phone,
        CASE
            WHEN COALESCE(tags ->> 'capacity', '') ~ '^[0-9]{1,9}$'
            THEN (tags ->> 'capacity')::INTEGER
            ELSE NULL
        END AS parsed_capacity
    FROM city_objects
),
scored_objects AS (
    SELECT
        addressed_objects.*,
        LEAST(100,
              30
            + 25
            + CASE WHEN full_address IS NOT NULL THEN 15 ELSE 0 END
            + 10
            + CASE WHEN contact_phone IS NOT NULL THEN 8 ELSE 0 END
            + CASE WHEN tags ? 'website' OR tags ? 'contact:website' THEN 7 ELSE 0 END
            + CASE WHEN tags ? 'wikidata' OR tags ? 'wikipedia' THEN 5 ELSE 0 END
        )::SMALLINT AS quality_score
    FROM addressed_objects
)
INSERT INTO _osm_candidates
    (source_id, source_url, osm_element_type, osm_id,
     name, type, category, address, city, phone, capacity,
     tags, data_quality_score, geom)
SELECT DISTINCT ON (element_type, osm_id)
    element_type || '/' || osm_id::text,
    'https://www.openstreetmap.org/' || element_type || '/' || osm_id::text,
    element_type,
    osm_id,
    LEFT(facility_name, 250),
    facility_type,
    LEFT(facility_category, 100),
    full_address,
    inferred_city,
    LEFT(contact_phone, 80),
    parsed_capacity,
    tags,
    quality_score,
    ST_SetSRID(ST_Point(longitude, latitude), 4326)
FROM scored_objects
ORDER BY element_type, osm_id, quality_score DESC;

-- Remove candidates that closely duplicate one of the retained legacy rows.
DELETE FROM _osm_candidates candidate
USING facilities legacy
WHERE legacy.source = 'legacy_seed'
  AND candidate.type = legacy.type
  AND LOWER(REGEXP_REPLACE(BTRIM(candidate.name), '\s+', ' ', 'g'))
      = LOWER(REGEXP_REPLACE(BTRIM(legacy.name), '\s+', ' ', 'g'))
  AND ST_DWithin(candidate.geom::geography, legacy.geom::geography, 120);

-- Remove duplicate OSM representations of the same named nearby place.
DELETE FROM _osm_candidates later_candidate
USING _osm_candidates earlier_candidate
WHERE later_candidate.source_id > earlier_candidate.source_id
  AND later_candidate.type = earlier_candidate.type
  AND LOWER(REGEXP_REPLACE(BTRIM(later_candidate.name), '\s+', ' ', 'g'))
      = LOWER(REGEXP_REPLACE(BTRIM(earlier_candidate.name), '\s+', ' ', 'g'))
  AND ST_DWithin(
        later_candidate.geom::geography,
        earlier_candidate.geom::geography,
        CASE
            WHEN later_candidate.type IN ('red_metro','transit_station') THEN 140
            ELSE 75
        END
      );

CREATE TEMP TABLE _facility_targets (
    type  VARCHAR(50) PRIMARY KEY,
    quota INTEGER NOT NULL CHECK (quota >= 0)
) ON COMMIT DROP;

INSERT INTO _facility_targets (type, quota) VALUES
('school', 37),
('college', 10),
('university', 10),
('hospital', 18),
('clinic', 10),
('pharmacy', 10),
('govt', 24),
('mosque', 30),
('park', 18),
('police', 12),
('fire', 5),
('ambulance', 5),
('red_metro', 14),
('transit_station', 10),
('library', 5),
('post_office', 6),
('community_center', 5),
('sports_center', 6),
('playground', 5);

CREATE TEMP TABLE _osm_selected
    (LIKE _osm_candidates INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
ON COMMIT DROP;

-- First pass: meet category targets while alternating both cities.
WITH city_ranked AS (
    SELECT
        candidate.*,
        ROW_NUMBER() OVER (
            PARTITION BY candidate.type, candidate.city
            ORDER BY candidate.data_quality_score DESC,
                     candidate.name,
                     candidate.source_id
        ) AS city_rank
    FROM _osm_candidates candidate
),
balanced_ranked AS (
    SELECT
        city_ranked.*,
        ROW_NUMBER() OVER (
            PARTITION BY city_ranked.type
            ORDER BY city_ranked.city_rank,
                     city_ranked.city,
                     city_ranked.data_quality_score DESC,
                     city_ranked.name,
                     city_ranked.source_id
        ) AS type_rank
    FROM city_ranked
)
INSERT INTO _osm_selected
    (source_id, source_url, osm_element_type, osm_id,
     name, type, category, address, city, phone, capacity,
     tags, data_quality_score, geom)
SELECT
    ranked.source_id,
    ranked.source_url,
    ranked.osm_element_type,
    ranked.osm_id,
    ranked.name,
    ranked.type,
    ranked.category,
    ranked.address,
    ranked.city,
    ranked.phone,
    ranked.capacity,
    ranked.tags,
    ranked.data_quality_score,
    ranked.geom
FROM balanced_ranked ranked
JOIN _facility_targets target
  ON target.type = ranked.type
WHERE ranked.type_rank <= target.quota
ORDER BY ranked.type, ranked.type_rank;

-- Second pass: fill any remaining places toward exactly 300 total facilities.
WITH remaining AS (
    SELECT
        candidate.*,
        ROW_NUMBER() OVER (
            PARTITION BY candidate.city
            ORDER BY candidate.data_quality_score DESC,
                     candidate.name,
                     candidate.source_id
        ) AS city_rank
    FROM _osm_candidates candidate
    LEFT JOIN _osm_selected selected
      ON selected.source_id = candidate.source_id
    WHERE selected.source_id IS NULL
),
balanced_remaining AS (
    SELECT
        remaining.*,
        ROW_NUMBER() OVER (
            ORDER BY remaining.city_rank,
                     remaining.city,
                     remaining.data_quality_score DESC,
                     remaining.name,
                     remaining.source_id
        ) AS overall_rank
    FROM remaining
)
INSERT INTO _osm_selected
    (source_id, source_url, osm_element_type, osm_id,
     name, type, category, address, city, phone, capacity,
     tags, data_quality_score, geom)
SELECT
    remainder.source_id,
    remainder.source_url,
    remainder.osm_element_type,
    remainder.osm_id,
    remainder.name,
    remainder.type,
    remainder.category,
    remainder.address,
    remainder.city,
    remainder.phone,
    remainder.capacity,
    remainder.tags,
    remainder.data_quality_score,
    remainder.geom
FROM balanced_remaining remainder
WHERE remainder.overall_rank <= GREATEST(
    300
    - (SELECT COUNT(*) FROM facilities)
    - (SELECT COUNT(*) FROM _osm_selected),
    0
)
ORDER BY remainder.overall_rank;

-- Final OSM insertion. Rows are source-traceable but remain marked osm_imported,
-- not manually verified.
INSERT INTO facilities
    (name, type, category, address, city, phone, capacity, rating, geom,
     source, source_id, source_url, osm_element_type, osm_id, tags,
     verification_status, verification_notes, data_quality_score,
     imported_at, is_active, created_at, updated_at)
SELECT
    selected.name,
    selected.type,
    selected.category,
    selected.address,
    selected.city,
    selected.phone,
    selected.capacity,
    NULL,
    selected.geom,
    'openstreetmap',
    selected.source_id,
    selected.source_url,
    selected.osm_element_type,
    selected.osm_id,
    selected.tags,
    'osm_imported',
    'Imported from current OpenStreetMap data through Overpass API; manually review critical pitch/demo locations.',
    selected.data_quality_score,
    NOW(),
    TRUE,
    NOW(),
    NOW()
FROM _osm_selected selected
ORDER BY selected.city, selected.type, selected.name
ON CONFLICT (source, source_id) DO NOTHING;

UPDATE data_sources
SET retrieved_at = NOW()
WHERE code = 'openstreetmap';

COMMIT;
