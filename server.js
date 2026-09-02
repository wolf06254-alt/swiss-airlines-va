/* ============================================================
   Swiss Airlines VA — Server
   Database: SQLite (file) or PostgreSQL (connection string)
   ============================================================ */

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'Gregory';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123789';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

const SESSION_SECRET = process.env.SESSION_SECRET || 'swiss-airlines-va-secret-key-2026';

/* ============================================================
   DATABASE SETUP — with robust connection handling + auto-reconnect
   ============================================================ */
let db, dbType, pgPool;
let pgReconnectAttempts = 0;
const PG_MAX_RECONNECT = 10;
const pgConn = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (pgConn && pgConn.startsWith('postgres')) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: pgConn,
    ssl: { rejectUnauthorized: false },
    // Robust connection settings for Render
    max: 10,                          // max pool connections
    idleTimeoutMillis: 30000,         // close idle connections after 30s
    connectionTimeoutMillis: 10000,   // timeout connecting after 10s
    keepAlive: true,                   // enable TCP keepalive
    keepAliveInitialDelayMillis: 10000 // initial delay before first keepalive
  });

  // Handle pool-level errors (prevents uncaught exceptions crashing the process)
  pgPool.on('error', (err) => {
    console.error('❌ [PG POOL] Unexpected error on idle client:', err.message);
    console.error('❌ [PG POOL] This may indicate lost DB connection. Setting dbReady=false for reconnect.');
    dbReady = false;
    // Schedule reconnection attempt
    if (pgReconnectAttempts < PG_MAX_RECONNECT) {
      const delay = Math.min(5000 * (pgReconnectAttempts + 1), 30000);
      console.log(`🔄 [PG POOL] Will attempt reconnect in ${delay}ms (attempt ${pgReconnectAttempts + 1}/${PG_MAX_RECONNECT})`);
      setTimeout(async () => {
        try {
          await db.query('SELECT 1 as test');
          console.log('✅ [PG POOL] Reconnection succeeded after pool error');
          dbReady = true;
          pgReconnectAttempts = 0;
        } catch (e) {
          pgReconnectAttempts++;
          console.error('❌ [PG POOL] Reconnection failed:', e.message);
          // Try full re-init
          initDb().catch(err => console.error('❌ [PG POOL] Re-init failed:', err.message));
        }
      }, delay);
    }
  });

  // Handle pool connection events
  pgPool.on('connect', (client) => {
    console.log('🔗 [PG POOL] New client connected');
  });

  // Test connection immediately
  pgPool.query('SELECT NOW() as now').then(r => {
    console.log('✅ [PG POOL] Connected to PostgreSQL at:', r.rows[0].now);
  }).catch(err => {
    console.error('❌ [PG POOL] Initial connection failed:', err.message);
    console.error('❌ [PG POOL] Will retry on next query...');
  });

  db = pgPool;
  dbType = 'postgres';
  console.log('🗄️  Using PostgreSQL');
} else {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database('./swiss_airlines.db');
  dbType = 'sqlite';
  console.log('🗄️  Using SQLite');
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  WARNING: DATABASE_URL is not set — running on local SQLite file.');
    console.warn('⚠️  On Render this file lives on an EPHEMERAL disk: every deploy/restart');
    console.warn('⚠️  wipes it, so submitted applications will disappear from the admin panel.');
    console.warn('⚠️  Attach a PostgreSQL database and set DATABASE_URL (see RENDER_SETUP.md).');
  }
}

/* ============================================================
   SESSION STORE — persistent with PostgreSQL
   ============================================================ */
let sessionStore;
if (dbType === 'postgres') {
  const pgSession = require('connect-pg-simple')(session);
  sessionStore = new pgSession({
    pool: pgPool,
    tableName: 'session',
    createTableIfMissing: true,
    // Prune expired sessions every 15 minutes
    pruneSessionInterval: 15 * 60 * 1000
  });
  console.log('🔒 Session store: PostgreSQL (persistent across deploys)');
} else {
  // SQLite — sessions stored in memory (resets on restart, acceptable for local dev)
  sessionStore = undefined;
  console.log('🔒 Session store: Memory (resets on restart)');
}

/* ============================================================
   MIDDLEWARE
   ============================================================ */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Trust proxy — MUST be set BEFORE the session middleware so that
// express-session correctly sees X-Forwarded-Proto on Render's reverse proxy.
app.set('trust proxy', 1);

app.use(session({
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,                      // refresh cookie lifetime on every request
  cookie: {
    secure: false,                    // Render terminates TLS; non-secure cookie still travels over HTTPS
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    sameSite: 'lax',
    path: '/'
  },
  name: 'swiss_session'
}));

/* ============================================================
   SITE MODE GATE (maintenance / update screen)
   Non-admin visitors get maintenance.html while the site is
   switched off from the admin panel. Admins pass through.
   ============================================================ */
const MODE_ALLOW_EXACT = new Set([
  '/login.html', '/maintenance.html', '/admin.html',
  '/api/login', '/api/logout', '/api/me', '/api/site-mode', '/api/health',
  '/favicon.ico', '/robots.txt'
]);
const MODE_ASSET_RE = /\.(css|js|mjs|png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|eot|map|json|mp4|webm)$/i;

app.use((req, res, next) => {
  // keep the cached settings reasonably fresh (multi-instance safe)
  if (dbReady && Date.now() - siteSettingsAt > 15000) { siteSettingsAt = Date.now(); settingsLoad().catch(() => {}); }

  if (siteSettings.site_mode === 'live') return next();
  if (req.session && req.session.isAdmin) return next();

  const p = req.path;
  if (MODE_ALLOW_EXACT.has(p)) return next();
  if (MODE_ASSET_RE.test(p)) return next();

  res.setHeader('Retry-After', '3600');
  res.setHeader('Cache-Control', 'no-store');
  if (p.startsWith('/api/')) {
    return res.status(503).json({ success: false, maintenance: true, mode: siteSettings.site_mode, error: 'Site is temporarily unavailable' });
  }
  return res.status(503).sendFile(path.join(__dirname, 'maintenance.html'));
});

app.use(express.static(path.join(__dirname, '.')));

/* ============================================================
   SECURITY HEADERS
   ============================================================ */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

/* ============================================================
   RATE LIMITER (in-memory, per IP)
   ============================================================ */
const rateLimits = new Map();
function rateLimit(windowMs = 60000, max = 5) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimits.get(ip) || { count: 0, resetTime: now + windowMs };
    if (now > record.resetTime) { record.count = 0; record.resetTime = now + windowMs; }
    record.count++;
    rateLimits.set(ip, record);
    if (record.count > max) {
      console.log('🚫 [RATE LIMIT] Blocked IP:', ip, '| Count:', record.count);
      return res.status(429).json({ success: false, error: 'Слишком много запросов. Подожди минуту.' });
    }
    next();
  };
}

/* ============================================================
   ROUTES FOR HTML PAGES
   ============================================================ */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/404.html', (req, res) => res.sendFile(path.join(__dirname, '404.html')));
app.get('/maintenance.html', (req, res) => res.sendFile(path.join(__dirname, 'maintenance.html')));
app.get('/history.html', (req, res) => res.sendFile(path.join(__dirname, 'history.html')));
app.get('/events.html', (req, res) => res.sendFile(path.join(__dirname, 'events.html')));

// Алиасы без .html (на случай чистых ссылок / внешних переходов)
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, 'history.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'events.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

/* ============================================================
   LIVE STATS (BETA) — counter helpers
   ============================================================ */
const STAT_KEYS = ['visits', 'pilots', 'flights', 'flight_hours', 'destinations'];

/* ============================================================
   SITE SETTINGS (site mode: live / maintenance / update)
   ============================================================ */
const SETTING_KEYS = ['site_mode', 'maint_title', 'maint_message', 'maint_eta', 'maint_done', 'maint_done_at'];
const SETTING_DEFAULTS = { site_mode: 'live', maint_title: '', maint_message: '', maint_eta: '', maint_done: '', maint_done_at: '' };
const SITE_MODES = ['live', 'maintenance', 'update'];
let siteSettings = Object.assign({}, SETTING_DEFAULTS);
let siteSettingsAt = 0;

async function settingsLoad() {
  const out = Object.assign({}, SETTING_DEFAULTS);
  try {
    if (dbType === 'postgres') {
      const r = await db.query('SELECT skey, svalue FROM site_settings');
      for (const row of r.rows) if (SETTING_KEYS.includes(row.skey)) out[row.skey] = row.svalue == null ? '' : String(row.svalue);
    } else {
      const rows = await new Promise((resolve, reject) => db.all('SELECT skey, svalue FROM site_settings', [], (err, r) => err ? reject(err) : resolve(r || [])));
      for (const row of rows) if (SETTING_KEYS.includes(row.skey)) out[row.skey] = row.svalue == null ? '' : String(row.svalue);
    }
    if (!SITE_MODES.includes(out.site_mode)) out.site_mode = 'live';
    siteSettings = out;
    siteSettingsAt = Date.now();
  } catch (e) {
    console.error('[SETTINGS] read error:', e.message);
  }
  return siteSettings;
}

async function settingsSet(key, value) {
  if (!SETTING_KEYS.includes(key)) return false;
  const v = value == null ? '' : String(value).slice(0, 500);
  if (dbType === 'postgres') {
    await db.query('INSERT INTO site_settings (skey, svalue, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP) ON CONFLICT (skey) DO UPDATE SET svalue = $2, updated_at = CURRENT_TIMESTAMP', [key, v]);
  } else {
    await new Promise((resolve, reject) => db.run('INSERT INTO site_settings (skey, svalue, updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(skey) DO UPDATE SET svalue = excluded.svalue, updated_at = CURRENT_TIMESTAMP', [key, v], (err) => err ? reject(err) : resolve()));
  }
  siteSettings[key] = v;
  return true;
}

async function statsGetAll() {
  const out = {};
  for (const k of STAT_KEYS) out[k] = 0;
  try {
    if (dbType === 'postgres') {
      const r = await db.query('SELECT skey, svalue FROM site_stats');
      for (const row of r.rows) out[row.skey] = parseInt(row.svalue) || 0;
    } else {
      const rows = await new Promise((resolve, reject) => db.all('SELECT skey, svalue FROM site_stats', [], (err, r) => err ? reject(err) : resolve(r || [])));
      for (const row of rows) out[row.skey] = parseInt(row.svalue) || 0;
    }
  } catch (e) {
    console.error('[STATS] read error:', e.message);
  }
  return out;
}

async function statsSet(key, value) {
  if (!STAT_KEYS.includes(key)) return false;
  const v = Math.max(0, parseInt(value) || 0);
  if (dbType === 'postgres') {
    await db.query('INSERT INTO site_stats (skey, svalue, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP) ON CONFLICT (skey) DO UPDATE SET svalue = $2, updated_at = CURRENT_TIMESTAMP', [key, v]);
  } else {
    await new Promise((resolve, reject) => db.run('INSERT INTO site_stats (skey, svalue, updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(skey) DO UPDATE SET svalue = excluded.svalue, updated_at = CURRENT_TIMESTAMP', [key, v], (err) => err ? reject(err) : resolve()));
  }
  return true;
}

async function statsBump(key, delta) {
  if (!STAT_KEYS.includes(key)) return;
  const d = parseInt(delta) || 1;
  try {
    if (dbType === 'postgres') {
      await db.query('INSERT INTO site_stats (skey, svalue, updated_at) VALUES ($1,$2,CURRENT_TIMESTAMP) ON CONFLICT (skey) DO UPDATE SET svalue = site_stats.svalue + $2, updated_at = CURRENT_TIMESTAMP', [key, d]);
    } else {
      await new Promise((resolve) => db.run('INSERT INTO site_stats (skey, svalue, updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(skey) DO UPDATE SET svalue = svalue + ?, updated_at = CURRENT_TIMESTAMP', [key, d, d], () => resolve()));
    }
  } catch (e) {
    console.error('[STATS] bump error:', e.message);
  }
}

// Rough "online now" gauge: unique IPs seen in the last 5 minutes
const onlineVisitors = new Map();
function touchVisitor(ip) {
  const now = Date.now();
  onlineVisitors.set(ip, now);
  for (const [k, t] of onlineVisitors) { if (now - t > 5 * 60 * 1000) onlineVisitors.delete(k); }
  return onlineVisitors.size;
}

/* ============================================================
   DATABASE INITIALIZATION
   ============================================================ */
let dbReady = false;

async function initDb() {
  try {
    if (dbType === 'postgres') {
      // First, verify the connection works
      try {
        await db.query('SELECT 1 as test');
        console.log('✅ [DB] PostgreSQL connection verified');
      } catch (connErr) {
        console.error('❌ [DB] PostgreSQL connection failed, retrying in 3s...', connErr.message);
        await new Promise(r => setTimeout(r, 3000));
        try {
          await db.query('SELECT 1 as test');
          console.log('✅ [DB] PostgreSQL connection retry succeeded');
        } catch (retryErr) {
          console.error('❌ [DB] PostgreSQL connection retry failed. Tables may not be created.');
          throw retryErr;
        }
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS applications (
          id SERIAL PRIMARY KEY,
          roblox_name TEXT NOT NULL,
          char_age TEXT, real_age TEXT, experience TEXT, role TEXT,
          online_time TEXT, why_swiss TEXT, rules TEXT, fro TEXT,
          flight_minutes TEXT, telegram TEXT, about TEXT,
          exam_score INTEGER, exam_total INTEGER, exam_passed BOOLEAN DEFAULT false,
          application_type TEXT DEFAULT 'academy',
          status TEXT DEFAULT 'new',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      // BETA: exam columns migration for already existing databases
      await db.query('ALTER TABLE applications ADD COLUMN IF NOT EXISTS exam_score INTEGER');
      await db.query('ALTER TABLE applications ADD COLUMN IF NOT EXISTS exam_total INTEGER');
      await db.query('ALTER TABLE applications ADD COLUMN IF NOT EXISTS exam_passed BOOLEAN DEFAULT false');
      await db.query("ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_type TEXT DEFAULT 'academy'");
      // BETA: live site statistics counters
      await db.query(`
        CREATE TABLE IF NOT EXISTS site_stats (
          skey TEXT PRIMARY KEY,
          svalue BIGINT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      for (const k of STAT_KEYS) {
        await db.query('INSERT INTO site_stats (skey, svalue) VALUES ($1, 0) ON CONFLICT (skey) DO NOTHING', [k]);
      }
      // Site mode settings (maintenance / update screen)
      await db.query(`
        CREATE TABLE IF NOT EXISTS site_settings (
          skey TEXT PRIMARY KEY,
          svalue TEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      for (const k of SETTING_KEYS) {
        await db.query('INSERT INTO site_settings (skey, svalue) VALUES ($1, $2) ON CONFLICT (skey) DO NOTHING', [k, SETTING_DEFAULTS[k]]);
      }
      await db.query(`
        CREATE TABLE IF NOT EXISTS events (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          date TEXT NOT NULL,
          time TEXT,
          location TEXT,
          status TEXT DEFAULT 'upcoming',
          image_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS routes (
          id SERIAL PRIMARY KEY,
          origin TEXT NOT NULL,
          origin_code TEXT,
          destination TEXT NOT NULL,
          destination_code TEXT,
          distance_km INTEGER,
          duration_min INTEGER,
          aircraft_type TEXT,
          frequency TEXT,
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS fleet (
          id SERIAL PRIMARY KEY,
          model TEXT NOT NULL,
          manufacturer TEXT,
          category TEXT,
          capacity INTEGER,
          range_km INTEGER,
          speed_kmh INTEGER,
          status TEXT DEFAULT 'active',
          description TEXT,
          image_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS timeline (
          id SERIAL PRIMARY KEY,
          year TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          icon TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          roblox_name TEXT NOT NULL, char_age TEXT, real_age TEXT, experience TEXT, role TEXT,
          online_time TEXT, why_swiss TEXT, rules TEXT, fro TEXT,
          flight_minutes TEXT, telegram TEXT, about TEXT,
          exam_score INTEGER, exam_total INTEGER, exam_passed INTEGER DEFAULT 0,
          application_type TEXT DEFAULT 'academy',
          status TEXT DEFAULT 'new', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
      // BETA: exam columns migration for already existing SQLite files
      const appCols = await new Promise((resolve) => db.all("PRAGMA table_info(applications)", [], (err, r) => resolve(err ? [] : (r || []))));
      const haveCols = appCols.map(c => c.name);
      for (const [col, ddl] of [['exam_score', 'INTEGER'], ['exam_total', 'INTEGER'], ['exam_passed', 'INTEGER DEFAULT 0'], ['application_type', "TEXT DEFAULT 'academy'"]]) {
        if (!haveCols.includes(col)) {
          await new Promise((resolve) => db.run('ALTER TABLE applications ADD COLUMN ' + col + ' ' + ddl, [], () => resolve()));
          console.log('[DB] Added applications.' + col);
        }
      }
      // BETA: live site statistics counters
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS site_stats (
          skey TEXT PRIMARY KEY, svalue INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
      for (const k of STAT_KEYS) {
        await new Promise((resolve) => db.run('INSERT OR IGNORE INTO site_stats (skey, svalue) VALUES (?, 0)', [k], () => resolve()));
      }
      // Site mode settings (maintenance / update screen)
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS site_settings (
          skey TEXT PRIMARY KEY, svalue TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
      for (const k of SETTING_KEYS) {
        await new Promise((resolve) => db.run('INSERT OR IGNORE INTO site_settings (skey, svalue) VALUES (?, ?)', [k, SETTING_DEFAULTS[k]], () => resolve()));
      }
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL, description TEXT, date TEXT NOT NULL, time TEXT,
          location TEXT, status TEXT DEFAULT 'upcoming', image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS routes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          origin TEXT NOT NULL, origin_code TEXT,
          destination TEXT NOT NULL, destination_code TEXT,
          distance_km INTEGER, duration_min INTEGER,
          aircraft_type TEXT, frequency TEXT,
          active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS fleet (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model TEXT NOT NULL, manufacturer TEXT, category TEXT,
          capacity INTEGER, range_km INTEGER, speed_kmh INTEGER,
          status TEXT DEFAULT 'active', description TEXT, image_url TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS timeline (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year TEXT NOT NULL, title TEXT NOT NULL, description TEXT, icon TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
    }

    // ============ SEED DATA ============
    const seedEvents = [];
    const seedApplications = [];
    const seedRoutes = [];
    const seedFleet = [
      {model:'Airbus A220-100',manufacturer:'Airbus',category:'Regional',capacity:125,range_km:5400,speed_kmh:829,description:'Smallest A220 variant, perfect for thin regional routes and Swiss domestic flights'},
      {model:'Airbus A220-300',manufacturer:'Airbus',category:'Regional',capacity:145,range_km:6300,speed_kmh:829,description:'Swiss flagship regional jet, the backbone of European short-haul operations'},
      {model:'Airbus A319neo',manufacturer:'Airbus',category:'Short-haul',capacity:140,range_km:6850,speed_kmh:833,description:'Compact narrow-body for lower-demand European city pairs'},
      {model:'Airbus A320neo',manufacturer:'Airbus',category:'Short-haul',capacity:180,range_km:6500,speed_kmh:833,description:'Efficient narrow-body workhorse for high-demand European routes'},
      {model:'Airbus A321neo',manufacturer:'Airbus',category:'Short-haul',capacity:220,range_km:7400,speed_kmh:833,description:'Larger narrow-body for medium-range and busy European corridors'},
      {model:'Airbus A330-300',manufacturer:'Airbus',category:'Long-haul',capacity:300,range_km:11750,speed_kmh:871,description:'Wide-body long-haul workhorse, serving North America and Middle East'},
      {model:'Airbus A340-300',manufacturer:'Airbus',category:'Long-haul',capacity:275,range_km:13200,speed_kmh:871,description:'Four-engine classic, being phased out in favor of A350. Last flights in 2025.'},
      {model:'Airbus A350-900',manufacturer:'Airbus',category:'Long-haul',capacity:315,range_km:15000,speed_kmh:903,description:'Next-gen ultra-long-haul flagship. Replacing A340 on Asia and Americas routes.'},
      {model:'Boeing 777-300ER',manufacturer:'Boeing',category:'Long-haul',capacity:340,range_km:13650,speed_kmh:905,description:'Long-range wide-body for highest-demand intercontinental routes'},
      {model:'Boeing 787-9 Dreamliner',manufacturer:'Boeing',category:'Long-haul',capacity:296,range_km:14140,speed_kmh:903,description:'Modern composite long-haul, fuel efficient for secondary long-haul routes'}
    ];
    const seedTimeline = [];

    // Seed routes (if empty)
    if (dbType === 'postgres') {
      const rc = (await db.query('SELECT COUNT(*) as c FROM routes')).rows[0].c;
      if (parseInt(rc) === 0) {
        for (const r of seedRoutes) {
          await db.query('INSERT INTO routes (origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
            [r.origin, r.origin_code, r.destination, r.destination_code, r.distance_km, r.duration_min, r.aircraft_type, r.frequency]);
        }
        console.log('✅ Seeded', seedRoutes.length, 'routes');
      }
      const fc = (await db.query('SELECT COUNT(*) as c FROM fleet')).rows[0].c;
      if (parseInt(fc) === 0) {
        for (const f of seedFleet) {
          await db.query('INSERT INTO fleet (model, manufacturer, category, capacity, range_km, speed_kmh, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [f.model, f.manufacturer, f.category, f.capacity, f.range_km, f.speed_kmh, f.description]);
        }
        console.log('✅ Seeded', seedFleet.length, 'fleet items');
      }
      const tc = (await db.query('SELECT COUNT(*) as c FROM timeline')).rows[0].c;
      if (parseInt(tc) === 0) {
        for (const t of seedTimeline) {
          await db.query('INSERT INTO timeline (year, title, description, icon) VALUES ($1,$2,$3,$4)',
            [t.year, t.title, t.description, t.icon]);
        }
        console.log('✅ Seeded', seedTimeline.length, 'timeline entries');
      }
      const ec = (await db.query('SELECT COUNT(*) as c FROM events')).rows[0].c;
      if (parseInt(ec) === 0) {
        for (const e of seedEvents) {
          await db.query('INSERT INTO events (title, description, date, time, location, status, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [e.title, e.description, e.date, e.time, e.location, e.status, e.image_url || null]);
        }
        console.log('✅ Seeded', seedEvents.length, 'events');
      }
      const ac = (await db.query('SELECT COUNT(*) as c FROM applications')).rows[0].c;
      if (parseInt(ac) === 0) {
        for (const a of seedApplications) {
          await db.query('INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
            [a.roblox_name, a.char_age, a.real_age, a.experience, a.role, a.online_time, a.why_swiss, a.rules, a.fro, a.flight_minutes, a.telegram, a.about, a.status]);
        }
        console.log('✅ Seeded', seedApplications.length, 'applications');
      }

      // ============ LOG EXISTING DATA COUNTS ============
      const appCount = (await db.query('SELECT COUNT(*) as c FROM applications')).rows[0].c;
      const eventCount = (await db.query('SELECT COUNT(*) as c FROM events')).rows[0].c;
      const routeCount = (await db.query('SELECT COUNT(*) as c FROM routes')).rows[0].c;
      console.log('📊 [DB] Applications in DB:', appCount);
      console.log('📊 [DB] Events in DB:', eventCount);
      console.log('📊 [DB] Routes in DB:', routeCount);
    } else {
      const rc = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM routes', [], (err, r) => err ? reject(err) : resolve(r)));
      if (rc && rc.c === 0) {
        const stmt = db.prepare('INSERT INTO routes (origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency) VALUES (?,?,?,?,?,?,?,?)');
        for (const r of seedRoutes) stmt.run(r.origin, r.origin_code, r.destination, r.destination_code, r.distance_km, r.duration_min, r.aircraft_type, r.frequency);
        stmt.finalize();
        console.log('✅ Seeded', seedRoutes.length, 'routes');
      }
      const fc = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM fleet', [], (err, r) => err ? reject(err) : resolve(r)));
      if (fc && fc.c === 0) {
        const stmt = db.prepare('INSERT INTO fleet (model, manufacturer, category, capacity, range_km, speed_kmh, description) VALUES (?,?,?,?,?,?,?)');
        for (const f of seedFleet) stmt.run(f.model, f.manufacturer, f.category, f.capacity, f.range_km, f.speed_kmh, f.description);
        stmt.finalize();
        console.log('✅ Seeded', seedFleet.length, 'fleet items');
      }
      const tc = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM timeline', [], (err, r) => err ? reject(err) : resolve(r)));
      if (tc && tc.c === 0) {
        const stmt = db.prepare('INSERT INTO timeline (year, title, description, icon) VALUES (?,?,?,?)');
        for (const t of seedTimeline) stmt.run(t.year, t.title, t.description, t.icon);
        stmt.finalize();
        console.log('✅ Seeded', seedTimeline.length, 'timeline entries');
      }
      const ec = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM events', [], (err, r) => err ? reject(err) : resolve(r)));
      if (ec && ec.c === 0) {
        const stmt = db.prepare('INSERT INTO events (title, description, date, time, location, status, image_url) VALUES (?,?,?,?,?,?,?)');
        for (const e of seedEvents) stmt.run(e.title, e.description, e.date, e.time, e.location, e.status, e.image_url || null);
        stmt.finalize();
        console.log('✅ Seeded', seedEvents.length, 'events');
      }
      const ac = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM applications', [], (err, r) => err ? reject(err) : resolve(r)));
      if (ac && ac.c === 0) {
        const stmt = db.prepare('INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
        for (const a of seedApplications) stmt.run(a.roblox_name, a.char_age, a.real_age, a.experience, a.role, a.online_time, a.why_swiss, a.rules, a.fro, a.flight_minutes, a.telegram, a.about, a.status);
        stmt.finalize();
        console.log('✅ Seeded', seedApplications.length, 'applications');
      }

      // ============ LOG EXISTING DATA COUNTS ============
      const appCount = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM applications', [], (err, r) => err ? reject(err) : resolve(r)));
      console.log('📊 [DB] Applications in DB:', appCount ? appCount.c : 0);
    }

    dbReady = true;
    pgReconnectAttempts = 0;
    try { await settingsLoad(); console.log('⚙️  [SETTINGS] site_mode =', siteSettings.site_mode); } catch (e) { console.error('[SETTINGS] init error:', e.message); }
    console.log('✅ Database initialized and ready');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    // Don't crash — server can still serve static files, API will return 503
    dbReady = false;
    // Auto-retry: schedule another initDb attempt after 10 seconds
    const retryDelay = Math.min(10000 * (pgReconnectAttempts + 1), 60000);
    pgReconnectAttempts++;
    console.log(`🔄 [INIT_DB] Will retry in ${retryDelay}ms (attempt ${pgReconnectAttempts})`);
    setTimeout(() => {
      initDb().catch(e => console.error('❌ [INIT_DB] Retry failed:', e.message));
    }, retryDelay);
  }
}

/* ============================================================
   AUTH MIDDLEWARE
   ============================================================ */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) { next(); }
  else { res.status(401).json({ error: 'Unauthorized', needLogin: true }); }
}

/* ============================================================
   DB READY MIDDLEWARE — blocks API calls until DB is ready
   ============================================================ */
function requireDb(req, res, next) {
  if (dbReady) return next();
  // Auto-reconnect: try to re-initialize DB if not ready
  console.log('⏳ [REQUIRE_DB] DB not ready, attempting re-init...');
  initDb().then(() => {
    if (dbReady) {
      console.log('✅ [REQUIRE_DB] Re-init succeeded, proceeding');
      next();
    } else {
      console.error('❌ [REQUIRE_DB] Re-init failed, returning 503');
      res.status(503).json({ error: 'Database is not ready yet. Please try again in a few seconds.', retry: true });
    }
  }).catch(err => {
    console.error('❌ [REQUIRE_DB] Re-init error:', err.message);
    res.status(503).json({ error: 'Database is not ready yet. Please try again in a few seconds.', retry: true });
  });
}

/* ============================================================
   HEALTH CHECK — comprehensive status
   ============================================================ */
app.get('/api/health', async (req, res) => {
  try {
    let count = 0;
    let sessionCount = 0;
    if (dbType === 'postgres') {
      const result = await db.query('SELECT COUNT(*) as count FROM applications');
      count = parseInt(result.rows[0].count);
      try {
        const sessResult = await db.query('SELECT COUNT(*) as count FROM session');
        sessionCount = parseInt(sessResult.rows[0].count);
      } catch (e) { /* session table might not exist yet */ }
    } else {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM applications', [], (err, r) => err ? reject(err) : resolve(r));
      });
      count = row ? row.count : 0;
    }
    res.json({
      status: 'ok',
      db: dbType,
      dbReady,
      applications_count: count,
      active_sessions: sessionCount,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pgReconnectAttempts,
      env: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    console.error('❌ [HEALTH] DB check failed:', err.message);
    res.status(500).json({ status: 'error', db: dbType, dbReady, error: err.message, pgReconnectAttempts });
  }
});

/* ============================================================
   DB STATUS — comprehensive diagnostics
   ============================================================ */
app.get('/api/db-status', requireAuth, async (req, res) => {
  try {
    const counts = {};
    const tables = ['applications', 'events', 'routes', 'fleet', 'timeline'];
    for (const t of tables) {
      try {
        if (dbType === 'postgres') {
          const r = await db.query(`SELECT COUNT(*) as c FROM ${t}`);
          counts[t] = parseInt(r.rows[0].c);
        } else {
          const r = await new Promise((resolve, reject) => db.get(`SELECT COUNT(*) as c FROM ${t}`, [], (err, row) => err ? reject(err) : resolve(row)));
          counts[t] = r ? r.c : 0;
        }
      } catch (e) {
        counts[t] = `ERROR: ${e.message}`;
      }
    }
    // Session count
    try {
      if (dbType === 'postgres') {
        const sr = await db.query('SELECT COUNT(*) as c FROM session');
        counts.session = parseInt(sr.rows[0].c);
      }
    } catch (e) {
      counts.session = `ERROR: ${e.message}`;
    }
    // Latest application info
    let latestApp = null;
    try {
      if (dbType === 'postgres') {
        const lr = await db.query('SELECT id, roblox_name, status, created_at FROM applications ORDER BY created_at DESC LIMIT 1');
        latestApp = lr.rows[0] || null;
      } else {
        latestApp = await new Promise((resolve, reject) => db.get('SELECT id, roblox_name, status, created_at FROM applications ORDER BY created_at DESC LIMIT 1', [], (err, r) => err ? reject(err) : resolve(r)));
      }
    } catch (e) { /* ignore */ }
    
    res.json({
      dbType,
      dbReady,
      persistent: dbType === 'postgres',
      databaseUrlSet: !!process.env.DATABASE_URL,
      sessionStore: dbType === 'postgres' ? 'postgres' : 'memory',
      pgReconnectAttempts,
      counts,
      latestApplication: latestApp,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message, dbReady, pgReconnectAttempts });
  }
});

/* ============================================================
   PUBLIC API
   ============================================================ */
app.post('/api/submit', rateLimit(60000, 10), requireDb, async (req, res) => {
  const { roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, exam_score, exam_total, exam_passed, application_type } = req.body;
  // Application type: 'academy' (pilot academy, with exam) or 'staff' (hiring, no exam)
  const appType = (application_type === 'staff') ? 'staff' : 'academy';
  // BETA: entrance exam result (optional, validated but never trusted for anything critical)
  const examScore = (exam_score === undefined || exam_score === null || exam_score === '') ? null : Math.max(0, parseInt(exam_score) || 0);
  const examTotal = (exam_total === undefined || exam_total === null || exam_total === '') ? null : Math.max(0, parseInt(exam_total) || 0);
  const examPassed = (exam_passed === true || exam_passed === 'true' || exam_passed === 1 || exam_passed === '1');
  console.log('📥 [SUBMIT] Received', appType, 'application from:', roblox_name);
  if (!roblox_name || !experience || !rules || !telegram) {
    return res.status(400).json({ success: false, error: 'Required fields missing' });
  }
  if (roblox_name.length > 50 || telegram.length > 50) {
    return res.status(400).json({ success: false, error: 'Roblox name or Telegram too long (max 50 chars)' });
  }
  if (experience && experience.length > 2000) return res.status(400).json({ success: false, error: 'Experience too long' });
  if (about && about.length > 2000) return res.status(400).json({ success: false, error: 'About too long' });
  if (why_swiss && why_swiss.length > 2000) return res.status(400).json({ success: false, error: 'Why Swiss too long' });

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (dbType === 'postgres') {
        const result = await db.query(
          `INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, exam_score, exam_total, exam_passed, application_type)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, examScore, examTotal, examPassed, appType]
        );
        console.log('✅ [SUBMIT] Application saved, ID:', result.rows[0].id, '(attempt', attempt, ')');
        if (attempt > 0) { dbReady = true; pgReconnectAttempts = 0; }
        return res.json({ success: true, id: result.rows[0].id });
      } else {
        const stmt = db.prepare(`INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, exam_score, exam_total, exam_passed, application_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const id = await new Promise((resolve, reject) => {
          stmt.run(roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, examScore, examTotal, examPassed ? 1 : 0, appType, function(err) {
            if (err) { stmt.finalize(); reject(err); return; }
            resolve(this.lastID);
            stmt.finalize();
          });
        });
        console.log('✅ [SUBMIT] Application saved, ID:', id, '(attempt', attempt, ')');
        return res.json({ success: true, id });
      }
    } catch (err) {
      console.error('❌ [SUBMIT] Error on attempt', attempt, ':', err.message);
      if (attempt < maxRetries) {
        console.log('🔄 [SUBMIT] Retrying in 2s...');
        await new Promise(r => setTimeout(r, 2000));
        try { await initDb(); } catch(e) { /* ignore */ }
        continue;
      }
      return res.status(500).json({ success: false, error: 'Database error: ' + err.message });
    }
  }
});

/* ============================================================
   PUBLIC CMS CONTENT API (read-only)
   ============================================================ */

// Events
app.get('/api/events', requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM events ORDER BY date DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM events ORDER BY date DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ events: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fleet
app.get('/api/fleet', requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM fleet ORDER BY category, model'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM fleet ORDER BY category, model', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ fleet: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Routes
app.get('/api/routes', requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM routes WHERE active = true ORDER BY origin'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM routes WHERE active = 1 ORDER BY origin', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ routes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Timeline
app.get('/api/timeline', requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM timeline ORDER BY year'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM timeline ORDER BY year', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ timeline: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   LIVE STATS API (BETA) — public, read-only
   ============================================================ */
app.get('/api/stats-public', rateLimit(60000, 60), requireDb, async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const online = touchVisitor(ip);
    if (req.query.count === '1') await statsBump('visits', 1);

    const manual = await statsGetAll();
    let applications = 0, acceptedPilots = 0, events = 0, routes = 0, fleet = 0;
    if (dbType === 'postgres') {
      applications = parseInt((await db.query('SELECT COUNT(*) as c FROM applications')).rows[0].c) || 0;
      acceptedPilots = parseInt((await db.query("SELECT COUNT(*) as c FROM applications WHERE status = 'accepted'")).rows[0].c) || 0;
      events = parseInt((await db.query('SELECT COUNT(*) as c FROM events')).rows[0].c) || 0;
      routes = parseInt((await db.query('SELECT COUNT(*) as c FROM routes')).rows[0].c) || 0;
      fleet = parseInt((await db.query('SELECT COUNT(*) as c FROM fleet')).rows[0].c) || 0;
    } else {
      const one = (sql) => new Promise((resolve) => db.get(sql, [], (err, r) => resolve(err || !r ? 0 : (r.c || 0))));
      applications = await one('SELECT COUNT(*) as c FROM applications');
      acceptedPilots = await one("SELECT COUNT(*) as c FROM applications WHERE status = 'accepted'");
      events = await one('SELECT COUNT(*) as c FROM events');
      routes = await one('SELECT COUNT(*) as c FROM routes');
      fleet = await one('SELECT COUNT(*) as c FROM fleet');
    }

    res.json({
      beta: true,
      online,
      visits: manual.visits,
      applications,
      pilots: manual.pilots > 0 ? manual.pilots : acceptedPilots,
      flights: manual.flights,
      flight_hours: manual.flight_hours,
      destinations: manual.destinations > 0 ? manual.destinations : routes,
      events,
      routes,
      fleet,
      server_time: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ============================================================
   AUTH API
   ============================================================ */
app.post('/api/login', rateLimit(60000, 5), (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    req.session.isAdmin = true;
    req.session.username = username;
    // Explicitly save session before responding
    req.session.save((err) => {
      if (err) {
        console.error('❌ [LOGIN] Session save error:', err);
        return res.status(500).json({ success: false, error: 'Session save failed' });
      }
      console.log('✅ [LOGIN] Admin logged in:', username, '| Session ID:', req.sessionID);
      res.json({ success: true });
    });
  } else {
    console.log('⚠️ [LOGIN] Failed login attempt for:', username);
    res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
  }
});

/* ===== SITE MODE (maintenance / update) ===== */
app.get('/api/site-mode', async (req, res) => {
  if (dbReady && Date.now() - siteSettingsAt > 15000) { try { await settingsLoad(); } catch (e) {} }
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    mode: siteSettings.site_mode || 'live',
    title: siteSettings.maint_title || '',
    message: siteSettings.maint_message || '',
    eta: siteSettings.maint_eta || '',
    done: siteSettings.maint_done || '',
    doneAt: siteSettings.maint_done_at || '',
    isAdmin: !!(req.session && req.session.isAdmin)
  });
});

app.put('/api/admin/site-mode', requireAuth, requireDb, async (req, res) => {
  try {
    const body = req.body || {};
    if (body.mode !== undefined) {
      const mode = String(body.mode);
      if (!SITE_MODES.includes(mode)) return res.status(400).json({ success: false, error: 'Invalid mode' });
      const prev = siteSettings.site_mode || 'live';
      await settingsSet('site_mode', mode);
      // Remember "work finished" so visitors get a completion animation once
      if (mode === 'live' && prev !== 'live') {
        await settingsSet('maint_done', prev);
        await settingsSet('maint_done_at', String(Date.now()));
      } else if (mode !== 'live') {
        await settingsSet('maint_done', '');
        await settingsSet('maint_done_at', '');
      }
    }
    if (body.title !== undefined) await settingsSet('maint_title', body.title);
    if (body.message !== undefined) await settingsSet('maint_message', body.message);
    if (body.eta !== undefined) await settingsSet('maint_eta', body.eta);
    await settingsLoad();
    console.log('⚙️  [SETTINGS] site_mode set to', siteSettings.site_mode);
    res.json({
      success: true,
      mode: siteSettings.site_mode,
      title: siteSettings.maint_title,
      message: siteSettings.maint_message,
      eta: siteSettings.maint_eta,
      done: siteSettings.maint_done || '',
      doneAt: siteSettings.maint_done_at || ''
    });
  } catch (e) {
    console.error('[SETTINGS] save error:', e.message);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

app.get('/api/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin), username: req.session.username || null });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* ============================================================
   ADMIN APPLICATIONS API
   ============================================================ */
app.get('/api/applications', requireAuth, requireDb, async (req, res) => {
  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let rows;
      if (dbType === 'postgres') {
        const r = await db.query('SELECT * FROM applications ORDER BY created_at DESC');
        rows = r.rows;
      } else {
        rows = await new Promise((resolve, reject) => db.all('SELECT * FROM applications ORDER BY created_at DESC', [], (err, r) => err ? reject(err) : resolve(r)));
      }
      console.log('📋 [APPLICATIONS] Returning', rows.length, 'applications to admin (attempt', attempt, ')');
      // If we got here after a retry, DB is working again
      if (attempt > 0) { dbReady = true; pgReconnectAttempts = 0; }
      return res.json({ applications: rows, user: { username: req.session.username || 'Администратор' } });
    } catch (err) {
      console.error('❌ [APPLICATIONS] Error on attempt', attempt, ':', err.message);
      if (attempt < maxRetries) {
        console.log('🔄 [APPLICATIONS] Retrying in 2s...');
        await new Promise(r => setTimeout(r, 2000));
        // Try to re-init DB
        try { await initDb(); } catch(e) { /* ignore */ }
        continue;
      }
      return res.status(500).json({ error: err.message, retry: true });
    }
  }
});

app.put('/api/applications/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params; const { status } = req.body;
  const validStatuses = ['new', 'review', 'accepted', 'rejected'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    if (dbType === 'postgres') {
      const result = await db.query('UPDATE applications SET status = $1 WHERE id = $2', [status, id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('UPDATE applications SET status = ? WHERE id = ?', [status, id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    console.log('✅ [APPLICATION] Status updated:', id, '→', status);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/applications/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('DELETE FROM applications WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('DELETE FROM applications WHERE id = ?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    console.log('🗑️ [APPLICATION] Deleted:', id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN STATS API
   ============================================================ */
app.get('/api/stats', requireAuth, requireDb, async (req, res) => {
  try {
    const stats = {};
    if (dbType === 'postgres') {
      const ar = await db.query('SELECT COUNT(*) as c FROM applications'); stats.applications = parseInt(ar.rows[0].c);
      const er = await db.query('SELECT COUNT(*) as c FROM events'); stats.events = parseInt(er.rows[0].c);
      const rr = await db.query('SELECT COUNT(*) as c FROM routes'); stats.routes = parseInt(rr.rows[0].c);
      const fr = await db.query('SELECT COUNT(*) as c FROM fleet'); stats.fleet = parseInt(fr.rows[0].c);
    } else {
      const ar = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM applications', [], (err, r) => err ? reject(err) : resolve(r))); stats.applications = ar ? ar.c : 0;
      const er = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM events', [], (err, r) => err ? reject(err) : resolve(r))); stats.events = er ? er.c : 0;
      const rr = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM routes', [], (err, r) => err ? reject(err) : resolve(r))); stats.routes = rr ? rr.c : 0;
      const fr = await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as c FROM fleet', [], (err, r) => err ? reject(err) : resolve(r))); stats.fleet = fr ? fr.c : 0;
    }
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN LIVE STATS API (BETA)
   ============================================================ */
app.get('/api/admin/site-stats', requireAuth, requireDb, async (req, res) => {
  try {
    const manual = await statsGetAll();
    let examStats = { with_exam: 0, passed: 0, avg_score: null };
    if (dbType === 'postgres') {
      const r = await db.query('SELECT COUNT(exam_score) as with_exam, COUNT(CASE WHEN exam_passed THEN 1 END) as passed, AVG(exam_score) as avg_score FROM applications');
      examStats = {
        with_exam: parseInt(r.rows[0].with_exam) || 0,
        passed: parseInt(r.rows[0].passed) || 0,
        avg_score: r.rows[0].avg_score === null ? null : Math.round(parseFloat(r.rows[0].avg_score) * 10) / 10
      };
    } else {
      const r = await new Promise((resolve) => db.get('SELECT COUNT(exam_score) as with_exam, SUM(CASE WHEN exam_passed = 1 THEN 1 ELSE 0 END) as passed, AVG(exam_score) as avg_score FROM applications', [], (err, row) => resolve(err ? null : row)));
      if (r) examStats = {
        with_exam: r.with_exam || 0,
        passed: r.passed || 0,
        avg_score: r.avg_score === null ? null : Math.round(parseFloat(r.avg_score) * 10) / 10
      };
    }
    res.json({ stats: manual, online: onlineVisitors.size, exam: examStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/site-stats', requireAuth, requireDb, async (req, res) => {
  try {
    const updated = [];
    for (const k of STAT_KEYS) {
      if (req.body && req.body[k] !== undefined && req.body[k] !== null && req.body[k] !== '') {
        await statsSet(k, req.body[k]);
        updated.push(k);
      }
    }
    console.log('[STATS] Admin updated counters:', updated.join(', ') || 'nothing');
    const stats = await statsGetAll();
    res.json({ success: true, updated, stats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN EVENTS API
   ============================================================ */
app.get('/api/admin/events', requireAuth, requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM events ORDER BY date DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM events ORDER BY date DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ events: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/events', requireAuth, requireDb, async (req, res) => {
  const { title, description, date, time, location, status, image_url } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
  try {
    if (dbType === 'postgres') {
      const result = await db.query('INSERT INTO events (title, description, date, time, location, status, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [title, description || null, date, time || null, location || null, status || 'upcoming', image_url || null]);
      res.json({ success: true, id: result.rows[0].id });
    } else {
      db.run('INSERT INTO events (title, description, date, time, location, status, image_url) VALUES (?,?,?,?,?,?,?)',
        [title, description || null, date, time || null, location || null, status || 'upcoming', image_url || null],
        function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/events/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  const { title, description, date, time, location, status, image_url } = req.body;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('UPDATE events SET title=$1, description=$2, date=$3, time=$4, location=$5, status=$6, image_url=$7 WHERE id=$8',
        [title, description || null, date, time || null, location || null, status || 'upcoming', image_url || null, id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('UPDATE events SET title=?, description=?, date=?, time=?, location=?, status=?, image_url=? WHERE id=?',
        [title, description || null, date, time || null, location || null, status || 'upcoming', image_url || null, id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/events/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('DELETE FROM events WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('DELETE FROM events WHERE id = ?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   AI IMAGE GENERATION API
   ============================================================ */
app.post('/api/admin/generate-event-image', requireAuth, requireDb, async (req, res) => {
  const { title, description, location } = req.body;
  if (!title) return res.status(400).json({ error: 'Event title required' });

  // For now, return a placeholder Swiss-themed image URL
  // In production, integrate with an image generation API
  const imageUrl = `https://images.unsplash.com/photo-1436491865332-7a61d109a5d2?w=800&h=400&fit=crop&q=80&sig=${encodeURIComponent(title)}`;
  res.json({ success: true, image_url: imageUrl });
});

/* ============================================================
   ADMIN ROUTES API
   ============================================================ */
app.get('/api/admin/routes', requireAuth, requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM routes ORDER BY origin'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM routes ORDER BY origin', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ routes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/routes', requireAuth, requireDb, async (req, res) => {
  const { origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency } = req.body;
  if (!origin || !destination) return res.status(400).json({ error: 'Origin and destination required' });
  try {
    if (dbType === 'postgres') {
      const result = await db.query('INSERT INTO routes (origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [origin, origin_code || null, destination, destination_code || null, distance_km || null, duration_min || null, aircraft_type || null, frequency || null]);
      res.json({ success: true, id: result.rows[0].id });
    } else {
      db.run('INSERT INTO routes (origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency) VALUES (?,?,?,?,?,?,?,?)',
        [origin, origin_code || null, destination, destination_code || null, distance_km || null, duration_min || null, aircraft_type || null, frequency || null],
        function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/routes/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  const { origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency, active } = req.body;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('UPDATE routes SET origin=$1, origin_code=$2, destination=$3, destination_code=$4, distance_km=$5, duration_min=$6, aircraft_type=$7, frequency=$8, active=$9 WHERE id=$10',
        [origin, origin_code || null, destination, destination_code || null, distance_km || null, duration_min || null, aircraft_type || null, frequency || null, active !== false, id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('UPDATE routes SET origin=?, origin_code=?, destination=?, destination_code=?, distance_km=?, duration_min=?, aircraft_type=?, frequency=?, active=? WHERE id=?',
        [origin, origin_code || null, destination, destination_code || null, distance_km || null, duration_min || null, aircraft_type || null, frequency || null, active !== false ? 1 : 0, id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/routes/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('DELETE FROM routes WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('DELETE FROM routes WHERE id = ?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN FLEET API
   ============================================================ */
app.get('/api/admin/fleet', requireAuth, requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM fleet ORDER BY category, model'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM fleet ORDER BY category, model', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ fleet: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/fleet', requireAuth, requireDb, async (req, res) => {
  const { model, manufacturer, category, capacity, range_km, speed_kmh, description, image_url } = req.body;
  if (!model) return res.status(400).json({ error: 'Model required' });
  try {
    if (dbType === 'postgres') {
      const result = await db.query('INSERT INTO fleet (model, manufacturer, category, capacity, range_km, speed_kmh, description, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [model, manufacturer || null, category || null, capacity || null, range_km || null, speed_kmh || null, description || null, image_url || null]);
      res.json({ success: true, id: result.rows[0].id });
    } else {
      db.run('INSERT INTO fleet (model, manufacturer, category, capacity, range_km, speed_kmh, description, image_url) VALUES (?,?,?,?,?,?,?,?)',
        [model, manufacturer || null, category || null, capacity || null, range_km || null, speed_kmh || null, description || null, image_url || null],
        function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/fleet/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  const { model, manufacturer, category, capacity, range_km, speed_kmh, description, image_url, status } = req.body;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('UPDATE fleet SET model=$1, manufacturer=$2, category=$3, capacity=$4, range_km=$5, speed_kmh=$6, description=$7, image_url=$8, status=$9 WHERE id=$10',
        [model, manufacturer || null, category || null, capacity || null, range_km || null, speed_kmh || null, description || null, image_url || null, status || 'active', id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('UPDATE fleet SET model=?, manufacturer=?, category=?, capacity=?, range_km=?, speed_kmh=?, description=?, image_url=?, status=? WHERE id=?',
        [model, manufacturer || null, category || null, capacity || null, range_km || null, speed_kmh || null, description || null, image_url || null, status || 'active', id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/fleet/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('DELETE FROM fleet WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('DELETE FROM fleet WHERE id = ?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN TIMELINE API
   ============================================================ */
app.get('/api/admin/timeline', requireAuth, requireDb, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM timeline ORDER BY year'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM timeline ORDER BY year', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ timeline: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/timeline', requireAuth, requireDb, async (req, res) => {
  const { year, title, description, icon } = req.body;
  if (!year || !title) return res.status(400).json({ error: 'Year and title required' });
  try {
    if (dbType === 'postgres') {
      const result = await db.query('INSERT INTO timeline (year, title, description, icon) VALUES ($1,$2,$3,$4) RETURNING id',
        [year, title, description || null, icon || null]);
      res.json({ success: true, id: result.rows[0].id });
    } else {
      db.run('INSERT INTO timeline (year, title, description, icon) VALUES (?,?,?,?)',
        [year, title, description || null, icon || null],
        function(err) { if (err) return res.status(500).json({ error: err.message }); res.json({ success: true, id: this.lastID }); });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/timeline/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  const { year, title, description, icon } = req.body;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('UPDATE timeline SET year=$1, title=$2, description=$3, icon=$4 WHERE id=$5',
        [year, title, description || null, icon || null, id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('UPDATE timeline SET year=?, title=?, description=?, icon=? WHERE id=?',
        [year, title, description || null, icon || null, id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/timeline/:id', requireAuth, requireDb, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') {
      const result = await db.query('DELETE FROM timeline WHERE id = $1', [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const result = await new Promise((resolve, reject) => db.run('DELETE FROM timeline WHERE id = ?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   PTFS NOTIFICATION API
   ============================================================ */
app.get('/api/notifications', requireDb, async (req, res) => {
  const { ptfs_nick } = req.query;
  if (!ptfs_nick) return res.json({ notifications: [] });
  try {
    let rows;
    if (dbType === 'postgres') {
      rows = (await db.query('SELECT * FROM applications WHERE LOWER(roblox_name) = LOWER($1) ORDER BY created_at DESC LIMIT 1', [ptfs_nick])).rows;
    } else {
      rows = await new Promise((resolve, reject) => db.all('SELECT * FROM applications WHERE LOWER(roblox_name) = LOWER(?) ORDER BY created_at DESC LIMIT 1', [ptfs_nick], (err, r) => err ? reject(err) : resolve(r)));
    }
    if (rows.length === 0) return res.json({ notifications: [] });
    const app = rows[0];
    res.json({ notifications: [{ title: 'Анкета', message: 'Ваша анкета найдена', status: app.status, created_at: app.created_at, data: app }] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   CATCH-ALL 404 — рейс отклонён (must stay last, before listen)
   ============================================================ */
app.use((req, res) => {
  // API и AJAX-запросы — всегда JSON
  if (req.path.startsWith('/api/') || req.xhr || (req.headers.accept || '').indexOf('application/json') !== -1) {
    return res.status(404).json({ success: false, error: 'Not found', path: req.path });
  }
  // Браузерные переходы — красивая страница Diverted
  if ((req.headers.accept || '').indexOf('html') !== -1) {
    return res.status(404).sendFile(path.join(__dirname, '404.html'), (err) => {
      if (err) res.status(404).type('txt').send('404 — Not found');
    });
  }
  return res.status(404).type('txt').send('404 — Not found');
});

/* ============================================================
   ERROR HANDLER — один формат ошибок
   ============================================================ */
app.use((err, req, res, next) => {
  console.error('[ERROR]', req.method, req.originalUrl, '—', err && err.message);
  if (res.headersSent) return;
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
  res.status(500).type('txt').send('500 — Internal server error');
});

/* ============================================================
   START SERVER — wait for DB init first
   ============================================================ */
initDb().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`✈️  Swiss Airlines server running on port ${PORT}`);
    console.log(`🗄️  Database: ${dbType.toUpperCase()}`);
    console.log(`📝 Public form: http://localhost:${PORT}`);
    console.log(`🔐 Admin panel: http://localhost:${PORT}/login.html`);
    console.log(`🔑 Default admin: ${ADMIN_USERNAME}`);
    console.log(`💡 To change credentials, set ADMIN_USERNAME and ADMIN_PASSWORD environment variables`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  });

  /* ============================================================
     GRACEFUL SHUTDOWN
     ============================================================ */
  function shutdown(signal) {
    console.log(`\n${signal} received. Closing server gracefully...`);
    server.close(() => {
      console.log('🛑 HTTP server closed');
      if (dbType === 'sqlite') {
        db.close((err) => {
          if (err) console.error('❌ Error closing SQLite:', err.message);
          else console.log('✅ SQLite connection closed');
          process.exit(0);
        });
      } else {
        db.end().then(() => { console.log('✅ PostgreSQL pool closed'); process.exit(0); }).catch((err) => { console.error('❌ Error closing PostgreSQL:', err.message); process.exit(1); });
      }
    });
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}).catch(err => {
  console.error('❌ Failed to initialize DB, starting server anyway (API will return 503):', err);
  const server = app.listen(PORT, () => {
    console.log(`✈️  Swiss Airlines server running on port ${PORT} (DB not ready)`);
  });
});
