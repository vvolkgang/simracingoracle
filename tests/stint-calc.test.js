"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const StintCalc = require("../assets/js/stint-calc.js");

const EPS = 1e-9;
function close(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < EPS, `${msg || ""} expected ~${expected}, got ${actual}`);
}

test("parseDuration: tokens, decimals, h:mm[:ss], plain minutes", () => {
  close(StintCalc.parseDuration("4h"), 4 * 3600);
  close(StintCalc.parseDuration("20m"), 20 * 60);
  close(StintCalc.parseDuration("1h30m"), 5400);
  close(StintCalc.parseDuration("90m"), 5400);
  close(StintCalc.parseDuration("1.5h"), 5400);
  close(StintCalc.parseDuration("1h 30m"), 5400);
  close(StintCalc.parseDuration("4:00"), 4 * 3600);
  close(StintCalc.parseDuration("0:30"), 30 * 60);
  close(StintCalc.parseDuration("1:30:00"), 5400);
  close(StintCalc.parseDuration("90"), 5400, "plain numbers are minutes");
});

test("parseDuration: invalid input -> NaN", () => {
  assert.ok(Number.isNaN(StintCalc.parseDuration("")));
  assert.ok(Number.isNaN(StintCalc.parseDuration("abc")));
  assert.ok(Number.isNaN(StintCalc.parseDuration("1x")));
  assert.ok(Number.isNaN(StintCalc.parseDuration("4h30")), "trailing garbage");
  assert.ok(Number.isNaN(StintCalc.parseDuration("0h")), "zero total invalid");
  assert.ok(Number.isNaN(StintCalc.parseDuration("1:60")), "minutes >= 60 invalid");
  assert.ok(Number.isNaN(StintCalc.parseDuration("-4h")));
  assert.ok(Number.isNaN(StintCalc.parseDuration(null)));
});

test("computeStintPlan: 4h NEC-style race", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "4h",
    lapTime: "1:55.000",         // 115s
    fuelPerLap: 3.8,
    tankSize: 100,               // floor(100/3.8) = 26 laps per tank
    fuelStintMargin: 0,
    fuelLastStrintMargin: 1,     // extra 1 lap of fuel in the final stint
    refuelStrategy: "best",
    tyreLife: 0,
    refuelRate: 3,
    fuelAndTyresConcurrent: true,
    tyreChangeTime: 25,
    driverChangeTime: 30,
  });
  assert.equal(out.valid, true);
  // floor(14400/115)+1 = 125 + 1 = 126 laps
  assert.equal(out.estimatedLaps, 126);
  // Total fuel includes race consumption + final reserve.
  close(out.totalFuel, (126 + 1) * 3.8);
  assert.equal(out.lapsPerStint, 26);
  assert.equal(out.stintCount, 5);    // ceil(126/26) = 5
  assert.equal(out.pitStops, 4);
  // Stints: 26, 26, 26, 26, 22 (last = 126 - 26*4)
  assert.equal(out.stints[4].laps, 22);
  close(out.stints[0].startFuel, 26 * 3.8);
  close(out.stints[0].fuelAtPit, 0);
  // Earlier pits refuel a full 26-lap stint
  close(out.stints[0].pit.refuel, 26 * 3.8);
  // LAST refuel includes the fuelLastStrintMargin (22 + 1) * 3.8 = 87.4L (< tank=100)
  close(out.stints[3].pit.refuel, (22 + 1) * 3.8);
});

test("computeStintPlan: stint margin applies before the final refuel", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "30m", lapTime: "60", fuelPerLap: 2, tankSize: 30,
    fuelStintMargin: 0.5, fuelLastStrintMargin: 2, tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  // estimatedLaps = floor(1800/60)+1 = 31; lapsPerStint = floor(30/2) = 15
  // stintCount = ceil(31/15) = 3 -> 15, 15, 1
  assert.equal(out.lapsPerStint, 15);
  assert.equal(out.stintCount, 3);
  // First two stints include the shared stint margin, capped by the tank.
  close(out.stints[0].startFuel, 30);
  close(out.stints[0].fuelAtPit, 0);
  // pit 0: lapsNext = 15 (not last), refuel wants (15+0.5)*2, capped at 30
  close(out.stints[0].pit.refuel, 30);
  // pit 1: lapsNext = 1 (LAST), refuel = (1 + 2)*2 = 6
  close(out.stints[1].pit.refuel, 6);
});

test("computeStintPlan: start fuel mirrors the matching refuel target", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "25m", lapTime: "60", fuelPerLap: 12, tankSize: 100,
    fuelLastStrintMargin: 1, tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  // Default fuelStintMargin is 0.3, so each non-final 8-lap stint wants 99.6L.
  close(out.stints[0].startFuel, (8 + 0.3) * 12);
  close(out.stints[0].fuelAtPit, 0.3 * 12);
  close(out.stints[1].startFuel, out.stints[0].pit.refuel);
});

test("computeStintPlan: last stint fuel required subtracts current fuel in tank", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "30m", lapTime: "60", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 1, currentFuelInTank: 8,
    tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  // estimatedLaps = 31, stints = 20, 11. Final target is (11 + 1) * 2 = 24L.
  close(out.lastStintStartFuel, 24);
  close(out.lastStintFuelRequired, 16);
});

test("computeStintPlan: balanced strategy evens stints without adding stops", () => {
  const base = {
    raceLength: "30m", lapTime: "60", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 99, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  };
  const best = StintCalc.computeStintPlan({ ...base, refuelStrategy: "best" });
  const balanced = StintCalc.computeStintPlan({ ...base, refuelStrategy: "balanced" });

  // estimatedLaps = 31, max tank = 20 laps. Best is 20/11; balanced is 16/15.
  assert.equal(best.stintCount, 2);
  assert.equal(balanced.stintCount, 2);
  assert.deepEqual(best.stints.map((s) => s.laps), [20, 11]);
  assert.deepEqual(balanced.stints.map((s) => s.laps), [16, 15]);
});

test("computeStintPlan: tyre swap recommended when life would expire", () => {
  // tank=60, fpl=2 -> 30 laps per stint; tyreLife=40 means after stint 1
  // tyres are at 30 laps; next stint would push to 60 > 40, so recommend
  // at the first pit. After change, tyres reset.
  const out = StintCalc.computeStintPlan({
    raceLength: "90m",            // 90 min
    lapTime: "60",                 // 60s/lap -> floor(5400/60)+1 = 91 laps
    fuelPerLap: 2,
    tankSize: 60,
    fuelStintMargin: 0,
    fuelLastStrintMargin: 0,
    tyreLife: 40,
    refuelRate: 3,
    fuelAndTyresConcurrent: true,
    tyreChangeTime: 25,
    driverChangeTime: 0,
  });
  assert.equal(out.lapsPerStint, 30);
  assert.equal(out.stintCount, Math.ceil(91 / 30));      // 4
  assert.equal(out.stints[0].pit.tyreChange, true);      // 30+30=60 > 40
  assert.equal(out.stints[1].pit.tyreChange, true);      // tyres reset; 30+30=60>40 again
});

test("computeStintPlan: tyreLife=0 changes tyres at every pit", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "60m", lapTime: "60", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 25, driverChangeTime: 0,
  });
  out.stints.forEach((s) => {
    if (s.pit) assert.equal(s.pit.tyreChange, true);
  });
});

test("computeStintPlan: pit time concurrent vs sequential", () => {
  const base = {
    raceLength: "60m", lapTime: "60", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 20, refuelRate: 2,
    tyreChangeTime: 25, driverChangeTime: 10,
  };
  // 20 laps per stint, 20-lap tyres -> first pit will swap.
  const concurrent = StintCalc.computeStintPlan({ ...base, fuelAndTyresConcurrent: true });
  const sequential = StintCalc.computeStintPlan({ ...base, fuelAndTyresConcurrent: false });

  // refuelTime = (20 * 2) / 2 = 20s
  // concurrent: max(20, 25) + 10 = 35; sequential: 20 + 25 + 10 = 55
  close(concurrent.stints[0].pit.pitTime, 35);
  close(sequential.stints[0].pit.pitTime, 55);
});

test("computeStintPlan: last refuel capped at tank size when margin pushes over", () => {
  // tank=10, fpl=2 -> lapsPerStint = 5; fuelLastStrintMargin=4 inflates the last
  // refuel beyond the tank, which then caps.
  const out = StintCalc.computeStintPlan({
    raceLength: "12m", lapTime: "60", fuelPerLap: 2, tankSize: 10,
    fuelStintMargin: 0, fuelLastStrintMargin: 4, tyreLife: 0, refuelRate: 2,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  // estimatedLaps = floor(720/60)+1 = 13; stints: 5, 5, 3
  assert.equal(out.lapsPerStint, 5);
  assert.equal(out.stintCount, 3);
  // Last refuel WANTS (3 + 4) * 2 = 14L, capped at tank = 10L.
  close(out.stints[1].pit.refuel, 10);
  // Earlier refuel is a full 5-lap stint = 10L (also at the cap).
  close(out.stints[0].pit.refuel, 10);
});

test("computeStintPlan: invalid inputs -> valid:false, no stints", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "nope", lapTime: "1:30", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  assert.equal(out.valid, false);
  assert.equal(out.stints.length, 0);
});

test("computeStintPlan: tank smaller than one lap of fuel -> invalid", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "60m", lapTime: "60", fuelPerLap: 5, tankSize: 4,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  assert.equal(out.valid, false);
});

test("computeStintPlan: totalPitTime sums all pits", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "60m", lapTime: "60", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 0, refuelRate: 2,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 5,
  });
  const sum = out.stints.reduce((acc, s) => acc + (s.pit ? s.pit.pitTime : 0), 0);
  close(out.totalPitTime, sum);
});

test("computeStintPlan: last stint shorter than lapsPerStint", () => {
  const out = StintCalc.computeStintPlan({
    raceLength: "30m", lapTime: "60", fuelPerLap: 2, tankSize: 40,
    fuelStintMargin: 0, fuelLastStrintMargin: 0, tyreLife: 0, refuelRate: 3,
    fuelAndTyresConcurrent: true, tyreChangeTime: 0, driverChangeTime: 0,
  });
  // estimatedLaps = 31, lapsPerStint = 20 -> stints: 20, 11
  assert.equal(out.estimatedLaps, 31);
  assert.equal(out.lapsPerStint, 20);
  assert.equal(out.stintCount, 2);
  assert.equal(out.stints[0].laps, 20);
  assert.equal(out.stints[1].laps, 11);
});
