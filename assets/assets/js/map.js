/* Access map: MapLibre GL over free OpenFreeMap (OpenStreetMap) tiles, with an offline schematic
   SVG fallback. Mirrors src/components/AccessMap.tsx + LiveMap.tsx.

   The text list under every map is rendered separately (PERender.accessListHtml), so the map is
   never the only way to get the information. */
(function () {
  "use strict";
  var PE = window.PE;
  var R = window.PERender;

  var STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
  PE.MAP_STYLE_URL = STYLE_URL;

  var libPromise = null;
  function loadMapLibrary() {
    if (window.maplibregl) return Promise.resolve(window.maplibregl);
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet"; css.href = PE.root + "assets/vendor/maplibre-gl.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = PE.root + "assets/vendor/maplibre-gl.js";
      // Never sit on "Loading map…" forever: after 12s give up and let the caller show the schematic map.
      var timer = setTimeout(function () { libPromise = null; reject(new Error("maplibre load timed out")); }, 12000);
      s.onload = function () { clearTimeout(timer); window.maplibregl ? resolve(window.maplibregl) : reject(new Error("maplibre missing")); };
      s.onerror = function () { clearTimeout(timer); libPromise = null; reject(new Error("maplibre failed to load")); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function schematicSvg(points) {
    if (!points.length) return "";
    var lats = points.map(function (f) { return f.geo.lat; });
    var lngs = points.map(function (f) { return f.geo.lng; });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    var spanLat = maxLat - minLat || 0.001, spanLng = maxLng - minLng || 0.001;
    var dots = points.map(function (f) {
      var x = 10 + ((f.geo.lng - minLng) / spanLng) * 80;
      var y = 10 + (1 - (f.geo.lat - minLat) / spanLat) * 80;
      var s = R.featureStatus(f);
      return '<g transform="translate(' + x.toFixed(2) + " " + y.toFixed(2) + ')">' +
        '<circle r="5.2" fill="' + R.catTint(f.type) + '" stroke="' + R.statusFill(s) + '" stroke-width="1.1"></circle>' +
        '<g transform="translate(-3.4 -3.4) scale(0.283)" fill="none" stroke="#02385f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + R.typeIconInner(f.type) + "</g>" +
        '<circle cx="3.9" cy="3.9" r="2.1" fill="' + R.statusFill(s) + '" stroke="#fff" stroke-width="0.5"></circle>' +
        '<text x="3.9" y="4.7" font-size="2.6" font-weight="700" text-anchor="middle" fill="#02385f">' + R.STATUS_META[s].symbol + "</text></g>";
    }).join("");
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" ' +
      'aria-label="Offline schematic map of access features. The text list below gives the same information.">' +
      '<defs><pattern id="pe-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#9aa7b8" stroke-width="0.4"></path></pattern></defs>' +
      '<rect x="0" y="0" width="100" height="100" fill="url(#pe-grid)"></rect>' + dots + "</svg>";
  }

  /* mount(container, { features, getNeeds, onModeChange }) -> controller { update(), resize() } */
  function mount(container, opts) {
    var state = { map: null, markers: [], loaded: false, failed: false, mode: null, destroyed: false, watchdog: null };

    function points() {
      if (opts.getPoints) return opts.getPoints();
      var needs = opts.getNeeds();
      var vis = R.visibleFeatures(opts.features, needs);
      return vis.length ? vis : opts.features;
    }
    function setMode(mode) {
      if (state.mode === mode) return;
      state.mode = mode;
      if (opts.onModeChange) opts.onModeChange(mode);
    }
    function teardownLive() {
      state.markers.forEach(function (m) { m.remove(); });
      state.markers = [];
      if (state.map) { state.map.remove(); state.map = null; }
      state.loaded = false;
      clearTimeout(state.watchdog);
    }
    function showSchematic() {
      teardownLive();
      container.removeAttribute("role");
      container.innerHTML = schematicSvg(points());
      setMode("schematic");
    }
    function fail() {
      if (state.failed) return;
      state.failed = true;
      showSchematic();
    }

    function drawMarkers(lib) {
      if (!state.map || !state.loaded) return;
      state.markers.forEach(function (m) { m.remove(); });
      var pts = points();
      state.markers = pts.map(function (f) {
        var s = R.featureStatus(f);
        var el = document.createElement("div");
        el.innerHTML = R.pinHtml(f.type, s, "md");
        el.style.lineHeight = "0";
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", f.name + ", " + R.STATUS_META[s].label + (f.sample ? " (sample pin)" : ""));
        var popup = new lib.Popup({ offset: 16 }).setHTML(
          "<strong>" + R.esc(f.name) + "</strong><br>" +
          '<span style="color:#444">' + R.esc(f.locationNote) + "</span><br>" +
          "<span>" + R.esc(R.typeMeta(f.type).label) + " · " + R.esc(R.STATUS_META[s].label) + "</span>");
        return new lib.Marker({ element: el }).setLngLat([f.geo.lng, f.geo.lat]).setPopup(popup).addTo(state.map);
      });
      if (pts.length > 1) {
        var b = new lib.LngLatBounds();
        pts.forEach(function (f) { b.extend([f.geo.lng, f.geo.lat]); });
        state.map.fitBounds(b, { padding: 56, maxZoom: 17, duration: 0 });
      } else if (pts.length === 1) {
        state.map.setCenter([pts[0].geo.lng, pts[0].geo.lat]);
      }
    }

    function startLive() {
      if (state.failed || state.destroyed || state.map) return;
      container.innerHTML = "";
      container.setAttribute("role", "application");
      container.setAttribute("aria-label", "Interactive map of access features. The text list below gives the same information.");
      loadMapLibrary().then(function (lib) {
        if (state.destroyed || state.failed || state.map) return;
        var feats = opts.features;
        var center = [
          feats.reduce(function (a, f) { return a + f.geo.lng; }, 0) / feats.length,
          feats.reduce(function (a, f) { return a + f.geo.lat; }, 0) / feats.length
        ];
        var map;
        try {
          map = new lib.Map({ container: container, style: STYLE_URL, center: center, zoom: 15, attributionControl: { compact: true } });
        } catch (e) { fail(); return; }
        state.map = map;
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.on("error", function (e) {
          if (!state.loaded) fail(); else console.warn("Map tile error", e && e.error);
        });
        map.on("load", function () {
          state.loaded = true;
          clearTimeout(state.watchdog);
          map.resize();
          setMode("live");
          drawMarkers(lib);
        });
        state.watchdog = setTimeout(function () { if (!state.loaded) fail(); }, 8000);
      }).catch(function () { fail(); });
    }

    function update() {
      if (state.destroyed) return;
      if (navigator.onLine === false || state.failed) { showSchematic(); return; }
      if (state.map) { if (state.loaded && window.maplibregl) drawMarkers(window.maplibregl); }
      else startLive();
    }

    function onOnline() { state.failed = false; update(); }
    function onOffline() { showSchematic(); }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    update();
    return {
      update: update,
      resize: function () { if (state.map) state.map.resize(); },
      destroy: function () {
        state.destroyed = true;
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        teardownLive();
      }
    };
  }

  PE.AccessMap = { mount: mount, schematicSvg: schematicSvg, loadLibrary: loadMapLibrary };
})();
