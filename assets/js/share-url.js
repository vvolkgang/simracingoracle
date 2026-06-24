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
      setVal(pair[1], params.get(pair[0]));
      applied = true;
    });
    return applied;
  }

  function addFields(url, fields) {
    fields.forEach(function (pair) {
      var value = val(pair[1]);
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

  global.ShareUrl = {
    applyFields: applyFields,
    buildUrl: buildUrl,
    copyUrl: copyUrl,
    setVal: setVal,
  };
})(typeof self !== "undefined" ? self : this);
