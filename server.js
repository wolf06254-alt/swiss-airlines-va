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
}

/* ============================================================
   DB HELPERS — unified access for PostgreSQL + SQLite
   sqlPg uses $1,$2...   sqlLite uses ?,?...
   ============================================================ */
async function dbAll(sqlPg, sqlLite, params = []) {
  if (dbType === 'postgres') return (await db.query(sqlPg, params)).rows;
  return await new Promise((resolve, reject) => db.all(sqlLite, params, (err, rows) => err ? reject(err) : resolve(rows || [])));
}
async function dbGet(sqlPg, sqlLite, params = []) {
  const rows = await dbAll(sqlPg, sqlLite, params);
  return rows.length ? rows[0] : null;
}
async function dbRun(sqlPg, sqlLite, params = []) {
  if (dbType === 'postgres') {
    const r = await db.query(sqlPg, params);
    return { rowCount: r.rowCount, rows: r.rows, lastID: r.rows && r.rows[0] ? r.rows[0].id : null };
  }
  return await new Promise((resolve, reject) => db.run(sqlLite, params, function (err) {
    if (err) reject(err); else resolve({ rowCount: this.changes, lastID: this.lastID, rows: [] });
  }));
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
app.use(express.static(path.join(__dirname, '.')));

app.use(session({
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,                    // Render uses proxy, no HTTPS on app level
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
    sameSite: 'lax'
  },
  name: 'swiss_session'
}));

// Trust proxy — required for Render (reverse proxy)
app.set('trust proxy', 1);

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
app.get('/pilot.html', (req, res) => res.sendFile(path.join(__dirname, 'pilot.html')));

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
          status TEXT DEFAULT 'new',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
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
      // ===== PILOTS (личные кабинеты) =====
      await db.query(`
        CREATE TABLE IF NOT EXISTS pilots (
          id SERIAL PRIMARY KEY,
          callsign TEXT UNIQUE NOT NULL,
          roblox_name TEXT NOT NULL,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          application_id INTEGER,
          rank TEXT DEFAULT 'Кадет',
          total_minutes INTEGER DEFAULT 0,
          total_flights INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          telegram TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS flight_reports (
          id SERIAL PRIMARY KEY,
          pilot_id INTEGER NOT NULL,
          flight_number TEXT,
          departure TEXT NOT NULL,
          arrival TEXT NOT NULL,
          aircraft TEXT,
          duration_min INTEGER NOT NULL,
          pax INTEGER,
          landing_rate INTEGER,
          comment TEXT,
          status TEXT DEFAULT 'pending',
          admin_comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          reviewed_at TIMESTAMP
        )
      `);
      await db.query('CREATE INDEX IF NOT EXISTS idx_reports_pilot ON flight_reports(pilot_id)');
      await db.query('CREATE INDEX IF NOT EXISTS idx_reports_status ON flight_reports(status)');
    } else {
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          roblox_name TEXT NOT NULL, char_age TEXT, real_age TEXT, experience TEXT, role TEXT,
          online_time TEXT, why_swiss TEXT, rules TEXT, fro TEXT,
          flight_minutes TEXT, telegram TEXT, about TEXT,
          status TEXT DEFAULT 'new', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => err ? reject(err) : resolve());
      });
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
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS pilots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          callsign TEXT UNIQUE NOT NULL,
          roblox_name TEXT NOT NULL,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          application_id INTEGER,
          rank TEXT DEFAULT 'Кадет',
          total_minutes INTEGER DEFAULT 0,
          total_flights INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          telegram TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME
        )`, (err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS flight_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pilot_id INTEGER NOT NULL,
          flight_number TEXT,
          departure TEXT NOT NULL,
          arrival TEXT NOT NULL,
          aircraft TEXT,
          duration_min INTEGER NOT NULL,
          pax INTEGER,
          landing_rate INTEGER,
          comment TEXT,
          status TEXT DEFAULT 'pending',
          admin_comment TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          reviewed_at DATETIME
        )`, (err) => err ? reject(err) : resolve());
      });
      await new Promise((resolve) => db.run('CREATE INDEX IF NOT EXISTS idx_reports_pilot ON flight_reports(pilot_id)', () => resolve()));
      await new Promise((resolve) => db.run('CREATE INDEX IF NOT EXISTS idx_reports_status ON flight_reports(status)', () => resolve()));
    }

    // ============ SEED DATA ============
    const seedEvents = [];
    const seedApplications = [];
    const seedRoutes = [
      // Внутренние — Швейцария
      {origin:'Цюрих',origin_code:'IPPH',destination:'Женева',destination_code:'IZOL',distance_km:230,duration_min:45,aircraft_type:'Airbus A220-100',frequency:'ежедневно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Лугано',destination_code:'ILKL',distance_km:210,duration_min:40,aircraft_type:'Airbus A220-100',frequency:'ежедневно'},
      {origin:'Женева',origin_code:'IZOL',destination:'Берн',destination_code:'IJAF',distance_km:160,duration_min:35,aircraft_type:'Airbus A220-100',frequency:'ежедневно'},
      // Европа из Цюриха
      {origin:'Цюрих',origin_code:'IPPH',destination:'Лондон',destination_code:'IKFL',distance_km:947,duration_min:105,aircraft_type:'Airbus A320neo',frequency:'ежедневно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Москва',destination_code:'IRFD',distance_km:2200,duration_min:195,aircraft_type:'Airbus A320-200',frequency:'ежедневно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Манчестер',destination_code:'ITEY',distance_km:1050,duration_min:120,aircraft_type:'Airbus A220-300',frequency:'5x в неделю'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Санкт-Петербург',destination_code:'IMLR',distance_km:2400,duration_min:205,aircraft_type:'Airbus A320neo',frequency:'3x в неделю'},
      // Америка
      {origin:'Цюрих',origin_code:'IPPH',destination:'Нью-Йорк',destination_code:'ITKO',distance_km:6980,duration_min:510,aircraft_type:'Boeing 777-300ER',frequency:'ежедневно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Чикаго',destination_code:'IDCS',distance_km:7420,duration_min:540,aircraft_type:'Airbus A340-300',frequency:'еженедельно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Лос-Анджелес',destination_code:'IBRD',distance_km:9540,duration_min:690,aircraft_type:'Airbus A350-900',frequency:'ежедневно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Сан-Паулу',destination_code:'ISAU',distance_km:9855,duration_min:720,aircraft_type:'Boeing 777-300ER',frequency:'еженедельно'},
      // Африка и Ближний Восток
      {origin:'Цюрих',origin_code:'IPPH',destination:'Каир',destination_code:'ILAR',distance_km:2840,duration_min:240,aircraft_type:'Airbus A220-300',frequency:'ежедневно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Найроби',destination_code:'IPAP',distance_km:6460,duration_min:480,aircraft_type:'Airbus A330-300',frequency:'еженедельно'},
      {origin:'Цюрих',origin_code:'IPPH',destination:'Дубай',destination_code:'ISKP',distance_km:4860,duration_min:370,aircraft_type:'Airbus A330-300',frequency:'ежедневно'},
      // Азия
      {origin:'Цюрих',origin_code:'IPPH',destination:'Сингапур',destination_code:'IBTH',distance_km:10300,duration_min:750,aircraft_type:'Boeing 777-300ER',frequency:'ежедневно'},
      // Из Женевы
      {origin:'Женева',origin_code:'IZOL',destination:'Лондон',destination_code:'IKFL',distance_km:815,duration_min:95,aircraft_type:'Airbus A220-300',frequency:'ежедневно'},
      {origin:'Женева',origin_code:'IZOL',destination:'Москва',destination_code:'IRFD',distance_km:2500,duration_min:210,aircraft_type:'Airbus A321neo',frequency:'еженедельно'},
      {origin:'Женева',origin_code:'IZOL',destination:'Нью-Йорк',destination_code:'ITKO',distance_km:6900,duration_min:505,aircraft_type:'Airbus A330-300',frequency:'ежедневно'},
      {origin:'Женева',origin_code:'IZOL',destination:'Дубай',destination_code:'ISKP',distance_km:4800,duration_min:365,aircraft_type:'Airbus A330-300',frequency:'4x в неделю'},
      // Региональные / фидерные
      {origin:'Москва',origin_code:'IRFD',destination:'Санкт-Петербург',destination_code:'IMLR',distance_km:700,duration_min:90,aircraft_type:'Airbus A220-300',frequency:'ежедневно'},
      {origin:'Москва',origin_code:'IRFD',destination:'Сочи',destination_code:'IBLT',distance_km:1500,duration_min:145,aircraft_type:'Airbus A320-200',frequency:'ежедневно'},
      {origin:'Москва',origin_code:'IRFD',destination:'Дубай',destination_code:'ISKP',distance_km:3600,duration_min:280,aircraft_type:'Airbus A321neo',frequency:'ежедневно'},
      {origin:'Нью-Йорк',origin_code:'ITKO',destination:'Чикаго',destination_code:'IDCS',distance_km:1190,duration_min:150,aircraft_type:'Airbus A320neo',frequency:'ежедневно'},
      {origin:'Нью-Йорк',origin_code:'ITKO',destination:'Лос-Анджелес',destination_code:'IBRD',distance_km:3940,duration_min:330,aircraft_type:'Airbus A321neo',frequency:'ежедневно'},
      {origin:'Лондон',origin_code:'IKFL',destination:'Манчестер',destination_code:'ITEY',distance_km:300,duration_min:55,aircraft_type:'Airbus A220-100',frequency:'ежедневно'},
      {origin:'Лондон',origin_code:'IKFL',destination:'Нью-Йорк',destination_code:'ITKO',distance_km:5570,duration_min:420,aircraft_type:'Boeing 777-300ER',frequency:'ежедневно'},
      {origin:'Каир',origin_code:'ILAR',destination:'Шарм-эль-Шейх',destination_code:'IBAR',distance_km:500,duration_min:60,aircraft_type:'Airbus A220-300',frequency:'ежедневно'},
      {origin:'Найроби',origin_code:'IPAP',destination:'Дар-эс-Салам',destination_code:'IHEN',distance_km:1100,duration_min:90,aircraft_type:'Airbus A220-300',frequency:'ежедневно'},
      {origin:'Дубай',origin_code:'ISKP',destination:'Сингапур',destination_code:'IBTH',distance_km:5900,duration_min:430,aircraft_type:'Airbus A330-300',frequency:'ежедневно'},
      {origin:'Сан-Паулу',origin_code:'ISAU',destination:'Нью-Йорк',destination_code:'ITKO',distance_km:7700,duration_min:570,aircraft_type:'Boeing 777-300ER',frequency:'ежедневно'}
    ];
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
  const { roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about } = req.body;
  console.log('📥 [SUBMIT] Received application from:', roblox_name);
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
          `INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about]
        );
        console.log('✅ [SUBMIT] Application saved, ID:', result.rows[0].id, '(attempt', attempt, ')');
        if (attempt > 0) { dbReady = true; pgReconnectAttempts = 0; }
        return res.json({ success: true, id: result.rows[0].id });
      } else {
        const stmt = db.prepare(`INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const id = await new Promise((resolve, reject) => {
          stmt.run(roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, function(err) {
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
   PILOT CABINET — ranks, auth, reports, leaderboard
   ============================================================ */
const RANKS = [
  { key: 'cadet',   ru: 'Кадет',           en: 'Cadet',         minHours: 0 },
  { key: 'fo',      ru: 'Второй пилот',    en: 'First Officer', minHours: 10 },
  { key: 'cpt',     ru: 'Капитан',         en: 'Captain',       minHours: 30 },
  { key: 'senior',  ru: 'Старший капитан', en: 'Senior Captain',minHours: 75 }
];
function rankForMinutes(min) {
  const h = (min || 0) / 60;
  let r = RANKS[0];
  for (const x of RANKS) if (h >= x.minHours) r = x;
  return r.ru;
}
function requirePilot(req, res, next) {
  if (req.session && req.session.pilotId) return next();
  res.status(401).json({ error: 'Требуется вход в кабинет пилота', needLogin: true });
}
function publicPilot(p) {
  if (!p) return null;
  return {
    id: p.id, callsign: p.callsign, roblox_name: p.roblox_name, username: p.username,
    rank: p.rank, total_minutes: p.total_minutes || 0,
    total_hours: Math.round(((p.total_minutes || 0) / 60) * 10) / 10,
    total_flights: p.total_flights || 0, status: p.status,
    created_at: p.created_at, last_login: p.last_login
  };
}
async function nextCallsign() {
  const row = await dbGet(
    "SELECT callsign FROM pilots WHERE callsign LIKE 'SWR-%' ORDER BY id DESC LIMIT 1",
    "SELECT callsign FROM pilots WHERE callsign LIKE 'SWR-%' ORDER BY id DESC LIMIT 1"
  );
  let n = 100;
  const all = await dbAll('SELECT callsign FROM pilots', 'SELECT callsign FROM pilots');
  for (const r of all) {
    const m = /^SWR-(\d+)$/.exec(r.callsign || '');
    if (m) n = Math.max(n, parseInt(m[1], 10));
  }
  if (row) { /* keep linter calm */ }
  return 'SWR-' + String(n + 1).padStart(3, '0');
}

// Проверка: есть ли принятая анкета на этот ник (шаг 1 регистрации)
app.get('/api/pilot/check', requireDb, rateLimit(60000, 30), async (req, res) => {
  const nick = (req.query.roblox_name || '').trim();
  if (!nick) return res.status(400).json({ error: 'Укажите ник Roblox' });
  try {
    const appRow = await dbGet(
      "SELECT * FROM applications WHERE LOWER(roblox_name)=LOWER($1) AND status='accepted' ORDER BY created_at DESC LIMIT 1",
      "SELECT * FROM applications WHERE LOWER(roblox_name)=LOWER(?) AND status='accepted' ORDER BY created_at DESC LIMIT 1",
      [nick]
    );
    if (!appRow) return res.json({ eligible: false, reason: 'Принятая анкета с таким ником не найдена' });
    const exists = await dbGet(
      'SELECT id, callsign FROM pilots WHERE LOWER(roblox_name)=LOWER($1)',
      'SELECT id, callsign FROM pilots WHERE LOWER(roblox_name)=LOWER(?)', [nick]
    );
    if (exists) return res.json({ eligible: false, reason: 'Аккаунт пилота уже создан (' + exists.callsign + ')' });
    res.json({ eligible: true, roblox_name: appRow.roblox_name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Регистрация пилота — только по принятой анкете
app.post('/api/pilot/register', requireDb, rateLimit(60000, 5), async (req, res) => {
  const { roblox_name, username, password } = req.body || {};
  if (!roblox_name || !username || !password) return res.status(400).json({ error: 'Заполните все поля' });
  if (String(username).length < 3) return res.status(400).json({ error: 'Логин слишком короткий (мин. 3 символа)' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Пароль слишком короткий (мин. 6 символов)' });
  try {
    const appRow = await dbGet(
      "SELECT * FROM applications WHERE LOWER(roblox_name)=LOWER($1) AND status='accepted' ORDER BY created_at DESC LIMIT 1",
      "SELECT * FROM applications WHERE LOWER(roblox_name)=LOWER(?) AND status='accepted' ORDER BY created_at DESC LIMIT 1",
      [roblox_name]
    );
    if (!appRow) return res.status(403).json({ error: 'Регистрация доступна только пилотам с принятой анкетой' });
    const dupNick = await dbGet('SELECT id FROM pilots WHERE LOWER(roblox_name)=LOWER($1)', 'SELECT id FROM pilots WHERE LOWER(roblox_name)=LOWER(?)', [roblox_name]);
    if (dupNick) return res.status(409).json({ error: 'Аккаунт для этого ника уже существует' });
    const dupUser = await dbGet('SELECT id FROM pilots WHERE LOWER(username)=LOWER($1)', 'SELECT id FROM pilots WHERE LOWER(username)=LOWER(?)', [username]);
    if (dupUser) return res.status(409).json({ error: 'Такой логин уже занят' });

    const callsign = await nextCallsign();
    const hash = bcrypt.hashSync(String(password), 10);
    const r = await dbRun(
      'INSERT INTO pilots (callsign, roblox_name, username, password_hash, application_id, rank, telegram) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      'INSERT INTO pilots (callsign, roblox_name, username, password_hash, application_id, rank, telegram) VALUES (?,?,?,?,?,?,?)',
      [callsign, appRow.roblox_name, username, hash, appRow.id, RANKS[0].ru, appRow.telegram || null]
    );
    req.session.pilotId = r.lastID;
    req.session.pilotCallsign = callsign;
    req.session.save(() => res.json({ success: true, callsign, rank: RANKS[0].ru }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pilot/login', requireDb, rateLimit(60000, 10), async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  try {
    const p = await dbGet('SELECT * FROM pilots WHERE LOWER(username)=LOWER($1)', 'SELECT * FROM pilots WHERE LOWER(username)=LOWER(?)', [username]);
    if (!p || !bcrypt.compareSync(String(password), p.password_hash)) return res.status(401).json({ error: 'Неверный логин или пароль' });
    if (p.status === 'suspended') return res.status(403).json({ error: 'Аккаунт приостановлен. Свяжитесь с администрацией.' });
    await dbRun('UPDATE pilots SET last_login=CURRENT_TIMESTAMP WHERE id=$1', 'UPDATE pilots SET last_login=CURRENT_TIMESTAMP WHERE id=?', [p.id]);
    req.session.pilotId = p.id;
    req.session.pilotCallsign = p.callsign;
    req.session.save(() => res.json({ success: true, pilot: publicPilot(p) }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pilot/logout', (req, res) => {
  if (req.session) { delete req.session.pilotId; delete req.session.pilotCallsign; }
  res.json({ success: true });
});

app.get('/api/pilot/me', requireDb, async (req, res) => {
  if (!req.session || !req.session.pilotId) return res.json({ loggedIn: false });
  try {
    const p = await dbGet('SELECT * FROM pilots WHERE id=$1', 'SELECT * FROM pilots WHERE id=?', [req.session.pilotId]);
    if (!p) { delete req.session.pilotId; return res.json({ loggedIn: false }); }
    const nextRank = RANKS.find(r => (p.total_minutes || 0) / 60 < r.minHours) || null;
    res.json({
      loggedIn: true, pilot: publicPilot(p), ranks: RANKS,
      next_rank: nextRank ? { name: nextRank.ru, hours_needed: Math.round((nextRank.minHours - (p.total_minutes || 0) / 60) * 10) / 10 } : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pilot/password', requireDb, requirePilot, async (req, res) => {
  const { old_password, new_password } = req.body || {};
  if (!old_password || !new_password) return res.status(400).json({ error: 'Заполните оба поля' });
  if (String(new_password).length < 6) return res.status(400).json({ error: 'Новый пароль слишком короткий (мин. 6 символов)' });
  try {
    const p = await dbGet('SELECT * FROM pilots WHERE id=$1', 'SELECT * FROM pilots WHERE id=?', [req.session.pilotId]);
    if (!p || !bcrypt.compareSync(String(old_password), p.password_hash)) return res.status(401).json({ error: 'Текущий пароль неверен' });
    await dbRun('UPDATE pilots SET password_hash=$1 WHERE id=$2', 'UPDATE pilots SET password_hash=? WHERE id=?', [bcrypt.hashSync(String(new_password), 10), p.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Отчёты пилота
app.get('/api/pilot/reports', requireDb, requirePilot, async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT * FROM flight_reports WHERE pilot_id=$1 ORDER BY created_at DESC',
      'SELECT * FROM flight_reports WHERE pilot_id=? ORDER BY created_at DESC', [req.session.pilotId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/pilot/reports', requireDb, requirePilot, rateLimit(60000, 10), async (req, res) => {
  const b = req.body || {};
  const dur = parseInt(b.duration_min, 10);
  if (!b.departure || !b.arrival) return res.status(400).json({ error: 'Укажите аэропорт вылета и прилёта' });
  if (!dur || dur < 5 || dur > 900) return res.status(400).json({ error: 'Длительность рейса должна быть от 5 до 900 минут' });
  try {
    await dbRun(
      'INSERT INTO flight_reports (pilot_id, flight_number, departure, arrival, aircraft, duration_min, pax, landing_rate, comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      'INSERT INTO flight_reports (pilot_id, flight_number, departure, arrival, aircraft, duration_min, pax, landing_rate, comment) VALUES (?,?,?,?,?,?,?,?,?)',
      [req.session.pilotId, b.flight_number || null, b.departure, b.arrival, b.aircraft || null, dur,
       b.pax ? parseInt(b.pax, 10) : null, b.landing_rate ? parseInt(b.landing_rate, 10) : null, b.comment || null]
    );
    res.json({ success: true, message: 'Отчёт отправлен на проверку администратору' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/pilot/reports/:id', requireDb, requirePilot, async (req, res) => {
  try {
    const r = await dbRun(
      "DELETE FROM flight_reports WHERE id=$1 AND pilot_id=$2 AND status='pending'",
      "DELETE FROM flight_reports WHERE id=? AND pilot_id=? AND status='pending'",
      [req.params.id, req.session.pilotId]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Отчёт не найден или уже проверен' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Публичный лидерборд
app.get('/api/leaderboard', requireDb, async (req, res) => {
  try {
    const rows = await dbAll(
      "SELECT callsign, roblox_name, rank, total_minutes, total_flights FROM pilots WHERE status='active' ORDER BY total_minutes DESC, total_flights DESC LIMIT 50",
      "SELECT callsign, roblox_name, rank, total_minutes, total_flights FROM pilots WHERE status='active' ORDER BY total_minutes DESC, total_flights DESC LIMIT 50"
    );
    res.json(rows.map((p, i) => ({
      position: i + 1, callsign: p.callsign, roblox_name: p.roblox_name, rank: p.rank,
      total_hours: Math.round(((p.total_minutes || 0) / 60) * 10) / 10, total_flights: p.total_flights || 0
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ---------- АДМИН: пилоты и отчёты ---------- */
app.get('/api/admin/pilots', requireAuth, requireDb, async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM pilots ORDER BY total_minutes DESC, id ASC', 'SELECT * FROM pilots ORDER BY total_minutes DESC, id ASC');
    res.json(rows.map(publicPilot));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/pilots/:id', requireAuth, requireDb, async (req, res) => {
  const b = req.body || {};
  try {
    const p = await dbGet('SELECT * FROM pilots WHERE id=$1', 'SELECT * FROM pilots WHERE id=?', [req.params.id]);
    if (!p) return res.status(404).json({ error: 'Пилот не найден' });
    const minutes = b.total_minutes !== undefined ? Math.max(0, parseInt(b.total_minutes, 10) || 0) : p.total_minutes;
    const status = b.status || p.status;
    const rank = b.rank || rankForMinutes(minutes);
    await dbRun(
      'UPDATE pilots SET total_minutes=$1, status=$2, rank=$3 WHERE id=$4',
      'UPDATE pilots SET total_minutes=?, status=?, rank=? WHERE id=?', [minutes, status, rank, p.id]
    );
    res.json({ success: true, rank });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/pilots/:id/reset-password', requireAuth, requireDb, async (req, res) => {
  const { new_password } = req.body || {};
  if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: 'Пароль должен быть минимум 6 символов' });
  try {
    const r = await dbRun('UPDATE pilots SET password_hash=$1 WHERE id=$2', 'UPDATE pilots SET password_hash=? WHERE id=?', [bcrypt.hashSync(String(new_password), 10), req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Пилот не найден' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/pilots/:id', requireAuth, requireDb, async (req, res) => {
  try {
    await dbRun('DELETE FROM flight_reports WHERE pilot_id=$1', 'DELETE FROM flight_reports WHERE pilot_id=?', [req.params.id]);
    const r = await dbRun('DELETE FROM pilots WHERE id=$1', 'DELETE FROM pilots WHERE id=?', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Пилот не найден' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/reports', requireAuth, requireDb, async (req, res) => {
  try {
    const rows = await dbAll(
      'SELECT r.*, p.callsign, p.roblox_name, p.rank FROM flight_reports r JOIN pilots p ON p.id=r.pilot_id ORDER BY CASE WHEN r.status=\'pending\' THEN 0 ELSE 1 END, r.created_at DESC',
      'SELECT r.*, p.callsign, p.roblox_name, p.rank FROM flight_reports r JOIN pilots p ON p.id=r.pilot_id ORDER BY CASE WHEN r.status=\'pending\' THEN 0 ELSE 1 END, r.created_at DESC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Проверка отчёта: approved → часы начисляются, звание пересчитывается
app.put('/api/admin/reports/:id', requireAuth, requireDb, async (req, res) => {
  const { status, admin_comment } = req.body || {};
  if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ error: 'Недопустимый статус' });
  try {
    const rep = await dbGet('SELECT * FROM flight_reports WHERE id=$1', 'SELECT * FROM flight_reports WHERE id=?', [req.params.id]);
    if (!rep) return res.status(404).json({ error: 'Отчёт не найден' });
    const pilot = await dbGet('SELECT * FROM pilots WHERE id=$1', 'SELECT * FROM pilots WHERE id=?', [rep.pilot_id]);
    if (!pilot) return res.status(404).json({ error: 'Пилот не найден' });

    let minutes = pilot.total_minutes || 0;
    let flights = pilot.total_flights || 0;
    if (rep.status === 'approved' && status !== 'approved') { minutes -= rep.duration_min; flights -= 1; }
    if (rep.status !== 'approved' && status === 'approved') { minutes += rep.duration_min; flights += 1; }
    minutes = Math.max(0, minutes); flights = Math.max(0, flights);
    const newRank = rankForMinutes(minutes);

    await dbRun(
      'UPDATE flight_reports SET status=$1, admin_comment=$2, reviewed_at=CURRENT_TIMESTAMP WHERE id=$3',
      'UPDATE flight_reports SET status=?, admin_comment=?, reviewed_at=CURRENT_TIMESTAMP WHERE id=?',
      [status, admin_comment || null, rep.id]
    );
    await dbRun(
      'UPDATE pilots SET total_minutes=$1, total_flights=$2, rank=$3 WHERE id=$4',
      'UPDATE pilots SET total_minutes=?, total_flights=?, rank=? WHERE id=?', [minutes, flights, newRank, pilot.id]
    );
    res.json({ success: true, promoted: newRank !== pilot.rank, rank: newRank, total_hours: Math.round((minutes / 60) * 10) / 10 });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
