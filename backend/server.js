const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const { testConnection, pool } = require("./db");
const facilitiesRoutes = require("./routes/facilities");
const roadsRoutes = require("./routes/roads");
const zonesRoutes = require("./routes/zones");
const analysisRoutes = require("./routes/analysis");
const statsRoutes = require("./routes/stats");
const metaRoutes = require("./routes/meta");

const app = express();
const PORT = Number(process.env.PORT || 3005);

const allowedOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS."));
  }
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));

app.get("/api", (req, res) => {
  res.json({
    project: "CIMS — City Infrastructure Mapping System",
    stack: "PostgreSQL/PostGIS + Express + React + Mapbox GL JS",
    status: "API running",
    version: "2.0.0"
  });
});

app.get("/api/health", async (req, res, next) => {
  try {
    const database = await testConnection();
    res.json({ ok: true, database, message: "CIMS API connected to PostGIS." });
  } catch (error) {
    next(error);
  }
});

app.use("/api/meta", metaRoutes);
app.use("/api/facilities", facilitiesRoutes);
app.use("/api/roads", roadsRoutes);
app.use("/api/zones", zonesRoutes);
app.use("/api/analysis", analysisRoutes);
app.use("/api/stats", statsRoutes);

const frontendDist = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    index: false
  }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found", path: req.originalUrl });
});

app.use((error, req, res, next) => {
  const status = error.status || 500;
  console.error(`[${new Date().toISOString()}]`, error.stack || error.message);
  res.status(status).json({
    error: error.message || "Internal server error",
    hint: status === 500
      ? "Check PostgreSQL/PostGIS, backend/.env, and the database schema."
      : undefined
  });
});

const server = app.listen(PORT, () => {
  console.log(`\nCIMS API: http://localhost:${PORT}/api`);
  console.log(`CIMS app: http://localhost:${PORT}\n`);
});

async function shutdown(signal) {
  console.log(`${signal} received. Closing CIMS services...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
