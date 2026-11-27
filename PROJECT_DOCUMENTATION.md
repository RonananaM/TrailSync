# TrailSync — Project Documentation

## Project information

**Project title:** TrailSync: An Offline-First Web-Based Hiking and Trail Analytics Dashboard Using Node.js and Express.js  
**Course:** IT 314 — Web Systems and Technologies  
**Institution:** Batangas State University — Alangilan Campus  
**Track alignment:** Network Technology (NT) and Business Analytics (BA)  
**Project period:** December 1–5, 2026  

> Complete the group number, section, three member names and roles, instructor, approval date, and submission date before submitting. Update test outcomes only after performing the tests.

## 1. Project overview

TrailSync is a responsive web application for hikers and outdoor enthusiasts. It records GPS locations during a hike, calculates distance and duration, stores activity data in the browser using IndexedDB, and synchronizes local hike records with a Node.js and Express.js API when connectivity is available. The server stores accounts and synchronized hike records in MySQL.

The dashboard presents total distance, completed hikes, estimated elevation gain, active time, and a monthly distance chart. Users can review hike history and export GPX and CSV files.

## 2. Problem statement and rationale

Hiking trails may pass through areas with weak or unavailable cellular coverage. Applications that depend on continuous internet connectivity may have difficulty saving activity data in these areas. Hikers also need a convenient way to review their distance, duration, elevation information, and previous activities.

TrailSync addresses this situation by storing hike data locally first and synchronizing it with the server when an internet connection becomes available.

### Problem questions

1. How can hikers record GPS points and basic hike metrics when internet access is unavailable?
2. How can the application preserve local activity data and synchronize it when connectivity returns?
3. How can users review activity records through a dashboard and downloadable reports?

## 3. Objectives

### General objective

To design and develop a responsive, offline-first web-based hiking tracker and analytics dashboard using HTML, CSS, JavaScript, Node.js, Express.js, and MySQL.

### Specific objectives

1. Provide account registration and login.
2. Record GPS points through browser location services.
3. Support start, pause, resume, and finish controls.
4. Calculate approximate route distance and elapsed duration.
5. Save hike records locally through IndexedDB.
6. Synchronize pending local hikes to a MySQL-backed REST API.
7. Display summary statistics and monthly activity charts.
8. Provide hike history and GPX/CSV exports.

## 4. Scope and limitations

### Included

- User registration and login
- Password hashing and JWT authentication
- GPS tracking through the browser Geolocation API
- Haversine distance calculation
- Approximate elevation gain from available altitude samples
- IndexedDB local hike storage
- Online synchronization with the server
- MySQL persistence
- Dashboard analytics and history
- GPX and CSV export
- Responsive dark interface
- PWA manifest and same-origin application-shell caching

### Limitations

- Offline map tile downloading is not implemented. Map tiles are provided by OpenStreetMap and require network access.
- External Leaflet and Chart.js CDN assets and Google Fonts may not be available offline unless cached separately.
- Browser background suspension can interrupt GPS tracking; keep the page open during a hike.
- GPS and altitude accuracy depend on the device and environment.
- Calorie output is a simple estimate and is not a personalized health measurement.
- This is a student project and requires testing on target devices and browsers.

## 5. Target users and academic track relevance

### Target users

- Hikers and climbers in Batangas and nearby provinces
- Outdoor enthusiasts
- Users who want to review personal hiking performance

### Business Analytics

The system collects activity information and presents summary metrics, monthly distance charts, and downloadable CSV data for further analysis.

### Network Technology

The system demonstrates REST API communication, authenticated client-server requests, IndexedDB offline storage, and synchronization when connectivity returns.

## 6. Technology stack

| Technology | Purpose |
|---|---|
| HTML5 | Page structure |
| CSS3 | Responsive dark interface |
| JavaScript | Client-side application logic |
| Node.js | Server runtime |
| Express.js | REST API |
| MySQL | Persistent server database |
| mysql2 | Node.js MySQL driver |
| bcryptjs | Password hashing |
| JWT | API authentication |
| IndexedDB | Local browser storage |
| Leaflet / OpenStreetMap | Map display |
| Chart.js | Analytics chart |
| Service Worker | Application shell caching |
| Web App Manifest | PWA metadata |

## 7. System architecture

1. **Presentation layer:** HTML and CSS display the interface.
2. **Client application layer:** JavaScript manages authentication, GPS tracking, calculations, charts, exports, and API requests.
3. **Offline layer:** IndexedDB stores hike records locally. The service worker caches the same-origin application shell.
4. **API layer:** Express.js exposes authentication and hike endpoints.
5. **Data layer:** MySQL stores user accounts and synchronized hike records.

### Data flow

1. User registers or logs in.
2. The server validates credentials and returns a JWT.
3. User starts a hike and grants location permission.
4. The browser records GPS points and calculates distance.
5. The user finishes the hike; the record is saved in IndexedDB.
6. When online, the client sends pending records to the synchronization API.
7. The server validates and stores the records in MySQL.
8. Dashboard metrics are calculated from local hike records.

## 8. Database design

### Users table

| Field | Type | Description |
|---|---|---|
| id | BIGINT | Primary key |
| name | VARCHAR(100) | User name |
| email | VARCHAR(190) | Unique email |
| password_hash | VARCHAR(255) | Hashed password |
| created_at | TIMESTAMP | Account creation time |

### Hikes table

| Field | Type | Description |
|---|---|---|
| id | CHAR(36) | Hike UUID, primary key |
| user_id | BIGINT | Foreign key to users |
| title | VARCHAR(150) | Hike title |
| started_at | VARCHAR(40) | Start timestamp |
| ended_at | VARCHAR(40) | End timestamp |
| duration_seconds | INT | Active duration |
| distance_meters | DOUBLE | Calculated distance |
| elevation_gain | DOUBLE | Estimated elevation gain |
| calories | INT | Approximate estimate |
| points | JSON | Recorded GPS points |
| created_at | TIMESTAMP | Server record creation |
| updated_at | TIMESTAMP | Last update |

One user can own many hikes. Each hike belongs to one user.

## 9. System modules

1. **Authentication:** registration, login, password hashing, and JWT authorization.
2. **GPS Tracker:** browser GPS recording with start, pause, resume, and finish controls.
3. **Distance Calculator:** Haversine formula between consecutive coordinates.
4. **Offline Storage:** IndexedDB stores local hike records.
5. **Synchronization:** sends pending records to the protected server endpoint.
6. **Analytics:** dashboard totals and monthly distance chart.
7. **History and Export:** review hikes and export GPX/CSV.
8. **PWA:** install metadata and service worker application-shell caching.

## 10. Installation and execution

### Requirements

- Node.js 18+
- MySQL 8+
- VS Code
- Modern browser
- GPS-enabled device for GPS testing

### Setup

1. Start MySQL.
2. Create the database `trailsync_db` or execute `database.sql`.
3. Copy `.env.example` to `.env`.
4. Set the MySQL host, port, username, password, database, and a strong JWT secret.
5. Open the project folder in VS Code.
6. Run `npm install`.
7. Run `npm start`.
8. Open `http://localhost:3000`.

The MySQL account must have privileges required for the database and table setup. See README.md for details.

## 11. Testing plan

Record actual outcomes and evidence after performing each test.

| Test | Procedure | Expected result | Actual result |
|---|---|---|---|
| Registration | Submit valid account details | Account created | To be tested |
| Duplicate account | Register same email again | Duplicate email rejected | To be tested |
| Login | Submit correct credentials | User signs in | To be tested |
| Invalid login | Submit wrong password | Login rejected | To be tested |
| API protection | Call private endpoint without JWT | HTTP 401 | To be tested |
| GPS | Start tracking with permission | GPS points collected | To be tested |
| Pause/resume | Pause and resume hike | Recording state changes | To be tested |
| Finish | Finish an active hike | Local hike saved | To be tested |
| Local persistence | Reload browser | Saved hike remains | To be tested |
| Offline mode | Disconnect after app shell loaded | Local hikes remain accessible | To be tested |
| Synchronization | Reconnect and sync | Pending hikes uploaded | To be tested |
| GPX export | Export a recorded route | GPX file downloaded | To be tested |
| CSV export | Export hike history | CSV file downloaded | To be tested |
| Responsive UI | Open on mobile viewport | Layout adapts | To be tested |

## 12. Security and privacy

- Passwords are hashed using bcryptjs.
- Private API routes require a valid JWT.
- SQL statements use parameterized queries.
- Location is collected only after browser permission is granted and tracking is started.
- GPS routes and account data should not be published without user permission.
- Use a strong secret, HTTPS, secure token handling, backups, and least-privilege database credentials before deployment.

## 13. Group roles

The guideline requires exactly three group members. Replace the sample roles with the actual work allocation.

| Member | Suggested role | Responsibilities |
|---|---|---|
| [Member 1] | Frontend developer / designer | HTML, CSS, responsive UI, dashboard |
| [Member 2] | Backend developer / database | Express API, MySQL, authentication |
| [Member 3] | Integration / QA / documentation | GPS, IndexedDB, sync, testing, documentation |

## 14. Presentation plan

The guideline specifies a face-to-face presentation and system demonstration, maximum 10 minutes, formal attire, and participation by all group members.

| Time | Activity |
|---|---|
| 0:00–0:45 | Introduce all members and roles |
| 0:45–1:45 | Explain problem, purpose, and target users |
| 1:45–3:00 | Demonstrate login and dashboard |
| 3:00–4:30 | Demonstrate GPS tracker |
| 4:30–6:00 | Explain offline storage and synchronization |
| 6:00–7:15 | Explain Express API and MySQL |
| 7:15–8:30 | Show analytics, history, and exports |
| 8:30–9:30 | Explain development process and limitations |
| 9:30–10:00 | Conclusion |

## 15. Conclusion

TrailSync demonstrates how a web application can support hiking activity recording when network connectivity is unreliable. By combining browser GPS, IndexedDB, a Node.js and Express.js REST API, MySQL, and an analytics dashboard, the system provides local activity recording and later synchronization.

The group must complete device testing, gather screenshots and evidence, verify database requirements with the instructor, and accurately report limitations before final submission.
