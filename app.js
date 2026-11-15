(() => {
"use strict";
const CFG = window.BUDGET_CONFIG;
const CATS = CFG.CATEGORIES;
const catById = id => CATS.find(c => c.id === id) || { id, label: id, short: id, color: "#888", icon: "•" };
const LS = { data: "bt.data", meta: "bt.meta", token: "bt.token" };
const $ = id => document.getElementById(id);

/* ---------- storage ---------- */
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

let data = load(LS.data, null) || {
  version: 1, updatedAt: 0,
  budgets: { ...CFG.DEFAULT_BUDGETS }, budgetsUpdatedAt: 0,
  entries: [], deleted: []
};
let meta = load(LS.meta, { fileId: "", dirty: false, signedIn: false, lastSync: 0 });
const persist = () => { save(LS.data, data); save(LS.meta, meta); };

/* ---------- helpers ---------- */
const money = n => "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = n => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const parseAmount = s => { const n = parseFloat(String(s).replace(",", ".").replace(/[^0-9.]/g, "")); return isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
const monthKey = d => d.slice(0, 7);
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200);
}

/* ---------- state ---------- */
let viewMonth = todayStr().slice(0, 7);
let selectedCat = load("bt.cat", CATS[0].id);
let editingId = null;

function touch() { data.updatedAt = Date.now(); meta.dirty = true; persist(); render(); scheduleSync(); }

function addEntry(e) { data.entries.push({ ...e, id: uid(), createdAt: new Date().toISOString(), updatedAt: Date.now() }); touch(); }
function updateEntry(id, patch) {
  const e = data.entries.find(x => x.id === id); if (!e) return;
  Object.assign(e, patch, { updatedAt: Date.now() }); touch();
}
function deleteEntry(id) {
  data.entries = data.entries.filter(x => x.id !== id);
  data.deleted.push({ id, deletedAt: Date.now() }); touch();
}

/* ---------- render ---------- */
function monthLabel(k) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function shiftMonth(k, delta) {
  const [y, m] = k.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function render() {
  $("monthLabel").textContent = monthLabel(viewMonth);
  const inMonth = data.entries.filter(e => monthKey(e.date) === viewMonth);
  const spent = {}; CATS.forEach(c => spent[c.id] = 0);
  inMonth.forEach(e => spent[e.category] = (spent[e.category] || 0) + e.amount);

  let totBudget = 0, totSpent = 0;
  $("cards").innerHTML = CATS.map(c => {
    const b = Number(data.budgets[c.id]) || 0, s = spent[c.id] || 0, rem = b - s;
    const pct = b > 0 ? Math.min(100, s / b * 100) : (s > 0 ? 100 : 0);
    const cls = s > b ? "bad" : (b > 0 && s / b >= 0.85 ? "warn" : "");
    totBudget += b; totSpent += s;
    return `<button type="button" class="cat-card ${c.id === selectedCat ? "selected" : ""}" data-cat="${c.id}" style="--c:${c.color}">
      <div class="cat-head"><span class="cat-name"><i>${c.icon}</i>${esc(c.label)}</span><span class="muted">${Math.round(b > 0 ? s / b * 100 : 0)}%</span></div>
      <div class="remaining ${rem < 0 ? "over" : ""}">${rem < 0 ? money(-rem) + " over" : money(rem) + " left"}</div>
      <div class="bar"><span class="${cls}" style="width:${pct}%"></span></div>
      <div class="cat-meta"><span>Spent ${money(s)}</span><span>Budget ${money(b)}</span></div>
    </button>`;
  }).join("");
  $("totalCard").innerHTML = `<span>Total spent</span><span>${money(totSpent)} <span class="muted">/ ${money(totBudget)}</span></span>`;

  $("catButtons").innerHTML = CATS.map(c =>
    `<button type="button" class="cat-btn" role="radio" aria-checked="${c.id === selectedCat}" data-cat="${c.id}" style="--c:${c.color}"><span>${c.icon}</span>${esc(c.short)}</button>`).join("");

  const sorted = [...inMonth].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
  $("entryCount").textContent = sorted.length ? `(${sorted.length})` : "";
  $("emptyMsg").hidden = sorted.length > 0;
  $("entryList").innerHTML = sorted.map(e => {
    const c = catById(e.category);
    const title = e.store || e.note || c.short;
    const sub = [new Date(e.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), c.short, e.store && e.note ? e.note : ""].filter(Boolean).join(" · ");
    return `<li class="entry" data-id="${e.id}" style="--c:${c.color}"><span class="swatch"></span>
      <div class="entry-main"><div class="entry-title">${esc(title)}</div><div class="entry-sub">${esc(sub)}</div></div>
      <div class="entry-amt">${money(e.amount)}</div></li>`;
  }).join("");
  renderSync();
}

/* ---------- events ---------- */
$("prevMonth").onclick = () => { viewMonth = shiftMonth(viewMonth, -1); render(); };
$("nextMonth").onclick = () => { viewMonth = shiftMonth(viewMonth, 1); render(); };

function selectCat(id) { selectedCat = id; save("bt.cat", id); render(); }
$("cards").addEventListener("click", e => {
  const b = e.target.closest("[data-cat]"); if (!b) return;
  selectCat(b.dataset.cat); $("amount").focus();
});
$("catButtons").addEventListener("click", e => {
  const b = e.target.closest("[data-cat]"); if (b) { selectCat(b.dataset.cat); $("amount").focus(); }
});

$("date").value = todayStr();
$("logForm").addEventListener("submit", e => {
  e.preventDefault();
  const amount = parseAmount($("amount").value);
  if (!(amount > 0)) { toast("Enter an amount"); $("amount").focus(); return; }
  const date = $("date").value || todayStr();
  const store = $("store").value.trim();
  addEntry({ date, category: selectedCat, amount, store, note: "" });
  if (monthKey(date) !== viewMonth) viewMonth = monthKey(date);
  $("amount").value = ""; $("store").value = ""; $("date").value = todayStr();
  render(); toast(`Saved ${money(amount)} · ${catById(selectedCat).short}`);
  if (navigator.vibrate) navigator.vibrate(15);
});

/* edit dialog */
$("editCat").innerHTML = CATS.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
$("entryList").addEventListener("click", e => {
  const li = e.target.closest("[data-id]"); if (!li) return;
  const en = data.entries.find(x => x.id === li.dataset.id); if (!en) return;
  editingId = en.id;
  $("editCat").value = en.category; $("editAmount").value = en.amount.toFixed(2);
  $("editStore").value = en.store || ""; $("editNote").value = en.note || ""; $("editDate").value = en.date;
  $("editDialog").showModal();
});
$("editForm").addEventListener("submit", e => {
  e.preventDefault();
  const amount = parseAmount($("editAmount").value);
  if (!(amount > 0)) { toast("Enter a valid amount"); return; }
  updateEntry(editingId, { category: $("editCat").value, amount, store: $("editStore").value.trim(), note: $("editNote").value.trim(), date: $("editDate").value });
  $("editDialog").close();
});
$("editCancel").onclick = () => $("editDialog").close();
$("editDelete").onclick = () => { if (confirm("Delete this entry?")) { deleteEntry(editingId); $("editDialog").close(); toast("Deleted"); } };

/* settings dialog */
function openSettings() {
  $("budgetFields").innerHTML = CATS.map(c => `<div class="budget-row"><label>${c.icon} ${esc(c.label)}</label>
    <div class="amount-wrap small" style="width:130px"><span class="cur">$</span><input data-budget="${c.id}" inputmode="decimal" value="${Number(data.budgets[c.id] || 0).toFixed(2)}"></div></div>`).join("");
  $("fileIdField").value = meta.fileId || "";
  renderSync(); $("settingsDialog").showModal();
}
$("settingsBtn").onclick = openSettings;
$("settingsClose").onclick = () => {
  let changed = false;
  document.querySelectorAll("[data-budget]").forEach(inp => {
    const v = parseAmount(inp.value);
    if (isFinite(v) && v !== data.budgets[inp.dataset.budget]) { data.budgets[inp.dataset.budget] = v; changed = true; }
  });
  if (changed) { data.budgetsUpdatedAt = Date.now(); touch(); }
  const id = $("fileIdField").value.trim();
  if (id !== meta.fileId) { meta.fileId = id; meta.dirty = true; persist(); scheduleSync(); }
  $("settingsDialog").close();
};
$("copyId").onclick = async () => {
  try { await navigator.clipboard.writeText($("fileIdField").value); toast("File ID copied"); } catch { $("fileIdField").select(); }
};
$("signInBtn").onclick = () => sync(true);
$("syncNowBtn").onclick = () => sync(true);
$("signOutBtn").onclick = () => {
  if (token.value && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value, () => {});
  token.value = ""; token.exp = 0; meta.signedIn = false; save(LS.token, null); persist(); syncState = "local"; renderSync();
};
$("syncPill").onclick = () => { if (!CFG.GOOGLE_CLIENT_ID.startsWith("YOUR_")) sync(true); else openSettings(); };

/* ---------- Google auth (Google Identity Services token flow) ---------- */
const token = Object.assign({ value: "", exp: 0 }, load(LS.token, {}));
let tokenClient = null;
function initTokenClient() {
  if (tokenClient || !window.google?.accounts?.oauth2 || CFG.GOOGLE_CLIENT_ID.startsWith("YOUR_")) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CFG.GOOGLE_CLIENT_ID, scope: CFG.DRIVE_SCOPE, callback: () => {}
  });
}
window.__gsiLoaded = () => { initTokenClient(); if (meta.signedIn) sync(false); };

function getToken(interactive) {
  if (token.value && Date.now() < token.exp - 60000) return Promise.resolve(token.value);
  initTokenClient();
  if (!tokenClient) return Promise.reject(new Error("auth-unavailable"));
  return new Promise((resolve, reject) => {
    tokenClient.callback = r => {
      if (r.error) return reject(new Error(r.error));
      token.value = r.access_token; token.exp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
      save(LS.token, token); meta.signedIn = true; persist(); resolve(token.value);
    };
    tokenClient.error_callback = err => reject(new Error(err?.type || "auth-failed"));
    tokenClient.requestAccessToken({ prompt: interactive ? (meta.signedIn ? "" : "select_account") : "" });
  });
}

/* ---------- Drive REST ---------- */
async function drive(path, opts = {}, auth) {
  const res = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + auth } });
  if (res.status === 401) { token.value = ""; token.exp = 0; throw new Error("unauthorized"); }
  if (!res.ok) throw new Error("drive-" + res.status);
  return res;
}
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

async function ensureFile(auth) {
  if (meta.fileId) return meta.fileId;
  const q = encodeURIComponent(`name='${CFG.DRIVE_FILE_NAME}' and trashed=false and mimeType!='application/vnd.google-apps.folder'`);
  const found = await (await drive(`${API}?q=${q}&fields=files(id,modifiedTime,parents)&orderBy=modifiedTime desc&pageSize=10`, {}, auth)).json();
  if (found.files?.length) return (meta.fileId = found.files[0].id);

  const fq = encodeURIComponent(`name='${CFG.DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const folders = await (await drive(`${API}?q=${fq}&fields=files(id)&pageSize=1`, {}, auth)).json();
  let folderId = folders.files?.[0]?.id;
  if (!folderId) {
    const f = await (await drive(`${API}?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: CFG.DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" })
    }, auth)).json();
    folderId = f.id;
  }
  const boundary = "bt" + Date.now();
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name: CFG.DRIVE_FILE_NAME, mimeType: "application/json", parents: [folderId] }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(exportData(data))}\r\n--${boundary}--`;
  const created = await (await drive(`${UPLOAD}?uploadType=multipart&fields=id`, {
    method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body
  }, auth)).json();
  return (meta.fileId = created.id);
}

function exportData(d) {
  return { version: 1, updatedAt: new Date(d.updatedAt || Date.now()).toISOString(), budgets: d.budgets, budgetsUpdatedAt: d.budgetsUpdatedAt || 0,
    entries: d.entries.map(e => ({ id: e.id, date: e.date, category: e.category, amount: e.amount, store: e.store || "", note: e.note || "", createdAt: e.createdAt, updatedAt: e.updatedAt || 0 })),
    deleted: d.deleted };
}
function importData(r) {
  const ts = v => typeof v === "number" ? v : (Date.parse(v) || 0);
  return { version: 1, updatedAt: ts(r.updatedAt), budgets: { ...CFG.DEFAULT_BUDGETS, ...(r.budgets || {}) }, budgetsUpdatedAt: ts(r.budgetsUpdatedAt),
    entries: (r.entries || []).filter(e => e && e.id).map(e => ({ ...e, amount: Number(e.amount) || 0, updatedAt: e.updatedAt || ts(e.createdAt) })),
    deleted: r.deleted || [] };
}

/* Merge: union by id, newest updatedAt wins per entry, tombstones prevent resurrection. */
function merge(a, b) {
  const tomb = new Map();
  [...a.deleted, ...b.deleted].forEach(t => tomb.set(t.id, Math.max(tomb.get(t.id) || 0, t.deletedAt || 0)));
  const map = new Map();
  [...a.entries, ...b.entries].forEach(e => {
    const cur = map.get(e.id);
    if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) map.set(e.id, e);
  });
  tomb.forEach((_, id) => map.delete(id));
  const useA = (a.budgetsUpdatedAt || 0) >= (b.budgetsUpdatedAt || 0);
  return { version: 1, updatedAt: Math.max(a.updatedAt, b.updatedAt),
    budgets: useA ? a.budgets : b.budgets, budgetsUpdatedAt: Math.max(a.budgetsUpdatedAt || 0, b.budgetsUpdatedAt || 0),
    entries: [...map.values()], deleted: [...tomb].map(([id, deletedAt]) => ({ id, deletedAt })) };
}

/* ---------- sync ---------- */
let syncState = meta.dirty ? "pending" : "local"; // local | pending | busy | ok | err | auth
let syncing = false, rerun = false, syncTimer = null, lastError = "";
function scheduleSync() {
  if (!meta.signedIn || !navigator.onLine) { syncState = meta.signedIn ? "pending" : "local"; renderSync(); return; }
  syncState = "pending"; renderSync();
  clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(false), 1500);
}
async function sync(interactive) {
  if (CFG.GOOGLE_CLIENT_ID.startsWith("YOUR_")) { lastError = "Add your Google Client ID in config.js (see README)."; syncState = "err"; renderSync(); if (interactive) toast(lastError); return; }
  if (!navigator.onLine) { syncState = "pending"; renderSync(); if (interactive) toast("Offline — will sync later"); return; }
  if (syncing) { rerun = true; return; }
  syncing = true; syncState = "busy"; renderSync();
  try {
    const auth = await getToken(interactive);
    const id = await ensureFile(auth);
    const res = await drive(`${API}/${id}?alt=media`, { cache: "no-store" }, auth);
    let remote;
    try { remote = importData(await res.json()); } catch { remote = importData({}); }
    const merged = merge(data, remote);
    const remoteJson = JSON.stringify(exportData(remote)), mergedJson = JSON.stringify(exportData(merged));
    data = merged; persist();
    if (remoteJson !== mergedJson || meta.dirty) {
      await drive(`${UPLOAD}/${id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exportData(merged), null, 2) }, auth);
    }
    meta.dirty = false; meta.lastSync = Date.now(); persist();
    syncState = "ok"; lastError = ""; render();
  } catch (err) {
    lastError = err.message;
    syncState = /auth|popup|access_denied|unauthorized|interaction/i.test(err.message) ? "auth" : "err";
    if (interactive) toast("Sync failed: " + err.message);
  } finally {
    syncing = false; renderSync();
    if (rerun) { rerun = false; scheduleSync(); }
  }
}
function renderSync() {
  const pill = $("syncPill"), txt = $("syncText");
  pill.className = "sync-pill " + ({ ok: "ok", pending: "pending", busy: "busy pending", err: "err", auth: "err", local: "" }[syncState] || "");
  const unsent = meta.dirty && syncState !== "ok";
  txt.textContent = { local: "Local only", pending: "Waiting to sync", busy: "Syncing…", ok: "Synced", err: "Sync error", auth: "Tap to reconnect" }[syncState];
  if (!navigator.onLine && meta.signedIn) txt.textContent = unsent ? "Offline · saved locally" : "Offline";
  const ds = $("driveStatus");
  if (ds) ds.textContent = meta.signedIn
    ? `Signed in. ${meta.lastSync ? "Last sync " + new Date(meta.lastSync).toLocaleString() + "." : "Not synced yet."}${lastError ? " Last error: " + lastError : ""}`
    : "Not signed in. Data is saved on this device only.";
  const f = $("fileIdField"); if (f && document.activeElement !== f) f.value = meta.fileId || "";
}

window.addEventListener("online", () => { if (meta.signedIn) sync(false); renderSync(); });
window.addEventListener("offline", renderSync);
document.addEventListener("visibilitychange", () => { if (!document.hidden && meta.signedIn && navigator.onLine) sync(false); });

/* ---------- boot ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
if (window.google?.accounts?.oauth2) window.__gsiLoaded();
})();
