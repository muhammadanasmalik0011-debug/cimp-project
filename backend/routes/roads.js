const express = require("express");
const db = require("../db");
const { parseBbox } = require("../utils/query");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { road_type, bbox, include_inactive = "false" } = req.query;
    const parsedBbox = parseBbox(bbox);
    const values = [];
    const where = [];

    if (include_inactive !== "true") where.push("r.is_active = TRUE");
    if (road_type) {
      values.push(road_type);
      where.push(`r.road_type = $${values.length}`);
    }
    if (parsedBbox) {
      values.push(parsedBbox.west, parsedBbox.south, parsedBbox.east, parsedBbox.north);
      const start = values.length - 3;
      where.push(`r.geom && ST_MakeEnvelope($${start}, $${start + 1}, $${start + 2}, $${start + 3}, 4326)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const { rows } = await db.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(json_build_object(
          'type', 'Feature',
          'id', r.id,
          'geometry', ST_AsGeoJSON(r.geom)::json,
          'properties', json_build_object(
            'id', r.id,
            'name', r.name,
            'road_type', r.road_type,
            'surface', r.surface,
            'lanes', r.lanes,
            'source', r.source,
            'is_active', r.is_active
          )
        ) ORDER BY r.name), '[]'::json)
      ) AS geojson
      FROM roads r
      ${whereSql}
    `, values);
    res.json(rows[0].geojson);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
