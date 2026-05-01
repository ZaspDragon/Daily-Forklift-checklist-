/* ═══════════════════════════════════════════════════════════════
   Chadwell Supply — Daily Forklift Inspection System
   Role-based: Employee / Manager / Admin
   Admin can create/edit/delete users
   localStorage now — Firebase-ready architecture
   ═══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════════════
// USER MANAGEMENT — swap for Firebase Auth later
// ══════════════════════════════════════════════════════════════

const DEFAULT_USERS = [
  { username: "employee", pin: "1234", role: "employee", display: "Employee" },
  { username: "manager",  pin: "2468", role: "manager",  display: "Manager" },
  { username: "admin",    pin: "9999", role: "admin",    display: "Admin" }
];

const USERS_KEY = "forklift_users";

function getUsers() {
  try {
    const stored = JSON.parse(localStorage.getItem(USERS_KEY));
    if (stored && stored.length > 0) return stored;
  } catch {}
  // First run — seed defaults
  localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
  return [...DEFAULT_USERS];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

let currentUser = null;  // { username, role, display }

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
  document.getElementById("loginPin").value = "";
  showPage("loginPage");
}

function restoreSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem("forklift_session"));
    if (s && s.username && s.role) {
      // Verify user still exists
      const match = getUsers().find(u => u.username === s.username);
      if (match) { currentUser = s; return true; }
    }
  } catch {}
  return false;
}

function routeAfterLogin() {
  if (!currentUser) { showPage("loginPage"); return; }
  if (currentUser.role === "employee") {
    initEmpDashboard();
  } else {
    initMgrDashboard();
  }
}

// Enter key handlers
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loginPin").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("loginUser").addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginPin").focus();
  });
  if (restoreSession()) routeAfterLogin();
});


// ══════════════════════════════════════════════════════════════
// DATA — swap for Firestore later
// ══════════════════════════════════════════════════════════════

const STORAGE_KEY = "forklift_inspections_v2";

function getAllInspections() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveInspection(record) {
  const all = getAllInspections();
  all.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function clearAllInspections() {
  localStorage.removeItem(STORAGE_KEY);
}

function getMyInspections() {
  if (!currentUser) return [];
  return getAllInspections().filter(r => r.username === currentUser.username);
}


// ══════════════════════════════════════════════════════════════
// CHECKLIST ITEMS — 15-item list
// ══════════════════════════════════════════════════════════════

const CHECKLIST_ITEMS = [
  "Forks",
  "Tires",
  "Horn",
  "Lights",
  "Backup alarm",
  "Seatbelt",
  "Brakes",
  "Steering",
  "Hydraulic leaks",
  "Battery / propane",
  "Mast / chains",
  "Data plate",
  "Safety decals",
  "General damage",
  "Floor area clear"
];


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

  const hour = new Date().getHours();
  let greeting = "morning";
  if (hour >= 12 && hour < 17) greeting = "afternoon";
  else if (hour >= 17) greeting = "evening";
  document.getElementById("empGreeting").textContent = greeting;

  renderEmpRecent();
}

function renderEmpRecent() {
  const list = document.getElementById("empRecentList");
  const records = getMyInspections().slice(0, 10);

  if (records.length === 0) {
    list.innerHTML = '<div class="empty-state">No inspections yet. Start your first one above!</div>';
    return;
  }
  list.innerHTML = records.map(r => renderInspCard(r, false)).join("");
}

function backToEmpDash() {
  initEmpDashboard();
}


// ══════════════════════════════════════════════════════════════
// INSPECTION FORM
// ══════════════════════════════════════════════════════════════

let checkState = {};

function showInspectionForm() {
  showPage("inspectionPage");
  document.getElementById("inspStep1").classList.remove("hidden");
  document.getElementById("inspStep2").classList.add("hidden");
  document.getElementById("inspStep3").classList.add("hidden");

  document.getElementById("inspDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("inspOperator").value = currentUser.display || "";

  checkState = {};
  CHECKLIST_ITEMS.forEach((_, i) => {
    checkState[i] = { status: null, note: "" };
  });
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
    let statusClass = "";
    if (s.status === "pass") statusClass = "status-pass";
    else if (s.status === "fail") statusClass = "status-fail";
    else if (s.status === "na") statusClass = "status-na";

    const div = document.createElement("div");
    div.className = `check-item ${statusClass}`;
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
      </div>
    `;

    if (s.status === "fail") {
      html += `
        <div class="check-comment">
          <input type="text" placeholder="Describe the issue (required)..."
                 value="${esc(s.note)}"
                 oninput="setNote(${i}, this.value)"
                 id="note-${i}">
        </div>
      `;
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
    setTimeout(() => {
      const noteEl = document.getElementById(`note-${idx}`);
      if (noteEl) noteEl.focus();
    }, 50);
  }
}

function setNote(idx, val) {
  checkState[idx].note = val;
  updateFailWarning();
}

function updateFailWarning() {
  const hasUnnotedFail = CHECKLIST_ITEMS.some((_, i) =>
    checkState[i].status === "fail" && !checkState[i].note.trim()
  );
  const el = document.getElementById("failWarning");
  if (hasUnnotedFail) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

function submitInspection() {
  const unanswered = CHECKLIST_ITEMS.filter((_, i) => checkState[i].status === null);
  if (unanswered.length > 0) {
    if (!confirm(`${unanswered.length} item(s) are not checked. Submit anyway?`)) return;
  }

  const unnotedFails = CHECKLIST_ITEMS.filter((_, i) =>
    checkState[i].status === "fail" && !checkState[i].note.trim()
  );
  if (unnotedFails.length > 0) {
    toast("⚠️ Please add a comment for each failed item before submitting.");
    return;
  }

  const failCount = CHECKLIST_ITEMS.filter((_, i) => checkState[i].status === "fail").length;
  const comments = document.getElementById("inspComments").value.trim();

  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    username: currentUser.username,
    displayName: currentUser.display,
    branch: document.getElementById("inspBranch").value.trim(),
    truckNum: document.getElementById("inspTruck").value.trim(),
    serialNum: document.getElementById("inspSerial").value.trim(),
    inspDate: document.getElementById("inspDate").value,
    shift: document.getElementById("inspShift").value,
    operator: document.getElementById("inspOperator").value.trim(),
    comments,
    items: CHECKLIST_ITEMS.map((label, i) => ({
      label,
      status: checkState[i].status || "skipped",
      note: checkState[i].note || ""
    }))
  };

  saveInspection(record);

  const passCount = record.items.filter(i => i.status === "pass").length;
  const naCount   = record.items.filter(i => i.status === "na").length;

  document.getElementById("inspStep2").classList.add("hidden");
  document.getElementById("inspStep3").classList.remove("hidden");
  document.getElementById("confirmSummary").innerHTML =
    `Truck #<strong>${esc(record.truckNum)}</strong> at <strong>${esc(record.branch)}</strong><br>` +
    `<span style="color:var(--success)">✅ ${passCount} passed</span>` +
    (failCount > 0 ? ` &nbsp; <span style="color:var(--danger)">❌ ${failCount} failed</span>` : "") +
    (naCount > 0 ? ` &nbsp; <span style="color:var(--neutral)">⬜ ${naCount} N/A</span>` : "");

  toast("✅ Inspection submitted successfully!");
}


// ══════════════════════════════════════════════════════════════
// MANAGER / ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════

function initMgrDashboard() {
  showPage("managerPage");

  const isAdmin = currentUser.role === "admin";
  document.getElementById("mgrTitle").textContent = isAdmin ? "Admin Dashboard" : "Management";
  document.getElementById("mgrUserLabel").textContent = currentUser.display;

  // Show/hide admin-only elements
  document.getElementById("adminClearBtn").classList.toggle("hidden", !isAdmin);
  document.getElementById("adminTabs").classList.toggle("hidden", !isAdmin);

  // If not admin, make sure inspections tab is showing
  if (!isAdmin) {
    document.getElementById("tabContentInspections").classList.remove("hidden");
    document.getElementById("tabContentUsers").classList.add("hidden");
  } else {
    switchTab("inspections");
  }

  // Filters
  document.getElementById("mgrFilterDate").value = new Date().toISOString().split("T")[0];
  document.getElementById("mgrFilterTruck").value = "";
  document.getElementById("mgrFilterStatus").value = "";

  const operators = [...new Set(getAllInspections().map(r => r.operator))].sort();
  const sel = document.getElementById("mgrFilterOperator");
  sel.innerHTML = '<option value="">All Operators</option>';
  operators.forEach(op => {
    sel.innerHTML += `<option value="${esc(op)}">${esc(op)}</option>`;
  });

  renderMgrDashboard();
}

function switchTab(tab) {
  const tabBtns = document.querySelectorAll(".tab-btn");
  tabBtns.forEach(b => b.classList.remove("active"));

  if (tab === "users") {
    document.getElementById("tabUsers").classList.add("active");
    document.getElementById("tabContentInspections").classList.add("hidden");
    document.getElementById("tabContentUsers").classList.remove("hidden");
    // Also hide the filter bar and stats for cleaner look
    document.querySelector(".filter-bar").classList.add("hidden");
    document.querySelector(".stats-row").classList.add("hidden");
    renderUsersList();
  } else {
    document.getElementById("tabInspections").classList.add("active");
    document.getElementById("tabContentInspections").classList.remove("hidden");
    document.getElementById("tabContentUsers").classList.add("hidden");
    document.querySelector(".filter-bar").classList.remove("hidden");
    document.querySelector(".stats-row").classList.remove("hidden");
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

  // Stats
  const dayRecords = fDate ? getAllInspections().filter(r => r.inspDate === fDate) : getAllInspections();
  const total   = dayRecords.length;
  const drivers = new Set(dayRecords.map(r => r.operator)).size;
  const passed  = dayRecords.filter(r => !r.items.some(i => i.status === "fail")).length;
  const failed  = total - passed;

  document.getElementById("mgrStats").innerHTML = `
    <div class="stat-card s-total"><div class="stat-num">${total}</div><div class="stat-label">Inspections</div></div>
    <div class="stat-card s-drivers"><div class="stat-num">${drivers}</div><div class="stat-label">Operators</div></div>
    <div class="stat-card s-passed"><div class="stat-num">${passed}</div><div class="stat-label">Passed</div></div>
    <div class="stat-card s-failed"><div class="stat-num">${failed}</div><div class="stat-label">Has Failures</div></div>
  `;

  const list = document.getElementById("mgrList");
  if (records.length === 0) {
    list.innerHTML = `<div class="empty-state">No inspections found. Adjust your filters or check back later.</div>`;
    return;
  }
  list.innerHTML = records.map(r => renderInspCard(r, true)).join("");
}


// ══════════════════════════════════════════════════════════════
// USER MANAGEMENT (Admin only)
// ══════════════════════════════════════════════════════════════

function createUser() {
  if (currentUser.role !== "admin") { toast("⛔ Admin only."); return; }

  const display  = document.getElementById("newUserName").value.trim();
  const username = document.getElementById("newUserUsername").value.trim().toLowerCase();
  const pin      = document.getElementById("newUserPin").value.trim();
  const role     = document.getElementById("newUserRole").value;

  if (!display || !username || !pin) {
    toast("⚠️ Please fill in Display Name, Username, and PIN.");
    return;
  }

  if (pin.length < 4) {
    toast("⚠️ PIN must be at least 4 digits.");
    return;
  }

  const users = getUsers();

  // Check for duplicate username
  if (users.some(u => u.username.toLowerCase() === username)) {
    toast("⚠️ Username already exists. Choose a different one.");
    return;
  }

  users.push({ username, pin, role, display });
  saveUsers(users);

  // Clear form
  document.getElementById("newUserName").value = "";
  document.getElementById("newUserUsername").value = "";
  document.getElementById("newUserPin").value = "";
  document.getElementById("newUserRole").value = "employee";

  toast(`✅ User "${display}" created!`);
  renderUsersList();
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
      </div>
    `;
  }).join("");
}

function editUser(username) {
  if (currentUser.role !== "admin") return;

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) { toast("User not found."); return; }

  const newDisplay = prompt("Display Name:", user.display);
  if (newDisplay === null) return;  // cancelled
  if (!newDisplay.trim()) { toast("⚠️ Name can't be empty."); return; }

  const newPin = prompt("New PIN (leave blank to keep current):", "");
  if (newPin !== null && newPin !== "" && newPin.length < 4) {
    toast("⚠️ PIN must be at least 4 digits.");
    return;
  }

  const newRole = prompt("Role (employee / manager / admin):", user.role);
  if (newRole === null) return;
  if (!["employee", "manager", "admin"].includes(newRole.toLowerCase().trim())) {
    toast("⚠️ Role must be employee, manager, or admin.");
    return;
  }

  // Apply changes
  user.display = newDisplay.trim();
  if (newPin && newPin.trim()) user.pin = newPin.trim();
  user.role = newRole.toLowerCase().trim();

  saveUsers(users);
  toast(`✅ User "${user.display}" updated!`);
  renderUsersList();
}

function deleteUser(username) {
  if (currentUser.role !== "admin") return;
  if (username === currentUser.username) { toast("⚠️ Can't delete yourself."); return; }

  const users = getUsers();
  const user = users.find(u => u.username === username);
  if (!user) return;

  if (!confirm(`Delete user "${user.display}" (@${user.username})?\n\nThis can't be undone.`)) return;

  const updated = users.filter(u => u.username !== username);
  saveUsers(updated);
  toast(`🗑️ User "${user.display}" deleted.`);
  renderUsersList();
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

  const time = new Date(r.timestamp).toLocaleString();
  const opLabel = showOperator ? `<span>👤 ${esc(r.operator)}</span>` : "";

  let notesHtml = "";
  if (failedItems.length > 0 || r.comments) {
    notesHtml = `<div class="ic-notes">`;
    if (failedItems.length > 0) {
      notesHtml += `<strong>Failed items:</strong>`;
      failedItems.forEach(fi => {
        notesHtml += `<div class="ic-fail-item">❌ ${esc(fi.label)}${fi.note ? ': ' + esc(fi.note) : ''}</div>`;
      });
    }
    if (r.comments) {
      notesHtml += `<div class="ic-comment">"${esc(r.comments)}"</div>`;
    }
    notesHtml += `</div>`;
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
    </div>
  `;
}


// ══════════════════════════════════════════════════════════════
// CSV EXPORT
// ══════════════════════════════════════════════════════════════

function exportCSV() {
  const records = getAllInspections();
  if (records.length === 0) { toast("⚠️ No data to export."); return; }

  const headers = [
    "Date", "Timestamp", "Branch", "Truck #", "Serial #", "Shift", "Operator",
    ...CHECKLIST_ITEMS,
    "Failure Notes", "Comments"
  ];

  const rows = records.map(r => {
    const failNotes = r.items
      .filter(i => i.status === "fail" && i.note)
      .map(i => `${i.label}: ${i.note}`)
      .join("; ");
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `forklift-inspections-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("📤 CSV exported!");
}


// ══════════════════════════════════════════════════════════════
// ADMIN: CLEAR ALL
// ══════════════════════════════════════════════════════════════

function clearAllData() {
  if (currentUser.role !== "admin") { toast("⛔ Admin only."); return; }
  if (!confirm("⚠️ Delete ALL inspection data?\n\nThis cannot be undone.")) return;
  clearAllInspections();
  renderMgrDashboard();
  toast("🗑️ All inspection data cleared.");
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
