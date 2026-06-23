/*
 * Presets for the Fuel Planning page. Keep ALL preset data here so it's easy to
 * add/edit without touching the page logic. The selects in index.html are built
 * from these lists (a "Custom" entry is appended automatically by fuel.js).
 *
 * Why a .js file and not presets.json? This is a buildless static site: a plain
 * `window.Presets` loads via <script> synchronously, works over file:// (no fetch
 * / CORS), and allows comments like this one. JSON would need async fetch and a
 * served origin for no real gain, since the data already lives only here.
 *
 *   format[].sessions[].start defaults to "standing" (larger safety margin);
 *   adjust per session in the UI.
 *
 * NOTE: the car lap time / fuel-per-lap figures below are starting estimates —
 * verify against your own telemetry and tweak as needed.
 */
(function (global) {
  "use strict";

  global.Presets = {
    format: [
      {
        id: "srp",
        label: "SimRacingPortugal",
        sessions: [
          { name: "Qualifying", unit: "time", limit: 5, start: "na" },
          { name: "Heat", unit: "time", limit: 15, start: "standing" },
          { name: "Feature", unit: "time", limit: 20, start: "standing" },
        ],
      },
      {
        id: "ir15",
        label: "iRacing 15min",
        sessions: [
          { name: "Qualifying", unit: "laps", limit: 2, start: "standing" },
          { name: "Race", unit: "time", limit: 15, start: "standing" },
        ],
      },
      {
        id: "ir30",
        label: "iRacing 30min",
        sessions: [
          { name: "Qualifying", unit: "laps", limit: 2, start: "standing" },
          { name: "Race", unit: "time", limit: 30, start: "standing" },
        ],
      },
    ],

    car: [
      {
        id: "cadillac-charlotte-roval-2025",
        label: "Cadillac CTS-V @ Charlotte Roval 2025",
        lapTime: "1:23.000",
        fuelPerLap: 2.3,
        marginStanding: 2,
        marginRolling: 1,
      },
      {
        id: "radical-sr8-charlotte-roval-2025",
        label: "Radical SR8 @ Charlotte Roval 2025",
        lapTime: "1:42.000",
        fuelPerLap: 2.6,
        marginStanding: 2,
        marginRolling: 1,
      },
    ],
  };
})(typeof self !== "undefined" ? self : this);
