require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USERNAME || 'Gregory';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || '123789';
const SESSION_SECRET = process.env.SESSION_SECRET || 'swiss-secret-2026';

const tokens = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname)));

const db = new sqlite3.Database(path.join(__dirname, 'database.sqlite'), (err) => {
  if (err) console.error('DB error:', err);
  else console.log('SQLite connected');
});

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDB() {
  await dbRun(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, age INTEGER, platform TEXT, username TEXT, discord TEXT,
    country TEXT, experience TEXT, hours TEXT, motivation TEXT,
    status TEXT DEFAULT 'Новая', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS fleet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL, manufacturer TEXT, category TEXT, capacity TEXT,
    range_km INTEGER, speed_kmh INTEGER, status TEXT DEFAULT 'active',
    description TEXT, image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS routes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    origin TEXT NOT NULL, origin_code TEXT, destination TEXT NOT NULL, destination_code TEXT,
    distance_km INTEGER, duration_min INTEGER, aircraft_type TEXT, frequency TEXT,
    notes TEXT, active INTEGER DEFAULT 1,
    origin_lat REAL, origin_lon REAL, dest_lat REAL, dest_lon REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, date TEXT, description TEXT, image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER, title TEXT, description TEXT, icon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('DB tables ready');
  await seedData();
}

async function seedData() {
  const fleetCount = await dbAll('SELECT COUNT(*) as c FROM fleet');
  if (fleetCount[0].c === 0) {
    const fleet = [
      ['Airbus A220-100','Airbus','Региональный','125','3350','829','active','Региональный самолёт для коротких маршрутов по Европе.',''],
      ['Airbus A220-300','Airbus','Региональный','145','3350','829','active','Увеличенная версия A220 для плотных европейских направлений.',''],
      ['Airbus A319','Airbus','Узкофюзеляжный','138','6800','828','active','Классический европейский самолёт средней дальности.',''],
      ['Airbus A320neo','Airbus','Узкофюзеляжный','180','6300','828','active','Новое поколение A320 с топливной эффективностью на 15% выше.',''],
      ['Airbus A321neo','Airbus','Узкофюзеляжный','219','7400','828','active','Удлинённая версия A320neo для высоких нагрузок.',''],
      ['Airbus A330-300','Airbus','Широкофюзеляжный','236','11300','871','active','Дальнемагистральный широкофюзеляжник для трансатлантики.',''],
      ['Airbus A340-300','Airbus','Широкофюзеляжный','219','13700','871','active','Классический четырёхдвигательный лайнер для дальних рейсов.',''],
      ['Boeing 777-300ER','Boeing','Широкофюзеляжный','340','13650','892','active','Флагман дальнемагистрального флота Swiss.',''],
      ['Boeing 787-9','Boeing','Широкофюзеляжный','290','14010','903','active','Сверхэффективный Dreamliner для дальних маршрутов.',''],
      ['Bombardier CS100','Bombardier','Региональный','108','3100','828','active','Компактный региональный самолёт для небольших аэропортов.','']
    ];
    for (const f of fleet) {
      await dbRun(`INSERT INTO fleet (model,manufacturer,category,capacity,range_km,speed_kmh,status,description,image_url) VALUES (?,?,?,?,?,?,?,?,?)`, f);
    }
    console.log('Fleet seeded');
  }

  const routesCount = await dbAll('SELECT COUNT(*) as c FROM routes');
  if (routesCount[0].c === 0) {
    const routes = [
      ['Цюрих','ZRH','Женева','GVA',230,55,'A220-100','Ежедневно','Внутренний рейс',47.4647,8.5492,46.2380,6.1089],
      ['Цюрих','ZRH','Лондон','LHR',788,110,'A320neo','Ежедневно','Основной европейский хаб',47.4647,8.5492,51.4700,-0.4543],
      ['Цюрих','ZRH','Париж','CDG',478,85,'A220-300','Ежедневно','Популярное направление',47.4647,8.5492,49.0097,2.5479],
      ['Цюрих','ZRH','Амстердам','AMS',603,95,'A320neo','Ежедневно','Европейский хаб',47.4647,8.5492,52.3105,4.7683],
      ['Цюрих','ZRH','Франкфурт','FRA',285,60,'A220-100','Ежедневно','Короткий рейс',47.4647,8.5492,50.0379,8.5622],
      ['Цюрих','ZRH','Мюнхен','MUC',261,55,'A220-100','Ежедневно','Близкий сосед',47.4647,8.5492,48.3538,11.7861],
      ['Цюрих','ZRH','Вена','VIE',604,95,'A320neo','Ежедневно','Австрийское направление',47.4647,8.5492,48.1103,16.5697],
      ['Цюрих','ZRH','Милан','MXP',203,50,'A220-100','Ежедневно','Итальянский рейс',47.4647,8.5492,45.6301,8.7231],
      ['Цюрих','ZRH','Рим','FCO',700,105,'A320neo','Ежедневно','В Италию',47.4647,8.5492,41.8003,12.2389],
      ['Цюрих','ZRH','Мадрид','MAD',1236,155,'A321neo','Ежедневно','Испанское направление',47.4647,8.5492,40.4983,-3.5676],
      ['Цюрих','ZRH','Лиссабон','LIS',1723,185,'A321neo','Ежедневно','Португалия',47.4647,8.5492,38.7756,-9.1354],
      ['Цюрих','ZRH','Брюссель','BRU',483,80,'A220-300','Ежедневно','Бельгия',47.4647,8.5492,50.9010,4.4844],
      ['Цюрих','ZRH','Прага','PRG',560,90,'A220-300','Ежедневно','Чехия',47.4647,8.5492,50.1008,14.2632],
      ['Цюрих','ZRH','Берлин','BER',669,100,'A320neo','Ежедневно','Немецкая столица',47.4647,8.5492,52.3667,13.5033],
      ['Цюрих','ZRH','Копенгаген','CPH',959,120,'A320neo','Ежедневно','Дания',47.4647,8.5492,55.6180,12.6560],
      ['Цюрих','ZRH','Стокгольм','ARN',1496,155,'A321neo','Ежедневно','Швеция',47.4647,8.5492,59.6519,17.9186],
      ['Цюрих','ZRH','Осло','OSL',1420,150,'A321neo','Ежедневно','Норвегия',47.4647,8.5492,60.1939,11.1004],
      ['Цюрих','ZRH','Хельсинки','HEL',1777,175,'A321neo','Ежедневно','Финляндия',47.4647,8.5492,60.3172,24.9633],
      ['Цюрих','ZRH','Дубай','DXB',4770,330,'B777-300ER','Ежедневно','Ближний Восток',47.4647,8.5492,25.2532,55.3657],
      ['Цюрих','ZRH','Тель-Авив','TLV',2814,245,'A330-300','Ежедневно','Израиль',47.4647,8.5492,32.0055,34.8854],
      ['Цюрих','ZRH','Нью-Йорк','JFK',6342,510,'B777-300ER','Ежедневно','Трансатлантика',47.4647,8.5492,40.6413,-73.7781],
      ['Цюрих','ZRH','Майами','MIA',7885,640,'B777-300ER','Ежедневно','США — юг',47.4647,8.5492,25.7959,-80.2870],
      ['Цюрих','ZRH','Лос-Анджелес','LAX',9539,750,'B787-9','Ежедневно','США — запад',47.4647,8.5492,33.9416,-118.4085],
      ['Цюрих','ZRH','Сан-Франциско','SFO',9360,740,'B787-9','Ежедневно','Калифорния',47.4647,8.5492,37.6213,-122.3790],
      ['Цюрих','ZRH','Бостон','BOS',5992,485,'A330-300','Ежедневно','США — восток',47.4647,8.5492,42.3656,-71.0096],
      ['Цюрих','ZRH','Сингапур','SIN',10328,795,'B787-9','Ежедневно','Дальний Восток',47.4647,8.5492,1.3644,103.9915],
      ['Цюрих','ZRH','Бангкок','BKK',9094,715,'B777-300ER','Ежедневно','Таиланд',47.4647,8.5492,13.6900,100.7501],
      ['Цюрих','ZRH','Токио','NRT',9572,755,'B787-9','Ежедневно','Япония',47.4647,8.5492,35.7647,140.3864],
      ['Цюрих','ZRH','Пекин','PEK',8005,650,'A340-300','Ежедневно','Китай',47.4647,8.5492,40.0799,116.6031],
      ['Цюрих','ZRH','Шанхай','PVG',8922,710,'A340-300','Ежедневно','Китай',47.4647,8.5492,31.1443,121.8083],
      ['Цюрих','ZRH','Мумбаи','BOM',6486,525,'A330-300','Ежедневно','Индия',47.4647,8.5492,19.0896,72.8656],
      ['Женева','GVA','Лондон','LHR',755,105,'A220-300','Ежедневно','Из Женевы',46.2380,6.1089,51.4700,-0.4543],
      ['Женева','GVA','Париж','CDG',411,75,'A220-100','Ежедневно','Из Женевы',46.2380,6.1089,49.0097,2.5479]
    ];
    for (const r of routes) {
      await dbRun(`INSERT INTO routes (origin,origin_code,destination,destination_code,distance_km,duration_min,aircraft_type,frequency,notes,active,origin_lat,origin_lon,dest_lat,dest_lon) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, r);
    }
    console.log('Routes seeded');
  }

  const eventsCount = await dbAll('SELECT COUNT(*) as c FROM events');
  if (eventsCount[0].c === 0) {
    const events = [
      ['Групповой полёт: Цюрих — Нью-Йорк','2026-08-20','Совместный трансатлантический рейс на B777-300ER. Приглашаются все пилоты VA.',''],
      ['Тренировка: Посадка в Женеве','2026-08-25','Практика захода на посадку в сложных метеоусловиях.',''],
      ['Ивент: Swiss Precision Challenge','2026-09-05','Соревнование по точности приземления. Призы за топ-3.',''],
      ['Групповой полёт: Европейский тур','2026-09-12','Цепочка рейсов по 5 европейским столицам за один день.',''],
      ['Специальный рейс: День авиации','2026-09-27','Праздничный рейс с эксклюзивным расписанием и ливреями.',''],
      ['Ночной полёт: Цюрих — Дубай','2026-10-10','Ночной вылет с полной процедурой FMC и VATSIM.',''],
      ['Турнир: Crosswind Masters','2026-10-18','Соревнование по посадке с боковым ветром.',''],
      ['Групповой полёт: Тихоокеанский маршрут','2026-11-01','Дальний рейс Цюрих — Лос-Анджелес в составе каравана.','']
    ];
    for (const e of events) {
      await dbRun(`INSERT INTO events (title,date,description,image_url) VALUES (?,?,?,?)`, e);
    }
    console.log('Events seeded');
  }

  const timelineCount = await dbAll('SELECT COUNT(*) as c FROM timeline');
  if (timelineCount[0].c === 0) {
    const timeline = [
      [2023,'Основание VA','Gregory основал Swiss Airlines VA для PTFS. Первые 5 пилотов присоединились к проекту.','🛫'],
      [2023,'Первый рейс','Выполнен первый официальный рейс Цюрих — Женева. Начало операционной деятельности.','✈️'],
      [2024,'Расширение флота','Флот пополнился Airbus A320neo и Boeing 777-300ER. Открыты 15 новых направлений.','📈'],
      [2024,'Discord-сообщество','Запущен официальный Discord-сервер. Более 50 активных участников за первый месяц.','💬'],
      [2025,'Международные рейсы','Открыты трансатлантические направления: Нью-Йорк, Бостон, Майами.','🌍'],
      [2025,'100 пилотов','Swiss Airlines VA достигла отметки в 100 активных пилотов. Введена система званий.','🎖️'],
      [2026,'Азиатское направление','Запущены регулярные рейсы в Сингапур, Токио и Бангкок.','🌏'],
      [2026,'Обновление сайта','Запущен новый сайт с интерактивной картой маршрутов, админ-панелью и полным каталогом флота.','🚀']
    ];
    for (const t of timeline) {
      await dbRun(`INSERT INTO timeline (year,title,description,icon) VALUES (?,?,?,?)`, t);
    }
    console.log('Timeline seeded');
  }
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && tokens.has(m[1])) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Auth
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.authenticated = true;
    const token = crypto.randomBytes(32).toString('hex');
    tokens.set(token, true);
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m) tokens.delete(m[1]);
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/me', (req, res) => {
  const auth = req.headers['authorization'] || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const ok = (req.session && req.session.authenticated) || (m && tokens.has(m[1]));
  res.json({ authenticated: !!ok });
});

// Applications
app.get('/api/applications', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM applications ORDER BY created_at DESC');
  res.json(rows);
});
app.post('/api/applications', async (req, res) => {
  const { name, age, platform, username, discord, country, experience, hours, motivation } = req.body;
  try {
    const result = await dbRun(
      `INSERT INTO applications (name,age,platform,username,discord,country,experience,hours,motivation) VALUES (?,?,?,?,?,?,?,?,?)`,
      [name, age, platform, username, discord, country, experience, hours, motivation]
    );
    res.json({ success: true, id: result.id });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
app.patch('/api/applications/:id/status', requireAuth, async (req, res) => {
  await dbRun('UPDATE applications SET status=? WHERE id=?', [req.body.status, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/applications/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM applications WHERE id=?', [req.params.id]);
  res.json({ success: true });
});
app.get('/api/applications/export', requireAuth, async (req, res) => {
  const rows = await dbAll('SELECT * FROM applications ORDER BY created_at DESC');
  const headers = ['ID','Name','Age','Platform','Username','Discord','Country','Experience','Hours','Motivation','Status','Date'];
  const lines = [headers.join(';')];
  for (const r of rows) {
    lines.push([r.id, `"${(r.name||'').replace(/"/g,'""')}"`, r.age, `"${(r.platform||'').replace(/"/g,'""')}"`,
      `"${(r.username||'').replace(/"/g,'""')}"`, `"${(r.discord||'').replace(/"/g,'""')}"`,
      `"${(r.country||'').replace(/"/g,'""')}"`, `"${(r.experience||'').replace(/"/g,'""')}"`,
      `"${(r.hours||'').replace(/"/g,'""')}"`, `"${(r.motivation||'').replace(/"/g,'""')}"`,
      r.status||'Новая', r.created_at].join(';'));
  }
  res.setHeader('Content-Type','text/csv; charset=utf-8');
  res.setHeader('Content-Disposition','attachment; filename=applications.csv');
  res.send('\uFEFF'+lines.join('\n'));
});

// Fleet CRUD
app.get('/api/fleet', async (req, res) => {
  const rows = await dbAll('SELECT * FROM fleet ORDER BY id');
  res.json(rows);
});
app.post('/api/fleet', requireAuth, async (req, res) => {
  const { model, manufacturer, category, capacity, range_km, speed_kmh, status, description, image_url } = req.body;
  const result = await dbRun(`INSERT INTO fleet (model,manufacturer,category,capacity,range_km,speed_kmh,status,description,image_url) VALUES (?,?,?,?,?,?,?,?,?)`,
    [model, manufacturer, category, capacity, range_km, speed_kmh, status, description, image_url]);
  res.json({ success: true, id: result.id });
});
app.patch('/api/fleet/:id', requireAuth, async (req, res) => {
  const { model, manufacturer, category, capacity, range_km, speed_kmh, status, description, image_url } = req.body;
  await dbRun(`UPDATE fleet SET model=?,manufacturer=?,category=?,capacity=?,range_km=?,speed_kmh=?,status=?,description=?,image_url=? WHERE id=?`,
    [model, manufacturer, category, capacity, range_km, speed_kmh, status, description, image_url, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/fleet/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM fleet WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// Routes CRUD
app.get('/api/routes', async (req, res) => {
  const rows = await dbAll('SELECT * FROM routes ORDER BY id');
  res.json(rows);
});
app.post('/api/routes', requireAuth, async (req, res) => {
  const { origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency, notes, active, origin_lat, origin_lon, dest_lat, dest_lon } = req.body;
  const result = await dbRun(`INSERT INTO routes (origin,origin_code,destination,destination_code,distance_km,duration_min,aircraft_type,frequency,notes,active,origin_lat,origin_lon,dest_lat,dest_lon) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency, notes, active?1:0, origin_lat, origin_lon, dest_lat, dest_lon]);
  res.json({ success: true, id: result.id });
});
app.patch('/api/routes/:id', requireAuth, async (req, res) => {
  const { origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency, notes, active, origin_lat, origin_lon, dest_lat, dest_lon } = req.body;
  await dbRun(`UPDATE routes SET origin=?,origin_code=?,destination=?,destination_code=?,distance_km=?,duration_min=?,aircraft_type=?,frequency=?,notes=?,active=?,origin_lat=?,origin_lon=?,dest_lat=?,dest_lon=? WHERE id=?`,
    [origin, origin_code, destination, destination_code, distance_km, duration_min, aircraft_type, frequency, notes, active?1:0, origin_lat, origin_lon, dest_lat, dest_lon, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/routes/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM routes WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// Events CRUD
app.get('/api/events', async (req, res) => {
  const rows = await dbAll('SELECT * FROM events ORDER BY date');
  res.json(rows);
});
app.post('/api/events', requireAuth, async (req, res) => {
  const { title, date, description, image_url } = req.body;
  const result = await dbRun(`INSERT INTO events (title,date,description,image_url) VALUES (?,?,?,?)`, [title, date, description, image_url]);
  res.json({ success: true, id: result.id });
});
app.patch('/api/events/:id', requireAuth, async (req, res) => {
  const { title, date, description, image_url } = req.body;
  await dbRun(`UPDATE events SET title=?,date=?,description=?,image_url=? WHERE id=?`, [title, date, description, image_url, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/events/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM events WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// Timeline CRUD
app.get('/api/timeline', async (req, res) => {
  const rows = await dbAll('SELECT * FROM timeline ORDER BY year');
  res.json(rows);
});
app.post('/api/timeline', requireAuth, async (req, res) => {
  const { year, title, description, icon } = req.body;
  const result = await dbRun(`INSERT INTO timeline (year,title,description,icon) VALUES (?,?,?,?)`, [year, title, description, icon]);
  res.json({ success: true, id: result.id });
});
app.patch('/api/timeline/:id', requireAuth, async (req, res) => {
  const { year, title, description, icon } = req.body;
  await dbRun(`UPDATE timeline SET year=?,title=?,description=?,icon=? WHERE id=?`, [year, title, description, icon, req.params.id]);
  res.json({ success: true });
});
app.delete('/api/timeline/:id', requireAuth, async (req, res) => {
  await dbRun('DELETE FROM timeline WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

app.listen(PORT, async () => {
  await initDB();
  console.log(`Server running on port ${PORT}`);
});
