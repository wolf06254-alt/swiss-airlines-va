const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'swiss-airlines-va-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 86400000 }
}));

// ─── CRITICAL: Verify all HTML files exist on startup ───
const REQUIRED_FILES = [
  'index.html', 'events.html', 'history.html', 'apply.html',
  'login.html', 'admin.html'
];
console.log('=== SWISS Airlines VA Startup Check ===');
console.log('__dirname:', __dirname);
console.log('Files in project root:');
try {
  const files = fs.readdirSync(__dirname);
  files.forEach(f => console.log('  ', f));
  // Check subdirs
  ['views','public'].forEach(d => {
    const dp = path.join(__dirname, d);
    if (fs.existsSync(dp)) {
      console.log(d + '/ contents:');
      fs.readdirSync(dp).forEach(f => console.log('    ', f));
    }
  });
} catch(e) { console.log('Could not list files:', e.message); }

REQUIRED_FILES.forEach(f => {
  const p1 = path.join(__dirname, f);
  const p2 = path.join(__dirname, 'views', f);
  const p3 = path.join(__dirname, 'public', f);
  const exists = fs.existsSync(p1) || fs.existsSync(p2) || fs.existsSync(p3);
  if (!exists) {
    console.error('WARNING: File not found:', f, '(checked root, views/, public/)');
  } else {
    console.log('OK:', f);
  }
});
console.log('=======================================');

// ─── Helper: resolve file from any location ───
function resolveFile(name) {
  // Check root first, then views/, then public/
  const candidates = [
    path.join(__dirname, name),
    path.join(__dirname, 'views', name),
    path.join(__dirname, 'public', name)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  console.error('FILE NOT FOUND:', name, 'Checked:', candidates);
  return null;
}

// Serve static files from root (fallback)
app.use(express.static(__dirname));
// Also serve from views and public if they exist
const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(viewsDir)) app.use(express.static(viewsDir));
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

// ─── HTML Pages ───
app.get('/', (req, res) => {
  const f = resolveFile('index.html');
  if (f) return res.sendFile(f);
  res.status(404).send('index.html not found');
});
app.get('/events', (req, res) => {
  const f = resolveFile('events.html');
  if (f) return res.sendFile(f);
  res.status(404).send('events.html not found');
});
app.get('/history', (req, res) => {
  const f = resolveFile('history.html');
  if (f) return res.sendFile(f);
  res.status(404).send('history.html not found');
});
app.get('/apply', (req, res) => {
  const f = resolveFile('apply.html');
  if (f) return res.sendFile(f);
  res.status(404).send('apply.html not found');
});
app.get('/login', (req, res) => {
  const f = resolveFile('login.html');
  if (f) return res.sendFile(f);
  res.status(404).send('login.html not found');
});
app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login');
  const f = resolveFile('admin.html');
  if (f) return res.sendFile(f);
  res.status(404).send('admin.html not found');
});

// ─── Database (JSON file) ───
const DB_PATH = path.join(__dirname, 'data', 'db.json');
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify({
        events: [], history: [], applications: [], flights: [],
        siteBinding: { url: '', enabled: false, updated_at: null },
        users: [{ username: 'Gregory', password: bcrypt.hashSync('123789', 10), role: 'admin' }]
      }));
    }
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!Array.isArray(db.flights)) db.flights = [];
    if (!db.siteBinding) db.siteBinding = { url: '', enabled: false, updated_at: null };
    return db;
  } catch(e) {
    return {
      events: [], history: [], applications: [], flights: [],
      siteBinding: { url: '', enabled: false, updated_at: null },
      users: [{ username: 'Gregory', password: bcrypt.hashSync('123789', 10), role: 'admin' }]
    };
  }
}
function writeDB(db) { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
function isAdmin(req) { return req.session.user && req.session.user.role === 'admin'; }
function validateHttpUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password;
  } catch (e) { return false; }
}

// ─── Auth API ───
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Неверные данные' });
  }
  req.session.user = { username: user.username, role: user.role };
  res.json({ ok: true, username: user.username, role: user.role });
});
app.get('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Не авторизован' });
  res.json(req.session.user);
});

// ─── Events API ───
app.get('/api/events', (req, res) => { const db = readDB(); res.json(db.events || []); });
app.post('/api/events', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  const ev = { id: Date.now(), ...req.body, created_at: new Date().toISOString() };
  db.events.push(ev);
  writeDB(db);
  res.json(ev);
});
app.delete('/api/events/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  db.events = db.events.filter(e => e.id != req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ─── History API ───
app.get('/api/history', (req, res) => { const db = readDB(); res.json(db.history || []); });
app.post('/api/history', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  const h = { id: Date.now(), ...req.body };
  db.history.push(h);
  writeDB(db);
  res.json(h);
});
app.delete('/api/history/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  db.history = db.history.filter(h => h.id != req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ─── Applications API ───
app.get('/api/applications', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB(); res.json(db.applications || []);
});
app.post('/api/applications', (req, res) => {
  const db = readDB();
  const app = { id: Date.now(), ...req.body, status: 'pending', created_at: new Date().toISOString() };
  db.applications.push(app);
  writeDB(db);
  res.json({ ok: true, id: app.id });
});
app.patch('/api/applications/:id', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  const idx = db.applications.findIndex(a => a.id == req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Не найдена' });
  db.applications[idx] = { ...db.applications[idx], ...req.body };
  writeDB(db);
  res.json(db.applications[idx]);
});

// ─── Flight status binding API ───
const FLIGHT_STATUSES = ['skyboard', 'approaching', 'takeoff', 'preparing_landing', 'check_in', 'boarding', 'departed', 'landed', 'cancelled'];

app.get('/api/site-binding', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const { url, enabled, updated_at } = readDB().siteBinding;
  res.json({ url, enabled, updated_at });
});
app.put('/api/site-binding', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const url = String(req.body.url || '').trim();
  const enabled = req.body.enabled !== false;
  if (!validateHttpUrl(url)) {
    return res.status(400).json({ error: 'Укажите корректную ссылку с протоколом http:// или https://' });
  }
  const db = readDB();
  db.siteBinding = { url, enabled, updated_at: new Date().toISOString() };
  writeDB(db);
  res.json(db.siteBinding);
});

// Public, read-only contract for the linked site to poll.
app.get('/api/flights/statuses', (req, res) => {
  const db = readDB();
  res.json({
    updated_at: new Date().toISOString(),
    binding: db.siteBinding.enabled ? { url: db.siteBinding.url } : null,
    statuses: db.siteBinding.enabled ? db.flights : []
  });
});
app.get('/api/flight-statuses', (req, res) => res.redirect(308, '/api/flights/statuses'));

app.get('/api/flights', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  res.json(readDB().flights);
});
app.post('/api/flights', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const flightNumber = String(req.body.flight_number || '').trim();
  const status = String(req.body.status || '').trim();
  if (!flightNumber || !FLIGHT_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Номер рейса и допустимый статус обязательны' });
  }
  const db = readDB();
  const flight = {
    id: Date.now(),
    flight_number: flightNumber,
    departure: String(req.body.departure || '').trim(),
    arrival: String(req.body.arrival || '').trim(),
    status,
    updated_at: new Date().toISOString()
  };
  db.flights.push(flight);
  writeDB(db);
  res.status(201).json(flight);
});
app.patch('/api/flights/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  const idx = db.flights.findIndex(f => f.id == req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Рейс не найден' });
  if (req.body.status !== undefined && !FLIGHT_STATUSES.includes(req.body.status)) {
    return res.status(400).json({ error: 'Недопустимый статус рейса' });
  }
  db.flights[idx] = {
    ...db.flights[idx],
    ...req.body,
    updated_at: new Date().toISOString()
  };
  writeDB(db);
  res.json(db.flights[idx]);
});
app.delete('/api/flights/:id', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Доступ запрещён' });
  const db = readDB();
  db.flights = db.flights.filter(f => f.id != req.params.id);
  writeDB(db);
  res.json({ ok: true });
});

// ─── Start ───
app.listen(PORT, () => console.log(`SWISS Airlines VA running on port ${PORT}`));
