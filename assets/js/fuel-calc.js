/*
 * Pure fuel-planning calculations. No DOM, no side effects — safe to unit test.
 * Exposed as `FuelCalc` in the browser and as a CommonJS module under Node.
 *
 * Model
 * -----
 * laps(session):
 *   - "laps" limit -> ceil(limitValue)
 *   - "time" limit -> floor(minutes*60 / lapSeconds) + 1
 *       (+1: when the clock hits zero the lap in progress must still be
 *        finished, so you always need fuel for one more lap.)
 * base       = laps * fuelPerLap
 * withMargin = (laps + extraLaps[startType]) * fuelPerLap
 *   - standing starts default to a larger extra-lap margin than rolling.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.FuelCalc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Parse "90", "90.5", "1:30", "1:30.250", "01m30.250s" -> seconds. NaN if invalid. */
  function parseLapTime(input) {
    if (input == null) return NaN;
    var str = String(input).trim().toLowerCase().replace(/\s+/g, "");
    if (!str) return NaN;
    if (/[hms]/.test(str)) {
      var total = 0;
      var matched = 0;
      var re = /([\d.]+)(h|m|s)/g;
      var match;
      while ((match = re.exec(str)) !== null) {
        var value = Number(match[1]);
        if (isNaN(value) || value < 0) return NaN;
        if (match[2] === "h") total += value * 3600;
        else if (match[2] === "m") total += value * 60;
        else total += value;
        matched += match[0].length;
      }
      return matched === str.length && total > 0 ? total : NaN;
    }
    if (str.indexOf(":") === -1) {
      var n = Number(str);
      return n >= 0 ? n : NaN;
    }
    var parts = str.split(":");
    if (parts.length !== 2) return NaN;
    var min = Number(parts[0]);
    var sec = Number(parts[1]);
    if (isNaN(min) || isNaN(sec) || min < 0 || sec < 0 || sec >= 60) return NaN;
    return min * 60 + sec;
  }

  /** Laps needed for a session. Returns a positive integer or null if not computable. */
  function lapsForSession(session, lapSeconds) {
    var value = Number(session.limitValue);
    if (isNaN(value) || value <= 0) return null;
    if (session.limitType === "laps") return Math.ceil(value);
    if (!lapSeconds || lapSeconds <= 0 || isNaN(lapSeconds)) return null;
    return Math.floor((value * 60) / lapSeconds) + 1;
  }

  /** Fuel for a known lap count. */
  function sessionFuel(laps, fuelPerLap, extraLaps) {
    var extra = Number(extraLaps) || 0;
    return {
      base: laps * fuelPerLap,
      withMargin: (laps + extra) * fuelPerLap,
    };
  }

  /**
   * Compute a full plan.
   * plan = { lapTime, fuelPerLap, margins: {standing, rolling}, sessions: [...] }
   * Returns { valid, sessions: [{included, name, startType, laps, base, withMargin}], totals }.
   * Sessions without a positive limit are marked included:false and skipped in totals.
   */
  function computePlan(plan) {
    var lapSeconds = parseLapTime(plan.lapTime);
    var fuelPerLap = Number(plan.fuelPerLap);
    var margins = plan.margins || {};
    var valid = !isNaN(lapSeconds) && lapSeconds > 0 && !isNaN(fuelPerLap) && fuelPerLap > 0;

    var totals = { laps: 0, base: 0, withMargin: 0 };
    var sessions = (plan.sessions || []).map(function (s) {
      var laps = valid ? lapsForSession(s, lapSeconds) : null;
      if (laps == null) {
        return { included: false, name: s.name || "", startType: s.startType, laps: null, base: 0, withMargin: 0 };
      }
      var extra = margins[s.startType];
      var fuel = sessionFuel(laps, fuelPerLap, extra);
      totals.laps += laps;
      totals.base += fuel.base;
      totals.withMargin += fuel.withMargin;
      return {
        included: true,
        name: s.name || "",
        startType: s.startType,
        laps: laps,
        base: fuel.base,
        withMargin: fuel.withMargin,
      };
    });

    return { valid: valid, lapSeconds: lapSeconds, sessions: sessions, totals: totals };
  }

  return {
    parseLapTime: parseLapTime,
    lapsForSession: lapsForSession,
    sessionFuel: sessionFuel,
    computePlan: computePlan,
  };
});
