const express = require("express");
const db = require("../db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const [summary, typeCounts, cityCounts, verificationCounts] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM facilities WHERE is_active = TRUE) AS facilities,
          (SELECT COUNT(*)::int FROM roads WHERE is_active = TRUE) AS active_roads,
          (SELECT COUNT(*)::int FROM roads) AS roads_in_database,
          (SELECT COUNT(*)::int FROM zones WHERE is_active = TRUE) AS zones,
          (SELECT COUNT(*)::int FROM analysis_log) AS analyses,
          ROUND((SELECT AVG(rating) FROM facilities WHERE is_active = TRUE AND rating IS NOT NULL)::numeric, 2) AS average_rating,
          ROUND((SELECT AVG(data_quality_score) FROM facilities WHERE is_active = TRUE AND data_quality_score IS NOT NULL)::numeric, 1) AS average_quality
      `),
      db.query(`
        SELECT
          ft.code AS type,
          ft.display_name AS label,
          ft.default_color AS color,
          ft.marker_letter AS icon,
          ft.sort_order,
          COUNT(f.id)::int AS total
        FROM facility_types ft
        LEFT JOIN facilities f
          ON f.type = ft.code
         AND f.is_active = TRUE
        GROUP BY ft.code, ft.display_name, ft.default_color, ft.marker_letter, ft.sort_order
        ORDER BY ft.sort_order, ft.display_name
      `),
      db.query(`
        SELECT city, COUNT(*)::int AS total
        FROM facilities
        WHERE is_active = TRUE
        GROUP BY city
        ORDER BY city
      `),
      db.query(`
        SELECT verification_status, COUNT(*)::int AS total
        FROM facilities
        WHERE is_active = TRUE
        GROUP BY verification_status
        ORDER BY total DESC
      `)
    ]);

    res.json({
      summary: summary.rows[0],
      facility_counts: typeCounts.rows,
      city_counts: cityCounts.rows,
      verification_counts: verificationCounts.rows
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
