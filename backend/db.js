require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "cims_db",
  max: 12,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 7_000,
  application_name: "cims-mapbox-api"
});

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error.message);
});

async function testConnection() {
  const { rows } = await pool.query(`
    SELECT
      NOW() AS now,
      current_database() AS database,
      current_user AS database_user,
      PostGIS_Version() AS postgis_version,
      (SELECT COUNT(*)::int FROM facilities WHERE is_active = TRUE) AS active_facilities
  `);
  return rows[0];
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection
};
