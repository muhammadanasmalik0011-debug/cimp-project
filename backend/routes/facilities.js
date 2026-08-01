const express = require("express");
const db = require("../db");
const {
  integerInRange,
  parseBbox,
  parseTypes,
  numberOrNull
} = require("../utils/query");

const router = express.Router();

async function facilityTypeExists(type) {
  const { rowCount } = await db.query(
    "SELECT 1 FROM facility_types WHERE code = $1",
    [type]
  );
  return rowCount > 0;
}

router.get("/", async (req, res, next) => {
  try {
    const {
      q = "",
      city,
      type,
      types,
      bbox,
      limit: requestedLimit
    } = req.query;

    const selectedTypes = parseTypes(types || type);
    const parsedBbox = parseBbox(bbox);
    const limit = integerInRange(requestedLimit, 1000, 1, 5000);
    const values = [];
    const conditions = ["f.is_active = TRUE"];

    if (selectedTypes.length) {
      values.push(selectedTypes);
      conditions.push(`f.type = ANY($${values.length}::text[])`);
    }

    if (city && city !== "all") {
      values.push(city);
      conditions.push(`f.city = $${values.length}`);
    }

    if (q.trim()) {
      values.push(`%${q.trim()}%`);
      const index = values.length;
      conditions.push(`(
        f.name ILIKE $${index}
        OR COALESCE(f.address, '') ILIKE $${index}
        OR COALESCE(f.category, '') ILIKE $${index}
        OR f.city ILIKE $${index}
      )`);
    }

    if (parsedBbox) {
      values.push(parsedBbox.west, parsedBbox.south, parsedBbox.east, parsedBbox.north);
      const start = values.length - 3;
      conditions.push(`f.geom && ST_MakeEnvelope($${start}, $${start + 1}, $${start + 2}, $${start + 3}, 4326)`);
    }

    values.push(limit);
    const limitIndex = values.length;

    const { rows } = await db.query(`
      WITH matched AS (
        SELECT
          f.id,
          f.name,
          f.type,
          ft.display_name AS type_label,
          ft.default_color AS type_color,
          ft.marker_letter AS type_icon,
          f.category,
          f.address,
          f.city,
          f.phone,
          f.capacity,
          f.rating,
          f.source,
          f.source_id,
          f.source_url,
          f.verification_status,
          f.data_quality_score,
          f.imported_at,
          f.geom
        FROM facilities f
        JOIN facility_types ft ON ft.code = f.type
        WHERE ${conditions.join(" AND ")}
        ORDER BY ft.sort_order, f.name
        LIMIT $${limitIndex}
      )
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(
          json_agg(
            json_build_object(
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
                'source', source,
                'source_id', source_id,
                'source_url', source_url,
                'verification_status', verification_status,
                'data_quality_score', data_quality_score,
                'imported_at', imported_at,
                'longitude', ST_X(geom),
                'latitude', ST_Y(geom)
              )
            )
          ),
          '[]'::json
        )
      ) AS geojson
      FROM matched
    `, values);

    const geojson = rows[0].geojson;
    res.json({
      ...geojson,
      meta: {
        returned: geojson.features.length,
        limit,
        filters: {
          q: q || null,
          city: city || "all",
          types: selectedTypes,
          bbox: parsedBbox
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Facility id must be an integer." });
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
          'source', f.source,
          'source_id', f.source_id,
          'source_url', f.source_url,
          'verification_status', f.verification_status,
          'data_quality_score', f.data_quality_score,
          'tags', f.tags,
          'longitude', ST_X(f.geom),
          'latitude', ST_Y(f.geom)
        )
      ) AS feature
      FROM facilities f
      JOIN facility_types ft ON ft.code = f.type
      WHERE f.id = $1 AND f.is_active = TRUE
    `, [id]);

    if (!rows.length) return res.status(404).json({ error: "Facility not found." });
    res.json(rows[0].feature);
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const {
      name,
      type,
      category = null,
      address = null,
      city,
      phone = null,
      capacity = null,
      rating = null,
      longitude,
      latitude
    } = req.body;

    const lon = numberOrNull(longitude);
    const lat = numberOrNull(latitude);

    if (!name || !type || !city || lon === null || lat === null) {
      return res.status(400).json({
        error: "name, type, city, longitude and latitude are required."
      });
    }

    if (!(await facilityTypeExists(type))) {
      return res.status(400).json({ error: `Unknown facility type: ${type}` });
    }

    const { rows } = await db.query(`
      INSERT INTO facilities (
        name, type, category, address, city, phone, capacity, rating,
        geom, source, verification_status, data_quality_score, is_active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        ST_SetSRID(ST_MakePoint($9, $10), 4326),
        'legacy_seed', 'needs_review', 70, TRUE
      )
      RETURNING
        id, name, type, category, address, city, phone, capacity, rating,
        source, verification_status, data_quality_score,
        ST_X(geom) AS longitude,
        ST_Y(geom) AS latitude
    `, [
      name.trim(), type, category, address, city, phone,
      capacity, rating, lon, lat
    ]);

    res.status(201).json({ status: "success", facility: rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
