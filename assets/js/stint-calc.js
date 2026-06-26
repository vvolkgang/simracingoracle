/*
 * Pure stint-planning calculations.

 * Model
 * -----
 * estimatedLaps = floor(raceSeconds / lapSeconds) + 1   (lap-in-progress rule)
 * totalFuel     = (estimatedLaps + fuelLastStrintMargin) * fuelPerLap
 *   (we plan to end the race with `fuelLastStrintMargin` laps of fuel still in the
 *    tank, since the actual finishing lap count depends on the class leader.)
 *
 * maxLapsOnTank = max(1, floor(tankSize / fuelPerLap))
 * stintCount    = ceil(estimatedLaps / maxLapsOnTank)
 *
 * Refuel strategies:
 *   - "best": full tanks first; last stint gets whatever is left.
 *   - "balanced": same minimum stint count, but laps distributed as evenly
 *     as possible so the final driver doesn't get a very short stint.
 *
 * Per pit stop (between stint i and i+1):
 *   targetMarginLaps = (next stint is the last one) ? fuelLastStrintMargin : fuelStintMargin
 *   refuel       = min((lapsNext + targetMarginLaps) * fuelPerLap, tankSize)
 *   tyresChange  = true at every stop when tyreLife == 0; otherwise recommended
 *                  when the tyres' cumulative age + next stint laps exceeds
 *                  tyreLife. We do NOT add extra pit stops just for tyres.
 *   refuelTime   = refuel / refuelRate
 *   pitTime      = (concurrent ? max(refuelTime, tyreChangeTime) : refuelTime + tyreChangeTime)
 *                  + driverChangeTime
 *                  (driver change is always added separately.)
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else global.StintCalc = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** Parse "4h", "20m", "1h30m", "90m", "1.5h", "1h", "75". Returns seconds, or NaN. */
  function parseDuration(input) {
    if (input == null) return NaN;
    var str = String(input).trim().toLowerCase().replace(/\s+/g, "");
    if (!str) return NaN;
    // Plain number → minutes (matches the "race length in minutes" intuition).
    if (/^[\d.]+$/.test(str)) {
      var n = Number(str);
      return n >= 0 ? n * 60 : NaN;
    }
    // h:mm or h:mm:ss → hours:minutes(:seconds)
    if (str.indexOf(":") !== -1) {
      var parts = str.split(":");
      if (parts.length < 2 || parts.length > 3) return NaN;
      var nums = parts.map(Number);
      if (nums.some(function (x) { return isNaN(x) || x < 0; })) return NaN;
      var h = nums[0], m = nums[1], s = nums[2] || 0;
      if (m >= 60 || s >= 60) return NaN;
      return h * 3600 + m * 60 + s;
    }
    // Token form: "1h30m", "4h", "20m", "1.5h".
    var total = 0;
    var matched = 0;
    var re = /([\d.]+)\s*(h|m)/g;
    var match;
    while ((match = re.exec(str)) !== null) {
      var value = Number(match[1]);
      if (isNaN(value) || value < 0) return NaN;
      total += value * (match[2] === "h" ? 3600 : 60);
      matched += match[0].length;
    }
    if (matched !== str.length || total === 0) return NaN;
    return total;
  }

  /** Parse "1:30.000", "90", "90.5", "01m30.000s". Returns seconds, or NaN. */
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

  function num(v, fallback) {
    var n = Number(v);
    return isNaN(n) ? (fallback == null ? NaN : fallback) : n;
  }

  function stintLapsForStrategy(estimatedLaps, maxLapsOnTank, refuelStrategy) {
    var count = Math.ceil(estimatedLaps / maxLapsOnTank);
    var stints = [];
    if (refuelStrategy === "balanced") {
      var base = Math.floor(estimatedLaps / count);
      var remainder = estimatedLaps % count;
      for (var i = 0; i < count; i++) {
        stints.push(base + (i < remainder ? 1 : 0));
      }
      return stints;
    }
    for (var j = 0; j < count; j++) {
      stints.push(j === count - 1 ? estimatedLaps - maxLapsOnTank * j : maxLapsOnTank);
    }
    return stints;
  }

  function computeStintPlan(plan) {
    var raceSeconds = parseDuration(plan.raceLength);
    var lapSeconds = parseLapTime(plan.lapTime);
    var fuelPerLap = num(plan.fuelPerLap);
    var tankSize = num(plan.tankSize);
    var fuelStintMargin = Math.max(0, num(plan.fuelStintMargin, 0.3));
    var fuelLastStrintMargin = Math.max(0, num(plan.fuelLastStrintMargin, 0));
    var currentFuelInput = num(plan.currentFuelInTank);
    var hasLiveFinalStintOverride = !isNaN(currentFuelInput);
    var currentFuelInTank = hasLiveFinalStintOverride ? Math.max(0, currentFuelInput) : 0;
    var remainingSeconds = parseDuration(plan.remainingTime);
    var refuelStrategy = plan.refuelStrategy === "balanced" ? "balanced" : "best";
    var tyreLife = num(plan.tyreLife, 0);
    var refuelRate = num(plan.refuelRate, 0);
    var fuelAndTyresConcurrent = !!plan.fuelAndTyresConcurrent;
    var tyreChangeTime = num(plan.tyreChangeTime, 0);
    var driverChangeTime = num(plan.driverChangeTime, 0);

    var valid =
      raceSeconds > 0 &&
      lapSeconds > 0 &&
      fuelPerLap > 0 &&
      tankSize > 0 &&
      tankSize / fuelPerLap >= 1;
    if (!valid) {
      return {
        valid: false,
        raceSeconds: raceSeconds,
        lapSeconds: lapSeconds,
        estimatedLaps: 0,
        totalFuel: 0,
        lapsPerStint: 0,
        stintCount: 0,
        pitStops: 0,
        stints: [],
        totalPitTime: 0,
        refuelRate: refuelRate,
        currentFuelInTank: currentFuelInTank,
        hasLiveFinalStintOverride: hasLiveFinalStintOverride,
        lastStintRemainingLaps: 0,
        lastStintStartFuel: 0,
        lastStintFuelRequired: 0,
      };
    }

    var estimatedLaps = Math.floor(raceSeconds / lapSeconds) + 1;
    var liveRemainingLaps = remainingSeconds > 0 ? Math.floor(remainingSeconds / lapSeconds) + 1 : 0;
    var totalFuel = (estimatedLaps + fuelLastStrintMargin) * fuelPerLap;
    var lapsPerStint = Math.max(1, Math.floor(tankSize / fuelPerLap));
    var stintLaps = stintLapsForStrategy(estimatedLaps, lapsPerStint, refuelStrategy);
    var stintCount = stintLaps.length;
    var pitStops = Math.max(0, stintCount - 1);

    var stints = [];
    var tyreAge = 0; // laps on the current set of tyres
    var totalPitTime = 0;

    for (var i = 0; i < stintCount; i++) {
      var lapsThis = stintLaps[i];
      var fuelUsed = lapsThis * fuelPerLap;
      var isLast = i === stintCount - 1;
      var targetMargin = isLast ? fuelLastStrintMargin : fuelStintMargin;
      var startFuel = Math.min((lapsThis + targetMargin) * fuelPerLap, tankSize);
      var fuelAtPit = Math.max(0, startFuel - fuelUsed);
      tyreAge += lapsThis;

      var pit = null;
      if (i < stintCount - 1) {
        var nextIsLast = i + 1 === stintCount - 1;
        var lapsNext = stintLaps[i + 1];
        var extra = nextIsLast ? fuelLastStrintMargin : fuelStintMargin;
        var refuel = Math.min((lapsNext + extra) * fuelPerLap, tankSize);
        var refuelTime = refuelRate > 0 ? refuel / refuelRate : 0;
        var changeTyres = tyreLife <= 0 || tyreAge + lapsNext > tyreLife;
        var tyreT = changeTyres ? tyreChangeTime : 0;
        var pitTime = (fuelAndTyresConcurrent ? Math.max(refuelTime, tyreT) : refuelTime + tyreT) + driverChangeTime;
        if (changeTyres) tyreAge = 0;
        pit = {
          refuel: refuel,
          refuelTime: refuelTime,
          tyreChange: changeTyres,
          tyreChangeTime: tyreT,
          driverChangeTime: driverChangeTime,
          pitTime: pitTime,
          isConcurrent: fuelAndTyresConcurrent,
        };
        totalPitTime += pitTime;
      }

      stints.push({
        index: i + 1,
        laps: lapsThis,
        startFuel: startFuel,
        fuelUsed: fuelUsed,
        fuelAtPit: fuelAtPit,
        pit: pit,
      });
    }

    var plannedLastStintLaps = stints.length ? stints[stints.length - 1].laps : 0;
    var lastStintRemainingLaps = liveRemainingLaps > 0 ? liveRemainingLaps : plannedLastStintLaps;
    var lastStintStartFuel = Math.min((lastStintRemainingLaps + fuelLastStrintMargin) * fuelPerLap, tankSize);
    var cappedCurrentFuel = Math.min(currentFuelInTank, tankSize);
    var lastStintFuelRequired = Math.max(0, lastStintStartFuel - cappedCurrentFuel);

    return {
      valid: true,
      raceSeconds: raceSeconds,
      lapSeconds: lapSeconds,
      estimatedLaps: estimatedLaps,
      totalFuel: totalFuel,
      lapsPerStint: lapsPerStint,
      stintCount: stintCount,
      pitStops: pitStops,
      refuelStrategy: refuelStrategy,
      stints: stints,
      totalPitTime: totalPitTime,
      refuelRate: refuelRate,
      currentFuelInTank: cappedCurrentFuel,
      hasLiveFinalStintOverride: hasLiveFinalStintOverride,
      lastStintRemainingLaps: lastStintRemainingLaps,
      lastStintStartFuel: lastStintStartFuel,
      lastStintFuelRequired: lastStintFuelRequired,
    };
  }

  return {
    parseDuration: parseDuration,
    parseLapTime: parseLapTime,
    computeStintPlan: computeStintPlan,
  };
});
