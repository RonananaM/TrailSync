const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "trailsync_token";
const USER_KEY = "trailsync_user";
let token = localStorage.getItem(TOKEN_KEY);
let user = JSON.parse(localStorage.getItem(USER_KEY) || "null");
let db;
let hikes = [];
let chart;
let map;
let routeLine;
let marker;
let watchId = null;
let session = null;
let tickHandle = null;
let toastHandle;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => el.classList.remove("show"), 3200);
}

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TrailSyncLocalDB", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("hikes")) {
        database.createObjectStore("hikes", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeHike(hike) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("hikes", "readwrite");
    tx.objectStore("hikes").put(hike);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function readHikes() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("hikes", "readonly");
    const request = tx.objectStore("hikes").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function deleteLocalHike(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("hikes", "readwrite");
    tx.objectStore("hikes").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function showAuth(register = false) {
  $("authScreen").classList.remove("hidden");
  $("appShell").classList.add("hidden");
  $("nameField").classList.toggle("hidden", !register);
  $("authName").required = register;
  $("authTitle").textContent = register ? "Create your account" : "Welcome back";
  $("authSubtitle").textContent = register ? "Start keeping track of every adventure." : "Sign in to continue your journey.";
  $("authSubmit").innerHTML = register ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
  $("authSwitchText").textContent = register ? "Already have an account?" : "New to TrailSync?";
  $("authSwitch").textContent = register ? "Sign in" : "Create account";
  $("authPassword").autocomplete = register ? "new-password" : "current-password";
  $("authForm").dataset.mode = register ? "register" : "login";
}

function showApp() {
  $("authScreen").classList.add("hidden");
  $("appShell").classList.remove("hidden");
  $("userName").textContent = user?.name || "Hiker";
  $("userEmail").textContent = user?.email || "";
  $("userAvatar").textContent = (user?.name || "H").charAt(0).toUpperCase();
  $("todayLabel").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
  updateConnection();
}

function logout() {
  token = null;
  user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  showAuth(false);
}

function updateConnection() {
  const online = navigator.onLine;
  $("connectionText").textContent = online ? "Internet connected" : "Offline mode";
  $("syncText").textContent = online ? "Ready to synchronize" : "Local records are available";
  $("syncDot").style.background = online ? "var(--green)" : "var(--orange)";
}

function showView(id) {
  document.querySelectorAll(".view").forEach(view => view.classList.add("hidden"));
  $(id).classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.target === id));
  $("pageTitle").textContent = id === "dashboardView" ? "Overview" : id === "trackerView" ? "GPS Tracker" : "Hike History";
  if (id === "trackerView") setTimeout(initMap, 100);
}

function initMap() {
  if (map || !window.L || !$("map")) return;
  map = L.map("map", { zoomControl: true }).setView([13.7565, 121.0583], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  routeLine = L.polyline([], { color: "#67dda1", weight: 5, opacity: .9 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
}

function haversine(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function sessionDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

function sessionElevation(points) {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = Number(points[i - 1].altitude);
    const current = Number(points[i].altitude);
    if (Number.isFinite(prev) && Number.isFinite(current) && current > prev) gain += current - prev;
  }
  return gain;
}

function elapsedSeconds() {
  if (!session) return 0;
  const now = session.status === "recording" ? Date.now() : session.pauseStarted;
  return Math.max(0, Math.floor((now - session.startedMs - session.pausedMs) / 1000));
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function updateTrackerMetrics() {
  if (!session) return;
  const distance = sessionDistance(session.points);
  $("timer").textContent = formatDuration(elapsedSeconds());
  $("liveDistance").innerHTML = `${(distance / 1000).toFixed(2)} <i>km</i>`;
  $("livePoints").textContent = session.points.length;
  $("liveElevation").innerHTML = `${Math.round(sessionElevation(session.points))} <i>m</i>`;
}

function addGpsPoint(position) {
  if (!session || session.status !== "recording") return;
  const point = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    altitude: Number.isFinite(position.coords.altitude) ? position.coords.altitude : null,
    accuracy: position.coords.accuracy,
    time: new Date(position.timestamp).toISOString()
  };
  const previous = session.points[session.points.length - 1];
  if (previous && point.accuracy > 100) {
    $("gpsStatus").textContent = "GPS accuracy is low — waiting for a better reading";
    return;
  }
  if (previous && haversine(previous, point) < 3) return;

  session.points.push(point);
  if (routeLine) routeLine.addLatLng([point.lat, point.lng]);
  if (map && window.L) {
    if (!marker) marker = L.circleMarker([point.lat, point.lng], { radius: 7, color: "#67dda1", fillColor: "#67dda1", fillOpacity: 1 }).addTo(map);
    else marker.setLatLng([point.lat, point.lng]);
    map.setView([point.lat, point.lng], Math.max(map.getZoom(), 15));
  }
  $("gpsStatus").textContent = `GPS accuracy ±${Math.round(point.accuracy)} m`;
  updateTrackerMetrics();
}

function gpsError(error) {
  const messages = {
    1: "Location permission denied. Enable location access in browser settings.",
    2: "Current location is unavailable. Move to an area with better GPS reception.",
    3: "GPS request timed out. Please try again."
  };
  toast(messages[error.code] || "Unable to access GPS.");
  $("gpsStatus").textContent = "GPS unavailable";
}

function startTracking() {
  if (!navigator.geolocation) return toast("This browser does not support GPS location.");
  if (!window.isSecureContext) return toast("GPS requires HTTPS or localhost.");
  session = {
    id: crypto.randomUUID(),
    title: "My hike",
    startedAt: new Date().toISOString(),
    startedMs: Date.now(),
    pausedMs: 0,
    pauseStarted: null,
    status: "recording",
    points: []
  };
  routeLine?.setLatLngs([]);
  if (marker) { map.removeLayer(marker); marker = null; }
  $("trackerState").textContent = "RECORDING IN PROGRESS";
  $("startButton").classList.add("hidden");
  $("pauseButton").classList.remove("hidden");
  $("finishButton").classList.remove("hidden");
  $("gpsStatus").textContent = "Requesting GPS signal…";
  watchId = navigator.geolocation.watchPosition(addGpsPoint, gpsError, {
    enableHighAccuracy: true, maximumAge: 3000, timeout: 15000
  });
  clearInterval(tickHandle);
  tickHandle = setInterval(updateTrackerMetrics, 1000);
  updateTrackerMetrics();
  toast("Hike tracking started. Keep this page open.");
}

function pauseTracking() {
  if (!session || session.status !== "recording") return;
  session.status = "paused";
  session.pauseStarted = Date.now();
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  $("pauseButton").classList.add("hidden");
  $("resumeButton").classList.remove("hidden");
  $("trackerState").textContent = "HIKE PAUSED";
  $("gpsStatus").textContent = "Recording paused";
  updateTrackerMetrics();
}

function resumeTracking() {
  if (!session || session.status !== "paused") return;
  session.pausedMs += Date.now() - session.pauseStarted;
  session.pauseStarted = null;
  session.status = "recording";
  watchId = navigator.geolocation.watchPosition(addGpsPoint, gpsError, {
    enableHighAccuracy: true, maximumAge: 3000, timeout: 15000
  });
  $("resumeButton").classList.add("hidden");
  $("pauseButton").classList.remove("hidden");
  $("trackerState").textContent = "RECORDING IN PROGRESS";
  $("gpsStatus").textContent = "Reconnecting to GPS…";
}

async function finishTracking() {
  if (!session) return;
  if (session.status === "recording" && watchId !== null) navigator.geolocation.clearWatch(watchId);
  const durationSeconds = elapsedSeconds();
  if (session.status === "paused") session.pausedMs += Date.now() - session.pauseStarted;
  clearInterval(tickHandle);
  const distanceMeters = sessionDistance(session.points);
  const elevationGain = sessionElevation(session.points);
  // Approximate placeholder only; not a personalized health or fitness measurement.
  const calories = Math.round((distanceMeters / 1000) * 60);
  const hike = {
    id: session.id,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    durationSeconds,
    distanceMeters,
    elevationGain,
    calories,
    points: session.points,
    synced: false
  };
  await storeHike(hike);
  session = null;
  watchId = null;
  $("trackerState").textContent = "HIKE SAVED LOCALLY";
  $("startButton").classList.remove("hidden");
  $("pauseButton").classList.add("hidden");
  $("resumeButton").classList.add("hidden");
  $("finishButton").classList.add("hidden");
  $("gpsStatus").textContent = "Ready for your next hike";
  await refreshHikes();
  toast("Hike saved on this device.");
}

function renderChart() {
  if (!window.Chart || !$("activityChart")) return;
  const totals = Array(12).fill(0);
  hikes.forEach(hike => {
    const date = new Date(hike.startedAt);
    if (!Number.isNaN(date.getTime())) totals[date.getMonth()] += Number(hike.distanceMeters || 0) / 1000;
  });
  if (chart) chart.destroy();
  chart = new Chart($("activityChart"), {
    type: "bar",
    data: {
      labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      datasets: [{
        data: totals.map(n => Number(n.toFixed(2))),
        backgroundColor: "#67dda1",
        borderRadius: 5,
        maxBarThickness: 24
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.raw} km` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#81939f", font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: "#263541" }, ticks: { color: "#81939f", font: { size: 10 } } }
      }
    }
  });
}

function renderDashboard() {
  const distance = hikes.reduce((sum, h) => sum + Number(h.distanceMeters || 0), 0);
  const elevation = hikes.reduce((sum, h) => sum + Number(h.elevationGain || 0), 0);
  const duration = hikes.reduce((sum, h) => sum + Number(h.durationSeconds || 0), 0);
  $("totalDistance").innerHTML = `${(distance / 1000).toFixed(1)} <small>km</small>`;
  $("totalHikes").textContent = hikes.length;
  $("totalElevation").innerHTML = `${Math.round(elevation).toLocaleString()} <small>m</small>`;
  $("totalTime").textContent = `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  const recent = [...hikes].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt)).slice(0, 4);
  $("recentHikes").innerHTML = recent.length ? recent.map(h => `
    <div class="recent-item">
      <div><strong>${escapeHtml(h.title || "My hike")}</strong><small>${new Date(h.startedAt).toLocaleDateString()}</small></div>
      <span class="recent-distance">${(Number(h.distanceMeters || 0) / 1000).toFixed(2)} km</span>
    </div>`).join("") : '<div class="empty-state">No hikes yet. Start your first adventure!</div>';
  renderChart();
}

function renderHistory() {
  const sorted = [...hikes].sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt));
  $("historyList").innerHTML = sorted.length ? sorted.map(h => `
    <div class="history-row">
      <span><strong>${escapeHtml(h.title || "My hike")}</strong><small>${new Date(h.startedAt).toLocaleString()}</small></span>
      <span>${(Number(h.distanceMeters || 0) / 1000).toFixed(2)} km</span>
      <span>${formatDuration(Number(h.durationSeconds || 0))}</span>
      <span class="status-pill">${h.synced ? "Synced" : "On device"}</span>
      <span class="row-actions"><button data-export="${h.id}">GPX ↓</button><button class="delete-action" data-delete="${h.id}">Delete</button></span>
    </div>`).join("") : '<div class="empty-state">No hikes recorded yet. Start your first hike!</div>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

async function refreshHikes() {
  hikes = await readHikes();
  renderDashboard();
  renderHistory();
}

async function syncHikes() {
  if (!navigator.onLine) return toast("You are offline. Hikes remain safely stored on this device.");
  if (!token) return toast("Sign in to synchronize your hikes.");
  const pending = hikes.filter(h => !h.synced);
  if (!pending.length) return toast("Everything is already synchronized.");
  try {
    const result = await api("/api/hikes/sync", {
      method: "POST",
      body: JSON.stringify({ hikes: pending.slice(0, 50) })
    });
    for (const hike of pending.slice(0, 50)) {
      hike.synced = true;
      await storeHike(hike);
    }
    await refreshHikes();
    $("syncText").textContent = "All local hikes synchronized";
    toast(`${result.synced} hike(s) synchronized.`);
  } catch (error) {
    toast(error.message);
  }
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportGpx(id) {
  const hike = hikes.find(item => item.id === id);
  if (!hike) return;
  const trackpoints = (hike.points || []).map(p =>
    `<trkpt lat="${p.lat}" lon="${p.lng}">${p.altitude !== null && p.altitude !== undefined ? `<ele>${p.altitude}</ele>` : ""}<time>${escapeHtml(p.time || hike.startedAt)}</time></trkpt>`
  ).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="TrailSync" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${escapeHtml(hike.title)}</name><trkseg>${trackpoints}</trkseg></trk></gpx>`;
  downloadFile(`trailsync-${id}.gpx`, xml, "application/gpx+xml");
}

function exportCsv() {
  const rows = [["Title","Started At","Ended At","Distance (m)","Duration (seconds)","Elevation Gain (m)","Calories","Synced"]];
  hikes.forEach(h => rows.push([
    h.title, h.startedAt, h.endedAt, h.distanceMeters, h.durationSeconds,
    h.elevationGain, h.calories, h.synced ? "Yes" : "No"
  ]));
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  downloadFile("trailsync-hikes.csv", csv, "text/csv;charset=utf-8");
}

async function deleteHike(id) {
  if (!confirm("Delete this hike from this device and your cloud account, if synchronized?")) return;
  const hike = hikes.find(item => item.id === id);
  await deleteLocalHike(id);
  if (hike?.synced && navigator.onLine && token) {
    try { await api(`/api/hikes/${encodeURIComponent(id)}`, { method: "DELETE" }); }
    catch (error) { toast(`Deleted locally; server deletion failed: ${error.message}`); }
  }
  await refreshHikes();
  toast("Hike deleted from this device.");
}

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const mode = $("authForm").dataset.mode;
  const payload = {
    email: $("authEmail").value.trim(),
    password: $("authPassword").value
  };
  if (mode === "register") payload.name = $("authName").value.trim();
  $("authSubmit").disabled = true;
  try {
    const result = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify(payload) });
    token = result.token;
    user = result.user;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    showApp();
    await refreshHikes();
    if (navigator.onLine) await syncHikes();
    toast(mode === "register" ? "Account created. Welcome to TrailSync!" : "Welcome back!");
  } catch (error) {
    toast(error.message);
  } finally {
    $("authSubmit").disabled = false;
  }
});

$("authSwitch").addEventListener("click", () => {
  showAuth($("authForm").dataset.mode !== "register");
});
$("logoutButton").addEventListener("click", logout);
$("syncButton").addEventListener("click", syncHikes);
$("startButton").addEventListener("click", startTracking);
$("pauseButton").addEventListener("click", pauseTracking);
$("resumeButton").addEventListener("click", resumeTracking);
$("finishButton").addEventListener("click", finishTracking);
$("exportCsvButton").addEventListener("click", exportCsv);

document.querySelectorAll(".nav-link").forEach(button =>
  button.addEventListener("click", () => showView(button.dataset.target))
);
document.querySelectorAll("[data-go]").forEach(button =>
  button.addEventListener("click", () => showView(button.dataset.go))
);
document.addEventListener("click", event => {
  const exportButton = event.target.closest("[data-export]");
  const deleteButton = event.target.closest("[data-delete]");
  if (exportButton) exportGpx(exportButton.dataset.export);
  if (deleteButton) deleteHike(deleteButton.dataset.delete);
});
window.addEventListener("online", () => { updateConnection(); syncHikes(); });
window.addEventListener("offline", updateConnection);

async function boot() {
  try {
    db = await openDatabase();
    await refreshHikes();
    if (token && navigator.onLine) {
      try {
        const result = await api("/api/me");
        user = result.user;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        showApp();
        await refreshHikes();
        await syncHikes();
      } catch {
        logout();
      }
    } else if (token && user) {
      showApp();
      await refreshHikes();
      $("syncText").textContent = "Offline — sync pending";
    } else {
      showAuth(false);
    }
  } catch (error) {
    console.error(error);
    toast("Local browser storage could not be initialized.");
    showAuth(false);
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.error));
}
boot();
