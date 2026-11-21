/* Core behaviour shared by every page: display settings, read-aloud, offline status,
   service-worker registration. Exposes a small global: window.PE. */
(function () {
  "use strict";

  var PE = (window.PE = window.PE || {});
  PE.root = document.documentElement.getAttribute("data-root") || "./";

  /* ---------- Safe storage (can throw in private mode / when blocked) ---------- */
  PE.ls = {
    get: function (key, fallback) {
      try { var raw = localStorage.getItem(key); return raw === null ? fallback : raw; } catch (e) { return fallback; }
    },
    set: function (key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
    remove: function (key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
    getJSON: function (key, fallback) {
      try { var raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch (e) { return fallback; }
    },
    setJSON: function (key, value) { return PE.ls.set(key, JSON.stringify(value)); }
  };

  /* ---------- Display settings ---------- */
  var SETTING_KEYS = {
    theme: "pe-theme", cb: "pe-cb", text: "pe-text",
    motion: "pe-motion", font: "pe-font", ls: "pe-ls", lh: "pe-lh"
  };
  var DEFAULTS = { theme: "light", cb: "none", text: "base", motion: "auto", font: "default", ls: "normal", lh: "normal" };

  PE.settings = {
    defaults: DEFAULTS,
    get: function () {
      var s = {};
      Object.keys(SETTING_KEYS).forEach(function (k) { s[k] = PE.ls.get(SETTING_KEYS[k], DEFAULTS[k]); });
      return s;
    },
    apply: function (s) {
      var root = document.documentElement;
      Object.keys(SETTING_KEYS).forEach(function (k) { root.setAttribute("data-" + k, s[k]); });
    },
    set: function (patch) {
      var s = PE.settings.get();
      Object.keys(patch).forEach(function (k) { s[k] = patch[k]; PE.ls.set(SETTING_KEYS[k], patch[k]); });
      PE.settings.apply(s);
      return s;
    },
    reset: function () {
      Object.keys(SETTING_KEYS).forEach(function (k) { PE.ls.remove(SETTING_KEYS[k]); });
      PE.settings.apply(DEFAULTS);
      return DEFAULTS;
    }
  };
  PE.settings.apply(PE.settings.get());

  /* ---------- Read aloud (Web Speech API, on-device) ---------- */
  function initSpeech() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll("button.speak"));
    if (!buttons.length) return;
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") return; // stay hidden

    var synth = window.speechSynthesis;
    var current = null;

    function setState(btn, speaking) {
      var label = btn.getAttribute("data-label") || "Listen";
      btn.setAttribute("aria-pressed", speaking ? "true" : "false");
      btn.setAttribute("aria-label", speaking ? "Stop reading aloud" : label + " — read aloud");
      var text = btn.querySelector(".speak-text");
      if (text) text.textContent = speaking ? "Stop" : label;
    }
    function stopAll() {
      synth.cancel();
      if (current) { setState(current, false); current = null; }
    }
    function resolveText(btn) {
      var explicit = btn.getAttribute("data-speak");
      if (explicit) return explicit;
      var main = document.getElementById("main");
      return (main || document.body).innerText;
    }

    buttons.forEach(function (btn) {
      btn.hidden = false;
      setState(btn, false);
      btn.addEventListener("click", function () {
        if (current === btn) { stopAll(); return; }
        var content = resolveText(btn).trim();
        if (!content) return;
        stopAll();
        var u = new SpeechSynthesisUtterance(content);
        u.lang = "en-AU";
        u.rate = 1;
        u.onend = u.onerror = function () { if (current === btn) { setState(btn, false); current = null; } };
        current = btn;
        setState(btn, true);
        synth.speak(u);
      });
    });
    window.addEventListener("pagehide", function () { synth.cancel(); });
  }

  /* ---------- Offline status banner ---------- */
  function initNetStatus() {
    var banner = document.getElementById("net-banner");
    if (!banner) return;
    function update() { banner.hidden = navigator.onLine !== false; }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  /* ---------- Service worker (offline support) ---------- */
  PE.swSupported = "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1");
  PE.swReady = null;
  function registerServiceWorker() {
    if (!PE.swSupported) return;
    PE.swReady = navigator.serviceWorker
      .register(PE.root + "sw.js", { scope: PE.root })
      .then(function () { return navigator.serviceWorker.ready; })
      .catch(function (err) { console.warn("Service worker registration failed", err); return null; });
  }

  /* Ask the worker to do something and wait for its reply. */
  PE.callSW = function (message, timeoutMs) {
    if (!PE.swReady) return Promise.reject(new Error("unsupported"));
    return PE.swReady.then(function (reg) {
      if (!reg || !reg.active) throw new Error("not-ready");
      return new Promise(function (resolve, reject) {
        var channel = new MessageChannel();
        var timer = setTimeout(function () { reject(new Error("timeout")); }, timeoutMs || 30000);
        channel.port1.onmessage = function (e) { clearTimeout(timer); resolve(e.data); };
        reg.active.postMessage(message, [channel.port2]);
      });
    });
  };

  /* ---------- Small helpers ---------- */
  PE.qs = function (name) { return new URLSearchParams(location.search).get(name); };
  PE.role = function () { var r = PE.ls.get("pe-role", null); return r === "attendee" || r === "organiser" ? r : null; };

  document.addEventListener("DOMContentLoaded", function () {
    initSpeech();
    initNetStatus();
    registerServiceWorker();
  });
})();
