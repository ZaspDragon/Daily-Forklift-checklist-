(function () {
  "use strict";

  const DEFAULT_BRANCH_ID = "OH01";
  const DEFAULT_BRANCH_NAME = "Canal Winchester";
  const PUBLIC_APP_URL = "https://zaspdragon.github.io/Daily-Forklift-checklist-/";
  const LEGACY_INSPECTIONS_KEY = "forklift_inspections_v2";
  const KEYS = {
    equipment: "forklift_equipmentProfiles_v1",
    inspections: "forklift_inspections_v1",
    defects: "forklift_defects_v1",
    repairs: "forklift_repairs_v1",
    hourMeters: "forklift_hourMeters_v1",
    auditLog: "forklift_auditLog_v1"
  };
  const COLLECTIONS = {
    equipment: "equipmentProfiles",
    inspections: "inspectionRecordsV1",
    defects: "defects",
    repairs: "repairs",
    hourMeters: "hourMeters",
    auditLog: "auditLog"
  };
  const EQUIPMENT_TYPES = [
    "Reach Truck",
    "Order Picker",
    "Sit-Down Forklift",
    "Pallet Jack",
    "Clamp Truck",
    "Tugger",
    "Other"
  ];
  const STATUSES = ["In Service", "Needs Repair", "Out of Service"];
  const CRITICAL_LABELS = [
    "Brakes",
    "Steering",
    "Horn",
    "Lights",
    "Backup alarm",
    "Hydraulic leaks",
    "Forks",
    "Mast / chains",
    "Seatbelt",
    "Tires",
    "Battery / propane",
    "Overhead Guard"
  ];

  const state = {
    equipment: [],
    inspections: [],
    defects: [],
    repairs: [],
    hourMeters: [],
    auditLog: [],
    selectedLiftId: ""
  };

  const native = {};

  document.addEventListener("DOMContentLoaded", () => {
    captureNativeFunctions();
    injectFleetUi();
    installHooks();
    initFleet();
  });

  function captureNativeFunctions() {
    native.showInspectionForm = window.showInspectionForm;
    native.goToChecklist = window.goToChecklist;
    native.submitInspection = window.submitInspection;
    native.saveInspection = window.saveInspection;
    native.routeAfterLogin = window.routeAfterLogin;
    native.initMgrDashboard = window.initMgrDashboard;
    native.renderMgrDashboard = window.renderMgrDashboard;
    native.getAllInspections = window.getAllInspections;
    native.exportCSV = window.exportCSV;
    native.showPage = window.showPage;
  }

  async function initFleet() {
    await loadFleetData();
    seedDemoDataIfNeeded();
    saveAllLocal();
    refreshEquipmentSelects();
    renderFleetPanel();
    const liftId = new URLSearchParams(window.location.search).get("lift");
    if (liftId) {
      [150, 600, 1400].forEach(ms => setTimeout(() => showLiftStatus(liftId, true), ms));
    }
  }

  function installHooks() {
    window.getAllInspections = function () {
      return getCombinedInspections();
    };

    window.showInspectionForm = function (liftId) {
      state.selectedLiftId = liftId || state.selectedLiftId || sessionStorage.getItem("forklift_pending_lift") || "";
      native.showInspectionForm();
      refreshEquipmentSelects();
      applySelectedLiftToInspection();
    };

    window.goToChecklist = function () {
      applySelectedLiftToInspection();
      return native.goToChecklist();
    };

    window.submitInspection = async function () {
      if (!validateHourMeterBeforeSubmit()) return;
      return native.submitInspection();
    };

    window.saveInspection = async function (record) {
      const enhanced = enrichInspectionRecord(record);
      await native.saveInspection(enhanced);
      await saveEnhancedInspection(enhanced);
    };

    window.routeAfterLogin = function () {
      native.routeAfterLogin();
      const pending = sessionStorage.getItem("forklift_pending_lift");
      if (pending) {
        sessionStorage.removeItem("forklift_pending_lift");
        setTimeout(() => window.showInspectionForm(pending), 100);
      }
    };

    window.initMgrDashboard = function () {
      native.initMgrDashboard();
      refreshFleetFilters();
      renderFleetPanel();
    };

    window.renderMgrDashboard = function () {
      native.renderMgrDashboard();
      renderFleetPanel();
    };

    exposeActions();
  }

  function exposeActions() {
    Object.assign(window, {
      fleetSelectLift,
      startLiftInspection,
      saveEquipmentProfile,
      editEquipmentProfile,
      generateLiftQr,
      printLiftQr,
      downloadLiftQr,
      copyLiftQr,
      showLiftStatus,
      renderFleetPanel,
      exportDailyInspectionsCsv,
      exportInspectionHistoryCsv,
      exportDefectLogCsv,
      exportRepairLogCsv,
      exportHourMeterHistoryCsv,
      exportEquipmentListCsv,
      exportAuditLogCsv,
      startDefectRepair,
      closeDefectWithRepair,
      markLiftOutOfService,
      approveLiftInService
    });
  }

  function injectFleetUi() {
    injectLiftStatusPage();
    injectInspectionFields();
    injectManagerFilters();
    injectFleetPanel();
  }

  function injectLiftStatusPage() {
    if (document.getElementById("liftStatusPage")) return;
    const html = `
      <div id="liftStatusPage" class="page hidden">
        <div class="app-container">
          <nav class="top-bar">
            <div class="top-bar-left">
              <span class="top-bar-icon">ID</span>
              <span class="top-bar-title">Lift Status</span>
            </div>
            <div class="top-bar-right">
              <button class="btn btn-sm btn-outline" onclick="doLogout()">Logout</button>
            </div>
          </nav>
          <div id="liftStatusContent"></div>
        </div>
      </div>`;
    const toast = document.getElementById("toastEl");
    if (toast) toast.insertAdjacentHTML("beforebegin", html);
    else document.body.insertAdjacentHTML("beforeend", html);
  }

  function injectInspectionFields() {
    if (document.getElementById("inspLiftId")) return;
    const firstCard = document.querySelector("#inspStep1 .form-card");
    if (!firstCard) return;
    const html = `
      <div class="form-row fleet-inspection-fields">
        <div class="form-group">
          <label for="inspLiftId">Lift ID</label>
          <select id="inspLiftId" onchange="fleetSelectLift(this.value)">
            <option value="">Manual / unassigned lift</option>
          </select>
        </div>
        <div class="form-group">
          <label for="inspHourMeter">Hour Meter Reading *</label>
          <input type="number" id="inspHourMeter" min="0" step="0.1" placeholder="Required before submit">
        </div>
      </div>
      <div class="form-row fleet-inspection-fields">
        <div class="form-group">
          <label for="inspPreviousHour">Previous Hour Meter</label>
          <input type="text" id="inspPreviousHour" readonly placeholder="None recorded">
        </div>
        <div class="form-group">
          <label for="inspSupervisorNote">Supervisor Override Note</label>
          <input type="text" id="inspSupervisorNote" placeholder="Required only if reading is lower">
        </div>
      </div>`;
    firstCard.insertAdjacentHTML("afterbegin", html);
  }

  function injectManagerFilters() {
    const bar = document.querySelector("#managerPage .filter-bar");
    if (!bar || document.getElementById("fleetFilterBranch")) return;
    const html = `
      <div class="form-group">
        <label for="fleetFilterBranch">Branch</label>
        <select id="fleetFilterBranch" onchange="renderFleetPanel()">
          <option value="">All Branches</option>
        </select>
      </div>
      <div class="form-group">
        <label for="fleetFilterType">Equipment Type</label>
        <select id="fleetFilterType" onchange="renderFleetPanel()">
          <option value="">All Types</option>
          ${EQUIPMENT_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="fleetFilterStatus">Equipment Status</label>
        <select id="fleetFilterStatus" onchange="renderFleetPanel()">
          <option value="">All Statuses</option>
          ${STATUSES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label for="fleetFilterLift">Lift ID</label>
        <input type="text" id="fleetFilterLift" placeholder="All" oninput="renderFleetPanel()">
      </div>`;
    bar.insertAdjacentHTML("beforeend", html);
  }

  function injectFleetPanel() {
    if (document.getElementById("fleetPanel")) return;
    const tab = document.getElementById("tabContentInspections");
    if (!tab) return;
    tab.insertAdjacentHTML("afterbegin", `<div id="fleetPanel" class="fleet-panel"></div>`);
  }

  async function loadFleetData() {
    if (isCloudActive()) {
      await Promise.all([
        loadCollection("equipment"),
        loadCollection("inspections"),
        loadCollection("defects"),
        loadCollection("repairs"),
        loadCollection("hourMeters"),
        loadCollection("auditLog")
      ]);
    } else {
      state.equipment = readLocal(KEYS.equipment);
      state.inspections = readLocal(KEYS.inspections);
      state.defects = readLocal(KEYS.defects);
      state.repairs = readLocal(KEYS.repairs);
      state.hourMeters = readLocal(KEYS.hourMeters);
      state.auditLog = readLocal(KEYS.auditLog);
    }
  }

  async function loadCollection(name) {
    try {
      const db = getDb();
      if (!db) {
        state[name] = readLocal(KEYS[name]);
        return;
      }
      const snap = await db.collection(COLLECTIONS[name]).get();
      state[name] = snap.docs.map(d => d.data());
    } catch (err) {
      console.warn("Fleet collection fallback:", name, err);
      state[name] = readLocal(KEYS[name]);
    }
  }

  function seedDemoDataIfNeeded() {
    if (state.equipment.length > 0) return;
    const today = todayIso();
    const yesterday = addDaysIso(-1);
    state.equipment = [
      demoEquipment("OH01-RT-01", "Reach Truck", "Crown", "RR 5725", "RT01-2026", "4500 lb", "Racking", "In Service"),
      demoEquipment("OH01-OP-01", "Order Picker", "Raymond", "5600", "OP01-2026", "3000 lb", "Picking", "In Service"),
      demoEquipment("OH01-SD-01", "Sit-Down Forklift", "Toyota", "8FGCU25", "SD01-2026", "5000 lb", "Shipping", "Out of Service"),
      demoEquipment("OH01-RT-02", "Reach Truck", "Crown", "RR 5725", "RT02-2026", "4500 lb", "Racking", "In Service"),
      demoEquipment("OH01-PJ-01", "Pallet Jack", "Crown", "WP 3200", "PJ01-2026", "4500 lb", "Receiving", "Needs Repair")
    ];
    const passedInspection = {
      id: id("insp"),
      timestamp: new Date().toISOString(),
      username: "employee",
      displayName: "Employee",
      branch: DEFAULT_BRANCH_NAME,
      branchId: DEFAULT_BRANCH_ID,
      branchName: DEFAULT_BRANCH_NAME,
      liftId: "OH01-RT-01",
      truckNum: "OH01-RT-01",
      serialNum: "RT01-2026",
      inspDate: today,
      shift: "1st",
      operator: "Employee",
      result: "passed",
      hourMeter: { previous: 1200.5, current: 1206.2, dailyHoursUsed: 5.7, notes: "" },
      comments: "Demo inspection passed.",
      items: getChecklistLabels().map(label => ({ label, status: "pass", note: "" }))
    };
    state.inspections = [passedInspection];
    state.hourMeters = [
      demoHour("OH01-RT-01", yesterday, 1200.5, 4.5, "Employee"),
      demoHour("OH01-RT-01", today, 1206.2, 5.7, "Employee"),
      demoHour("OH01-SD-01", yesterday, 876.1, 2.2, "Manager")
    ];
    const defect = {
      defectId: id("def"),
      liftId: "OH01-SD-01",
      branchId: DEFAULT_BRANCH_ID,
      branchName: DEFAULT_BRANCH_NAME,
      dateFound: yesterday,
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      foundBy: "Manager",
      checklistItem: "Brakes",
      defectDescription: "Service brake failed demo stop test.",
      severity: "Critical",
      status: "Open",
      notes: "Do not operate until repaired and approved.",
      photoName: "",
      photoData: null
    };
    state.defects = [defect];
    state.repairs = [
      {
        repairId: id("rep"),
        liftId: "OH01-SD-01",
        branchId: DEFAULT_BRANCH_ID,
        branchName: DEFAULT_BRANCH_NAME,
        defectId: defect.defectId,
        repairDate: "",
        repairedBy: "",
        vendorTechnician: "Pending",
        repairNotes: "Demo repair pending.",
        returnToServiceApprovedBy: "",
        approvalDate: "",
        status: "Repair Pending"
      }
    ];
    state.auditLog = [
      auditEntry("System", "system", "OH01-SD-01", "Defect created", "", "Critical brake defect", "Demo seed")
    ];
  }

  function demoEquipment(liftId, type, make, model, serial, capacity, area, status) {
    return {
      liftId,
      branchId: DEFAULT_BRANCH_ID,
      branchName: DEFAULT_BRANCH_NAME,
      equipmentType: type,
      make,
      model,
      serialNumber: serial,
      capacity,
      departmentArea: area,
      qrCodeUrl: qrLink(liftId),
      currentStatus: status,
      notes: "Demo lift profile"
    };
  }

  function demoHour(liftId, date, reading, dailyHoursUsed, inspector) {
    return {
      hourMeterId: id("hr"),
      liftId,
      branchId: DEFAULT_BRANCH_ID,
      branchName: DEFAULT_BRANCH_NAME,
      date,
      timestamp: new Date(date + "T12:00:00").toISOString(),
      inspector,
      hourMeterReading: reading,
      previousHourMeterReading: reading - dailyHoursUsed,
      dailyHoursUsed,
      notes: ""
    };
  }

  function refreshEquipmentSelects() {
    const select = document.getElementById("inspLiftId");
    if (!select) return;
    const current = state.selectedLiftId || select.value || "";
    select.innerHTML = `<option value="">Manual / unassigned lift</option>` +
      state.equipment
        .slice()
        .sort((a, b) => a.liftId.localeCompare(b.liftId))
        .map(e => `<option value="${esc(e.liftId)}">${esc(e.liftId)} - ${esc(e.equipmentType)}</option>`)
        .join("");
    select.value = state.equipment.some(e => e.liftId === current) ? current : "";
  }

  function refreshFleetFilters() {
    const branch = document.getElementById("fleetFilterBranch");
    if (!branch) return;
    const current = branch.value;
    const branches = unique(state.equipment.map(e => `${e.branchId || ""}|${e.branchName || "Unassigned Branch"}`));
    branch.innerHTML = `<option value="">All Branches</option>` +
      branches.map(v => {
        const parts = v.split("|");
        const idPart = parts[0] || "UNASSIGNED";
        const namePart = parts[1] || "Unassigned Branch";
        return `<option value="${esc(idPart)}">${esc(idPart)} - ${esc(namePart)}</option>`;
      }).join("");
    branch.value = current;
  }

  function fleetSelectLift(liftId) {
    state.selectedLiftId = liftId || "";
    applySelectedLiftToInspection();
  }

  function applySelectedLiftToInspection() {
    const liftId = state.selectedLiftId || valueOf("inspLiftId");
    const lift = findEquipment(liftId);
    setValue("inspLiftId", liftId);
    if (lift) {
      setValue("inspBranch", lift.branchName || DEFAULT_BRANCH_NAME);
      setValue("inspTruck", lift.liftId);
      setValue("inspSerial", lift.serialNumber || "");
    }
    const targetId = lift ? lift.liftId : valueOf("inspTruck");
    const prev = previousHourReading(targetId);
    setValue("inspPreviousHour", Number.isFinite(prev) ? String(prev) : "");
    const statusNote = lift && lift.currentStatus === "Out of Service"
      ? "This lift is out of service. Do not operate."
      : "";
    if (statusNote && window.toast) window.toast(statusNote);
  }

  function validateHourMeterBeforeSubmit() {
    const hour = Number.parseFloat(valueOf("inspHourMeter"));
    if (!Number.isFinite(hour) || hour < 0) {
      toastSafe("Hour Meter Reading is required before submitting.");
      return false;
    }
    const liftId = valueOf("inspLiftId") || valueOf("inspTruck");
    const prev = previousHourReading(liftId);
    if (Number.isFinite(prev) && hour < prev) {
      const user = currentUser();
      if (!isSupervisor(user)) {
        toastSafe("Lower hour meter readings require supervisor/admin override.");
        return false;
      }
      if (!valueOf("inspSupervisorNote")) {
        toastSafe("Enter a supervisor override note for the lower hour meter reading.");
        return false;
      }
    }
    return true;
  }

  function enrichInspectionRecord(record) {
    const lift = findEquipment(valueOf("inspLiftId")) || findEquipment(record.truckNum);
    const liftId = lift ? lift.liftId : (valueOf("inspLiftId") || record.liftId || null);
    const branchId = lift ? lift.branchId : (record.branchId || DEFAULT_BRANCH_ID);
    const branchName = lift ? lift.branchName : (record.branchName || record.branch || DEFAULT_BRANCH_NAME);
    const hour = Number.parseFloat(valueOf("inspHourMeter"));
    const prev = previousHourReading(liftId || record.truckNum);
    const daily = Number.isFinite(prev) && Number.isFinite(hour) ? round1(hour - prev) : null;
    const failed = (record.items || []).filter(i => i.status === "fail");
    return {
      ...record,
      liftId,
      branchId,
      branchName,
      branch: branchName,
      truckNum: liftId || record.truckNum,
      currentStatus: lift ? lift.currentStatus : "In Service",
      result: failed.length > 0 ? "failed" : "passed",
      hourMeter: Number.isFinite(hour) ? {
        previous: Number.isFinite(prev) ? prev : null,
        current: hour,
        dailyHoursUsed: daily,
        notes: valueOf("inspSupervisorNote")
      } : null
    };
  }

  async function saveEnhancedInspection(record) {
    upsertBy(state.inspections, "id", normalizeInspection(record));
    const user = currentUser();
    const liftId = record.liftId || record.truckNum || null;
    if (record.hourMeter && liftId) {
      const hourRecord = {
        hourMeterId: id("hr"),
        liftId,
        branchId: record.branchId || DEFAULT_BRANCH_ID,
        branchName: record.branchName || record.branch || DEFAULT_BRANCH_NAME,
        date: record.inspDate,
        timestamp: record.timestamp,
        inspector: record.operator || record.displayName || (user && user.display) || "",
        hourMeterReading: record.hourMeter.current,
        previousHourMeterReading: record.hourMeter.previous,
        dailyHoursUsed: record.hourMeter.dailyHoursUsed,
        notes: record.hourMeter.notes || ""
      };
      upsertBy(state.hourMeters, "hourMeterId", hourRecord);
    }
    processInspectionDefects(record);
    await auditAndPersist("Inspection submitted", liftId, "", record.result, record.comments || "");
    await saveAll();
    refreshEquipmentSelects();
    renderFleetPanel();
  }

  function processInspectionDefects(record) {
    const liftId = record.liftId || record.truckNum;
    if (!liftId) return;
    const failed = (record.items || []).filter(i => i.status === "fail");
    let hasCritical = false;
    failed.forEach(item => {
      const severity = isCriticalItem(item.label) ? "Critical" : "Medium";
      if (severity === "Critical") hasCritical = true;
      const open = state.defects.find(d =>
        d.liftId === liftId &&
        d.checklistItem === item.label &&
        !["Closed", "Voided"].includes(d.status)
      );
      const defect = open || {
        defectId: id("def"),
        liftId,
        branchId: record.branchId || DEFAULT_BRANCH_ID,
        branchName: record.branchName || record.branch || DEFAULT_BRANCH_NAME,
        dateFound: record.inspDate,
        timestamp: record.timestamp,
        foundBy: record.operator || record.displayName || "",
        checklistItem: item.label,
        defectDescription: item.note || record.comments || "Failed inspection item",
        severity,
        status: "Open",
        notes: "",
        photoName: "",
        photoData: null
      };
      defect.defectDescription = item.note || defect.defectDescription;
      defect.severity = severity;
      defect.status = defect.status || "Open";
      upsertBy(state.defects, "defectId", defect);
      addAudit("Failed item recorded", liftId, "", `${item.label}: ${severity}`, item.note || "");
      if (!open) addAudit("Defect created", liftId, "", item.label, item.note || "");
    });
    const lift = findEquipment(liftId);
    if (lift && failed.length > 0) {
      const old = lift.currentStatus;
      lift.currentStatus = hasCritical ? "Out of Service" : (old === "Out of Service" ? old : "Needs Repair");
      if (old !== lift.currentStatus) addAudit("Lift marked " + lift.currentStatus, liftId, old, lift.currentStatus, "Inspection failure");
    }
  }

  function renderFleetPanel() {
    const panel = document.getElementById("fleetPanel");
    if (!panel) return;
    refreshFleetFilters();
    const filteredEquipment = getFilteredEquipment();
    const today = todayIso();
    const inspections = getCombinedInspections();
    const todayInspections = inspections.filter(r => r.inspDate === today);
    const inspectedLiftIds = new Set(todayInspections.map(r => r.liftId || r.truckNum).filter(Boolean));
    const passedToday = todayInspections.filter(r => inspectionResult(r) === "passed").length;
    const failedToday = todayInspections.filter(r => inspectionResult(r) === "failed").length;
    const out = state.equipment.filter(e => computedLiftStatus(e.liftId) === "Out of Service").length;
    const openDefects = state.defects.filter(d => !["Closed", "Voided"].includes(d.status));

    panel.innerHTML = `
      <div class="fleet-stat-grid">
        ${statCard(state.equipment.length, "Total lifts", "s-total")}
        ${statCard(inspectedLiftIds.size, "Inspected today", "s-passed")}
        ${statCard(Math.max(state.equipment.length - inspectedLiftIds.size, 0), "Not inspected today", "s-failed")}
        ${statCard(passedToday, "Passed today", "s-passed")}
        ${statCard(failedToday, "Failed today", "s-failed")}
        ${statCard(out, "Out of service", "s-failed")}
      </div>
      ${renderEquipmentForm()}
      <div class="fleet-section">
        <div class="fleet-section-head">
          <h3>Equipment Status</h3>
          <div class="fleet-export-row">
            <button class="btn btn-sm btn-outline" onclick="exportDailyInspectionsCsv()">Daily Inspections</button>
            <button class="btn btn-sm btn-outline" onclick="exportInspectionHistoryCsv()">Inspection History</button>
            <button class="btn btn-sm btn-outline" onclick="exportDefectLogCsv()">Defect Log</button>
            <button class="btn btn-sm btn-outline" onclick="exportRepairLogCsv()">Repair Log</button>
            <button class="btn btn-sm btn-outline" onclick="exportHourMeterHistoryCsv()">Hour Meters</button>
            <button class="btn btn-sm btn-outline" onclick="exportEquipmentListCsv()">Equipment</button>
            <button class="btn btn-sm btn-outline" onclick="exportAuditLogCsv()">Audit Log</button>
          </div>
        </div>
        <div class="fleet-card-grid">${filteredEquipment.map(renderEquipmentCard).join("") || empty("No equipment profiles match the filters.")}</div>
      </div>
      <div class="fleet-two-col">
        <div class="fleet-section">
          <h3>Open Defects</h3>
          ${renderDefectTable(openDefects)}
        </div>
        <div class="fleet-section">
          <h3>Hour Meter Summary</h3>
          ${renderHourSummary(filteredEquipment)}
        </div>
      </div>
      <div class="fleet-section">
        <h3>Repair History</h3>
        ${renderRepairTable(state.repairs.slice().sort((a,b) => String(b.repairDate || "").localeCompare(String(a.repairDate || ""))).slice(0, 12))}
      </div>`;
  }

  function renderEquipmentForm() {
    return `
      <div class="form-card fleet-profile-form">
        <h3>Equipment / Lift Profile</h3>
        <input type="hidden" id="fleetEditingLiftId">
        <div class="form-row">
          ${input("fleetLiftId", "Lift ID *", "OH01-RT-01")}
          ${input("fleetBranchId", "Branch ID", DEFAULT_BRANCH_ID)}
        </div>
        <div class="form-row">
          ${input("fleetBranchName", "Branch Name", DEFAULT_BRANCH_NAME)}
          <div class="form-group">
            <label for="fleetEquipmentType">Equipment Type</label>
            <select id="fleetEquipmentType">${EQUIPMENT_TYPES.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="form-row">
          ${input("fleetMake", "Make", "Crown")}
          ${input("fleetModel", "Model", "RR 5725")}
        </div>
        <div class="form-row">
          ${input("fleetSerial", "Serial Number", "Serial #")}
          ${input("fleetCapacity", "Capacity", "4500 lb")}
        </div>
        <div class="form-row">
          ${input("fleetArea", "Department / Area", "Racking")}
          <div class="form-group">
            <label for="fleetCurrentStatus">Current Status</label>
            <select id="fleetCurrentStatus">${STATUSES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}</select>
          </div>
        </div>
        <div class="form-group">
          <label for="fleetNotes">Notes</label>
          <input type="text" id="fleetNotes" placeholder="Optional notes">
        </div>
        <div class="action-row">
          <button class="btn btn-primary" onclick="saveEquipmentProfile()">Save Lift Profile</button>
          <button class="btn btn-outline" onclick="editEquipmentProfile('')">Clear</button>
        </div>
      </div>`;
  }

  function renderEquipmentCard(e) {
    const status = computedLiftStatus(e.liftId);
    const last = lastInspection(e.liftId);
    const open = openDefectsForLift(e.liftId);
    const cls = status === "Out of Service" ? "fleet-bad" : status === "Needs Repair" ? "fleet-warn" : "fleet-good";
    return `
      <div class="fleet-card ${cls}">
        <div class="fleet-card-title">
          <strong>${esc(e.liftId)}</strong>
          <span class="fleet-status-pill">${esc(status)}</span>
        </div>
        <div class="fleet-meta">${esc(e.equipmentType)} | ${esc(e.branchId || "UNASSIGNED")} - ${esc(e.branchName || "Unassigned Branch")}</div>
        <div class="fleet-meta">${esc(e.make || "")} ${esc(e.model || "")} ${e.serialNumber ? "| S/N " + esc(e.serialNumber) : ""}</div>
        <div class="fleet-meta">Last inspection: ${last ? esc(formatDateTime(last.timestamp)) : "None"} ${last ? "(" + esc(inspectionResult(last)) + ")" : ""}</div>
        <div class="fleet-meta">Open defects: ${open.length}</div>
        <div class="action-row fleet-actions">
          <button class="btn btn-sm btn-outline" onclick="showLiftStatus('${js(e.liftId)}')">Status</button>
          <button class="btn btn-sm btn-outline" onclick="editEquipmentProfile('${js(e.liftId)}')">Edit</button>
          <button class="btn btn-sm btn-outline" onclick="generateLiftQr('${js(e.liftId)}')">Generate QR Code</button>
          <button class="btn btn-sm btn-outline" onclick="printLiftQr('${js(e.liftId)}')">Print QR Code</button>
          <button class="btn btn-sm btn-outline" onclick="downloadLiftQr('${js(e.liftId)}')">Download QR Code</button>
          <button class="btn btn-sm btn-outline" onclick="copyLiftQr('${js(e.liftId)}')">Copy QR Link</button>
        </div>
        <div id="qr-${cssId(e.liftId)}" class="fleet-qr-slot"></div>
      </div>`;
  }

  function renderDefectTable(defects) {
    const canEdit = !!currentUser();
    const rows = defects
      .slice()
      .sort((a, b) => String(b.timestamp || b.dateFound).localeCompare(String(a.timestamp || a.dateFound)))
      .map(d => `
        <tr>
          <td>${esc(d.liftId)}</td>
          <td>${esc(d.checklistItem)}</td>
          <td>${esc(d.severity)}</td>
          <td>${esc(d.dateFound)}</td>
          <td>${daysOpen(d.dateFound)}</td>
          <td>${esc(d.status)}</td>
          ${canEdit ? `<td class="fleet-table-actions">
            <button class="btn btn-sm btn-outline" onclick="startDefectRepair('${js(d.defectId)}')">Repair</button>
            <button class="btn btn-sm btn-outline" onclick="closeDefectWithRepair('${js(d.defectId)}')">Close</button>
          </td>` : ""}
        </tr>`).join("");
    const headers = ["Lift ID", "Defect", "Severity", "Date Found", "Days Open", "Status"];
    if (canEdit) headers.push("Actions");
    return table(headers, rows);
  }

  function renderHourSummary(equipment) {
    const rows = equipment.map(e => {
      const last = lastHour(e.liftId);
      const weekly = weeklyHours(e.liftId);
      const insp = lastInspection(e.liftId);
      return `
        <tr>
          <td>${esc(e.liftId)}</td>
          <td>${last ? esc(last.hourMeterReading) : ""}</td>
          <td>${last && last.dailyHoursUsed != null ? esc(last.dailyHoursUsed) : ""}</td>
          <td>${weekly}</td>
          <td>${insp ? esc(insp.inspDate) : ""}</td>
        </tr>`;
    }).join("");
    return table(["Lift ID", "Last Reading", "Daily Hours", "Weekly Hours", "Last Inspection"], rows);
  }

  function renderRepairTable(repairs) {
    const rows = repairs.map(r => `
      <tr>
        <td>${esc(r.liftId)}</td>
        <td>${esc(r.defectId || "")}</td>
        <td>${esc(r.repairDate || "")}</td>
        <td>${esc(r.vendorTechnician || r.repairedBy || "")}</td>
        <td>${esc(r.status)}</td>
        <td>${esc(r.returnToServiceApprovedBy || "")}</td>
      </tr>`).join("");
    return table(["Lift ID", "Defect ID", "Repair Date", "Technician", "Status", "Approved By"], rows);
  }

  function showLiftStatus(liftId, publicView) {
    const lift = findEquipment(liftId) || {
      liftId,
      branchId: DEFAULT_BRANCH_ID,
      branchName: DEFAULT_BRANCH_NAME,
      equipmentType: "Unknown",
      currentStatus: "In Service",
      qrCodeUrl: qrLink(liftId)
    };
    const content = document.getElementById("liftStatusContent");
    if (!content) return;
    const status = computedLiftStatus(liftId);
    const last = lastInspection(liftId);
    const open = openDefectsForLift(liftId);
    const closed = state.defects.filter(d => d.liftId === liftId && ["Closed", "Voided"].includes(d.status));
    const repairs = state.repairs.filter(r => r.liftId === liftId);
    const hours = state.hourMeters.filter(h => h.liftId === liftId).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    const banner = statusBanner(liftId, status, last, open);
    const user = currentUser();
    content.innerHTML = `
      ${banner}
      <div class="fleet-status-layout">
        <div class="fleet-section">
          <div class="fleet-status-head">
            <div>
              <h2>${esc(lift.liftId)}</h2>
              <p>${esc(lift.equipmentType || "Unknown")} | ${esc(lift.branchId || "UNASSIGNED")} - ${esc(lift.branchName || "Unassigned Branch")}</p>
            </div>
            <span class="fleet-status-pill">${esc(status)}</span>
          </div>
          <div class="fleet-detail-grid">
            ${detail("Last Inspection Date/Time", last ? formatDateTime(last.timestamp) : "None")}
            ${detail("Last Inspected By", last ? (last.operator || last.displayName || "") : "")}
            ${detail("Last Inspection Result", last ? inspectionResult(last).toUpperCase() : "None")}
            ${detail("Hour Meter Last Recorded", hours[0] ? String(hours[0].hourMeterReading) : "")}
            ${detail("Repair Status", repairs[0] ? repairs[0].status : "No active repair")}
            ${detail("QR Code URL", qrLink(lift.liftId))}
          </div>
          <div class="action-row">
            <button class="btn btn-primary" onclick="startLiftInspection('${js(lift.liftId)}')">Start Today's Inspection</button>
            ${user ? `<button class="btn btn-outline" onclick="renderFleetPanel(); showPage('managerPage')">Supervisor Dashboard</button>` : `<button class="btn btn-outline" onclick="sessionStorage.setItem('forklift_pending_lift','${js(lift.liftId)}'); showPage('loginPage')">Login to Edit</button>`}
          </div>
        </div>
        <div class="fleet-section">
          <h3>QR Label</h3>
          <div class="fleet-print-label">
            <strong>${esc(lift.liftId)}</strong>
            <span>${esc(lift.equipmentType || "")}</span>
            <span>${esc(lift.branchName || "")}</span>
            <span>Scan before use</span>
            <img src="${qrImage(lift.liftId)}" alt="QR code for ${escAttr(lift.liftId)}">
          </div>
          <div class="action-row">
            <button class="btn btn-sm btn-outline" onclick="printLiftQr('${js(lift.liftId)}')">Print QR Code</button>
            <button class="btn btn-sm btn-outline" onclick="downloadLiftQr('${js(lift.liftId)}')">Download QR Code</button>
            <button class="btn btn-sm btn-outline" onclick="copyLiftQr('${js(lift.liftId)}')">Copy QR Link</button>
          </div>
        </div>
      </div>
      <div class="fleet-two-col">
        <div class="fleet-section"><h3>Open Defects</h3>${renderDefectTable(open)}</div>
        <div class="fleet-section"><h3>Closed Defect History</h3>${renderDefectTable(closed)}</div>
      </div>
      <div class="fleet-two-col">
        <div class="fleet-section"><h3>Repair History</h3>${renderRepairTable(repairs)}</div>
        <div class="fleet-section"><h3>Hour Meter History Summary</h3>${renderHourHistory(hours.slice(0, 12))}</div>
      </div>`;
    native.showPage ? native.showPage("liftStatusPage") : showPage("liftStatusPage");
  }

  function statusBanner(liftId, status, last, open) {
    const today = todayIso();
    const criticalOpen = open.some(d => d.severity === "Critical");
    if (status === "Out of Service" || criticalOpen || (last && inspectionResult(last) === "failed")) {
      return `<div class="fleet-alert fleet-alert-danger">OUT OF SERVICE - DO NOT OPERATE</div>`;
    }
    if (!last || last.inspDate !== today) {
      return `<div class="fleet-alert fleet-alert-danger">NOT INSPECTED TODAY</div>`;
    }
    return `<div class="fleet-alert fleet-alert-success">INSPECTED TODAY - PASSED</div>`;
  }

  function renderHourHistory(hours) {
    const rows = hours.map(h => `
      <tr>
        <td>${esc(h.date)}</td>
        <td>${esc(h.liftId)}</td>
        <td>${esc(h.inspector || "")}</td>
        <td>${esc(h.hourMeterReading)}</td>
        <td>${h.dailyHoursUsed != null ? esc(h.dailyHoursUsed) : ""}</td>
      </tr>`).join("");
    return table(["Date", "Lift ID", "Inspector", "Reading", "Daily Hours"], rows);
  }

  async function saveEquipmentProfile() {
    const editing = valueOf("fleetEditingLiftId");
    const liftId = valueOf("fleetLiftId").toUpperCase();
    if (!liftId) {
      toastSafe("Lift ID is required.");
      return;
    }
    const old = editing ? findEquipment(editing) : null;
    const profile = {
      liftId,
      branchId: valueOf("fleetBranchId") || DEFAULT_BRANCH_ID,
      branchName: valueOf("fleetBranchName") || DEFAULT_BRANCH_NAME,
      equipmentType: valueOf("fleetEquipmentType") || "Other",
      make: valueOf("fleetMake"),
      model: valueOf("fleetModel"),
      serialNumber: valueOf("fleetSerial"),
      capacity: valueOf("fleetCapacity"),
      departmentArea: valueOf("fleetArea"),
      qrCodeUrl: qrLink(liftId),
      currentStatus: valueOf("fleetCurrentStatus") || "In Service",
      notes: valueOf("fleetNotes")
    };
    if (editing && editing !== liftId) {
      state.equipment = state.equipment.filter(e => e.liftId !== editing);
    }
    upsertBy(state.equipment, "liftId", profile);
    addAudit(old ? "Equipment profile edited" : "Equipment profile created", liftId, old ? JSON.stringify(old) : "", JSON.stringify(profile), "");
    await saveAll();
    editEquipmentProfile("");
    refreshEquipmentSelects();
    renderFleetPanel();
    toastSafe("Lift profile saved.");
  }

  function editEquipmentProfile(liftId) {
    const e = findEquipment(liftId) || {};
    setValue("fleetEditingLiftId", e.liftId || "");
    setValue("fleetLiftId", e.liftId || "");
    setValue("fleetBranchId", e.branchId || DEFAULT_BRANCH_ID);
    setValue("fleetBranchName", e.branchName || DEFAULT_BRANCH_NAME);
    setValue("fleetEquipmentType", e.equipmentType || "Reach Truck");
    setValue("fleetMake", e.make || "");
    setValue("fleetModel", e.model || "");
    setValue("fleetSerial", e.serialNumber || "");
    setValue("fleetCapacity", e.capacity || "");
    setValue("fleetArea", e.departmentArea || "");
    setValue("fleetCurrentStatus", e.currentStatus || "In Service");
    setValue("fleetNotes", e.notes || "");
  }

  function startLiftInspection(liftId) {
    state.selectedLiftId = liftId;
    const user = currentUser();
    if (!user) {
      sessionStorage.setItem("forklift_pending_lift", liftId);
      native.showPage("loginPage");
      return;
    }
    window.showInspectionForm(liftId);
  }

  function generateLiftQr(liftId) {
    const slot = document.getElementById(`qr-${cssId(liftId)}`);
    if (!slot) return;
    slot.innerHTML = `
      <div class="fleet-qr-box">
        <img src="${qrImage(liftId)}" alt="QR code for ${escAttr(liftId)}">
        <div class="fleet-meta">${esc(qrLink(liftId))}</div>
      </div>`;
  }

  function printLiftQr(liftId) {
    const lift = findEquipment(liftId);
    const win = window.open("", "_blank");
    if (!win) {
      toastSafe("Pop-up blocked. Please allow pop-ups to print QR codes.");
      return;
    }
    win.document.write(`<!doctype html><html><head><title>QR ${escHtml(liftId)}</title>
      <style>body{font-family:Arial,sans-serif;margin:0;padding:24px;text-align:center}.label{border:2px solid #111;display:inline-flex;flex-direction:column;gap:8px;padding:18px;min-width:280px}.id{font-size:28px;font-weight:800}.small{font-size:15px}img{width:220px;height:220px;margin:auto}@media print{button{display:none}}</style>
      </head><body><button onclick="print()">Print</button><div class="label">
      <div class="id">${escHtml(liftId)}</div>
      <div class="small">${escHtml(lift ? lift.equipmentType : "")}</div>
      <div class="small">${escHtml(lift ? lift.branchName : "")}</div>
      <div class="small"><strong>Scan before use</strong></div>
      <img src="${qrImage(liftId)}" alt="QR code">
      </div></body></html>`);
    win.document.close();
  }

  function downloadLiftQr(liftId) {
    const a = document.createElement("a");
    a.href = qrImage(liftId);
    a.download = `${liftId}-qr-code.png`;
    a.target = "_blank";
    a.click();
  }

  async function copyLiftQr(liftId) {
    const link = qrLink(liftId);
    try {
      await navigator.clipboard.writeText(link);
      toastSafe("QR link copied.");
    } catch {
      prompt("Copy QR link:", link);
    }
  }

  async function startDefectRepair(defectId) {
    const d = findBy(state.defects, "defectId", defectId);
    if (!d) return;
    if (!isSupervisor(currentUser())) {
      toastSafe("Supervisor/admin access required.");
      return;
    }
    const vendor = prompt("Vendor / Technician:", "");
    if (vendor === null) return;
    const notes = prompt("Repair notes:", d.notes || "");
    if (notes === null) return;
    d.status = "In Repair";
    const repair = {
      repairId: id("rep"),
      liftId: d.liftId,
      branchId: d.branchId || DEFAULT_BRANCH_ID,
      branchName: d.branchName || DEFAULT_BRANCH_NAME,
      defectId: d.defectId,
      repairDate: todayIso(),
      repairedBy: (currentUser() && currentUser().display) || "",
      vendorTechnician: vendor,
      repairNotes: notes,
      returnToServiceApprovedBy: "",
      approvalDate: "",
      status: "Repair Pending"
    };
    upsertBy(state.repairs, "repairId", repair);
    await auditAndPersist("Repair added", d.liftId, "", repair.status, notes);
    renderFleetPanel();
    showLiftStatus(d.liftId);
  }

  async function closeDefectWithRepair(defectId) {
    const d = findBy(state.defects, "defectId", defectId);
    if (!d) return;
    if (d.severity === "Critical" && !isSupervisor(currentUser())) {
      toastSafe("Regular users cannot close critical defects.");
      return;
    }
    if (!isSupervisor(currentUser())) {
      toastSafe("Supervisor/admin access required.");
      return;
    }
    const repairNotes = prompt("Repair notes required:", d.notes || "");
    if (!repairNotes || !repairNotes.trim()) {
      toastSafe("Repair notes are required to close a defect.");
      return;
    }
    const approvedBy = prompt("Return To Service Approved By:", (currentUser() && currentUser().display) || "");
    if (!approvedBy || !approvedBy.trim()) {
      toastSafe("Approved by is required.");
      return;
    }
    const old = d.status;
    d.status = "Closed";
    d.notes = repairNotes;
    const repair = {
      repairId: id("rep"),
      liftId: d.liftId,
      branchId: d.branchId || DEFAULT_BRANCH_ID,
      branchName: d.branchName || DEFAULT_BRANCH_NAME,
      defectId: d.defectId,
      repairDate: todayIso(),
      repairedBy: (currentUser() && currentUser().display) || "",
      vendorTechnician: "",
      repairNotes,
      returnToServiceApprovedBy: approvedBy,
      approvalDate: todayIso(),
      status: "Return To Service Approved"
    };
    upsertBy(state.repairs, "repairId", repair);
    addAudit("Defect closed", d.liftId, old, "Closed", repairNotes);
    if (!openDefectsForLift(d.liftId).some(x => x.severity === "Critical" && x.defectId !== d.defectId)) {
      const lift = findEquipment(d.liftId);
      if (lift) {
        const oldStatus = lift.currentStatus;
        lift.currentStatus = openDefectsForLift(d.liftId).some(x => x.defectId !== d.defectId) ? "Needs Repair" : "In Service";
        addAudit("Lift returned to In Service", d.liftId, oldStatus, lift.currentStatus, approvedBy);
      }
    }
    await saveAll();
    renderFleetPanel();
    showLiftStatus(d.liftId);
  }

  async function markLiftOutOfService(liftId) {
    const lift = findEquipment(liftId);
    if (!lift || !isSupervisor(currentUser())) return;
    const old = lift.currentStatus;
    lift.currentStatus = "Out of Service";
    await auditAndPersist("Lift marked Out of Service", liftId, old, lift.currentStatus, "");
    renderFleetPanel();
  }

  async function approveLiftInService(liftId) {
    const lift = findEquipment(liftId);
    if (!lift || !isSupervisor(currentUser())) return;
    if (openDefectsForLift(liftId).some(d => d.severity === "Critical")) {
      toastSafe("Critical defects must be closed before return to service.");
      return;
    }
    const approvedBy = prompt("Return To Service Approved By:", currentUser().display || "");
    if (!approvedBy) return;
    const old = lift.currentStatus;
    lift.currentStatus = "In Service";
    await auditAndPersist("Lift returned to In Service", liftId, old, lift.currentStatus, approvedBy);
    renderFleetPanel();
  }

  function exportDailyInspectionsCsv() {
    const today = todayIso();
    exportRows("forklift-daily-inspections", inspectionCsvRows(getCombinedInspections().filter(r => r.inspDate === today)));
  }

  function exportInspectionHistoryCsv() {
    exportRows("forklift-inspection-history", inspectionCsvRows(getCombinedInspections()));
  }

  function exportDefectLogCsv() {
    exportRows("forklift-defect-log", [
      ["Defect ID", "Lift ID", "Branch ID", "Branch Name", "Date Found", "Found By", "Checklist Item", "Description", "Severity", "Status", "Notes"],
      ...state.defects.map(d => [d.defectId, d.liftId, d.branchId, d.branchName, d.dateFound, d.foundBy, d.checklistItem, d.defectDescription, d.severity, d.status, d.notes])
    ]);
  }

  function exportRepairLogCsv() {
    exportRows("forklift-repair-log", [
      ["Repair ID", "Lift ID", "Branch ID", "Branch Name", "Defect ID", "Repair Date", "Repaired By", "Vendor / Technician", "Repair Notes", "Approved By", "Approval Date", "Status"],
      ...state.repairs.map(r => [r.repairId, r.liftId, r.branchId, r.branchName, r.defectId, r.repairDate, r.repairedBy, r.vendorTechnician, r.repairNotes, r.returnToServiceApprovedBy, r.approvalDate, r.status])
    ]);
  }

  function exportHourMeterHistoryCsv() {
    exportRows("forklift-hour-meter-history", [
      ["Date", "Timestamp", "Lift ID", "Branch ID", "Branch Name", "Inspector", "Hour Meter Reading", "Previous Hour Meter", "Daily Hours Used", "Notes"],
      ...state.hourMeters.map(h => [h.date, h.timestamp, h.liftId, h.branchId, h.branchName, h.inspector, h.hourMeterReading, h.previousHourMeterReading, h.dailyHoursUsed, h.notes])
    ]);
  }

  function exportEquipmentListCsv() {
    exportRows("forklift-equipment-list", [
      ["Lift ID", "Branch ID", "Branch Name", "Equipment Type", "Make", "Model", "Serial Number", "Capacity", "Department / Area", "QR Code URL", "Current Status", "Notes"],
      ...state.equipment.map(e => [e.liftId, e.branchId, e.branchName, e.equipmentType, e.make, e.model, e.serialNumber, e.capacity, e.departmentArea, qrLink(e.liftId), computedLiftStatus(e.liftId), e.notes])
    ]);
  }

  function exportAuditLogCsv() {
    exportRows("forklift-audit-log", [
      ["Timestamp", "User", "Role", "Lift ID", "Action", "Old Value", "New Value", "Notes"],
      ...state.auditLog.map(a => [a.timestamp, a.user, a.role, a.liftId, a.action, a.oldValue, a.newValue, a.notes])
    ]);
  }

  function inspectionCsvRows(records) {
    return [
      ["Date", "Timestamp", "Branch ID", "Branch Name", "Lift ID", "Truck #", "Serial #", "Shift", "Operator", "Result", "Hour Meter", "Daily Hours", "Comments"],
      ...records.map(r => [r.inspDate, r.timestamp, r.branchId, r.branchName, r.liftId, r.truckNum, r.serialNum, r.shift, r.operator, inspectionResult(r), r.hourMeter && r.hourMeter.current, r.hourMeter && r.hourMeter.dailyHoursUsed, r.comments])
    ];
  }

  function getCombinedInspections() {
    const original = native.getAllInspections ? native.getAllInspections() : readLocal(LEGACY_INSPECTIONS_KEY);
    const combined = [...(original || []), ...state.inspections].map(normalizeInspection);
    const map = new Map();
    combined.forEach(r => {
      const key = r.id || `${r.timestamp}|${r.truckNum}|${r.operator}`;
      map.set(key, { ...(map.get(key) || {}), ...r });
    });
    return Array.from(map.values()).sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
  }

  function normalizeInspection(r) {
    const liftId = r.liftId || r.truckNum || null;
    return {
      defects: [],
      repairs: [],
      auditLog: [],
      hourMeter: null,
      currentStatus: "In Service",
      branchId: r.branchId || (r.branch ? DEFAULT_BRANCH_ID : null),
      branchName: r.branchName || r.branch || "Unassigned Branch",
      liftId,
      result: r.result || ((r.items || []).some(i => i.status === "fail") ? "failed" : "passed"),
      ...r
    };
  }

  function findEquipment(liftId) {
    return state.equipment.find(e => e.liftId === liftId);
  }

  function findBy(arr, key, val) {
    return arr.find(x => x[key] === val);
  }

  function upsertBy(arr, key, obj) {
    const idx = arr.findIndex(x => x[key] === obj[key]);
    if (idx === -1) arr.unshift(obj);
    else arr[idx] = { ...arr[idx], ...obj };
  }

  function previousHourReading(liftId) {
    if (!liftId) return NaN;
    const latest = lastHour(liftId);
    return latest ? Number.parseFloat(latest.hourMeterReading) : NaN;
  }

  function lastHour(liftId) {
    return state.hourMeters
      .filter(h => h.liftId === liftId)
      .sort((a, b) => String(b.timestamp || b.date).localeCompare(String(a.timestamp || a.date)))[0];
  }

  function lastInspection(liftId) {
    return getCombinedInspections()
      .filter(r => (r.liftId || r.truckNum) === liftId)
      .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))[0];
  }

  function openDefectsForLift(liftId) {
    return state.defects.filter(d => d.liftId === liftId && !["Closed", "Voided"].includes(d.status));
  }

  function computedLiftStatus(liftId) {
    const lift = findEquipment(liftId);
    const open = openDefectsForLift(liftId);
    if (open.some(d => d.severity === "Critical")) return "Out of Service";
    if (lift && lift.currentStatus === "Out of Service") return "Out of Service";
    if (open.length > 0) return "Needs Repair";
    return lift ? (lift.currentStatus || "In Service") : "In Service";
  }

  function inspectionResult(r) {
    if (r.result) return String(r.result).toLowerCase();
    return (r.items || []).some(i => i.status === "fail") ? "failed" : "passed";
  }

  function isCriticalItem(label) {
    const l = String(label || "").toLowerCase();
    return CRITICAL_LABELS.some(item => l.includes(item.toLowerCase().replace(" / ", "")) || item.toLowerCase().includes(l));
  }

  function getFilteredEquipment() {
    const branch = valueOf("fleetFilterBranch");
    const type = valueOf("fleetFilterType");
    const status = valueOf("fleetFilterStatus");
    const lift = valueOf("fleetFilterLift").toLowerCase();
    return state.equipment.filter(e => {
      if (branch && (e.branchId || "UNASSIGNED") !== branch) return false;
      if (type && e.equipmentType !== type) return false;
      if (status && computedLiftStatus(e.liftId) !== status) return false;
      if (lift && !e.liftId.toLowerCase().includes(lift)) return false;
      return true;
    });
  }

  function weeklyHours(liftId) {
    const weekAgo = Date.now() - 7 * 86400000;
    const sum = state.hourMeters
      .filter(h => h.liftId === liftId && new Date(h.timestamp || h.date).getTime() >= weekAgo)
      .reduce((total, h) => total + (Number.parseFloat(h.dailyHoursUsed) || 0), 0);
    return round1(sum);
  }

  function addAudit(action, liftId, oldValue, newValue, notes) {
    const user = currentUser();
    state.auditLog.unshift(auditEntry(user ? user.display : "Public/System", user ? user.role : "public", liftId, action, oldValue, newValue, notes));
  }

  async function auditAndPersist(action, liftId, oldValue, newValue, notes) {
    addAudit(action, liftId, oldValue, newValue, notes);
    await saveAll();
  }

  function auditEntry(user, role, liftId, action, oldValue, newValue, notes) {
    return {
      auditId: id("aud"),
      timestamp: new Date().toISOString(),
      user,
      role,
      liftId: liftId || "",
      action,
      oldValue: oldValue || "",
      newValue: newValue || "",
      notes: notes || ""
    };
  }

  async function saveAll() {
    saveAllLocal();
    if (isCloudActive()) {
      await Promise.all([
        saveCollection("equipment", "liftId"),
        saveCollection("inspections", "id"),
        saveCollection("defects", "defectId"),
        saveCollection("repairs", "repairId"),
        saveCollection("hourMeters", "hourMeterId"),
        saveCollection("auditLog", "auditId")
      ]);
    }
  }

  function saveAllLocal() {
    localStorage.setItem(KEYS.equipment, JSON.stringify(state.equipment));
    localStorage.setItem(KEYS.inspections, JSON.stringify(state.inspections));
    localStorage.setItem(KEYS.defects, JSON.stringify(state.defects));
    localStorage.setItem(KEYS.repairs, JSON.stringify(state.repairs));
    localStorage.setItem(KEYS.hourMeters, JSON.stringify(state.hourMeters));
    localStorage.setItem(KEYS.auditLog, JSON.stringify(state.auditLog));
  }

  async function saveCollection(name, idField) {
    try {
      const db = getDb();
      if (!db) return;
      const batch = db.batch();
      state[name].forEach(item => {
        const docId = String(item[idField] || id(name));
        batch.set(db.collection(COLLECTIONS[name]).doc(docId), item);
      });
      await batch.commit();
    } catch (err) {
      console.warn("Fleet cloud save failed:", name, err);
    }
  }

  function isCloudActive() {
    return !!(window.forkliftApp && window.forkliftApp.isCloud && window.forkliftApp.isCloud());
  }

  function getDb() {
    return window.forkliftApp && window.forkliftApp.db ? window.forkliftApp.db() : null;
  }

  function currentUser() {
    return window.forkliftApp && window.forkliftApp.currentUser ? window.forkliftApp.currentUser() : null;
  }

  function isSupervisor(user) {
    return !!(user && ["manager", "admin"].includes(user.role));
  }

  function readLocal(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function getChecklistLabels() {
    const cards = Array.from(document.querySelectorAll(".check-label")).map(el => el.textContent);
    if (cards.length) return cards;
    return ["Forks", "Tires", "Horn", "Lights", "Backup alarm", "Seatbelt", "Brakes", "Steering", "Hydraulic leaks", "Battery / propane", "Mast / chains", "Data plate", "Safety decals", "General damage", "Floor area clear"];
  }

  function exportRows(name, rows) {
    if (!rows || rows.length <= 1) {
      toastSafe("No data to export.");
      return;
    }
    const csv = rows.map(row => row.map(cell => `"${String(cell == null ? "" : cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toastSafe("CSV exported.");
  }

  function table(headers, rows) {
    if (!rows) return empty("No records found.");
    return `<div class="fleet-table-wrap"><table class="fleet-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function statCard(num, label, cls) {
    return `<div class="stat-card ${cls}"><div class="stat-num">${esc(num)}</div><div class="stat-label">${esc(label)}</div></div>`;
  }

  function input(idValue, label, placeholder) {
    return `<div class="form-group"><label for="${idValue}">${esc(label)}</label><input type="text" id="${idValue}" placeholder="${escAttr(placeholder)}"></div>`;
  }

  function detail(label, value) {
    return `<div class="fleet-detail"><span>${esc(label)}</span><strong>${esc(value || "")}</strong></div>`;
  }

  function empty(msg) {
    return `<div class="empty-state">${esc(msg)}</div>`;
  }

  function qrLink(liftId) {
    return `${PUBLIC_APP_URL}?lift=${encodeURIComponent(liftId)}`;
  }

  function qrImage(liftId) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrLink(liftId))}`;
  }

  function valueOf(idValue) {
    const el = document.getElementById(idValue);
    return el ? String(el.value || "").trim() : "";
  }

  function setValue(idValue, value) {
    const el = document.getElementById(idValue);
    if (el) el.value = value == null ? "" : String(value);
  }

  function todayIso() {
    return localDateIso(new Date());
  }

  function addDaysIso(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return localDateIso(d);
  }

  function localDateIso(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().split("T")[0];
  }

  function daysOpen(dateStr) {
    const start = new Date(dateStr + "T00:00:00").getTime();
    if (!Number.isFinite(start)) return "";
    return Math.max(0, Math.floor((Date.now() - start) / 86400000));
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString();
  }

  function round1(num) {
    return Math.round(num * 10) / 10;
  }

  function unique(arr) {
    return Array.from(new Set(arr.filter(Boolean)));
  }

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function cssId(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function js(str) {
    return String(str).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  function escAttr(str) {
    return esc(str).replace(/"/g, "&quot;");
  }

  function escHtml(str) {
    return esc(str);
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  function toastSafe(msg) {
    if (window.toast) window.toast(msg);
    else alert(msg);
  }
})();
