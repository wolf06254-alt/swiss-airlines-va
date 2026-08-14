# 🚀 Гайд по развёртыванию Swiss Airlines VA на Render + GitHub

Этот гайд шаг за шагом объясняет, как загрузить сайт на GitHub и запустить его на Render бесплатно. Данные в SQLite сохраняются на диске Render (безопасно для бесплатного плана).

---

## 📋 Что тебе понадобится

- Аккаунт на [GitHub](https://github.com) (бесплатно)
- Аккаунт на [Render](https://render.com) (бесплатно)
- ZIP-архив проекта `swiss-airlines-va.zip`

---

## 1️⃣ Создаём репозиторий на GitHub

1. Открой [github.com](https://github.com) и залогинься
2. Нажми кнопку **+** (сверху справа) → **New repository**
3. Заполни поля:
   - **Repository name:** `swiss-airlines-va`
   - **Description:** `Swiss Airlines VA website for PTFS`
   - **Visibility:** 🔓 Public (или Private, если хочешь)
   - ✅ **Add a README:** НЕ ставь галочку (уже есть README)
   - ✅ **Add .gitignore:** НЕ ставь (уже есть)
4. Нажми **Create repository**

---

## 2️⃣ Загружаем файлы проекта

### Способ A: Через Git (рекомендуется)

Если у тебя установлен Git:

```bash
# Распакуй ZIP-архив в папку
cd swiss-airlines-va

# Инициализируй Git
git init

# Привяжи к GitHub (замени USERNAME на свой)
git remote add origin https://github.com/USERNAME/swiss-airlines-va.git

# Добавь все файлы
git add .

# Сделай первый коммит
git commit -m "Initial commit: Swiss Airlines VA"

# Запушь на GitHub
git branch -M main
git push -u origin main
```

### Способ B: Через веб-интерфейс GitHub

1. На странице репозитория нажми **Add file → Upload files**
2. Перетащи ВСЕ файлы из папки `swiss-airlines-va` (кроме `node_modules`)
3. В поле коммита напиши: `Initial commit`
4. Нажми **Commit changes**

> ⚠️ **Важно:** НЕ загружай папку `node_modules`! Она тяжёлая и не нужна — Render сам установит зависимости через `npm install`.

---

## 3️⃣ Разворачиваем на Render (Blueprint — самый лёгкий способ)

В проекте уже есть файл `render.yaml` — это конфигурация для Render. С его помощью Render сам создаст Web Service и настроит всё автоматически.

### Шаг 1: Подключи GitHub к Render

1. Зайди на [render.com](https://render.com) и зарегистрируйся (можно через GitHub)
2. На дашборде нажми **New → Blueprint**
3. Подключи свой GitHub-аккаунт и выбери репозиторий `swiss-airlines-va`
4. Render прочитает `render.yaml` и покажет, что будет создано:
   - **Web Service** `swiss-airlines-va` (Node.js)
   - **PostgreSQL** `swiss-airlines-db` (Free план)
5. Нажми **Apply**

### Шаг 2: Подожди деплой

- Render автоматически:
  1. Создаст сервер
  2. Установит зависимости (`npm install`)
  3. Создаст базу данных
  4. Запустит сервер (`node server.js`)
- Это занимает 2–3 минуты
- Когда статус станет **Live** — сайт готов!

### Шаг 3: Открой сайт

- Нажми на URL вида `https://swiss-airlines-va.onrender.com`
- Главная страница: `https://swiss-airlines-va.onrender.com/`
- Админка: `https://swiss-airlines-va.onrender.com/login.html`

---

## 4️⃣ Ручная настройка (если Blueprint не сработал)

Если Blueprint не подключился, настрой вручную:

### Создание Web Service

1. На Render нажми **New → Web Service**
2. Подключи GitHub-репозиторий `swiss-airlines-va`
3. Заполни поля:
   - **Name:** `swiss-airlines-va`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
4. Нажми **Create Web Service**

### Добавление переменных окружения

1. Перейди в созданный сервис → вкладка **Environment**
2. Добавь переменные:

| Key | Value | Описание |
|-----|-------|----------|
| `ADMIN_USERNAME` | `Gregory` | Логин администратора |
| `ADMIN_PASSWORD` | `123789` | Пароль администратора |
| `SESSION_SECRET` | `swiss-secret-2026-abc` | Секрет для сессий (придумай любую строку) |
| `NODE_ENV` | `production` | Режим production |

3. Нажми **Save Changes** — Render перезапустит сервер

---

## 5️⃣ Данные администратора

После деплоя вход в админ-панель:

- **URL:** `https://твой-сайт.onrender.com/login.html`
- **Логин:** `Gregory`
- **Пароль:** `123789`

> 🔐 **Совет:** Сразу после первого входа смени пароль в переменных окружения Render на более сложный!

---

## 6️⃣ UptimeRobot — чтобы сайт не "засыпал"

Бесплатный план Render останавливает сервер после 15 минут без трафика. Чтобы он был онлайн 24/7:

1. Зарегистрируйся на [uptimerobot.com](https://uptimerobot.com)
2. Нажми **Add New Monitor**
3. Настройки:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** `Swiss Airlines VA`
   - **URL:** `https://swiss-airlines-va.onrender.com` (замени на свой URL)
   - **Monitoring Interval:** `5 minutes`
4. Нажми **Create Monitor**

Теперь сайт будет пинговаться каждые 5 минут и оставаться активным.

---

## 7️⃣ Обновление сайта

Когда ты захочешь изменить сайт:

1. Поменяй файлы локально
2. Закоммить и запушь на GitHub:

```bash
git add .
git commit -m "Обновил дизайн / добавил страницу"
git push origin main
```

3. Render **автоматически** перезапустит сайт через 1–2 минуты (автодеплой)

---

## 8️⃣ Проверка работы после деплоя

Открой свой URL и проверь:

| Страница | Что проверить |
|----------|---------------|
| `/` | Главная с анимациями |
| `/fleet.html` | Карточки самолётов |
| `/routes.html` | Список маршрутов |
| `/map.html` | Интерактивная карта Leaflet |
| `/events.html` | События |
| `/history.html` | Таймлайн |
| `/patent.html` | Патент и правила |
| `/login.html` | Форма заявки + вход |
| `/admin.html` | Админ-панель (требует входа) |

---

## 🛠️ Если что-то пошло не так

### Сайт не открывается

1. На Render перейди в **Web Service → Logs**
2. Проверь ошибки (обычно проблема в переменных окружения или порте)

### Данные не сохраняются

- На Render с бесплатным планом SQLite файл живёт внутри контейнера. При полной пересборке (не перезапуске) данные могут сброситься.
- Для важных данных делай бэкап через админ-панель → **Export CSV**
- Для постоянного хранения подключи PostgreSQL через `render.yaml` (уже настроено в проекте)

### Стили не применяются

- Проверь, что в `render.yaml` или настройках Render **Build Command** = `npm install`
- Убедись, что статические файлы (CSS, JS) лежат в корне репозитория

---

## 📁 Что загружать на GitHub

✅ **Загружай:**
- Все `.html` файлы
- `server.js`
- `package.json`
- `render.yaml`
- `.env.example`
- `.gitignore`
- `i18n.js`

❌ **НЕ загружай:**
- `node_modules/` (папка с зависимостями)
- `database.sqlite` (база данных локальная)
- `.env` (секретные данные)

> Файл `.gitignore` уже настроен, чтобы исключить `node_modules` и `.env`.

---

## 🎉 Готово!

Твой сайт Swiss Airlines VA теперь работает в интернете. Любой человек может зайти, заполнить заявку, а ты — управлять всем через админ-панель.

**✈️ FLY TOGETHER. FLY SWISS.**
