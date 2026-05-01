/* ═══════════════════════════════════════════════════════════════
   Chadwell Supply — Daily Forklift Inspection System
   ☁️ Firebase Cloud Sync + 💾 localStorage Fallback
   Role-based: Employee / Manager / Admin
   ═══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════
// 🔥 FIREBASE CONFIG — Replace with your project's config
//    Leave apiKey empty to use localStorage (single browser only)
// ══════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "",
  authDomain:        "",
  projectId:         "",
  storageBucket:     "",
  messagingSenderId: "",
  appId:             ""
};

// ══════════════════════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════════════════════

const USE_FIREBASE = !!(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
let db = null;

const DEFAULT_USERS = [
  { username: "employee", pin: "1234", role: "employee", display: "Employee" },
  { username: "manager",  pin: "2468", role: "manager",  display: "Manager" },
  { username: "admin",    pin: "9999", role: "admin",    display: "Admin" }
];

const USERS_KEY    = "forklift_users";
const STORAGE_KEY  = "forklift_inspections_v2";

let usersCache       = [];
let inspectionsCache = [];
let currentUser      = null;   // { username, role, display }
let appReady         = false;

const CHECKLIST_ITEMS = [
  "Forks", "Tires", "Horn", "Lights", "Backup alarm",
  "Seatbelt", "Brakes", "Steering", "Hydraulic leaks",
  "Battery / propane", "Mast / chains", "Data plate",
  "Safety decals", "General damage", "Floor area clear"
];


// ══════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("loginPin").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("loginUser").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginPin").focus();
  });
  await initApp();
});

async function initApp() {
  showLoading(true);

  try {
    if (USE_FIREBASE) {
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();

      // Offline persistence
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) {
        console.warn("Persistence unavailable:", e.code);
      }

      // — Load users —
      const uSnap = await db.collection("users").get();
      usersCache = uSnap.docs.map(d => d.data());

      if (usersCache.length === 0) {
        const batch = db.batch();
        DEFAULT_USERS.forEach(u =>
          batch.set(db.collection("users").doc(u.username), u)
        );
        await batch.commit();
        usersCache = [...DEFAULT_USERS];
      }

      // — Load inspections —
      const iSnap = await db.collection("inspections")
                            .orderBy("timestamp", "desc").get();
      inspectionsCache = iSnap.docs.map(d => d.data());

      // — Real-time listeners —
      db.collection("users").onSnapshot(snap => {
        usersCache = snap.docs.map(d => d.data());
        // Refresh user list if admin is viewing it
        if (appReady && currentUser && currentUser.role === "admin" &&
            !document.getElementById("tabContentUsers").classList.contains("hidden")) {
          renderUsersList();
        }
      });

      db.collection("inspections").orderBy("timestamp", "desc")
        .onSnapshot(snap => {
          inspectionsCache = snap.docs.map(d => d.data());
          if (!appReady) return;
          // Auto-refresh the visible dashboard
          if (currentUser && currentUser.role !== "employee" &&
              !document.getElementById("managerPage").classList.contains("hidden")) {
            renderMgrDashboard();
          }
          if (currentUser && currentUser.role === "employee" &&
              !document.getElementById("employeeDashPage").classList.contains("hidden")) {
            renderEmpRecent();
          }
        });

      console.log("🔥 Firebase connected — data syncs across all devices");
      updateSyncBadge(true);
    } else {
      // localStorage fallback
      usersCache       = loadLocalUsers();
      inspectionsCache = loadLocalInspections();
      console.log("💾 localStorage mode (single browser). Add Firebase config for cloud sync.");
      updateSyncBadge(false);
    }
  } catch (err) {
    console.error("Firebase init failed, falling back to localStorage:", err);
    usersCache       = loadLocalUsers();
    inspectionsCache = loadLocalInspections();
    updateSyncBadge(false);
  }

  appReady = true;
  showLoading(false);

  if (restoreSession()) {
    routeAfterLogin();
  } else {
    showPage("loginPage");
  }
}

function showLoading(show) {
  const el = document.getElementById("loadingOverlay");
  if (el) el.classList.toggle("hidden", !show);
}

function updateSyncBadge(isCloud) {
  const el = document.getElementById("syncBadge");
  if (!el) return;
  if (isCloud) {
    el.textContent = "☁️ Cloud Sync Active";
    el.className   = "sync-badge sync-cloud";
  } else {
    el.textContent = "💾 Local Only";
    el.className   = "sync-badge sync-local";
  }
}


// ══════════════════════════════════════════════════════════════
// DATA — localStorage helpers
// ══════════════════════════════════════════════════════════════

function loadLocalUsers() {
  try {
    const s = JSON.parse(localStorage.getItem(USERS_KEY));
    if (s && s.length > 0) return s;
  } catch {}
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  return [...DEFAULT_USERS];
}

function loadLocalInspections() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}


// ══════════════════════════════════════════════════════════════
// DATA — unified read (always from cache)
// ══════════════════════════════════════════════════════════════

function getUsers()          { return usersCache; }
function getAllInspections()  { return inspectionsCache; }
function getMyInspections()  {
  if (!currentUser) return [];
  return inspectionsCache.filter(r => r.username === currentUser.username);
}


// ══════════════════════════════════════════════════════════════
// DATA — unified write
// ══════════════════════════════════════════════════════════════

async function saveInspection(record) {
  if (USE_FIREBASE) {
    await db.collection("inspections").add(record);
    // Real-time listener will update cache
  } else {
    inspectionsCache.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inspectionsCache));
  }
}

async function addUser(userData) {
  if (USE_FIREBASE) {
    await db.collection("users").doc(userData.username).set(userData);
  } else {
    usersCache.push(userData);
    localStorage.setItem(USERS_KEY, JSON.stringify(usersCache));
  }
}

async function updateUserInStore(username, updatedUser) {
  if (USE_FIREBASE) {
    await db.collection("users").doc(username).set(updatedUser);
  } else {
    const idx = usersCache.findIndex(u => u.username === username);
    if (idx !== -1) usersCache[idx] = updatedUser;
    localStorage.setItem(USERS_KEY, JSON.stringify(usersCache));
  }
}

async function removeUser(username) {
  if (USE_FIREBASE) {
    await db.collection("users").doc(username).delete();
  } else {
    usersCache = usersCache.filter(u => u.username !== username);
    localStorage.setItem(USERS_KEY, JSON.stringify(usersCache));
  }
}

async function clearAllInspectionData() {
  if (USE_FIREBASE) {
    // Batch-delete in groups of 500 (Firestore limit)
    const snap = await db.collection("inspections").get();
    const batchSize = 400;
    for (let i = 0; i < snap.docs.length; i += batchSize) {
      const batch = db.batch();
      snap.docs.slice(i, i + batchSize).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  inspectionsCache = [];
  localStorage.removeItem(STORAGE_KEY);
}


// ══════════════════════════════════════════════════════════════
// LOGIN / LOGOUT / SESSION
// ══════════════════════════════════════════════════════════════

function doLogin() {
  const user = document.getElementById("loginUser").value.trim().toLowerCase();
  const pin  = document.getElementById("loginPin").value.trim();
  const errEl = document.getElementById("loginError");

  const match = getUsers().find(u => u.username.toLowerCase() === user && u.pin === pin);
  if (!match) {
    errEl.textContent = "Invalid username or PIN. Please try again.";
    errEl.classList.remove("hidden");
    return;
  }

  errEl.classList.add("hidden");
  currentUser = { username: match.username, role: match.role, display: match.display };
  sessionStorage.setItem("forklift_session", JSON.stringify(currentUser));
  routeAfterLogin();
}

function doLogout() {
  currentUser = null;
  sessionStorage.removeItem("forklift_session");
  document.getElementById("loginUser").value = "";
  document.getElementById("loginPin").value  = "";
  showPage("loginPage");
}

function restoreSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem("forklift_session"));
    if (s && s.username && s.role) {
      const match = getUsers().find(u => u.username === s.username);
      if (match) { currentUser = s; return true; }
    }
  } catch {}
  return false;
}

function routeAfterLogin() {
  if (!currentUser) { showPage("loginPage"); return; }
  if (currentUser.role === "employee") initEmpDashboard();
  else initMgrDashboard();
}


// ══════════════════════════════════════════════════════════════
// PAGE MANAGEMENT
// ══════════════════════════════════════════════════════════════

function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
  window.scrollTo(0, 0);
}


// ══════════════════════════════════════════════════════════════
// EMPLOYEE DASHBOARD
// ══════════════════════════════════════════════════════════════

function initEmpDashboard() {
  showPage("employeeDashPage");
  document.getElementById("empUserLabel").textContent = currentUser.display;

  const h = new Date().getHours();
  document.getElementById("empGreeting").textContent =
    h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

  renderEmpRecent();
}

function renderEmpRecent() {
  const list    = document.getElementById("empRecentList");
  const records = getMyInspections().slice(0, 10);
  if (records.length === 0) {
    list.innerHTML = '<div class="empty-state">No inspections yet. Start your first one above!</div>';
    return;
  }
  list.innerHTML = records.map(r => renderInspCard(r, false)).join("");
}

function backToEmpDash() { initEmpDashboard(); }


// ══════════════════════════════════════════════════════════════
// INSPECTION FORM
// ══════════════════════════════════════════════════════════════

let checkState = {};

function showInspectionForm() {
  showPage("inspectionPage");
  document.getElementById("inspStep1").classList.remove("hidden");
  document.getElementById("inspStep2").classList.add("hidden");
  document.getElementById("inspStep3").classList.add("hidden");

  document.getElementById("inspDate").value     = new Date().toISOString().split("T")[0];
  document.getElementById("inspOperator").value  = currentUser.display || "";

  checkState = {};
  CHECKLIST_ITEMS.forEach((_, i) => { checkState[i] = { status: null, note: "" }; });
  document.getElementById("inspComments").value = "";
}

function goToChecklist() {
  const branch   = document.getElementById("inspBranch").value.trim();
  const truck    = document.getElementById("inspTruck").value.trim();
  const date     = document.getElementById("inspDate").value;
  const operator = document.getElementById("inspOperator").value.trim();

  if (!branch || !truck || !date || !operator) {
    toast("⚠️ Please fill in Branch, Truck #, Date, and Operator.");
    return;
  }

  const serial = document.getElementById("inspSerial").value.trim();
  const shift  = document.getElementById("inspShift").value;
  document.getElementById("inspInfoBar").innerHTML =
    `<span>📍 ${esc(branch)}</span>` +
    `<span>🚜 Truck #${esc(truck)}</span>` +
    (serial ? `<span>🔢 S/N ${esc(serial)}</span>` : "") +
    `<span>📅 ${date}</span>` +
    `<span>⏰ ${shift} Shift</span>` +
    `<span>👤 ${esc(operator)}</span>`;

  document.getElementById("inspStep1").classList.add("hidden");
  document.getElementById("inspStep2").classList.remove("hidden");
  renderChecklist();
}

function goBackToStep1() {
  document.getElementById("inspStep2").classList.add("hidden");
  document.getElementById("inspStep1").classList.remove("hidden");
}

function renderChecklist() {
  const container = document.getElementById("checklistContainer");
  container.innerHTML = "";

  CHECKLIST_ITEMS.forEach((item, i) => {
    const s = checkState[i];
    let cls = "";
    if (s.status === "pass") cls = "status-pass";
    else if (s.status === "fail") cls = "status-fail";
    else if (s.status === "na") cls = "status-na";

    const div = document.createElement("div");
    div.className = `check-item ${cls}`;
    div.id = `chk-${i}`;

    let html = `
      <div class="check-item-top">
        <span class="check-num">${i + 1}.</span>
        <span class="check-label">${esc(item)}</span>
        <div class="toggle-group">
          <button class="toggle-btn ${s.status === 'pass' ? 'pass-active' : ''}"
                  onclick="setStatus(${i},'pass')">Pass</button>
          <button class="toggle-btn ${s.status === 'fail' ? 'fail-active' : ''}"
                  onclick="setStatus(${i},'fail')">Fail</button>
          <button class="toggle-btn ${s.status === 'na' ? 'na-active' : ''}"
                  onclick="setStatus(${i},'na')">N/A</button>
        </div>
      </div>`;

    if (s.status === "fail") {
      html += `
        <div class="check-comment">
          <input type="text" placeholder="Describe the issue (required)..."
                 value="${esc(s.note)}" oninput="setNote(${i}, this.value)" id="note-${i}">
        </div>`;
    }
    div.innerHTML = html;
    container.appendChild(div);
  });
  updateFailWarning();
}

function setStatus(idx, val) {
  checkState[idx].status = checkState[idx].status === val ? null : val;
  if (checkState[idx].status !== "fail") checkState[idx].note = "";
  renderChecklist();
  if (checkState[idx].status === "fail") {
    setTimeout(() => { const n = document.getElementById(`note-${idx}`); if (n) n.focus(); }, 50);
  }
}

function setNote(idx, val) { checkState[idx].note = val; updateFailWarning(); }

function updateFailWarning() {
  const has = CHECKLIST_ITEMS.some((_, i) =>
    checkState[i].status === "fail" && !checkState[i].note.trim());
  document.getElementById("failWarning").classList.toggle("hidden", !has);
}

async function submitInspection() {
  const unanswered = CHECKLIST_ITEMS.filter((_, i) => checkState[i].status === null);
  if (unanswered.length > 0) {
    if (!confirm(`${unanswered.length} item(s) are not checked. Submit anyway?`)) return;
  }

  const unnotedFails = CHECKLIST_ITEMS.filter((_, i) =>
    checkState[i].status === "fail" && !checkState[i].note.trim());
  if (unnotedFails.length > 0) {
    toast("⚠️ Please add a comment for each failed item before submitting.");
    return;
  }

  const btn = document.getElementById("submitBtn");
  btn.disabled    = true;
  btn.textContent = "⏳ Submitting…";

  const comments = document.getElementById("inspComments").value.trim();
  const record = {
    id:          Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp:   new Date().toISOString(),
    username:    currentUser.username,
    displayName: currentUser.display,
    branch:      document.getElementById("inspBranch").value.trim(),
    truckNum:    document.getElementById("inspTruck").value.trim(),
    serialNum:   document.getElementById("inspSerial").value.trim(),
    inspDate:    document.getElementById("inspDate").value,
    shift:       document.getElementById("inspShift").value,
    operator:    document.getElementById("inspOperator").value.trim(),
    comments,
    items: CHECKLIST_ITEMS.map((label, i) => ({
      label,
      status: checkState[i].status || "skipped",
      note:   checkState[i].note   || ""
    }))
  };

  try {
    await saveInspection(record);

    const passCount = record.items.filter(i => i.status === "pass").length;
    const failCount = record.items.filter(i => i.status === "fail").length;
    const naCount   = record.items.filter(i => i.status === "na").length;

    document.getElementById("inspStep2").classList.add("hidden");
    document.getElementById("inspStep3").classList.remove("hidden");
    document.getElementById("confirmSummary").innerHTML =
      `Truck #<strong>${esc(record.truckNum)}</strong> at <strong>${esc(record.branch)}</strong><br>` +
      `<span style="color:var(--success)">✅ ${passCount} passed</span>` +
      (failCount > 0 ? ` &nbsp; <span style="color:var(--danger)">❌ ${failCount} failed</span>` : "") +
      (naCount > 0 ? ` &nbsp; <span style="color:var(--neutral)">⬜ ${naCount} N/A</span>` : "");

    toast("✅ Inspection submitted!");
  } catch (err) {
    console.error("Submit error:", err);
    toast("⚠️ Error saving — please try again.");
  } finally {
    btn.disabled    = false;
    btn.textContent = "✅ Submit Inspection";
  }
}


// ══════════════════════════════════════════════════════════════
// MANAGER / ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════

function initMgrDashboard() {
  showPage("managerPage");

  const isAdmin = currentUser.role === "admin";
  document.getElementById("mgrTitle").textContent     = isAdmin ? "Admin Dashboard" : "Management";
  document.getElementById("mgrUserLabel").textContent  = currentUser.display;

  document.getElementById("adminClearBtn").classList.toggle("hidden", !isAdmin);
  document.getElementById("adminTabs").classList.toggle("hidden", !isAdmin);

  if (!isAdmin) {
    document.getElementById("tabContentInspections").classList.remove("hidden");
    document.getElementById("tabContentUsers").classList.add("hidden");
  } else {
    switchTab("inspections");
  }

  // Filters
  document.getElementById("mgrFilterDate").value   = new Date().toISOString().split("T")[0];
  document.getElementById("mgrFilterTruck").value   = "";
  document.getElementById("mgrFilterStatus").value  = "";

  const operators = [...new Set(getAllInspections().map(r => r.operator))].sort();
  const sel = document.getElementById("mgrFilterOperator");
  sel.innerHTML = '<option value="">All Operators</option>';
  operators.forEach(op => {
    sel.innerHTML += `<option value="${esc(op)}">${esc(op)}</option>`;
  });

  renderMgrDashboard();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

  if (tab === "users") {
    document.getElementById("tabUsers").classList.add("active");
    document.getElementById("tabContentInspections").classList.add("hidden");
    document.getElementById("tabContentUsers").classList.remove("hidden");
    document.querySelector("#managerPage .filter-bar").classList.add("hidden");
    document.querySelector("#managerPage .stats-row").classList.add("hidden");
    renderUsersList();
  } else {
    document.getElementById("tabInspections").classList.add("active");
    document.getElementById("tabContentInspections").classList.remove("hidden");
    document.getElementById("tabContentUsers").classList.add("hidden");
    document.querySelector("#managerPage .filter-bar").classList.remove("hidden");
    document.querySelector("#managerPage .stats-row").classList.remove("hidden");
    renderMgrDashboard();
  }
}

function renderMgrDashboard() {
  let records = getAllInspections();

  const fDate     = document.getElementById("mgrFilterDate").value;
  const fTruck    = document.getElementById("mgrFilterTruck").value.trim().toLowerCase();
  const fOperator = document.getElementById("mgrFilterOperator").value;
  const fStatus   = document.getElementById("mgrFilterStatus").value;

  if (fDate)     records = records.filter(r => r.inspDate === fDate);
  if (fTruck)    records = records.filter(r => r.truckNum.toLowerCase().includes(fTruck));
  if (fOperator) records = records.filter(r => r.operator === fOperator);
  if (fStatus) {
    records = records.filter(r => {
      const hasFail = r.items.some(i => i.status === "fail");
      return fStatus === "failed" ? hasFail : !hasFail;
    });
  }

  // Stats (for current day filter)
  const dayRecords = fDate
    ? getAllInspections().filter(r => r.inspDate === fDate)
    : getAllInspections();
  const total   = dayRecords.length;
  const drivers = new Set(dayRecords.map(r => r.operator)).size;
  const passed  = dayRecords.filter(r => !r.items.some(i => i.status === "fail")).length;
  const failed  = total - passed;

  document.getElementById("mgrStats").innerHTML = `
    <div class="stat-card s-total"><div class="stat-num">${total}</div><div class="stat-label">Inspections</div></div>
    <div class="stat-card s-drivers"><div class="stat-num">${drivers}</div><div class="stat-label">Operators</div></div>
    <div class="stat-card s-passed"><div class="stat-num">${passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat-card s-failed"><div class="stat-num">${failed}</div><div class="stat-label">Has Failures</div></div>`;

  const list = document.getElementById("mgrList");
  if (records.length === 0) {
    list.innerHTML = '<div class="empty-state">No inspections found. Adjust your filters or check back later.</div>';
    return;
  }
  list.innerHTML = records.map(r => renderInspCard(r, true)).join("");
}


// ══════════════════════════════════════════════════════════════
// USER MANAGEMENT (Admin)
// ══════════════════════════════════════════════════════════════

async function createUser() {
  if (currentUser.role !== "admin") { toast("⛔ Admin only."); return; }

  const display  = document.getElementById("newUserName").value.trim();
  const username = document.getElementById("newUserUsername").value.trim().toLowerCase();
  const pin      = document.getElementById("newUserPin").value.trim();
  const role     = document.getElementById("newUserRole").value;

  if (!display || !username || !pin) {
    toast("⚠️ Please fill in Display Name, Username, and PIN."); return;
  }
  if (pin.length < 4) { toast("⚠️ PIN must be at least 4 digits."); return; }
  if (getUsers().some(u => u.username.toLowerCase() === username)) {
    toast("⚠️ Username already exists."); return;
  }

  try {
    await addUser({ username, pin, role, display });
    document.getElementById("newUserName").value     = "";
    document.getElementById("newUserUsername").value  = "";
    document.getElementById("newUserPin").value       = "";
    document.getElementById("newUserRole").value      = "employee";
    toast(`✅ User "${display}" created!`);
    renderUsersList();
  } catch (err) {
    console.error(err);
    toast("⚠️ Error creating user.");
  }
}

function renderUsersList() {
  const container = document.getElementById("usersList");
  const users = getUsers();
  if (users.length === 0) {
    container.innerHTML = '<div class="empty-state">No users found.</div>';
    return;
  }
  container.innerHTML = users.map(u => {
    const initials = u.display.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const isSelf = u.username === currentUser.username;
    return `
      <div class="user-card">
        <div class="user-avatar role-${u.role}">${initials}</div>
        <div class="user-info">
          <div class="user-display">${esc(u.display)} ${isSelf ? '<span style="color:var(--primary);font-size:.75rem">(you)</span>' : ''}</div>
          <div class="user-meta">@${esc(u.username)} &nbsp;·&nbsp; PIN: ${esc(u.pin)}</div>
        </div>
        <span class="role-badge rb-${u.role}">${u.role}</span>
        <div class="user-actions">
          ${!isSelf ? `<button class="btn btn-sm btn-outline" onclick="editUser('${esc(u.username)}')">✏️</button>` : ''}
          ${!isSelf ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${esc(u.username)}')">🗑️</button>` : ''}
        </div>
      </div>`;
  }).join("");
}

async function editUser(username) {
  if (currentUser.role !== "admin") return;
  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) { toast("User not found."); return; }

  const newDisplay = prompt("Display Name:", user.display);
  if (newDisplay === null) return;
  if (!newDisplay.trim()) { toast("⚠️ Name can't be empty."); return; }

  const newPin = prompt("New PIN (leave blank to keep current):", "");
  if (newPin !== null && newPin !== "" && newPin.length < 4) {
    toast("⚠️ PIN must be at least 4 digits."); return;
  }

  const newRole = prompt("Role (employee / manager / admin):", user.role);
  if (newRole === null) return;
  if (!["employee", "manager", "admin"].includes(newRole.toLowerCase().trim())) {
    toast("⚠️ Role must be employee, manager, or admin."); return;
  }

  const updated = { ...user, display: newDisplay.trim(), role: newRole.toLowerCase().trim() };
  if (newPin && newPin.trim()) updated.pin = newPin.trim();

  try {
    await updateUserInStore(username, updated);
    toast(`✅ User "${updated.display}" updated!`);
    renderUsersList();
  } catch (err) {
    console.error(err);
    toast("⚠️ Error updating user.");
  }
}

async function deleteUser(username) {
  if (currentUser.role !== "admin") return;
  if (username === currentUser.username) { toast("⚠️ Can't delete yourself."); return; }

  const user = getUsers().find(u => u.username === username);
  if (!user) return;
  if (!confirm(`Delete user "${user.display}" (@${user.username})?\n\nThis can't be undone.`)) return;

  try {
    await removeUser(username);
    toast(`🗑️ User "${user.display}" deleted.`);
    renderUsersList();
  } catch (err) {
    console.error(err);
    toast("⚠️ Error deleting user.");
  }
}


// ══════════════════════════════════════════════════════════════
// SHARED INSPECTION CARD
// ══════════════════════════════════════════════════════════════

function renderInspCard(r, showOperator) {
  const passCount = r.items.filter(i => i.status === "pass").length;
  const failCount = r.items.filter(i => i.status === "fail").length;
  const naCount   = r.items.filter(i => i.status === "na").length;
  const hasFail   = failCount > 0;
  const failedItems = r.items.filter(i => i.status === "fail");

  const time    = new Date(r.timestamp).toLocaleString();
  const opLabel = showOperator ? `<span>👤 ${esc(r.operator)}</span>` : "";

  let notesHtml = "";
  if (failedItems.length > 0 || r.comments) {
    notesHtml = '<div class="ic-notes">';
    if (failedItems.length > 0) {
      notesHtml += "<strong>Failed items:</strong>";
      failedItems.forEach(fi => {
        notesHtml += `<div class="ic-fail-item">❌ ${esc(fi.label)}${fi.note ? ': ' + esc(fi.note) : ''}</div>`;
      });
    }
    if (r.comments) notesHtml += `<div class="ic-comment">"${esc(r.comments)}"</div>`;
    notesHtml += '</div>';
  }

  return `
    <div class="insp-card ${hasFail ? 'card-fail' : 'card-pass'}">
      <div class="ic-row1">
        <span class="ic-title">Truck #${esc(r.truckNum)} — ${esc(r.branch)}</span>
        <span class="ic-badge ${hasFail ? 'badge-fail' : 'badge-pass'}">${hasFail ? '⚠️ Failed' : '✅ Passed'}</span>
      </div>
      <div class="ic-meta">
        <span>📅 ${r.inspDate}</span>
        <span>⏰ ${r.shift || '—'} Shift</span>
        ${r.serialNum ? `<span>🔢 ${esc(r.serialNum)}</span>` : ""}
        ${opLabel}
        <span style="color:#9ca3af">${time}</span>
      </div>
      <div class="ic-stats">
        <span class="st-pass">✅ ${passCount}</span>
        <span class="st-fail">❌ ${failCount}</span>
        <span class="st-na">⬜ ${naCount}</span>
      </div>
      ${notesHtml}
    </div>`;
}


// ══════════════════════════════════════════════════════════════
// CSV EXPORT
// ══════════════════════════════════════════════════════════════

function exportCSV() {
  const records = getAllInspections();
  if (records.length === 0) { toast("⚠️ No data to export."); return; }

  const headers = [
    "Date", "Timestamp", "Branch", "Truck #", "Serial #", "Shift", "Operator",
    ...CHECKLIST_ITEMS, "Failure Notes", "Comments"
  ];
  const rows = records.map(r => {
    const failNotes = r.items.filter(i => i.status === "fail" && i.note)
      .map(i => `${i.label}: ${i.note}`).join("; ");
    return [
      r.inspDate, r.timestamp, r.branch, r.truckNum, r.serialNum || "",
      r.shift || "", r.operator,
      ...r.items.map(i => i.status),
      failNotes, r.comments || ""
    ];
  });

  const csv = [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `forklift-inspections-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📤 CSV exported!");
}


// ══════════════════════════════════════════════════════════════
// ADMIN: CLEAR ALL
// ══════════════════════════════════════════════════════════════

async function clearAllData() {
  if (currentUser.role !== "admin") { toast("⛔ Admin only."); return; }
  if (!confirm("⚠️ Delete ALL inspection data?\n\nThis cannot be undone.")) return;

  toast("🗑️ Clearing data…");
  try {
    await clearAllInspectionData();
    renderMgrDashboard();
    toast("🗑️ All inspection data cleared.");
  } catch (err) {
    console.error(err);
    toast("⚠️ Error clearing data.");
  }
}


// ══════════════════════════════════════════════════════════════
// WEEKLY REPORT — matches original Chadwell Supply paper form
// ══════════════════════════════════════════════════════════════

function toggleReportPanel() {
  const panel = document.getElementById("reportPanel");
  const isHidden = panel.classList.contains("hidden");
  panel.classList.toggle("hidden");

  if (isHidden) {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(today);
    monday.setDate(today.getDate() - diff);
    document.getElementById("reportWeekStart").value = monday.toISOString().split("T")[0];

    const trucks = [...new Set(getAllInspections().map(r => r.truckNum))].sort();
    const sel = document.getElementById("reportTruck");
    sel.innerHTML = '<option value="">All Trucks (one page each)</option>';
    trucks.forEach(t => { sel.innerHTML += `<option value="${esc(t)}">${esc(t)}</option>`; });
  }
}

function generateWeeklyReport() {
  const startStr = document.getElementById("reportWeekStart").value;
  if (!startStr) { toast("⚠️ Select a week start date."); return; }

  const start = new Date(startStr + "T00:00:00");
  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    weekDates.push(d.toISOString().split("T")[0]);
  }

  const allRecords = getAllInspections().filter(r => weekDates.includes(r.inspDate));
  if (allRecords.length === 0) { toast("⚠️ No inspections found for that week."); return; }

  const selectedTruck = document.getElementById("reportTruck").value;
  let truckGroups;
  if (selectedTruck) {
    const recs = allRecords.filter(r => r.truckNum === selectedTruck);
    if (recs.length === 0) { toast("⚠️ No inspections for that truck this week."); return; }
    truckGroups = [{ truckNum: selectedTruck, records: recs }];
  } else {
    const trucks = [...new Set(allRecords.map(r => r.truckNum))].sort();
    truckGroups = trucks.map(t => ({ truckNum: t, records: allRecords.filter(r => r.truckNum === t) }));
  }

  const pages = truckGroups.map(g => buildReportPage(g, weekDates, startStr)).join("");
  const win = window.open("", "_blank");
  if (!win) { toast("⚠️ Pop-up blocked. Please allow pop-ups."); return; }
  win.document.write(buildReportShell(pages));
  win.document.close();
}

function buildReportShell(pagesHTML) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Chadwell Supply — Weekly Forklift Inspection Report</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',Arial,sans-serif;font-size:11px;color:#1f2937;background:#fff}
.report-page{width:100%;max-width:10.5in;margin:0 auto 30px;padding:.4in .35in;background:#fff}
.rpt-header{text-align:center;margin-bottom:12px;border-bottom:2px solid #1a56db;padding-bottom:10px}
.rpt-logo{font-family:Georgia,serif;font-size:26px;font-weight:900;color:#1a56db;letter-spacing:-.5px}
.rpt-logo span{font-size:14px;font-weight:600;display:block;color:#4b5563;letter-spacing:2px;text-transform:uppercase;margin-top:-2px}
.rpt-title{font-size:15px;font-weight:700;margin-top:4px;color:#1f2937}
.rpt-info{display:flex;flex-wrap:wrap;gap:4px 24px;margin-bottom:8px;font-size:11px}
.rpt-info .field{display:flex;align-items:baseline;gap:4px}
.rpt-info .field b{font-weight:700;white-space:nowrap}
.rpt-info .field .val{border-bottom:1px solid #374151;min-width:80px;padding:0 4px 1px;font-weight:600}
.rpt-instr{font-size:9.5px;color:#6b7280;text-align:center;margin-bottom:6px;font-style:italic}
.rpt-table{width:100%;border-collapse:collapse;margin-bottom:10px;font-size:10.5px}
.rpt-table th,.rpt-table td{border:1px solid #9ca3af;padding:4px 5px;text-align:center;vertical-align:middle}
.rpt-table th{background:#1e3a5f;color:#fff;font-weight:700;font-size:10px;letter-spacing:.3px}
.rpt-table th.day-header{min-width:62px}
.rpt-table th.item-header{text-align:left;min-width:200px;background:#1a56db}
.rpt-table .section-row td{background:#e5e7eb;font-weight:800;font-size:10.5px;text-align:center;letter-spacing:.3px;padding:5px;border-top:2px solid #6b7280}
.rpt-table .item-label{text-align:left;font-weight:500;padding-left:10px;background:#f9fafb}
.rpt-table .cell-pass{color:#1f2937;font-weight:700;font-size:11px}
.rpt-table .cell-fail{color:#dc2626;font-weight:800;font-size:12px;background:#fee2e2}
.rpt-table .cell-na{color:#9ca3af;font-size:10px}
.rpt-table .cell-empty{background:#f3f4f6}
.rpt-comments{border:1px solid #9ca3af;padding:8px 10px;min-height:60px;font-size:10.5px;margin-bottom:8px}
.rpt-comments b{display:block;margin-bottom:4px}
.rpt-comments .fail-note{color:#dc2626;margin-bottom:2px}
.rpt-comments .comment-note{color:#374151;font-style:italic}
.rpt-footer{font-size:9px;color:#9ca3af;text-align:center;margin-top:12px;padding-top:8px;border-top:1px solid #e5e7eb}
.print-bar{position:fixed;top:0;left:0;right:0;background:#1e3a5f;color:#fff;padding:10px 20px;display:flex;align-items:center;gap:16px;z-index:100;box-shadow:0 2px 10px rgba(0,0,0,.3);font-family:'Inter',sans-serif}
.print-bar button{padding:8px 24px;font-size:14px;font-weight:700;font-family:inherit;border:none;border-radius:6px;cursor:pointer;background:#3b82f6;color:#fff}
.print-bar button:hover{background:#2563eb}
.print-bar .info{font-size:13px}
.print-spacer{height:56px}
@media print{.print-bar,.print-spacer{display:none!important}body{padding:0}.report-page{margin:0;padding:.3in .25in;page-break-after:always;max-width:100%}.report-page:last-child{page-break-after:auto}}
@page{size:landscape;margin:.2in}
</style></head><body>
<div class="print-bar"><button onclick="window.print()">🖨️ Print / Save PDF</button><span class="info">Tip: landscape orientation. Save as PDF to email.</span></div>
<div class="print-spacer"></div>${pagesHTML}</body></html>`;
}

function buildReportPage(group, weekDates, startStr) {
  const records = group.records;
  const sample = records[0];
  const dayNames = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const sd = new Date(startStr + "T12:00:00");
  const startFormatted = sd.toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"});

  const sections = [
    { title:"Motor-Off Checks", items:["Forks","Tires","Hydraulic leaks","Battery / propane","Mast / chains","Seatbelt","Data plate","Safety decals","General damage","Floor area clear"] },
    { title:"Motor-On Checks",  items:["Horn","Lights","Backup alarm","Brakes","Steering"] }
  ];

  const dayRecords = {};
  weekDates.forEach((ds, i) => {
    const dr = records.filter(r => r.inspDate === ds).sort((a,b) => b.timestamp.localeCompare(a.timestamp));
    if (dr.length > 0) dayRecords[i] = dr[0];
  });

  const allNotes = [];
  weekDates.forEach((_, i) => {
    const rec = dayRecords[i]; if (!rec) return;
    rec.items.forEach(item => {
      if (item.status === "fail")
        allNotes.push({ day:dayNames[i], item:item.label, note:item.note||"(no details)", type:"fail" });
    });
    if (rec.comments) allNotes.push({ day:dayNames[i], note:rec.comments, type:"comment" });
  });

  let rows = "<tr><th class='item-header'>Inspection Item</th>";
  dayNames.forEach((day,i) => {
    const d = new Date(weekDates[i]+"T12:00:00");
    rows += `<th class="day-header">${day}<br><span style="font-weight:400;font-size:9px">${(d.getMonth()+1)+"/"+d.getDate()}</span></th>`;
  });
  rows += "</tr>";

  sections.forEach(sec => {
    rows += `<tr class="section-row"><td colspan="8">${escHtml(sec.title)}</td></tr>`;
    sec.items.forEach(itemLabel => {
      rows += "<tr><td class='item-label'>" + escHtml(itemLabel) + "</td>";
      dayNames.forEach((_,di) => {
        const rec = dayRecords[di];
        if (!rec) { rows += '<td class="cell-empty"></td>'; return; }
        const f = rec.items.find(it => it.label === itemLabel);
        if (!f || f.status === "skipped") rows += '<td class="cell-empty"></td>';
        else if (f.status === "pass") rows += `<td class="cell-pass">${escHtml(getInitials(rec.operator))}</td>`;
        else if (f.status === "fail") rows += `<td class="cell-fail">✗ ${escHtml(getInitials(rec.operator))}</td>`;
        else if (f.status === "na") rows += '<td class="cell-na">N/A</td>';
        else rows += '<td class="cell-empty"></td>';
      });
      rows += "</tr>";
    });
  });

  let commentsHTML = "<b>Comments / Failure Notes:</b>";
  if (allNotes.length > 0) {
    allNotes.forEach(n => {
      if (n.type === "fail") commentsHTML += `<div class="fail-note">⚠ ${escHtml(n.day)} — ${escHtml(n.item)}: ${escHtml(n.note)}</div>`;
      else commentsHTML += `<div class="comment-note">${escHtml(n.day)}: "${escHtml(n.note)}"</div>`;
    });
  } else {
    commentsHTML += '<div style="color:#9ca3af;margin-top:4px">No failures or comments this week.</div>';
  }

  return `<div class="report-page">
    <div class="rpt-header"><div class="rpt-logo">Chadwell<span>SUPPLY</span></div><div class="rpt-title">Daily Pre-use Inspection Checklist</div></div>
    <div class="rpt-info">
      <div class="field"><b>Branch:</b><span class="val">${escHtml(sample.branch||"—")}</span></div>
      <div class="field"><b>Truck #:</b><span class="val">${escHtml(group.truckNum)}</span></div>
      <div class="field"><b>Serial #:</b><span class="val">${escHtml(sample.serialNum||"—")}</span></div>
      <div class="field"><b>Shift:</b><span class="val">${escHtml(sample.shift||"—")}</span></div>
      <div class="field"><b>Start Date:</b><span class="val">${escHtml(startFormatted)}</span></div>
    </div>
    <div class="rpt-instr">Enter initials if item passes. For failures: mark with ✗ and describe in comments.</div>
    <table class="rpt-table">${rows}</table>
    <div class="rpt-comments">${commentsHTML}</div>
    <div class="rpt-footer">Generated ${new Date().toLocaleString()} — Chadwell Supply Forklift Inspection System</div>
  </div>`;
}

function getInitials(name) {
  if (!name) return "—";
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0,3);
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}


// ══════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function toast(msg) {
  const el = document.getElementById("toastEl");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3000);
}
