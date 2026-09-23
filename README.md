# Swiss Airlines VA

Virtual airline website for Swiss Airlines (PTFS).

## Setup
```bash
npm install
npm start
```

## Default Admin
- Username: `Gregory`
- Password: `123789`

## Structure
- `views/` — Main pages (index, events, history, apply) with embedded base64 images
- `public/` — Static files (login.html, admin.html)
- `server.js` — Express server with API routes
- `data/` — JSON database (auto-created)

## Pages
- `/` — Main page
- `/events` — Events
- `/history` — History timeline
- `/apply` — Application form
- `/login` — Admin login
- `/admin` — Admin panel (auth required)

## Привязка статусов рейсов

В админ-панели появилась вкладка **«Привязка»**. В ней можно сохранить URL внешнего сайта/API и включить выдачу статусов рейсов. URL валидируется на backend и принимает только `http://` или `https://` без учётных данных.

Статусы, добавленные администратором, доступны внешнему сайту через публичный read-only endpoint:

```http
GET /api/flights/statuses
```

Пример ответа:

```json
{
  "updated_at": "2026-09-23T12:00:00.000Z",
  "binding": { "url": "https://example.com/flights" },
  "statuses": [
    {
      "flight_number": "SWR-101",
      "departure": "ZRH",
      "arrival": "GVA",
      "status": "approaching",
      "updated_at": "2026-09-23T11:59:00.000Z"
    }
  ]
}
```

Допустимые коды статусов: `skyboard`, `approaching`, `takeoff`, `preparing_landing`, `check_in`, `boarding`, `departed`, `landed`, `cancelled`. Внешний сайт должен опрашивать endpoint самостоятельно (рекомендуемый интервал — 15–60 секунд); автоматического вызова API внешнего сайта в текущем проекте нет.