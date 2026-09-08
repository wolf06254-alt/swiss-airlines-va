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

// Serve static files (for login.html, admin.html etc)
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database (JSON file) ───
const DB_PATH = path.join(__dirname, 'data', 'db.json');
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
      fs.writeFileSync(DB_PATH, JSON.stringify({ events: [], history: [], applications: [], users: [{ username: 'Gregory', password: bcrypt.hashSync('123789', 10), role: 'admin' }] }));
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch(e) { return { events: [], history: [], applications: [], users: [{ username: 'Gregory', password: bcrypt.hashSync('123789', 10), role: 'admin' }] }; }
}
function writeDB(db) { fs.mkdirSync(path.dirname(DB_PATH), { recursive: true }); fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

// ─── HTML Pages (from /views) ───
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'index.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'views', 'events.html')));
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, 'views', 'history.html')));
app.get('/apply', (req, res) => res.sendFile(path.join(__dirname, 'views', 'apply.html')));

// ─── Auth ───
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
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

// ─── Admin ───
app.get('/admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

// ─── Start ───
app.listen(PORT, () => console.log(`SWISS Airlines VA running on port ${PORT}`));
