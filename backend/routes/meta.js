const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/facility-types", async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT
        ft.code,
        ft.display_name AS label,
        ft.description,
        ft.default_color AS color,
        ft.marker_letter AS icon,
        ft.sort_order,
        COUNT(f.id)::int AS total
      FROM facility_types ft
      LEFT JOIN facilities f
        ON f.type = ft.code
       AND f.is_active = TRUE
      GROUP BY ft.code, ft.display_name, ft.description, ft.default_color, ft.marker_letter, ft.sort_order
      ORDER BY ft.sort_order, ft.display_name
    `);
    res.json({ facility_types: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/cities", async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT city, COUNT(*)::int AS total
      FROM facilities
      WHERE is_active = TRUE
      GROUP BY city
      ORDER BY city
    `);
    res.json({ cities: rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
