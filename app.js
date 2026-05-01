/* ═══════════════════════════════════════════════════════════════
   Chadwell Supply — Daily Pre-use Forklift Inspection Checklist
   ═══════════════════════════════════════════════════════════════ */

// ── Checklist Data ──────────────────────────────────────────────
const SECTIONS = [
  {
    id: "motor-off",
    title: "Motor-Off Checks",
    cssClass: "motor-off",
    items: [
      "Operator's manual present",
      "Fluids – Hydraulic, transmission, brake",
      "Leaks – Check for signs of fluid leaks",
      "Tires – Condition",
      "Forks, top clip retaining pin & heel condition",
      "Load backrest is attached",
      "Finger guards are attached",
      "Overhead guards are attached",
      "Battery – Properly secured and maintained",
      "Seatbelt working properly",
      "Capacity plate(s) present and legible",
      "Safety warning labels present and legible"
    ]
  },
  {
    id: "motor-on",
    title: "Motor-On Checks",
    cssClass: "motor-on",
    items: [
      "Accelerator functioning smoothly",
      "Parking brake – holds truck",
      "Service brake functioning smoothly",
      "Steering functioning smoothly",
      "Drive controls FWD/REV working smoothly",
      "All fork controls functioning smoothly",
      "Attachment control functioning smoothly",
      "Horn, all lights, alarms all working",
      "All instruments/gauges/meters working"
    ]
  },
  {
    id: "electric",
    title: "Electric Trucks",
    cssClass: "electric",
    items: [
      "Batteries – free from damage and charged"
    ]
  },
  {
    id: "propane",
    title: "Propane Trucks",
    cssClass: "propane",
    items: [
      "Tank properly mounted and secured",
      "Inspect cylinder, gauge, valve, connection",
      "Hose securely connected and free from damage"
    ]
  }
];

const STORAGE_KEY = "forklift_inspections";

// ── State ───────────────────────────────────────────────────────
let checkState = {};   // key: "section-idx" → "pass"|"fail"|"na"|null
let sectionOpen = {};  // key: sectionId → boolean

// ── Init ────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Set today's date
  document.getElementById("inspDate").valueAsDate = new Date();

  // Initialize state
  let itemNum = 0;
  SECTIONS.forEach(sec => {
    sectionOpen[sec.id] = true;
    sec.items.forEach((_, i) => {
      checkState[`${sec.id}-${i}`] = null;
      itemNum++;
    });
  });

  renderChecklist();
});

// ── Render ──────────────────────────────────────────────────────
function renderChecklist() {
  const container = document.getElementById("checklistContainer");
  container.innerHTML = "";

  let globalIdx = 0;

  SECTIONS.forEach(sec => {
    const section = document.createElement("div");
    section.className = "checklist-section";

    // Count statuses for this section
    const counts = { pass: 0, fail: 0, na: 0, pending: 0 };
    sec.items.forEach((_, i) => {
      const st = checkState[`${sec.id}-${i}`];
      if (st === "pass") counts.pass++;
      else if (st === "fail") counts.fail++;
      else if (st === "na") counts.na++;
      else counts.pending++;
    });

    const statusText = counts.pending === 0
      ? (counts.fail > 0 ? `⚠️ ${counts.fail} failed` : "✅ All clear")
      : `${counts.pending} remaining`;

    // Header
    const header = document.createElement("div");
    header.className = `section-header ${sec.cssClass}`;
    header.innerHTML = `
      <span>${sec.title} <span style="font-weight:400;font-size:.78rem;opacity:.7">(${statusText})</span></span>
      <span class="chevron ${sectionOpen[sec.id] ? 'open' : ''}">▼</span>
    `;
    header.onclick = () => {
      sectionOpen[sec.id] = !sectionOpen[sec.id];
      renderChecklist();
    };
    section.appendChild(header);

    // Body
    if (sectionOpen[sec.id]) {
      const body = document.createElement("div");
      body.className = "section-body";

      sec.items.forEach((item, i) => {
        globalIdx++;
        const key = `${sec.id}-${i}`;
        const state = checkState[key];

        const row = document.createElement("div");
        row.className = "check-row";
        row.innerHTML = `
          <span class="item-num">${globalIdx}.</span>
          <span class="item-label">${item}</span>
          <div class="toggle-group">
            <button class="toggle-btn ${state === 'pass' ? 'pass-active' : ''}"
                    onclick="setCheck('${key}','pass')" title="Pass">Pass</button>
            <button class="toggle-btn ${state === 'fail' ? 'fail-active' : ''}"
                    onclick="setCheck('${key}','fail')" title="Fail">Fail</button>
            <button class="toggle-btn ${state === 'na' ? 'na-active' : ''}"
                    onclick="setCheck('${key}','na')" title="N/A">N/A</button>
          </div>
        `;
        body.appendChild(row);
      });

      section.appendChild(body);
    }

    container.appendChild(section);
  });
}

function setCheck(key, value) {
  checkState[key] = checkState[key] === value ? null : value;
  renderChecklist();
}

// ── Submit ──────────────────────────────────────────────────────
function submitChecklist() {
  const branch    = document.getElementById("branch").value.trim();
  const truckNum  = document.getElementById("truckNum").value.trim();
  const serialNum = document.getElementById("serialNum").value.trim();
  const inspDate  = document.getElementById("inspDate").value;
  const shift     = document.getElementById("shift").value;
  const operator  = document.getElementById("operator").value.trim().toUpperCase();
  const comments  = document.getElementById("comments").value.trim();

  // Validate required fields
  if (!branch || !truckNum || !inspDate || !operator) {
    toast("⚠️ Please fill in Branch, Truck #, Date, and Operator Initials.");
    return;
  }

  // Check for unanswered items (excluding N/A sections)
  const unanswered = [];
  let idx = 0;
  SECTIONS.forEach(sec => {
    sec.items.forEach((item, i) => {
      idx++;
      const st = checkState[`${sec.id}-${i}`];
      if (st === null) unanswered.push(`#${idx} ${item}`);
    });
  });

  if (unanswered.length > 0) {
    const proceed = confirm(
      `${unanswered.length} item(s) are not checked:\n\n` +
      unanswered.slice(0, 5).join("\n") +
      (unanswered.length > 5 ? `\n...and ${unanswered.length - 5} more` : "") +
      `\n\nSubmit anyway?`
    );
    if (!proceed) return;
  }

  // Check for failures without comments
  const failures = [];
  idx = 0;
  SECTIONS.forEach(sec => {
    sec.items.forEach((item, i) => {
      idx++;
      if (checkState[`${sec.id}-${i}`] === "fail") {
        failures.push(`#${idx} ${item}`);
      }
    });
  });

  if (failures.length > 0 && !comments) {
    const proceed = confirm(
      `You have ${failures.length} failed item(s) but no comments.\n` +
      `It's recommended to describe failures.\n\nSubmit anyway?`
    );
    if (!proceed) return;
  }

  // Build record
  const record = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    branch,
    truckNum,
    serialNum,
    inspDate,
    shift,
    operator,
    comments,
    items: {}
  };

  SECTIONS.forEach(sec => {
    sec.items.forEach((item, i) => {
      record.items[`${sec.id}-${i}`] = {
        label: item,
        section: sec.title,
        status: checkState[`${sec.id}-${i}`] || "skipped"
      };
    });
  });

  // Save
  const history = getHistory();
  history.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

  toast("✅ Inspection submitted successfully!");
  clearForm();
  renderHistory();
}

// ── Clear ───────────────────────────────────────────────────────
function clearForm() {
  // Reset checks
  SECTIONS.forEach(sec => {
    sec.items.forEach((_, i) => {
      checkState[`${sec.id}-${i}`] = null;
    });
  });
  document.getElementById("comments").value = "";
  renderChecklist();
}

// ── History ─────────────────────────────────────────────────────
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function toggleHistory() {
  const panel = document.getElementById("historyPanel");
  panel.classList.toggle("hidden");
  if (!panel.classList.contains("hidden")) renderHistory();
}

function renderHistory() {
  const list = document.getElementById("historyList");
  let records = getHistory();

  // Apply filters
  const dateFilter  = document.getElementById("histFilterDate").value;
  const truckFilter = document.getElementById("histFilterTruck").value.trim().toLowerCase();

  if (dateFilter) records = records.filter(r => r.inspDate === dateFilter);
  if (truckFilter) records = records.filter(r => r.truckNum.toLowerCase().includes(truckFilter));

  if (records.length === 0) {
    list.innerHTML = '<div class="empty-state">No inspections found.</div>';
    return;
  }

  list.innerHTML = records.map(r => {
    const items = Object.values(r.items);
    const pass = items.filter(i => i.status === "pass").length;
    const fail = items.filter(i => i.status === "fail").length;
    const na   = items.filter(i => i.status === "na").length;
    const skip = items.filter(i => i.status === "skipped").length;
    const failedItems = items.filter(i => i.status === "fail");

    const dateStr = new Date(r.timestamp).toLocaleString();

    return `
      <div class="history-card">
        <div class="hc-header">
          <strong>Truck #${r.truckNum} — Branch ${r.branch}</strong>
          <span class="hc-meta">${dateStr} | Shift: ${r.shift || "—"} | Operator: ${r.operator}</span>
        </div>
        <div class="hc-stats">
          <span class="stat-pass">✅ ${pass} passed</span>
          <span class="stat-fail">❌ ${fail} failed</span>
          <span class="stat-na">⬜ ${na} N/A</span>
          ${skip > 0 ? `<span style="color:#9ca3af">⏭️ ${skip} skipped</span>` : ""}
        </div>
        ${r.comments ? `<div class="hc-comments">"${r.comments}"</div>` : ""}
        ${failedItems.length > 0 ? `
          <details class="hc-details">
            <summary>View failed items (${failedItems.length})</summary>
            ${failedItems.map(fi => `<div class="hc-fail-item">❌ ${fi.label} (${fi.section})</div>`).join("")}
          </details>
        ` : ""}
      </div>
    `;
  }).join("");
}

function clearHistory() {
  if (confirm("Delete ALL inspection history? This cannot be undone.")) {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
    toast("🗑️ History cleared.");
  }
}

// ── Export CSV ───────────────────────────────────────────────────
function exportCSV() {
  const records = getHistory();
  if (records.length === 0) {
    toast("⚠️ No inspections to export.");
    return;
  }

  // Build CSV
  const allItemKeys = [];
  SECTIONS.forEach(sec => {
    sec.items.forEach((item, i) => {
      allItemKeys.push({ key: `${sec.id}-${i}`, label: item, section: sec.title });
    });
  });

  const headers = [
    "Date", "Timestamp", "Branch", "Truck #", "Serial #", "Shift", "Operator",
    ...allItemKeys.map(k => k.label),
    "Comments"
  ];

  const rows = records.map(r => {
    return [
      r.inspDate,
      r.timestamp,
      r.branch,
      r.truckNum,
      r.serialNum || "",
      r.shift || "",
      r.operator,
      ...allItemKeys.map(k => {
        const item = r.items[k.key];
        return item ? item.status : "";
      }),
      r.comments || ""
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // Download
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `forklift-inspections-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  toast("📤 CSV exported!");
}

// ── Toast ───────────────────────────────────────────────────────
function toast(msg) {
  let el = document.getElementById("toastEl");
  if (!el) {
    el = document.createElement("div");
    el.id = "toastEl";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3000);
}
