"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const FuelCalc = require("../assets/js/fuel-calc.js");

const EPS = 1e-9;
function close(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < EPS, `${msg || ""} expected ~${expected}, got ${actual}`);
}

test("parseLapTime: m:ss(.mmm) and raw seconds", () => {
  close(FuelCalc.parseLapTime("1:30.000"), 90);
  close(FuelCalc.parseLapTime("1:30"), 90);
  close(FuelCalc.parseLapTime("90"), 90);
  close(FuelCalc.parseLapTime("90.5"), 90.5);
  close(FuelCalc.parseLapTime("0:59.999"), 59.999);
  close(FuelCalc.parseLapTime("2:05.250"), 125.25);
});

test("parseLapTime: invalid input -> NaN", () => {
  assert.ok(Number.isNaN(FuelCalc.parseLapTime("")));
  assert.ok(Number.isNaN(FuelCalc.parseLapTime("   ")));
  assert.ok(Number.isNaN(FuelCalc.parseLapTime("abc")));
  assert.ok(Number.isNaN(FuelCalc.parseLapTime("1:60")), "seconds >= 60 invalid");
  assert.ok(Number.isNaN(FuelCalc.parseLapTime("1:2:3")), "too many parts");
  assert.ok(Number.isNaN(FuelCalc.parseLapTime(null)));
  assert.ok(Number.isNaN(FuelCalc.parseLapTime("-5")), "negative invalid");
});

test("lapsForSession: lap-limited rounds up", () => {
  assert.equal(FuelCalc.lapsForSession({ limitType: "laps", limitValue: 40 }, 90), 40);
  assert.equal(FuelCalc.lapsForSession({ limitType: "laps", limitValue: 40.2 }, 90), 41);
});

test("lapsForSession: time-limited adds the in-progress lap", () => {
  // 5 min @ 90s = 3.33 full laps -> 3 + 1 = 4
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: 5 }, 90), 4);
  // 15 min @ 90s = 10 full laps -> 10 + 1 = 11
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: 15 }, 90), 11);
  // 30 min @ 90s -> 20 + 1 = 21
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: 30 }, 90), 21);
});

test("lapsForSession: invalid -> null", () => {
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: 0 }, 90), null);
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: "" }, 90), null);
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: 10 }, 0), null);
  assert.equal(FuelCalc.lapsForSession({ limitType: "time", limitValue: 10 }, NaN), null);
});

test("sessionFuel: base and margin", () => {
  const r = FuelCalc.sessionFuel(40, 2.6, 2);
  close(r.base, 104);
  close(r.withMargin, 109.2);
});

test("sessionFuel: missing extra margin defaults to 0", () => {
  const r = FuelCalc.sessionFuel(10, 3, undefined);
  close(r.base, 30);
  close(r.withMargin, 30);
});

test("computePlan: example event totals", () => {
  const plan = {
    lapTime: "1:30.000",
    fuelPerLap: 2.6,
    margins: { standing: 2, rolling: 1 },
    sessions: [
      { name: "Qualifying", limitType: "time", limitValue: 5, startType: "standing" },
      { name: "Heat", limitType: "time", limitValue: 15, startType: "rolling" },
      { name: "Feature Race", limitType: "laps", limitValue: 40, startType: "standing" },
    ],
  };
  const out = FuelCalc.computePlan(plan);
  assert.equal(out.valid, true);

  assert.equal(out.sessions[0].laps, 4);
  close(out.sessions[0].base, 10.4);
  close(out.sessions[0].withMargin, 15.6);

  assert.equal(out.sessions[1].laps, 11);
  close(out.sessions[1].base, 28.6);
  close(out.sessions[1].withMargin, 31.2);

  assert.equal(out.sessions[2].laps, 40);
  close(out.sessions[2].base, 104);
  close(out.sessions[2].withMargin, 109.2);

  assert.equal(out.totals.laps, 55);
  close(out.totals.base, 143);
  close(out.totals.withMargin, 156);
});

test("computePlan: rolling vs standing margin differs", () => {
  const base = { lapTime: "90", fuelPerLap: 2, margins: { standing: 3, rolling: 1 } };
  const standing = FuelCalc.computePlan({
    ...base,
    sessions: [{ limitType: "laps", limitValue: 10, startType: "standing" }],
  });
  const rolling = FuelCalc.computePlan({
    ...base,
    sessions: [{ limitType: "laps", limitValue: 10, startType: "rolling" }],
  });
  close(standing.sessions[0].withMargin, (10 + 3) * 2);
  close(rolling.sessions[0].withMargin, (10 + 1) * 2);
});

test("computePlan: blank sessions excluded from totals", () => {
  const out = FuelCalc.computePlan({
    lapTime: "90",
    fuelPerLap: 2,
    margins: { standing: 2, rolling: 1 },
    sessions: [
      { name: "Race", limitType: "laps", limitValue: 10, startType: "standing" },
      { name: "", limitType: "time", limitValue: "", startType: "standing" },
    ],
  });
  assert.equal(out.sessions[0].included, true);
  assert.equal(out.sessions[1].included, false);
  assert.equal(out.totals.laps, 10);
  close(out.totals.base, 20);
});

test("computePlan: invalid inputs -> not valid, zero totals", () => {
  const out = FuelCalc.computePlan({
    lapTime: "nope",
    fuelPerLap: 2.6,
    margins: { standing: 2, rolling: 1 },
    sessions: [{ name: "Race", limitType: "laps", limitValue: 10, startType: "standing" }],
  });
  assert.equal(out.valid, false);
  assert.equal(out.sessions[0].included, false);
  assert.equal(out.totals.base, 0);
});
