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

const SESSION_SECRET = process.env.SESSION_SECRET || 'swiss-airlines-va-secret-key-' + Math.random().toString(36);

/* ============================================================
   DATABASE SETUP
   ============================================================ */
let db, dbType;
const pgConn = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';

if (pgConn && pgConn.startsWith('postgres')) {
  const { Pool } = require('pg');
  db = new Pool({ connectionString: pgConn, ssl: { rejectUnauthorized: false } });
  dbType = 'postgres';
  console.log('🗄️  Using PostgreSQL');
} else {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database('./swiss_airlines.db');
  dbType = 'sqlite';
  console.log('🗄️  Using SQLite');
}

/* ============================================================
   MIDDLEWARE
   ============================================================ */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.static(path.join(__dirname, '.')));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  },
  name: 'swiss_session'
}));

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

/* ============================================================
   DATABASE INITIALIZATION
   ============================================================ */
async function initDb() {
  try {
    if (dbType === 'postgres') {
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
    }
    console.log('✅ Database initialized');
  } catch (err) {
    console.error('❌ Database initialization error:', err);
  }
}
initDb();

/* ============================================================
   AUTH MIDDLEWARE
   ============================================================ */
function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) { next(); }
  else { res.status(401).json({ error: 'Unauthorized' }); }
}

/* ============================================================
   HEALTH CHECK
   ============================================================ */
app.get('/api/health', async (req, res) => {
  try {
    let count = 0;
    if (dbType === 'postgres') {
      const result = await db.query('SELECT COUNT(*) as count FROM applications');
      count = parseInt(result.rows[0].count);
    } else {
      const row = await new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM applications', [], (err, r) => err ? reject(err) : resolve(r));
      });
      count = row ? row.count : 0;
    }
    res.json({ status: 'ok', db: dbType, applications_count: count, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('❌ [HEALTH] DB check failed:', err.message);
    res.status(500).json({ status: 'error', db: dbType, error: err.message });
  }
});

/* ============================================================
   PUBLIC API
   ============================================================ */
app.post('/api/submit', rateLimit(60000, 10), async (req, res) => {
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

  try {
    if (dbType === 'postgres') {
      const result = await db.query(
        `INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about]
      );
      res.json({ success: true, id: result.rows[0].id });
    } else {
      const stmt = db.prepare(`INSERT INTO applications (roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      stmt.run(roblox_name, char_age, real_age, experience, role, online_time, why_swiss, rules, fro, flight_minutes, telegram, about, function(err) {
        if (err) { stmt.finalize(); return res.status(500).json({ success: false, error: 'DB error: ' + err.message }); }
        res.json({ success: true, id: this.lastID });
        stmt.finalize();
      });
    }
  } catch (err) {
    console.error('❌ [SUBMIT] Error:', err);
    res.status(500).json({ success: false, error: 'Database error: ' + err.message });
  }
});

/* ============================================================
   PUBLIC CMS CONTENT API (read-only)
   ============================================================ */

// Events
app.get('/api/events', async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM events ORDER BY date DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM events ORDER BY date DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ events: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Routes
app.get('/api/routes', async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM routes ORDER BY origin, destination'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM routes ORDER BY origin, destination', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ routes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fleet
app.get('/api/fleet', async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM fleet ORDER BY category, model'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM fleet ORDER BY category, model', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ fleet: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Timeline
app.get('/api/timeline', async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM timeline ORDER BY year DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM timeline ORDER BY year DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ timeline: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN AUTH
   ============================================================ */
app.post('/api/login', rateLimit(60000, 5), (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
    req.session.isAdmin = true;
    req.session.username = username;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Неверный логин или пароль' });
  }
});

app.get('/api/me', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin, username: req.session.username || null });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

/* ============================================================
   ADMIN APPLICATIONS API
   ============================================================ */
app.get('/api/applications', requireAuth, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM applications ORDER BY created_at DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM applications ORDER BY created_at DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ applications: rows, user: { username: req.session.username || 'Администратор' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/applications/:id', requireAuth, async (req, res) => {
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
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/applications/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') { const result = await db.query('DELETE FROM applications WHERE id = $1', [id]); if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' }); }
    else { const result = await new Promise((resolve, reject) => db.run('DELETE FROM applications WHERE id = ?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); })); if (result.changes === 0) return res.status(404).json({ error: 'Not found' }); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    let total, n, accepted, rejected;
    if (dbType === 'postgres') {
      total = parseInt((await db.query('SELECT COUNT(*) as total FROM applications')).rows[0].total);
      n = parseInt((await db.query('SELECT COUNT(*) as count FROM applications WHERE status = $1', ['new'])).rows[0].count);
      accepted = parseInt((await db.query('SELECT COUNT(*) as count FROM applications WHERE status = $1', ['accepted'])).rows[0].count);
      rejected = parseInt((await db.query('SELECT COUNT(*) as count FROM applications WHERE status = $1', ['rejected'])).rows[0].count);
    } else {
      total = (await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as total FROM applications', [], (err, r) => err ? reject(err) : resolve(r)))).total;
      n = (await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as count FROM applications WHERE status = ?', ['new'], (err, r) => err ? reject(err) : resolve(r)))).count || 0;
      accepted = (await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as count FROM applications WHERE status = ?', ['accepted'], (err, r) => err ? reject(err) : resolve(r)))).count || 0;
      rejected = (await new Promise((resolve, reject) => db.get('SELECT COUNT(*) as count FROM applications WHERE status = ?', ['rejected'], (err, r) => err ? reject(err) : resolve(r)))).count || 0;
    }
    res.json({ total, new: n, accepted, rejected });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN CMS API — EVENTS (full CRUD)
   ============================================================ */
app.get('/api/admin/events', requireAuth, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM events ORDER BY date DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM events ORDER BY date DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ events: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/events', requireAuth, async (req, res) => {
  const { title, description, date, time, location, status, image_url } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date required' });
  try {
    if (dbType === 'postgres') {
      const r = await db.query('INSERT INTO events (title,description,date,time,location,status,image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [title, description, date, time, location, status || 'upcoming', image_url]);
      res.json({ success: true, id: r.rows[0].id });
    } else {
      db.run('INSERT INTO events (title,description,date,time,location,status,image_url) VALUES (?,?,?,?,?,?,?)', [title, description, date, time, location, status || 'upcoming', image_url], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
      });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/events/:id', requireAuth, async (req, res) => {
  const { id } = req.params; const { title, description, date, time, location, status, image_url } = req.body;
  try {
    if (dbType === 'postgres') {
      const r = await db.query('UPDATE events SET title=$1,description=$2,date=$3,time=$4,location=$5,status=$6,image_url=$7 WHERE id=$8', [title, description, date, time, location, status, image_url, id]);
      if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    } else {
      const r = await new Promise((resolve, reject) => db.run('UPDATE events SET title=?,description=?,date=?,time=?,location=?,status=?,image_url=? WHERE id=?', [title, description, date, time, location, status, image_url, id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); }));
      if (r.changes === 0) return res.status(404).json({ error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/events/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    if (dbType === 'postgres') { const r = await db.query('DELETE FROM events WHERE id=$1', [id]); if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' }); }
    else { const r = await new Promise((resolve, reject) => db.run('DELETE FROM events WHERE id=?', [id], function(err) { err ? reject(err) : resolve({ changes: this.changes }); })); if (r.changes === 0) return res.status(404).json({ error: 'Not found' }); }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN CMS API — ROUTES (read-only GET)
   ============================================================ */
app.get('/api/admin/routes', requireAuth, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM routes ORDER BY origin, destination'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM routes ORDER BY origin, destination', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ routes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN CMS API — FLEET (read-only GET, static in admin.html)
   ============================================================ */
app.get('/api/admin/fleet', requireAuth, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM fleet ORDER BY category, model'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM fleet ORDER BY category, model', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ fleet: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   ADMIN CMS API — TIMELINE (read-only GET)
   ============================================================ */
app.get('/api/admin/timeline', requireAuth, async (req, res) => {
  try {
    let rows;
    if (dbType === 'postgres') { const r = await db.query('SELECT * FROM timeline ORDER BY year DESC'); rows = r.rows; }
    else { rows = await new Promise((resolve, reject) => db.all('SELECT * FROM timeline ORDER BY year DESC', [], (err, r) => err ? reject(err) : resolve(r))); }
    res.json({ timeline: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ============================================================
   PUBLIC MAIL API
   ============================================================ */
app.get('/api/notifications', async (req, res) => {
  const { ptfs_nick } = req.query;
  if (!ptfs_nick) return res.status(400).json({ error: 'Ник не указан' });
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
   START SERVER
   ============================================================ */
const server = app.listen(PORT, () => {
  console.log(`✈️  Swiss Airlines server running on port ${PORT}`);
  console.log(`🗄️  Database: ${dbType.toUpperCase()}`);
  console.log(`📝 Public form: http://localhost:${PORT}`);
  console.log(`🔐 Admin panel: http://localhost:${PORT}/login.html`);
  console.log(`🔑 Default admin: ${ADMIN_USERNAME}`);
  console.log(`💡 To change credentials, set ADMIN_USERNAME and ADMIN_PASSWORD environment variables`);
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