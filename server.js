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
    DROP TABLE IF EXISTS applications;
    DROP TABLE IF EXISTS contacts;

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

    CREATE TABLE applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      callsign TEXT NOT NULL,
      discord TEXT NOT NULL,
      email TEXT NOT NULL,
      age TEXT NOT NULL,
      experience TEXT,
      ptfs_hours TEXT,
      why_join TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedData() {
  const fleet = [
    ['Airbus A220-100','Narrow-body','HB-JBA',125,3350,'Active','a220'],
    ['Airbus A220-300','Narrow-body','HB-JCB',145,3350,'Active','a220'],
    ['Airbus A320-200','Narrow-body','HB-IJL',168,3200,'Active','a320'],
    ['Airbus A320neo','Narrow-body','HB-JDA',180,3700,'Active','a320'],
    ['Airbus A321-100','Narrow-body','HB-IOH',200,3500,'Active','a321'],
    ['Airbus A321-200','Narrow-body','HB-IOK',210,3700,'Active','a321'],
    ['Airbus A321neo','Narrow-body','HB-JPA',220,4000,'Active','a321'],
    ['Airbus A330-300','Wide-body','HB-JHL',236,11300,'Active','a330'],
    ['Airbus A340-300','Wide-body','HB-JMF',219,13700,'Active','a340'],
    ['Airbus A350-900','Wide-body','HB-JCA',325,15000,'Active','a350'],
    ['Boeing 777-300ER','Wide-body','HB-JND',340,14600,'Active','b777'],
    ['Boeing 747-8F','Cargo','HB-JQA',0,14800,'Active','b747f'],
    ['ATR 72-600','Regional','HB-ACB',72,900,'Active','atr72']
  ];
  fleet.forEach(row => {
    db.run('INSERT INTO fleet (aircraft, type, registration, capacity, range, status, image) VALUES (?,?,?,?,?,?,?)', row);
  });

  const routes = [
    ['LX14','Zurich (ZRH)','New York JFK (JFK)',6500,'8h 45m','Airbus A330-300','Daily','Active'],
    ['LX18','Zurich (ZRH)','Chicago ORD (ORD)',7100,'9h 30m','Boeing 777-300ER','Daily','Active'],
    ['LX40','Zurich (ZRH)','Los Angeles (LAX)',9500,'11h 20m','Airbus A340-300','Daily','Active'],
    ['LX52','Zurich (ZRH)','Boston (BOS)',6200,'8h 20m','Airbus A330-300','Daily','Active'],
    ['LX64','Zurich (ZRH)','Miami (MIA)',8100,'10h 15m','Airbus A330-300','Mon Wed Fri Sat','Active'],
    ['LX92','Zurich (ZRH)','Sao Paulo (GRU)',10000,'11h 50m','Airbus A350-900','Mon Thu Sat','Active'],
    ['LX178','Zurich (ZRH)','Tokyo Narita (NRT)',9600,'11h 30m','Airbus A350-900','Daily','Active'],
    ['LX188','Zurich (ZRH)','Shanghai (PVG)',9200,'11h 45m','Airbus A340-300','Mon Wed Fri','Active'],
    ['LX138','Zurich (ZRH)','Singapore (SIN)',10500,'12h 15m','Airbus A350-900','Daily','Active'],
    ['LX280','Zurich (ZRH)','Hong Kong (HKG)',9200,'11h 30m','Airbus A350-900','Daily','Active'],
    ['LX220','Zurich (ZRH)','Johannesburg (JNB)',5400,'10h 35m','Airbus A330-300','Mon Wed Fri','Active'],
    ['LX362','Zurich (ZRH)','Bangkok (BKK)',8900,'10h 50m','Airbus A350-900','Daily','Active'],
    ['LX302','Zurich (ZRH)','Mumbai (BOM)',4250,'7h 45m','Airbus A320neo','Tue Thu Sat','Active'],
    ['LX242','Zurich (ZRH)','Dubai (DXB)',2960,'6h 10m','Airbus A220-300','Daily','Active'],
    ['LX622','Zurich (ZRH)','Cairo (CAI)',2700,'3h 45m','Airbus A320neo','Tue Thu Sat','Active'],
    ['LX642','Zurich (ZRH)','Tel Aviv (TLV)',2800,'3h 50m','Airbus A320neo','Mon Wed Fri Sun','Active'],
    ['LX412','Zurich (ZRH)','Madrid (MAD)',1250,'2h 15m','Airbus A220-300','Daily','Active'],
    ['LX432','Zurich (ZRH)','London Heathrow (LHR)',800,'1h 40m','Airbus A320neo','Daily','Active'],
    ['LX452','Zurich (ZRH)','Paris CDG (CDG)',490,'1h 15m','Airbus A220-300','Daily','Active'],
    ['LX472','Zurich (ZRH)','Frankfurt (FRA)',300,'1h 00m','Airbus A320neo','Daily','Active'],
    ['LX482','Zurich (ZRH)','Amsterdam (AMS)',600,'1h 35m','Airbus A220-300','Daily','Active'],
    ['LX502','Zurich (ZRH)','Rome FCO (FCO)',740,'1h 35m','Airbus A320neo','Daily','Active'],
    ['LX522','Zurich (ZRH)','Barcelona (BCN)',830,'1h 45m','Airbus A320neo','Daily','Active'],
    ['LX542','Zurich (ZRH)','Vienna (VIE)',630,'1h 15m','Airbus A220-300','Daily','Active'],
    ['LX562','Zurich (ZRH)','Prague (PRG)',580,'1h 20m','Airbus A220-300','Daily','Active'],
    ['LX582','Zurich (ZRH)','Athens (ATH)',1700,'2h 45m','Airbus A320neo','Mon Wed Fri Sun','Active'],
    ['LX602','Zurich (ZRH)','Istanbul (IST)',1750,'2h 50m','Airbus A321neo','Daily','Active'],
    ['LX662','Zurich (ZRH)','Stockholm (ARN)',1230,'2h 15m','Airbus A220-300','Daily','Active'],
    ['LX682','Zurich (ZRH)','Oslo (OSL)',1250,'2h 20m','Airbus A220-300','Daily','Active'],
    ['LX702','Zurich (ZRH)','Copenhagen (CPH)',950,'1h 50m','Airbus A220-300','Daily','Active'],
    ['LX722','Zurich (ZRH)','Lisbon (LIS)',1750,'2h 50m','Airbus A320neo','Daily','Active'],
    ['LX742','Zurich (ZRH)','Dublin (DUB)',1240,'2h 15m','Airbus A220-300','Daily','Active'],
    ['LX762','Zurich (ZRH)','Edinburgh (EDI)',1250,'2h 20m','Airbus A220-300','Mon Thu Sat','Active'],
    ['LX782','Zurich (ZRH)','Geneva (GVA)',230,'0h 50m','Airbus A220-100','Daily','Active'],
    ['LX802','Zurich (ZRH)','Lugano (LUG)',170,'0h 45m','ATR 72-600','Daily','Active'],
    ['LX822','Geneva (GVA)','London Heathrow (LHR)',760,'1h 35m','Airbus A320neo','Daily','Active'],
    ['LX842','Geneva (GVA)','Paris CDG (CDG)',420,'1h 10m','Airbus A220-300','Daily','Active'],
    ['LX862','Geneva (GVA)','Barcelona (BCN)',650,'1h 30m','Airbus A320neo','Daily','Active'],
    ['LX882','Geneva (GVA)','Madrid (MAD)',1050,'2h 00m','Airbus A220-300','Daily','Active'],
    ['LX902','Geneva (GVA)','Rome FCO (FCO)',720,'1h 30m','Airbus A320neo','Daily','Active'],
    ['LX922','Geneva (GVA)','Frankfurt (FRA)',470,'1h 10m','Airbus A320neo','Daily','Active'],
    ['LX942','Geneva (GVA)','Munich (MUC)',510,'1h 15m','Airbus A220-300','Daily','Active'],
    ['LX962','Geneva (GVA)','Vienna (VIE)',820,'1h 40m','Airbus A220-300','Daily','Active'],
    ['LX982','Geneva (GVA)','Amsterdam (AMS)',710,'1h 40m','Airbus A320neo','Daily','Active']
  ];
  routes.forEach(row => {
    db.run('INSERT INTO routes (flight_number, origin, destination, distance, duration, aircraft_type, days, status) VALUES (?,?,?,?,?,?,?,?)', row);
  });

  const events = [
    ['Юбилей Swiss VA','Празднуем 3-й год существования! Особые групповые полеты и призы.','2026-09-15','Anniversary','Аэропорт Цюрих','anniversary'],
    ['Тур по Швейцарским Альпам','Полеты над Альпами с эксклюзивными ливреями.','2026-10-05','Tour','Женева — Лугано','tour'],
    ['Ночной Fly-In Цюрих','Ночное мероприятие с ATC и призами.','2026-11-12','Fly-In','Аэропорт Цюрих','flyin'],
    ['Рождественский Специальный Рейс','Праздничный полет в Лапландию.','2026-12-20','Special','Цюрих — Рованиеми','christmas'],
    ['Новогодний Групповой Полет','Встречаем новый год трансатлантическим перелетом.','2027-01-01','Group Flight','Цюрих — Нью-Йорк','newyear'],
    ['Expo Партнерских VA','Совместное мероприятие с партнерскими авиакомпаниями.','2026-09-28','Expo','Discord','expo'],
    ['Swiss Precision Challenge','Посадочный челлендж в Инсбруке.','2026-10-22','Challenge','Инсбрук','challenge'],
    ['Европейский Тур — Этап 1','Первый этап тура по столицам Европы.','2026-11-05','Tour','Цюрих — Вена','tour']
  ];
  events.forEach(row => {
    db.run('INSERT INTO events (title, description, event_date, event_type, location, image) VALUES (?,?,?,?,?,?)', row);
  });

  const timeline = [
    [1931,'Основание Swissair','Swissair создана 26 марта 1931 года слиянием Balair и Ad Astra Aero. Первая европейская авиакомпания с Lockheed Orion.','plane'],
    [1932,'Первые европейские рейсы','Swissair становится первой европейской авиакомпанией, использующей Lockheed Orion для регулярных рейсов.','flight'],
    [1949,'Трансатлантические рейсы','Начало регулярных рейсов между Швейцарией и Нью-Йорком.','globe'],
    [1950,'Рейсы в Южную Америку','Открытие маршрутов в Южную Америку.','map'],
    [1971,'Эра Boeing 747','Boeing 747-257B (HB-IGA) официально вступает в флот Swissair — новая эра дальнемагистральных перелетов.','jet'],
    [1981,'Первый Airbus A310','Swissair получает первый Airbus A310 — начало эры Airbus.','plane'],
    [1995,'Флот Airbus A320','Ввод в эксплуатацию Airbus A320 — модернизация европейского флота.','plane'],
    [2001,'Банкротство Swissair','Swissair объявляет банкротство в октябре 2001 года с долгом $7.9 млрд. Конец эпохи.','times'],
    [2002,'Рождение SWISS','Swiss International Air Lines (SWISS) создана на базе Crossair. Первый рейс 31 марта 2002 года из Базеля в Цюрих.','rocket'],
    [2004,'Отказ от oneworld','SWISS отказывается от вступления в альянс oneworld из-за напряженности с British Airways.','times'],
    [2005,'Партнерство с Lufthansa','Lufthansa приобретает 11% акций SWISS, начинается интеграция в группу.','handshake'],
    [2006,'Star Alliance','SWISS вступает в Star Alliance и программу Miles & More.','star'],
    [2007,'Полное поглощение','Lufthansa завершает поглощение SWISS. Авиакомпания становится частью Lufthansa Group.','building'],
    [2008,'Приобретение Edelweiss','SWISS приобретает Edelweiss Air — дочернюю авиакомпанию для чартерных рейсов.','plane'],
    [2011,'Новый бренд','SWISS обновляет ливрею: красные заглавные буквы на фюзеляже, удаление списка языков.','paint'],
    [2015,'Swiss Global Airlines','Региональная дочерняя компания переименована в Swiss Global Airlines, начинает эксплуатацию Boeing 777.','jet'],
    [2018,'Объединение с основной компанией','Swiss Global Airlines объединена с основной SWISS после нового трудового соглашения.','building'],
    [2022,'20-летие SWISS','SWISS отмечает 20-летие с момента первого рейса 31 марта 2002 года.','anniversary'],
    [2023,'Заказ A350-900','SWISS заказывает Airbus A350-900 для замены устаревших A340 к 2025 году.','plane']
  ];
  timeline.forEach(row => {
    db.run('INSERT INTO timeline (year, title, description, icon) VALUES (?,?,?,?)', row);
  });

  const staff = [
    ['Gregory','CEO','Management','Gregory','gregory','Основатель и CEO Swiss Airlines VA. Страстный авиатор и поклонник швейцарской точности.'],
    ['Marco','COO','Operations','Marco','marco','Операционный директор, управляющий ежедневными полетами и планированием маршрутов.'],
    ['Elena','Chief Pilot','Flight Operations','Elena','elena','Главный пилот с более чем 500 выполненными рейсами.'],
    ['Lucas','Fleet Manager','Technical','Lucas','lucas','Ответственный за техническое обслуживание флота и закупку самолетов.'],
    ['Sophie','Events Coordinator','Events','Sophie','sophie','Организатор всех мероприятий, туров и активностей сообщества.'],
    ['Hans','Community Manager','Community','Hans','hans','Управляет Discord и присутствием в социальных сетях.']
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
    if (!user) return res.status(401).json({ error: 'Неверные учетные данные' });
    if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Неверные учетные данные' });
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
    return res.status(403).json({ error: 'Доступ запрещен' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Требуется авторизация' });
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

app.get('/api/applications', requireAdmin, (req, res) => {
  db.all('SELECT * FROM applications ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/applications/:id', requireAdmin, (req, res) => {
  db.get('SELECT * FROM applications WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/apply', (req, res) => {
  const { callsign, discord, email, age, experience, ptfs_hours, why_join } = req.body;
  db.run('INSERT INTO applications (callsign, discord, email, age, experience, ptfs_hours, why_join, status) VALUES (?,?,?,?,?,?,?,?)',
    [callsign, discord, email, age || '', experience || '', ptfs_hours || '', why_join, 'pending'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Анкета отправлена! Мы свяжемся с вами в Discord.' });
    });
});
app.post('/api/applications', (req, res) => {
  const { callsign, discord, email, age, experience, ptfs_hours, why_join } = req.body;
  db.run('INSERT INTO applications (callsign, discord, email, age, experience, ptfs_hours, why_join, status) VALUES (?,?,?,?,?,?,?,?)',
    [callsign, discord, email, age || '', experience || '', ptfs_hours || '', why_join, 'pending'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Анкета отправлена! Мы свяжемся с вами в Discord.' });
    });
});
app.put('/api/applications/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.run('UPDATE applications SET status=? WHERE id=?',
    [status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/applications/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM applications WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ deleted: this.changes });
  });
});

app.get('/api/contacts', requireAdmin, (req, res) => {
  db.all('SELECT * FROM contacts ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});
app.get('/api/contacts/:id', requireAdmin, (req, res) => {
  db.get('SELECT * FROM contacts WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  db.run('INSERT INTO contacts (name, email, subject, message, status) VALUES (?,?,?,?,?)',
    [name, email, subject, message, 'new'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Сообщение отправлено! Мы ответим вам в ближайшее время.' });
    });
});
app.post('/api/contacts', (req, res) => {
  const { name, email, subject, message } = req.body;
  db.run('INSERT INTO contacts (name, email, subject, message, status) VALUES (?,?,?,?,?)',
    [name, email, subject, message, 'new'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: 'Сообщение отправлено! Мы ответим вам в ближайшее время.' });
    });
});
app.put('/api/contacts/:id', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.run('UPDATE contacts SET status=? WHERE id=?',
    [status, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    });
});
app.delete('/api/contacts/:id', requireAdmin, (req, res) => {
  db.run('DELETE FROM contacts WHERE id=?', [req.params.id], function(err) {
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
        db.get('SELECT COUNT(*) as applications FROM applications', [], (err, applications) => {
          if (err) return res.status(500).json({ error: err.message });
          db.get('SELECT COUNT(*) as contacts FROM contacts', [], (err, contacts) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ fleet: fleet.fleet, routes: routes.routes, events: events.events, applications: applications.applications, contacts: contacts.contacts });
          });
        });
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
app.get('/apply', (req, res) => res.sendFile(path.join(__dirname, 'apply.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'contact.html')));

app.listen(PORT, () => {
  console.log(`Swiss Airlines VA v2.0 running on port ${PORT}`);
});

initDB();
seedData();
