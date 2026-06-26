/*
 * DOM glue for the Stint Planning page. UI lives in stint-planning.html and
 * preset data in presets.js; this script only:
 *   - builds the stint preset select from window.Presets.stint,
 *   - applies preset values,
 *   - reads inputs, calls the pure StintCalc module, writes results back.
 */
(function () {
  "use strict";

  var PRESETS = (window.Presets && window.Presets.stint) || [];
  var presetEl;

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }
  function num(id) {
    return Number(val(id));
  }
  function checked(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }
  function fmtL(n) {
    return Number(n).toFixed(1) + " L";
  }
  /** Format seconds as "1m 30 s" or "45 s". */
  function fmtTime(seconds) {
    var s = Math.round(Number(seconds));
    if (!isFinite(s) || s < 0) return "—";
    if (s < 60) return s + " s";
    var m = Math.floor(s / 60);
    var rem = s % 60;
    return m + "m " + (rem < 10 ? "0" : "") + rem + " s";
  }

  function populatePresetSelect() {
    presetEl.innerHTML = "";
    PRESETS.forEach(function (p) {
      var opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.label;
      presetEl.appendChild(opt);
    });
    var custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = "Custom";
    presetEl.appendChild(custom);
  }

  function findPreset(id) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  /** Map of preset key -> input id. Only listed keys are applied. */
  var PRESET_FIELDS = {
    raceLength: "race-length",
    lapTime: "lap-time",
    fuelPerLap: "fuel-per-lap",
    tankSize: "tank-size",
    refuelStrategy: "refuel-strategy",
    fuelStintMargin: "fuel-stint-margin",
    fuelLastStrintMargin: "fuel-last-stint-margin",
    tyreLife: "tyre-life",
    refuelRate: "refuel-rate",
    tyreChangeTime: "tyre-change-time",
    driverChangeTime: "driver-change-time",
  };

  var SHARE_FIELDS = [
    ["race", "race-length"],
    ["lap", "lap-time", function (v) { return window.ShareUrl.formatLapToken(v); }, function (v) { return window.ShareUrl.tokenToClock(v); }],
    ["fpl", "fuel-per-lap"],
    ["tank", "tank-size"],
    ["strat", "refuel-strategy"],
    ["fsm", "fuel-stint-margin"],
    ["flsm", "fuel-last-stint-margin"],
    ["rate", "refuel-rate"],
    ["tyre", "tyre-life"],
    ["tyret", "tyre-change-time"],
    ["driver", "driver-change-time"],
    ["cur", "current-fuel-in-tank"],
    ["rem", "remaining-time"],
  ];

  function applyPreset(id) {
    var preset = findPreset(id);
    if (!preset) return;
    Object.keys(PRESET_FIELDS).forEach(function (key) {
      if (preset[key] == null) return;
      var el = document.getElementById(PRESET_FIELDS[key]);
      if (el) el.value = preset[key];
    });
    if (preset.fuelAndTyresConcurrent != null) {
      document.getElementById("concurrent").checked = !!preset.fuelAndTyresConcurrent;
    }
  }

  function applyQueryParams() {
    var params = new URLSearchParams(window.location.search);
    var hasSharedInputs = window.ShareUrl.applyFields(params, SHARE_FIELDS);

    if (params.has("conc")) {
      document.getElementById("concurrent").checked = params.get("conc") === "1";
      hasSharedInputs = true;
    }

    if (hasSharedInputs) presetEl.value = "custom";
  }

  function buildShareUrl() {
    return window.ShareUrl.buildUrl(SHARE_FIELDS, {
      conc: checked("concurrent") ? "1" : "0",
    });
  }

  function copyShareUrl() {
    window.ShareUrl.copyUrl(buildShareUrl(), this.parentNode.querySelector("[data-copy-status]"));
  }

  function readPlan() {
    return {
      raceLength: val("race-length"),
      lapTime: val("lap-time"),
      fuelPerLap: num("fuel-per-lap"),
      tankSize: num("tank-size"),
      refuelStrategy: val("refuel-strategy"),
      fuelStintMargin: num("fuel-stint-margin"),
      fuelLastStrintMargin: num("fuel-last-stint-margin"),
      currentFuelInTank: num("current-fuel-in-tank"),
      remainingTime: val("remaining-time"),
      tyreLife: num("tyre-life"),
      refuelRate: num("refuel-rate"),
      tyreChangeTime: num("tyre-change-time"),
      driverChangeTime: num("driver-change-time"),
      fuelAndTyresConcurrent: checked("concurrent"),
    };
  }

  function render() {
    var plan = readPlan();
    var out = window.StintCalc.computeStintPlan(plan);
    var emptyEl = document.getElementById("stint-empty");
    var resultsEl = document.getElementById("stint-results");

    if (!out.valid) {
      emptyEl.hidden = false;
      resultsEl.hidden = true;
      return;
    }
    emptyEl.hidden = true;
    resultsEl.hidden = false;

    document.getElementById("kpi-laps").textContent = out.estimatedLaps;
    document.getElementById("kpi-start-fuel").textContent = out.stints.length ? fmtL(out.stints[0].startFuel) : "—";
    document.getElementById("total-fuel-line").textContent = "Total fuel: " + fmtL(out.totalFuel);
    document.getElementById("last-stint-fuel-line").textContent = out.hasLiveFinalStintOverride
      ? "Last stint fuel to add now: " + fmtL(out.lastStintFuelRequired) +
        " (" + out.lastStintRemainingLaps + " laps, target " + fmtL(out.lastStintStartFuel) +
        ", current " + fmtL(out.currentFuelInTank) + ")"
      : "Last stint target: " + fmtL(out.lastStintStartFuel) +
        " (" + out.lastStintRemainingLaps + " laps)";
    document.getElementById("kpi-stints").textContent = out.stintCount;
    document.getElementById("kpi-stints-sub").textContent =
      out.pitStops + " pit stop" + (out.pitStops === 1 ? "" : "s");
    document.getElementById("kpi-pit").textContent = fmtTime(out.totalPitTime);
    document.getElementById("kpi-pit-sub").textContent =
      out.refuelRate > 0 ? "refuel assumed at " + out.refuelRate + " L/s" : "";

    var body = document.getElementById("stint-body");
    body.innerHTML = out.stints
      .map(function (s) {
        var pit = s.pit;
        var isLiveFinalStop = out.hasLiveFinalStintOverride && pit && s.index === out.stintCount - 1;
        var fuelAtPit = pit ? fmtL(isLiveFinalStop ? out.currentFuelInTank : s.fuelAtPit) : "—";
        var refuel = pit ? fmtL(isLiveFinalStop ? out.lastStintFuelRequired : pit.refuel) : "—";
        var pitTime = pit ? fmtTime(pit.pitTime) : "—";
        var tyresCell;
        if (!pit) {
          tyresCell = '<span class="cell-sub">—</span>';
        } else if (pit.tyreChange) {
          tyresCell = '<span class="badge rolling">Change</span>';
        } else {
          tyresCell = '<span class="cell-sub">Keep</span>';
        }
        return (
          "<tr>" +
          "<td>Stint " + s.index + "</td>" +
          "<td>" + s.laps + "</td>" +
          '<td class="cell-strong">' + fuelAtPit + "</td>" +
          '<td class="cell-strong">' + refuel + "</td>" +
          "<td>" + pitTime + "</td>" +
          "<td>" + tyresCell + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function init() {
    presetEl = document.getElementById("stint-preset");
    var form = document.getElementById("stint-form");

    populatePresetSelect();
    if (PRESETS.length) applyPreset(presetEl.value);
    applyQueryParams();

    presetEl.addEventListener("change", function () {
      if (presetEl.value !== "custom") applyPreset(presetEl.value);
      render();
    });

    // Manually editing any tracked field detaches the preset.
    var trackedIds = Object.values(PRESET_FIELDS).concat(["concurrent"]);
    trackedIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", function () { presetEl.value = "custom"; });
    });

    form.addEventListener("input", render);
    form.addEventListener("change", render);
    ["current-fuel-in-tank", "remaining-time"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

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
