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