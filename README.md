# TrailSync 2.0 — Dark UI + MySQL

Offline-first hiking tracker and trail analytics dashboard for the IT 314 Web Systems and Technologies final project.

## Features

- Responsive dark dashboard
- User registration and login
- Password hashing with bcryptjs
- JWT-protected REST API
- MySQL database and automatic table initialization
- Browser GPS tracking (start, pause, resume, finish)
- Distance calculation using the Haversine formula
- Local hike persistence using IndexedDB
- Manual and online-triggered synchronization
- Dashboard statistics and monthly Chart.js visualization
- Leaflet map with OpenStreetMap tiles
- GPX and CSV exports
- PWA manifest and service worker app-shell caching

## Requirements

- Node.js 18+
- MySQL 8+ (or a compatible MySQL server)
- npm
- Modern browser
- GPS-capable device for real GPS testing

## 1. Create the database user / database

Start MySQL. You may use MySQL Workbench, XAMPP, or the MySQL command line.

The server attempts to create `DB_NAME` automatically. The configured MySQL account must have permission to create a database and tables.

Alternatively, execute `database.sql` in MySQL Workbench. Then set the matching database name in `.env`.

Example local MySQL setup:

```sql
CREATE DATABASE trailsync_db;
```

If you use a dedicated account, create it and grant access (adjust the password):

```sql
CREATE USER 'trailsync_user'@'localhost' IDENTIFIED BY 'ChangeThisPassword!';
GRANT ALL PRIVILEGES ON trailsync_db.* TO 'trailsync_user'@'localhost';
FLUSH PRIVILEGES;
```

If you use the dedicated account, set `DB_USER=trailsync_user` and `DB_PASSWORD=ChangeThisPassword!` in `.env`. For automatic database creation, that account also needs CREATE privilege at the server level; otherwise create the database first and adjust `server.js` to skip the CREATE DATABASE step.

## 2. Configure environment variables

Copy `.env.example` to `.env`.

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=trailsync_db
JWT_SECRET=replace_this_with_a_long_random_secret_at_least_32_characters
JWT_EXPIRES_IN=7d
```

Use the actual MySQL password configured on your computer. Do not commit `.env` to Git.

## 3. Install dependencies

Open the TrailSync folder in VS Code. Select Terminal → New Terminal and run:

```bash
npm install
```

## 4. Start the application

```bash
npm start
```

Expected terminal output:

```text
TrailSync is running at http://localhost:3000
MySQL database "trailsync_db" is connected.
```

Open:

http://localhost:3000

## 5. Test the application

1. Register a test account.
2. Sign in.
3. Open GPS Tracker.
4. Allow location permission.
5. Start tracking outdoors or near a window with GPS reception.
6. Pause, resume, and finish the hike.
7. Check Overview and Hike History.
8. Export GPX or CSV.
9. Turn off the network after the app has loaded and verify locally stored hikes remain visible.
10. Reconnect and select Sync hikes.
11. Check the `hikes` table in MySQL Workbench.

## GPS and offline notes

- Geolocation generally requires a secure context (HTTPS); `http://localhost` is treated as secure for local development.
- Keep the page open while tracking. Browser background suspension can interrupt GPS collection.
- GPS accuracy depends on the device and environment.
- OpenStreetMap tiles and external CDN libraries require internet unless separately cached. This project does not download offline map tiles.
- The service worker caches the same-origin application shell. IndexedDB stores hike records locally.
- The application is a student project starter and needs real-device testing before deployment.

## Project structure

```text
TrailSync/
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── database.sql
├── README.md
├── PROJECT_DOCUMENTATION.md
└── public/
    ├── index.html
    ├── styles.css
    ├── app.js
    ├── sw.js
    └── manifest.webmanifest
```

## API endpoints

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | No | API/database health |
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Login |
| GET | `/api/me` | JWT | Current account |
| GET | `/api/hikes` | JWT | List server hikes |
| POST | `/api/hikes/sync` | JWT | Synchronize local hikes |
| DELETE | `/api/hikes/:id` | JWT | Delete own server hike |

## Troubleshooting

**ECONNREFUSED / connect ECONNREFUSED 127.0.0.1:3306**
- Start the MySQL service.
- Verify DB_HOST and DB_PORT.

**Access denied for user**
- Check DB_USER and DB_PASSWORD.
- Ensure the user has privileges on the database.

**Unknown database**
- Create the database using `database.sql`, or use an account allowed to create databases.

**GPS not working**
- Use localhost or HTTPS.
- Allow location permission in the browser.
- Test outdoors and keep the tab open.

**Port 3000 already in use**
- Change PORT in `.env`, then restart the server.

## Security before deployment

For a real public deployment, use HTTPS, a strong random JWT secret, secure token storage (prefer secure HttpOnly cookies), CSRF protections if using cookies, rate limits, strict input validation, database least-privilege credentials, backups, privacy notice, and production logging. Do not use sample credentials or development secrets in production.
