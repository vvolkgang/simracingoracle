/*
 * DOM glue for the Fuel Planning page. UI lives in index.html and preset data
 * lives in presets.js; this script only:
 *   - builds the preset selects from window.Presets,
 *   - clones the <template> to add/remove session rows (the dynamic part),
 *   - applies race-format / car presets,
 *   - reads inputs, calls the pure FuelCalc module, writes results back.
 * No layout/markup is generated here beyond cloning the single row blueprint.
 */
(function () {
  "use strict";

  var PRESETS = (window.Presets || { format: [], car: [] });

  var sessionsEl, templateEl, formatPresetEl, carPresetEl;

  var START_LABELS = { standing: "Standing", rolling: "Rolling", na: "N/A" };
  var SHARE_FIELDS = [
    ["lap", "lap-time", function (v) { return window.ShareUrl.formatLapToken(v); }, function (v) { return window.ShareUrl.tokenToClock(v); }],
    ["fpl", "fuel-per-lap"],
    ["ms", "margin-standing"],
    ["mr", "margin-rolling"],
  ];

  /** Coerce a preset's start value to a known type; empty/null/invalid -> "na". */
  function normalizeStart(value) {
    if (value == null) return "na";
    var v = String(value).trim().toLowerCase();
    return START_LABELS[v] ? v : "na";
  }

  function fmtFuel(litres) {
    return Number(litres).toFixed(2) + " L";
  }
  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function findPreset(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  /** Fill a <select> with preset entries plus a trailing "Custom" option. */
  function populateSelect(selectEl, items) {
    selectEl.innerHTML = "";
    items.forEach(function (item) {
      var opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = item.label;
      selectEl.appendChild(opt);
    });
    var custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Custom";
    selectEl.appendChild(custom);
  }

  function addSession(data) {
    var row = templateEl.content.firstElementChild.cloneNode(true);
    if (data) {
      row.querySelector('[data-k="name"]').value = data.name || "";
      row.querySelector('[data-k="limit"]').value = data.limit != null ? data.limit : "";
      row.querySelector('[data-k="unit"]').value = data.unit || "time";
      row.querySelector('[data-k="start"]').value = normalizeStart(data.start);
    }
    sessionsEl.appendChild(row);
  }

  function applyFormatPreset(id) {
    var preset = findPreset(PRESETS.format, id);
    sessionsEl.innerHTML = "";
    if (preset) preset.sessions.forEach(addSession);
    if (!sessionsEl.children.length) addSession();
  }

  function applyCarPreset(id) {
    var preset = findPreset(PRESETS.car, id);
    if (!preset) return;
    setIfPresent("lap-time", preset.lapTime);
    setIfPresent("fuel-per-lap", preset.fuelPerLap);
    setIfPresent("margin-standing", preset.marginStanding);
    setIfPresent("margin-rolling", preset.marginRolling);
  }

  function setIfPresent(id, value) {
    if (value == null) return;
    var el = document.getElementById(id);
    if (el) el.value = value;
  }

  function serializeSessions() {
    var rows = [];
    sessionsEl.querySelectorAll(".session-row").forEach(function (row) {
      rows.push([
        row.querySelector('[data-k="name"]').value,
        row.querySelector('[data-k="limit"]').value,
        row.querySelector('[data-k="unit"]').value === "laps" ? "l" : "t",
        row.querySelector('[data-k="start"]').value.charAt(0),
      ].join("."));
    });
    return rows.join("_");
  }

  function applySerializedSessions(value) {
    var rows;
    if (value.charAt(0) === "[") {
      try {
        rows = JSON.parse(value);
      } catch (e) {
        return false;
      }
      if (!Array.isArray(rows)) return false;
      sessionsEl.innerHTML = "";
      rows.forEach(function (row) {
        addSession({
          name: row.n,
          limit: row.l,
          unit: row.u,
          start: row.s,
        });
      });
    } else {
      rows = value.split("_").filter(Boolean);
      sessionsEl.innerHTML = "";
      rows.forEach(function (row) {
        var parts = row.split(".");
        addSession({
          name: parts[0] || "",
          limit: parts[1] || "",
          unit: parts[2] === "l" ? "laps" : "time",
          start: ({ s: "standing", r: "rolling", n: "na" })[parts[3]] || "na",
        });
      });
    }
    if (!sessionsEl.children.length) addSession();
    return true;
  }

  function applyQueryParams() {
    var params = new URLSearchParams(window.location.search);
    var hasSharedInputs = window.ShareUrl.applyFields(params, SHARE_FIELDS);
    if (params.has("sessions") && applySerializedSessions(params.get("sessions"))) {
      hasSharedInputs = true;
    }
    if (hasSharedInputs) {
      formatPresetEl.value = "custom";
      carPresetEl.value = "custom";
    }
  }

  function buildShareUrl() {
    return window.ShareUrl.buildUrl(SHARE_FIELDS, {
      sessions: serializeSessions(),
    });
  }

  function copyShareUrl() {
    window.ShareUrl.copyUrl(buildShareUrl(), this.parentNode.querySelector("[data-copy-status]"));
  }

  function readPlan() {
    var sessions = [];
    sessionsEl.querySelectorAll(".session-row").forEach(function (row) {
      sessions.push({
        name: row.querySelector('[data-k="name"]').value,
        limitType: row.querySelector('[data-k="unit"]').value,
        limitValue: row.querySelector('[data-k="limit"]').value,
        startType: row.querySelector('[data-k="start"]').value,
      });
    });
    return {
      lapTime: val("lap-time"),
      fuelPerLap: val("fuel-per-lap"),
      margins: { standing: val("margin-standing"), rolling: val("margin-rolling") },
      sessions: sessions,
    };
  }

  function render() {
    var result = window.FuelCalc.computePlan(readPlan());
    var table = document.getElementById("results-table");
    var empty = document.getElementById("results-empty");
    var body = document.getElementById("results-body");

    if (!result.valid) {
      table.hidden = true;
      empty.hidden = false;
      return;
    }
    table.hidden = false;
    empty.hidden = true;

    var esc = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    };

    body.innerHTML = result.sessions
      .filter(function (s) {
        return s.included;
      })
      .map(function (s, i) {
        return (
          "<tr><td>" + esc(s.name || "Session " + (i + 1)) + "</td>" +
          '<td><span class="badge ' + esc(s.startType) + '">' + esc(START_LABELS[s.startType] || s.startType) + "</span></td>" +
          "<td>" + s.laps + "</td>" +
          '<td class="cell-strong">' + fmtFuel(s.base) + "</td>" +
          '<td class="cell-margin">' + fmtFuel(s.withMargin) + "</td></tr>"
        );
      })
      .join("");

    document.getElementById("total-laps").textContent = result.totals.laps;
    document.getElementById("total-fuel").textContent = fmtFuel(result.totals.base);
    document.getElementById("total-margin").textContent = fmtFuel(result.totals.withMargin);
  }

  function init() {
    sessionsEl = document.getElementById("sessions");
    templateEl = document.getElementById("session-template");
    formatPresetEl = document.getElementById("preset");
    carPresetEl = document.getElementById("car-preset");
    var form = document.getElementById("fuel-form");

    populateSelect(formatPresetEl, PRESETS.format);
    populateSelect(carPresetEl, PRESETS.car);
    // A freshly populated select defaults to its first option, so both selectors
    // start on their first preset.
    applyFormatPreset(formatPresetEl.value);
    if (PRESETS.car.length) applyCarPreset(carPresetEl.value);
    applyQueryParams();

    formatPresetEl.addEventListener("change", function () {
      if (formatPresetEl.value !== "custom") applyFormatPreset(formatPresetEl.value);
      render();
    });

    carPresetEl.addEventListener("change", function () {
      if (carPresetEl.value !== "custom") applyCarPreset(carPresetEl.value);
      render();
    });

    // Manually editing any car/driver field detaches the car preset.
    ["lap-time", "fuel-per-lap", "margin-standing", "margin-rolling"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", function () {
        carPresetEl.value = "custom";
      });
    });

    document.getElementById("add-session").addEventListener("click", function () {
      addSession();
      formatPresetEl.value = "custom";
      render();
    });

    sessionsEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".session-remove");
      if (!btn) return;
      var row = btn.closest(".session-row");
      if (row) row.remove();
      formatPresetEl.value = "custom";
      render();
    });

    form.addEventListener("input", render);
    form.addEventListener("change", render);
    document.querySelectorAll("[data-copy-url]").forEach(function (btn) {
      btn.addEventListener("click", copyShareUrl);
    });

    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
