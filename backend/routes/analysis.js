const express = require("express");
const db = require("../db");
const { assertCoordinates, numberOrNull } = require("../utils/query");

const router = express.Router();

async function validateType(type) {
  if (!type || type === "all") return true;
  const { rowCount } = await db.query(
    "SELECT 1 FROM facility_types WHERE code = $1",
    [type]
  );
  return rowCount > 0;
}

async function logAnalysis({ type, longitude, latitude, radius = null, count, geojson, note }) {
  await db.query(`
    INSERT INTO analysis_log (
      analysis_type, input_geom, radius_m, result_count, result_geojson, user_note
    ) VALUES (
      $1,
      ST_SetSRID(ST_MakePoint($2, $3), 4326),
      $4, $5, $6::jsonb, $7
    )
  `, [type, longitude, latitude, radius, count, JSON.stringify(geojson), note]);
}

router.get("/nearest", async (req, res, next) => {
  try {
    const { latitude, longitude } = assertCoordinates(req.query.lat, req.query.lon);
    const type = String(req.query.type || "hospital").toLowerCase();

    if (!(await validateType(type))) {
      return res.status(400).json({ error: `Unknown facility type: ${type}` });
    }

    const { rows } = await db.query(`
      SELECT json_build_object(
        'type', 'Feature',
        'id', f.id,
        'geometry', ST_AsGeoJSON(f.geom)::json,
        'properties', json_build_object(
          'id', f.id,
          'name', f.name,
          'type', f.type,
          'type_label', ft.display_name,
          'type_color', ft.default_color,
          'type_icon', ft.marker_letter,
          'category', f.category,
          'address', f.address,
          'city', f.city,
          'phone', f.phone,
          'capacity', f.capacity,
          'rating', f.rating,
          'verification_status', f.verification_status,
          'data_quality_score', f.data_quality_score,
          'distance_m', ROUND(ST_Distance(
            f.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric, 1),
          'longitude', ST_X(f.geom),
          'latitude', ST_Y(f.geom)
        )
      ) AS feature
      FROM facilities f
      JOIN facility_types ft ON ft.code = f.type
      WHERE f.type = $3 AND f.is_active = TRUE
      ORDER BY f.geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
      LIMIT 1
    `, [longitude, latitude, type]);

    const feature = rows[0]?.feature || null;
    if (feature) {
      await logAnalysis({
        type: `nearest_${type}`,
        longitude,
        latitude,
        count: 1,
        geojson: feature,
        note: `Nearest ${type} analysis`
      });
    }

    res.json({
      status: "success",
      input: { lat: latitude, lon: longitude, type },
      result: feature
    });
  } catch (error) {
    next(error);
  }
});

router.get("/radius", async (req, res, next) => {
  try {
    const { latitude, longitude } = assertCoordinates(req.query.lat, req.query.lon);
    const radius = numberOrNull(req.query.radius);
    const type = String(req.query.type || "all").toLowerCase();

    if (radius === null || radius <= 0 || radius > 100_000) {
      return res.status(400).json({ error: "radius must be between 1 and 100000 metres." });
    }
    if (!(await validateType(type))) {
      return res.status(400).json({ error: `Unknown facility type: ${type}` });
    }

    const values = [longitude, latitude, radius];
    const typeSql = type === "all" ? "" : "AND f.type = $4";
    if (type !== "all") values.push(type);

    const { rows } = await db.query(`
      WITH matched AS (
        SELECT
          f.id, f.name, f.type, ft.display_name AS type_label, ft.default_color AS type_color,
          ft.marker_letter AS type_icon, f.category, f.address, f.city, f.phone,
          f.capacity, f.rating, f.verification_status, f.data_quality_score, f.geom,
          ROUND(ST_Distance(
            f.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )::numeric, 1) AS distance_m
        FROM facilities f
        JOIN facility_types ft ON ft.code = f.type
        WHERE f.is_active = TRUE
          AND ST_DWithin(
            f.geom::geography,
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )
          ${typeSql}
        ORDER BY distance_m
      )
      SELECT
        COUNT(*)::int AS total,
        json_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(json_agg(json_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object(
              'id', id,
              'name', name,
              'type', type,
              'type_label', type_label,
              'type_color', type_color,
              'type_icon', type_icon,
              'category', category,
              'address', address,
              'city', city,
              'phone', phone,
              'capacity', capacity,
              'rating', rating,
              'verification_status', verification_status,
              'data_quality_score', data_quality_score,
              'distance_m', distance_m,
              'longitude', ST_X(geom),
              'latitude', ST_Y(geom)
            )
          )), '[]'::json)
        ) AS geojson
      FROM matched
    `, values);

    const result = rows[0];
    await logAnalysis({
      type: type === "all" ? "radius_all" : `radius_${type}`,
      longitude,
      latitude,
      radius,
      count: result.total,
      geojson: result.geojson,
      note: `${type === "all" ? "All facilities" : type} within ${radius} metres`
    });

    res.json({
      status: "success",
      input: { lat: latitude, lon: longitude, radius_m: radius, type },
      total: result.total,
      geojson: result.geojson
    });
  } catch (error) {
    next(error);
  }
});

router.get("/buffer", async (req, res, next) => {
  try {
    const { latitude, longitude } = assertCoordinates(req.query.lat, req.query.lon);
    const radius = numberOrNull(req.query.radius);
    const type = String(req.query.type || "all").toLowerCase();

    if (radius === null || radius <= 0 || radius > 100_000) {
      return res.status(400).json({ error: "radius must be between 1 and 100000 metres." });
    }
    if (!(await validateType(type))) {
      return res.status(400).json({ error: `Unknown facility type: ${type}` });
    }

    const values = [longitude, latitude, radius];
    const typeSql = type === "all" ? "" : "AND f.type = $4";
    if (type !== "all") values.push(type);

    const { rows } = await db.query(`
      WITH input AS (
        SELECT
          ST_SetSRID(ST_MakePoint($1, $2), 4326) AS point_geom,
          ST_Buffer(
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
            $3
          )::geometry AS buffer_geom
      ),
      matched AS (
        SELECT
          f.id, f.name, f.type, ft.display_name AS type_label, ft.default_color AS type_color,
          ft.marker_letter AS type_icon, f.category, f.address, f.city, f.phone,
          f.capacity, f.rating, f.verification_status, f.data_quality_score, f.geom,
          ROUND(ST_Distance(f.geom::geography, i.point_geom::geography)::numeric, 1) AS distance_m
        FROM facilities f
        JOIN facility_types ft ON ft.code = f.type
        CROSS JOIN input i
        WHERE f.is_active = TRUE
          AND ST_Within(f.geom, i.buffer_geom)
          ${typeSql}
        ORDER BY distance_m
      )
      SELECT
        json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(i.buffer_geom)::json,
          'properties', json_build_object(
            'analysis', 'buffer',
            'radius_m', $3,
            'longitude', $1,
            'latitude', $2
          )
        ) AS feature,
        (SELECT COUNT(*)::int FROM matched) AS total,
        (SELECT json_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(json_agg(json_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object(
              'id', id, 'name', name, 'type', type, 'type_label', type_label,
              'type_color', type_color, 'type_icon', type_icon,
              'category', category, 'address', address, 'city', city,
              'phone', phone, 'capacity', capacity, 'rating', rating,
              'verification_status', verification_status,
              'data_quality_score', data_quality_score, 'distance_m', distance_m,
              'longitude', ST_X(geom), 'latitude', ST_Y(geom)
            )
          )), '[]'::json)
        ) FROM matched) AS geojson
      FROM input i
    `, values);

    const result = rows[0];
    const logGeojson = {
      type: "FeatureCollection",
      features: [result.feature, ...(result.geojson?.features || [])]
    };

    await logAnalysis({
      type: type === "all" ? "buffer_all" : `buffer_${type}`,
      longitude,
      latitude,
      radius,
      count: result.total,
      geojson: logGeojson,
      note: `${radius} metre buffer for ${type}`
    });

    res.json({
      status: "success",
      input: { lat: latitude, lon: longitude, radius_m: radius, type },
      feature: result.feature,
      total: result.total,
      geojson: result.geojson
    });
  } catch (error) {
    next(error);
  }
});


router.get("/within-zone/:zoneId", async (req, res, next) => {
  try {
    const zoneId = Number(req.params.zoneId);
    if (!Number.isInteger(zoneId)) {
      return res.status(400).json({ error: "zoneId must be an integer." });
    }

    const { rows } = await db.query(`
      WITH selected_zone AS (
        SELECT id, name, zone_type, geom
        FROM zones
        WHERE id = $1 AND is_active = TRUE
      ), matched AS (
        SELECT f.*, ft.display_name AS type_label, ft.default_color AS type_color,
               ft.marker_letter AS type_icon
        FROM facilities f
        JOIN facility_types ft ON ft.code = f.type
        JOIN selected_zone z ON ST_Within(f.geom, z.geom)
        WHERE f.is_active = TRUE
      )
      SELECT
        (SELECT name FROM selected_zone) AS zone_name,
        (SELECT zone_type FROM selected_zone) AS zone_type,
        COUNT(*)::int AS total,
        json_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(json_agg(json_build_object(
            'type', 'Feature',
            'id', id,
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object(
              'id', id, 'name', name, 'type', type,
              'type_label', type_label, 'type_color', type_color, 'type_icon', type_icon,
              'category', category, 'address', address, 'city', city,
              'rating', rating, 'verification_status', verification_status,
              'data_quality_score', data_quality_score
            )
          )), '[]'::json)
        ) AS geojson
      FROM matched
    `, [zoneId]);

    if (!rows[0]?.zone_name) {
      return res.status(404).json({ error: "Zone not found." });
    }

    res.json({ status: "success", zone_id: zoneId, ...rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/count-in-bbox", async (req, res, next) => {
  try {
    const parts = String(req.query.bbox || "").split(",").map(Number);
    if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
      return res.status(400).json({ error: "bbox must be west,south,east,north." });
    }
    const [west, south, east, north] = parts;
    const { rows } = await db.query(`
      SELECT f.type, ft.display_name AS label, ft.default_color AS color,
             COUNT(*)::int AS count
      FROM facilities f
      JOIN facility_types ft ON ft.code = f.type
      WHERE f.is_active = TRUE
        AND f.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      GROUP BY f.type, ft.display_name, ft.default_color, ft.sort_order
      ORDER BY count DESC, ft.sort_order
    `, [west, south, east, north]);
    res.json({ status: "success", bbox: { west, south, east, north }, data: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/distance", async (req, res, next) => {
  try {
    const id1 = Number(req.query.id1);
    const id2 = Number(req.query.id2);
    if (!Number.isInteger(id1) || !Number.isInteger(id2)) {
      return res.status(400).json({ error: "id1 and id2 must be integers." });
    }
    const { rows } = await db.query(`
      SELECT
        a.id AS facility_1_id,
        a.name AS facility_1,
        b.id AS facility_2_id,
        b.name AS facility_2,
        ROUND(ST_Distance(a.geom::geography, b.geom::geography)::numeric, 1) AS distance_m
      FROM facilities a
      JOIN facilities b ON b.id = $2
      WHERE a.id = $1 AND a.is_active = TRUE AND b.is_active = TRUE
    `, [id1, id2]);
    res.json({ status: "success", data: rows[0] || null });
  } catch (error) {
    next(error);
  }
});

router.get("/log", async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const { rows } = await db.query(`
      SELECT id, analysis_type, radius_m, result_count, user_note, created_at
      FROM analysis_log
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    res.json({ logs: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
