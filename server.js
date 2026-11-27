require("dotenv").config();

const express = require("express");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const { randomUUID } = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const DB_NAME = process.env.DB_NAME || "trailsync_db";

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("ERROR: Set JWT_SECRET in .env to a random string of at least 32 characters.");
  process.exit(1);
}

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0
};

let pool;

app.use(helmet({
  // Leaflet tiles and CDN-hosted libraries are used by this student project.
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Please try again later." }
});

function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d"
  });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Authentication required." });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Your session is invalid or expired. Please log in again." });
  }
}

function validEmail(email) {
  return typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    email.length <= 190;
}

function safeUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

function normalizeHike(input) {
  const points = Array.isArray(input.points) ? input.points.slice(0, 20000) : [];
  const validPoints = points.filter(p =>
    p && Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lng)) &&
    Math.abs(Number(p.lat)) <= 90 &&
    Math.abs(Number(p.lng)) <= 180
  ).map(p => ({
    lat: Number(p.lat),
    lng: Number(p.lng),
    altitude: Number.isFinite(Number(p.altitude)) ? Number(p.altitude) : null,
    accuracy: Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : null,
    time: String(p.time || "")
  }));

  const distance = Number(input.distanceMeters);
  const duration = Number(input.durationSeconds);
  const elevation = Number(input.elevationGain);
  const calories = Number(input.calories);

  return {
    id: typeof input.id === "string" && input.id.length <= 36 ? input.id : randomUUID(),
    title: String(input.title || "My hike").trim().slice(0, 150) || "My hike",
    startedAt: String(input.startedAt || new Date().toISOString()).slice(0, 40),
    endedAt: String(input.endedAt || new Date().toISOString()).slice(0, 40),
    durationSeconds: Number.isFinite(duration) ? Math.max(0, Math.min(Math.round(duration), 31536000)) : 0,
    distanceMeters: Number.isFinite(distance) ? Math.max(0, Math.min(distance, 100000000)) : 0,
    elevationGain: Number.isFinite(elevation) ? Math.max(0, Math.min(elevation, 1000000)) : 0,
    calories: Number.isFinite(calories) ? Math.max(0, Math.min(Math.round(calories), 1000000)) : 0,
    points: validPoints
  };
}

async function initializeDatabase() {
  // Create the database if the configured MySQL user has CREATE DATABASE permission.
  const admin = await mysql.createConnection({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password
  });
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME.replace(/[^a-zA-Z0-9_]/g, "")}\`
     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await admin.end();

  pool = mysql.createPool({ ...dbConfig, database: DB_NAME });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hikes (
      id CHAR(36) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      title VARCHAR(150) NOT NULL DEFAULT 'My hike',
      started_at VARCHAR(40) NOT NULL,
      ended_at VARCHAR(40) NOT NULL,
      duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
      distance_meters DOUBLE NOT NULL DEFAULT 0,
      elevation_gain DOUBLE NOT NULL DEFAULT 0,
      calories INT UNSIGNED NOT NULL DEFAULT 0,
      points JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_hikes_user_started (user_id, started_at),
      CONSTRAINT fk_hikes_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: "Name must contain 2 to 100 characters." });
    }
    if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: "Password must contain 8 to 72 characters." });
    }

    const [existing] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) return res.status(409).json({ error: "That email address is already registered." });

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash]
    );
    const user = { id: result.insertId, name, email };
    res.status(201).json({ token: createToken(user), user });
  } catch (error) {
    console.error("Register error:", error.message);
    res.status(500).json({ error: "Could not create the account." });
  }
});

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!validEmail(email) || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, password_hash FROM users WHERE email = ?",
      [email]
    );
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const user = safeUser(rows[0]);
    res.json({ token: createToken(user), user });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ error: "Could not log in." });
  }
});

app.get("/api/me", authenticate, async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT id, name, email FROM users WHERE id = ?",
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Account not found." });
  res.json({ user: safeUser(rows[0]) });
});

app.get("/api/hikes", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, title, started_at AS startedAt, ended_at AS endedAt,
       duration_seconds AS durationSeconds, distance_meters AS distanceMeters,
       elevation_gain AS elevationGain, calories, points
       FROM hikes WHERE user_id = ? ORDER BY started_at DESC`,
      [req.user.id]
    );
    res.json({ hikes: rows.map(row => ({
      ...row,
      points: typeof row.points === "string" ? JSON.parse(row.points) : row.points
    })) });
  } catch (error) {
    console.error("Get hikes error:", error.message);
    res.status(500).json({ error: "Could not load hikes." });
  }
});

app.post("/api/hikes/sync", authenticate, async (req, res) => {
  const incoming = Array.isArray(req.body.hikes) ? req.body.hikes : [];
  if (!incoming.length) return res.json({ synced: 0, message: "No hikes to synchronize." });
  if (incoming.length > 50) return res.status(400).json({ error: "Sync up to 50 hikes per request." });

  const connection = await pool.getConnection();
  let synced = 0;
  try {
    await connection.beginTransaction();
    for (const raw of incoming) {
      const hike = normalizeHike(raw);
      await connection.execute(
        `INSERT INTO hikes
          (id, user_id, title, started_at, ended_at, duration_seconds,
           distance_meters, elevation_gain, calories, points)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = IF(user_id = VALUES(user_id), VALUES(title), title),
           started_at = IF(user_id = VALUES(user_id), VALUES(started_at), started_at),
           ended_at = IF(user_id = VALUES(user_id), VALUES(ended_at), ended_at),
           duration_seconds = IF(user_id = VALUES(user_id), VALUES(duration_seconds), duration_seconds),
           distance_meters = IF(user_id = VALUES(user_id), VALUES(distance_meters), distance_meters),
           elevation_gain = IF(user_id = VALUES(user_id), VALUES(elevation_gain), elevation_gain),
           calories = IF(user_id = VALUES(user_id), VALUES(calories), calories),
           points = IF(user_id = VALUES(user_id), VALUES(points), points)`,
        [
          hike.id, req.user.id, hike.title, hike.startedAt, hike.endedAt,
          hike.durationSeconds, hike.distanceMeters, hike.elevationGain,
          hike.calories, JSON.stringify(hike.points)
        ]
      );
      synced++;
    }
    await connection.commit();
    res.json({ synced, message: "Hikes synchronized successfully." });
  } catch (error) {
    await connection.rollback();
    console.error("Sync error:", error.message);
    res.status(500).json({ error: "Synchronization failed. Your local records are still saved." });
  } finally {
    connection.release();
  }
});

app.delete("/api/hikes/:id", authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      "DELETE FROM hikes WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    res.json({ deleted: result.affectedRows > 0 });
  } catch (error) {
    console.error("Delete hike error:", error.message);
    res.status(500).json({ error: "Could not delete hike from the server." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function start() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`TrailSync is running at http://localhost:${PORT}`);
      console.log(`MySQL database "${DB_NAME}" is connected.`);
    });
  } catch (error) {
    console.error("Startup failed:", error.message);
    console.error("Check that MySQL is running and your .env credentials are correct.");
    process.exit(1);
  }
}

start();
