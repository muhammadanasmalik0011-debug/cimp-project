const express = require("express");
const db = require("../db");
const { parseBbox } = require("../utils/query");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { zone_type, bbox } = req.query;
    const parsedBbox = parseBbox(bbox);
    const values = [];
    const where = ["z.is_active = TRUE"];

    if (zone_type) {
      values.push(zone_type);
      where.push(`z.zone_type = $${values.length}`);
    }

    if (parsedBbox) {
      values.push(parsedBbox.west, parsedBbox.south, parsedBbox.east, parsedBbox.north);
      const start = values.length - 3;
      where.push(`z.geom && ST_MakeEnvelope($${start}, $${start + 1}, $${start + 2}, $${start + 3}, 4326)`);
    }

    const { rows } = await db.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(json_build_object(
          'type', 'Feature',
          'id', z.id,
          'geometry', ST_AsGeoJSON(z.geom)::json,
          'properties', json_build_object(
            'id', z.id,
            'name', z.name,
            'zone_type', z.zone_type,
            'population', z.population,
            'area_sqkm', z.area_sqkm,
            'calculated_area_sqkm', ROUND((ST_Area(z.geom::geography) / 1000000)::numeric, 4),
            'verification_status', z.verification_status
          )
        ) ORDER BY z.name), '[]'::json)
      ) AS geojson
      FROM zones z
      WHERE ${where.join(" AND ")}
    `, values);

    res.json(rows[0].geojson);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
