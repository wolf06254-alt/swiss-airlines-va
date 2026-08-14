# Swiss Airlines VA

Минималистичный сайт виртуальной авиакомпании Swiss Airlines для PTFS.

## Структура

- `index.html` — главная страница
- `apply.html` — анкета пилота
- `contacts.html` — контакты и Discord
- `login.html` — вход для администрации
- `admin.html` — панель управления заявками
- `style.css` — стили (dark theme, glassmorphism)
- `script.js` — анимации, i18n, формы
- `server.js` — бэкенд (Node.js + Express + SQLite)

## Установка

```bash
npm install
npm start
```

## Переменные окружения (.env)

```
PORT=3000
ADMIN_USERNAME=Gregory
ADMIN_PASSWORD=123789
SESSION_SECRET=your-secret
```

## Деплой

1. Загрузи репозиторий на GitHub.
2. Подключи репозиторий к Render.
3. Укажи Build Command: `npm install` и Start Command: `npm start`.
4. Готово!

## Дизайн

- Dark theme (#050505)
- Акцентный цвет — Swiss Red (#e30613)
- Glassmorphism карточки
- Canvas particles с соединяющими линиями
- Reveal on scroll анимации
