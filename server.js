require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'Gregory';
const ADMIN_PASS = process.env.ADMIN_PASS || '123789';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.use(session({
  secret: process.env.SESSION_SECRET || 'swiss-v2-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24*60*60*1000 }
}));

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'));

function initDB() {
  db.exec(`
    DROP TABLE IF EXISTS fleet;
    DROP TABLE IF EXISTS routes;
    DROP TABLE IF EXISTS events;
    DROP TABLE IF EXISTS timeline;
    DROP TABLE IF EXISTS staff;
    DROP TABLE IF EXISTS users;

    CREATE TABLE fleet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aircraft TEXT NOT NULL,
      type TEXT NOT NULL,
      registration TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      range INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_number TEXT NOT NULL,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      distance INTEGER NOT NULL,
      duration TEXT NOT NULL,
      aircraft_type TEXT NOT NULL,
      days TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      location TEXT,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      discord TEXT,
      image TEXT,
      bio TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedData() {
  const fleet = [
    ['Airbus A320neo','Narrow-body','HB-JDA',180,3200,'Active','a320'],
    ['Airbus A321neo','Narrow-body','HB-JPA',220,3700,'Active','a321'],
    ['Airbus A330-300','Wide-body','HB-JHL',236,11300,'Active','a330'],
    ['Airbus A340-300','Wide-body','HB-JMF',219,13700,'Active','a340'],
    ['Boeing 777-300ER','Wide-body','HB-JND',340,14600,'Active','b777'],
    ['Airbus A220-300','Narrow-body','HB-JCB',145,3350,'Active','a220'],
    ['Boeing 747-8','Wide-body','HB-JQA',362,14800,'Active','b747'],
    ['Airbus A350-900','Wide-body','HB-JCA',325,15000,'Active','a350'],
    ['Airbus A380-800','Wide-body','HB-JJI',509,15700,'Maintenance','a380'],
    ['Bombardier CS100','Regional','HB-JBD',125,2960,'Active','cs100']
  ];
  fleet.forEach(row => {
    db.run('INSERT INTO fleet (aircraft, type, registration, capacity, range, status, image) VALUES (?,?,?,?,?,?,?)', row);
  });

  const routes = [
    ['LX14','Zurich','New York JFK',6500,'8h 45m','Airbus A330-300','Daily','Active'],
    ['LX18','Zurich','Chicago ORD',7100,'9h 30m','Boeing 777-300ER','Daily','Active'],
    ['LX40','Zurich','Los Angeles',9500,'11h 20m','Airbus A340-300','Daily','Active'],
    ['LX64','Zurich','Miami',8100,'10h 15m','Airbus A330-300','Mon Wed Fri Sat','Active'],
    ['LX92','Zurich','Sao Paulo',10000,'11h 50m','Airbus A350-900','Mon Thu Sat','Active'],
    ['LX242','Zurich','Dubai',2960,'6h 10m','Airbus A220-300','Daily','Active'],
    ['LX178','Zurich','Tokyo NRT',9600,'11h 30m','Airbus A350-900','Daily','Active'],
    ['LX138','Zurich','Singapore',10500,'12h 15m','Airbus A350-900','Daily','Active'],
    ['LX188','Zurich','Shanghai',9200,'11h 45m','Airbus A340-300','Mon Wed Fri','Active'],
    ['LX52','Zurich','Boston',6200,'8h 20m','Airbus A330-300','Daily','Active'],
    ['LX280','Zurich','Hong Kong',9200,'11h 30m','Airbus A350-900','Daily','Active'],
    ['LX220','Zurich','Johannesburg',5400,'10h 35m','Airbus A330-300','Mon Wed Fri','Active'],
    ['LX302','Zurich','Mumbai',4250,'7h 45m','Airbus A320neo','Tue Thu Sat','Active'],
    ['LX362','Zurich','Bangkok',8900,'10h 50m','Airbus A350-900','Daily','Active'],
    ['LX412','Zurich','Madrid',1250,'2h 15m','Airbus A220-300','Daily','Active'],
    ['LX432','Zurich','London LHR',800,'1h 40m','Airbus A320neo','Daily','Active'],
    ['LX452','Zurich','Paris CDG',490,'1h 15m','Airbus A220-300','Daily','Active'],
    ['LX472','Zurich','Frankfurt',300,'1h 00m','Airbus A320neo','Daily','Active'],
    ['LX482','Zurich','Amsterdam',600,'1h 35m','Airbus A220-300','Daily','Active'],
    ['LX502','Zurich','Rome FCO',740,'1h 35m','Airbus A320neo','Daily','Active'],
    ['LX522','Zurich','Barcelona',830,'1h 45m','Airbus A320neo','Daily','Active'],
    ['LX542','Zurich','Vienna',630,'1h 15m','Airbus A220-300','Daily','Active'],
    ['LX562','Zurich','Prague',580,'1h 20m','Airbus A220-300','Daily','Active'],
    ['LX582','Zurich','Athens',1700,'2h 45m','Airbus A320neo','Mon Wed Fri Sun','Active'],
    ['LX602','Zurich','Istanbul',1750,'2h 50m','Airbus A321neo','Daily','Active'],
    ['LX622','Zurich','Cairo',2700,'3h 45m','Airbus A320neo','Tue Thu Sat','Active'],
    ['LX642','Zurich','Tel Aviv',2800,'3h 50m','Airbus A320neo','Mon Wed Fri Sun','Active'],
    ['LX662','Zurich','Stockholm',1230,'2h 15m','Airbus A220-300','Daily','Active'],
    ['LX682','Zurich','Oslo',1250,'2h 20m','Airbus A220-300','Daily','Active'],
    ['LX702','Zurich','Copenhagen',950,'1h 50m','Airbus A220-300','Daily','Active'],
    ['LX722','Zurich','Lisbon',1750,'2h 50m','Airbus A320neo','Daily','Active'],
    ['LX742','Zurich','Dublin',1240,'2h 15m','Airbus A220-300','Daily','Active'],
    ['LX762','Zurich','Edinburgh',1250,'2h 20m','Airbus A220-300','Mon Thu Sat','Active']
  ];
  routes.forEach(row => {
    db.run('INSERT INTO routes (flight_number, origin, destination, distance, duration, aircraft_type, days, status) VALUES (?,?,?,?,?,?,?,?)', row);
  });

  const events = [
    ['Swiss VA Anniversary Event','Celebrate our 3rd year with special group flights and giveaways.','2026-09-15','Anniversary','Zurich Airport','anniversary'],
    ['Swiss Alpine Tour','Fly scenic routes across the Swiss Alps with special liveries.','2026-10-05','Tour','Geneva to Lugano','tour'],
    ['Night Fly-In Zurich','Overnight event at Zurich with custom ATC and prizes.','2026-11-12','Fly-In','Zurich Airport','flyin'],
    ['Christmas Special Flight','Holiday-themed flight to Lapland with all fleet.','2026-12-20','Special','Zurich to Rovaniemi','christmas'],
    ['New Year Group Flight','Ring in the new year with a transatlantic group flight.','2027-01-01','Group Flight','Zurich to New York','newyear'],
    ['VA Partnership Expo','Collaboration event with partner VAs across Europe.','2026-09-28','Expo','Discord','expo'],
    ['Swiss Precision Challenge','Landing challenge at Innsbruck with scoring.','2026-10-22','Challenge','Innsbruck','challenge'],
    ['European Tour Leg 1','First leg of our European capital tour series.','2026-11-05','Tour','Zurich to Vienna','tour']
  ];
  events.forEach(row => {
    db.run('INSERT INTO events (title, description, event_date, event_type, location, image) VALUES (?,?,?,?,?,?)', row);
  });

  const timeline = [
    [2023,'Foundation','Swiss Airlines VA was founded by Gregory with a vision for Swiss excellence in PTFS.','foundation'],
    [2023,'First Flight','Our inaugural flight from Zurich to London marked the beginning of operations.','flight'],
    [2024,'Fleet Expansion','Added Airbus A330 and A340 to enable long-haul operations across continents.','fleet'],
    [2024,'100th Flight','Reached milestone of 100 completed flights by our pilots.','milestone'],
    [2024,'Discord Community','Launched official Discord server with over 100 members joining in first month.','community'],
    [2025,'Intercontinental Routes','Opened routes to North America, Asia, and South America.','routes'],
    [2025,'Website Launch','Released first version of the Swiss VA website with flight logging.','website'],
    [2026,'V2.0 Relaunch','Completely redesigned website with modern Swiss design and full database integration.','rocket']
  ];
  timeline.forEach(row => {
    db.run('INSERT INTO timeline (year, title, description, icon) VALUES (?,?,?,?)', row);
  });

  const staff = [
    ['Gregory','CEO','Management','Gregory','gregory','Founder and CEO of Swiss Airlines VA, passionate about aviation and Swiss precision.'],
    ['Marco','COO','Operations','Marco','marco','Chief Operations Officer managing daily operations and route planning.'],
    ['Elena','Chief Pilot','Flight Operations','Elena','elena','Head of Flight Operations with over 500 logged flights.'],
    ['Lucas','Fleet Manager','Technical','Lucas','lucas','Responsible for fleet maintenance and aircraft acquisitions.'],
    ['Sophie','Events Coordinator','Events','Sophie','sophie','Organizes all VA events, tours, and community activities.'],
    ['Hans','Community Manager','Community','Hans','hans','Manages Discord and social media presence.']
  ];
  staff.forEach(row => {
    db.run('INSERT INTO staff (name, role, department, discord, image, bio) VALUES (?,?,?,?,?,?)', row);
  });

  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.run('INSERT INTO users (username, password, role) VALUES (?,?,?)', [ADMIN_USER, hash, 'admin']);
}

function setupAuth() {
  const hash = bcrypt.hashSync(ADMIN_PASS, 10);
  db.run('INSERT OR IGNORE INTO users (username, password, role) VALUES (?,?,?)', [ADMIN_USER, hash, 'admin']);
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ success: true, role: user.role });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });
  db.get('SELECT id, username, role FROM users WHERE id = ?', [req.session.userId], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ loggedIn: true, user });
  });
});

function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

app.get('/api/fleet', (req, res) => {
  db.all('SELECT * FROM fleet ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/fleet/:id', (req, res) => {
  db.get('SELECT * FROM fleet WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/fleet', requireAdmin, (req, res) => {
  const { aircraft, type, registration, capacity, range, status, image } = req.body;
  db.run('INSERT INTO fleet (aircraft, type, registration, capacity, range, status, image) VALUES (?,?,?,?,?,?,?)',
    [aircraft, type, registration, capacity, range, status || 'Active', image || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});
app.put('/api/fleet/:id', requireAdmin, (req, res) => {
  const { aircraft, type, registration, capacity, range, status, image } = req.body;
  db.run('UPDATE fleet SET aircraft=?, type=?, registration=?, capacity=?, range=?, status=?, image=? WHERE id=?',
    [aircraft, type, registration, capacity, range, status, image, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/fleet/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM fleet WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/routes', (req, res) => {
  db.all('SELECT * FROM routes ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/routes/:id', (req, res) => {
  db.get('SELECT * FROM routes WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/routes', requireAdmin, (req, res) => {
  const { flight_number, origin, destination, distance, duration, aircraft_type, days, status } = req.body;
  db.run('INSERT INTO routes (flight_number, origin, destination, distance, duration, aircraft_type, days, status) VALUES (?,?,?,?,?,?,?,?)',
    [flight_number, origin, destination, distance, duration, aircraft_type, days, status || 'Active'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});
app.put('/api/routes/:id', requireAdmin, (req, res) => {
  const { flight_number, origin, destination, distance, duration, aircraft_type, days, status } = req.body;
  db.run('UPDATE routes SET flight_number=?, origin=?, destination=?, distance=?, duration=?, aircraft_type=?, days=?, status=? WHERE id=?',
    [flight_number, origin, destination, distance, duration, aircraft_type, days, status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/routes/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM routes WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/events', (req, res) => {
  db.all('SELECT * FROM events ORDER BY event_date', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/events/:id', (req, res) => {
  db.get('SELECT * FROM events WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/events', requireAdmin, (req, res) => {
  const { title, description, event_date, event_type, location, image } = req.body;
  db.run('INSERT INTO events (title, description, event_date, event_type, location, image) VALUES (?,?,?,?,?,?)',
    [title, description, event_date, event_type, location, image || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});
app.put('/api/events/:id', requireAdmin, (req, res) => {
  const { title, description, event_date, event_type, location, image } = req.body;
  db.run('UPDATE events SET title=?, description=?, event_date=?, event_type=?, location=?, image=? WHERE id=?',
    [title, description, event_date, event_type, location, image, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/events/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM events WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/timeline', (req, res) => {
  db.all('SELECT * FROM timeline ORDER BY year', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/timeline/:id', (req, res) => {
  db.get('SELECT * FROM timeline WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/timeline', requireAdmin, (req, res) => {
  const { year, title, description, icon } = req.body;
  db.run('INSERT INTO timeline (year, title, description, icon) VALUES (?,?,?,?)',
    [year, title, description, icon || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});
app.put('/api/timeline/:id', requireAdmin, (req, res) => {
  const { year, title, description, icon } = req.body;
  db.run('UPDATE timeline SET year=?, title=?, description=?, icon=? WHERE id=?',
    [year, title, description, icon, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/timeline/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM timeline WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/staff', (req, res) => {
  db.all('SELECT * FROM staff ORDER BY id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/staff/:id', (req, res) => {
  db.get('SELECT * FROM staff WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/staff', requireAdmin, (req, res) => {
  const { name, role, department, discord, image, bio } = req.body;
  db.run('INSERT INTO staff (name, role, department, discord, image, bio) VALUES (?,?,?,?,?,?)',
    [name, role, department, discord, image || '', bio || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});
app.put('/api/staff/:id', requireAdmin, (req, res) => {
  const { name, role, department, discord, image, bio } = req.body;
  db.run('UPDATE staff SET name=?, role=?, department=?, discord=?, image=?, bio=? WHERE id=?',
    [name, role, department, discord, image, bio, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/staff/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM staff WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/stats', (req, res) => {
  db.get('SELECT COUNT(*) as fleet FROM fleet', [], (err, fleet) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get('SELECT COUNT(*) as routes FROM routes', [], (err, routes) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT COUNT(*) as events FROM events', [], (err, events) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ fleet: fleet.fleet, routes: routes.routes, events: events.events });
      });
    });
  });
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/fleet', (req, res) => res.sendFile(path.join(__dirname, 'fleet.html')));
app.get('/routes', (req, res) => res.sendFile(path.join(__dirname, 'routes.html')));
app.get('/map', (req, res) => res.sendFile(path.join(__dirname, 'map.html')));
app.get('/events', (req, res) => res.sendFile(path.join(__dirname, 'events.html')));
app.get('/history', (req, res) => res.sendFile(path.join(__dirname, 'history.html')));

app.listen(PORT, () => {
  console.log(`Swiss Airlines VA v2.0 running on port ${PORT}`);
});

initDB();
seedData();
