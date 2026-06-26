/*
 * Shared URL export/import helpers for buildless pages.
 */
(function (global) {
  "use strict";

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : "";
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
  }

  function applyFields(params, fields) {
    var applied = false;
    fields.forEach(function (pair) {
      if (!params.has(pair[0])) return;
      var value = params.get(pair[0]);
      setVal(pair[1], pair[3] ? pair[3](value) : value);
      applied = true;
    });
    return applied;
  }

  function addFields(url, fields) {
    fields.forEach(function (pair) {
      var value = val(pair[1]);
      if (pair[2]) value = pair[2](value);
      if (value !== "") url.searchParams.set(pair[0], value);
    });
  }

  function buildUrl(fields, extras) {
    var url = new URL(window.location.href);
    url.search = "";
    addFields(url, fields);
    Object.keys(extras || {}).forEach(function (key) {
      var value = extras[key];
      if (value != null && value !== "") url.searchParams.set(key, value);
    });
    return url.toString();
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  function setStatus(statusTarget, message) {
    var el = typeof statusTarget === "string" ? document.getElementById(statusTarget) : statusTarget;
    if (!el) return;
    el.textContent = message;
    var key = el.id || el;
    window.clearTimeout(setStatus.timers[key]);
    setStatus.timers[key] = window.setTimeout(function () { el.textContent = ""; }, 2000);
  }
  setStatus.timers = {};

  function copyUrl(url, statusTarget) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { setStatus(statusTarget, "Copied"); })
        .catch(function () {
          fallbackCopy(url);
          setStatus(statusTarget, "Copied");
        });
      return;
    }
    fallbackCopy(url);
    setStatus(statusTarget, "Copied");
  }

  function parseClockTime(input) {
    var str = String(input || "").trim().toLowerCase();
    if (!str) return NaN;
    if (str.indexOf(":") !== -1) {
      var parts = str.split(":").map(Number);
      if (parts.length < 2 || parts.length > 3) return NaN;
      if (parts.some(function (x) { return isNaN(x) || x < 0; })) return NaN;
      var h = parts.length === 3 ? parts[0] : 0;
      var m = parts.length === 3 ? parts[1] : parts[0];
      var s = parts.length === 3 ? parts[2] : parts[1];
      if (m >= 60 || s >= 60) return NaN;
      return h * 3600 + m * 60 + s;
    }
    var total = 0;
    var matched = 0;
    var re = /([\d.]+)\s*(h|m|s)/g;
    var match;
    while ((match = re.exec(str)) !== null) {
      var value = Number(match[1]);
      if (isNaN(value) || value < 0) return NaN;
      if (match[2] === "h") total += value * 3600;
      else if (match[2] === "m") total += value * 60;
      else total += value;
      matched += match[0].length;
    }
    if (matched === str.replace(/\s+/g, "").length && total > 0) return total;
    var n = Number(str);
    return n >= 0 ? n : NaN;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatLapToken(input) {
    var seconds = parseClockTime(input);
    if (isNaN(seconds)) return input;
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds - h * 3600 - m * 60;
    var whole = Math.floor(s);
    var millis = Math.round((s - whole) * 1000);
    if (millis === 1000) {
      whole += 1;
      millis = 0;
    }
    var sec = pad2(whole) + "." + String(millis).padStart(3, "0") + "s";
    return (h ? pad2(h) + "h" : "") + pad2(m) + "m" + sec;
  }

  function tokenToClock(input) {
    var seconds = parseClockTime(input);
    if (isNaN(seconds)) return input;
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds - h * 3600 - m * 60;
    var whole = Math.floor(s);
    var millis = Math.round((s - whole) * 1000);
    if (millis === 1000) {
      whole += 1;
      millis = 0;
    }
    var sec = pad2(whole) + "." + String(millis).padStart(3, "0");
    return h ? h + ":" + pad2(m) + ":" + sec : m + ":" + sec;
  }

  global.ShareUrl = {
    applyFields: applyFields,
    buildUrl: buildUrl,
    copyUrl: copyUrl,
    formatLapToken: formatLapToken,
    setVal: setVal,
    tokenToClock: tokenToClock,
  };
})(typeof self !== "undefined" ? self : this);
