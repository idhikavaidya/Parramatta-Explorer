/* Explore page: search + category filter (mirrors src/components/ExploreView.tsx).
   The full list is already in the HTML (so it works without JavaScript); this script filters it. */
(function () {
  "use strict";
  var D = window.PE_DATA, R = window.PERender;
  var input = document.getElementById("q");
  var chipBox = document.getElementById("chips");
  var grid = document.getElementById("event-grid");
  var count = document.getElementById("result-count");
  var empty = document.getElementById("no-results");
  if (!input || !chipBox || !grid) return;

  var priceEl = document.getElementById("price-max");
  var priceOut = document.getElementById("price-out");
  var maxPrice = priceEl ? Number(priceEl.max) : 0;
  var mapWrap = document.getElementById("events-map-wrap");
  var mapEl = document.getElementById("events-map");
  var calEl = document.getElementById("events-calendar");
  var viewBox = document.getElementById("view-switch");
  var state = { q: "", cat: "All", price: maxPrice, view: "list" };
  var evMap = null, evMarkers = [], shownNow = D.events;

  function renderChips() {
    chipBox.innerHTML = D.categories.map(function (c) {
      return '<button type="button" class="chip" aria-pressed="' + (state.cat === c.label) + '" data-cat="' + R.esc(c.label) +
        '" style="background:' + c.bg + '">' + R.esc(c.label) + "</button>";
    }).join("") + '<button type="button" class="chip chip-reset" data-reset="1">Reset filters</button>';
  }

  function apply() {
    var q = state.q.trim().toLowerCase();
    var shown = D.events.filter(function (e) {
      var okCat = state.cat === "All" || e.categories.indexOf(state.cat) !== -1;
      var hay = (e.title + " " + e.categories.join(" ") + " " + e.blurb).toLowerCase();
      return okCat && e.price <= state.price && (q === "" || hay.indexOf(q) !== -1);
    });
    shownNow = shown;
    if (priceOut) priceOut.textContent = state.price >= maxPrice ? "Any price" : state.price === 0 ? "Free only" : "Up to $" + state.price;
    grid.innerHTML = shown.map(function (e) { return R.eventCard(e, PE.root); }).join("");
    grid.hidden = shown.length === 0 || state.view === "calendar";
    empty.hidden = shown.length !== 0;
    count.textContent = "Showing " + shown.length + " of " + D.events.length + " events";
    if (state.view === "map") drawEventMap();
    if (state.view === "calendar") drawCalendar();
  }

  /* ---------- Views: list / map / calendar ---------- */
  function setView(v) {
    state.view = v;
    Array.prototype.forEach.call(viewBox.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-view") === v));
    });
    mapWrap.hidden = v !== "map";
    calEl.hidden = v !== "calendar";
    // Calendar replaces the card grid (it links to the same plan pages); list and map keep the grid for the text version.
    if (v === "calendar") { grid.hidden = true; } else { grid.hidden = shownNow.length === 0; }
    if (v === "map") drawEventMap();
    if (v === "calendar") drawCalendar();
  }

  function drawCalendar() {
    var now = new Date().getMonth() + 1;
    var buckets = {}, ongoing = [];
    shownNow.forEach(function (e) {
      var ms = R.eventMonths(e.when);
      if (!ms) { ongoing.push(e); return; }
      ms.forEach(function (m) { (buckets[m] = buckets[m] || []).push(e); });
    });
    function line(e) { return '<li><a href="' + PE.root + "plan/" + R.esc(e.id) + '.html">' + R.eventEmojiHtml(e) + R.esc(e.title) + '</a> <span class="muted">· ' + (e.price ? "$" + e.price : "Free") + "</span></li>"; }
    var html = '<p class="muted small cal-note">Months come from each event\'s listed timing. Exact dates are not shown here — confirm with the organiser.</p><ol class="cal">';
    R.MONTH_NAMES.forEach(function (name, i) {
      var list = buckets[i + 1] || [];
      html += '<li' + (i + 1 === now ? ' class="is-now"' : "") + "><h3><span>" + name.charAt(0).toUpperCase() + name.slice(1) + "</span>" +
        (i + 1 === now ? '<span class="tag">This month</span>' : "") + "</h3>" +
        (list.length ? "<ul>" + list.map(line).join("") + "</ul>" : '<p class="muted">No listed events</p>') + "</li>";
    });
    html += "</ol>";
    if (ongoing.length) html += '<h3 style="margin-top:1.25rem;font-size:1.1rem">Regular / recurring</h3><ul class="pop-list">' + ongoing.map(function (e) { return line(e) .replace("</li>", ' <span class="muted">· ' + R.esc(e.when) + "</span></li>"); }).join("") + "</ul>";
    calEl.innerHTML = html;
  }

  function groupByPlace(list) {
    var g = {};
    list.forEach(function (e) {
      if (!e.geo) return;
      var k = e.geo.lat.toFixed(4) + "," + e.geo.lng.toFixed(4);
      (g[k] = g[k] || { geo: e.geo, events: [] }).events.push(e);
    });
    return Object.keys(g).map(function (k) { return g[k]; });
  }

  function popupHtml(group) {
    return "<strong>" + R.esc(group.events[0].place || "Parramatta") + "</strong>" +
      '<ul class="pop-list">' + group.events.map(function (e) {
        return '<li><a href="' + PE.root + "plan/" + R.esc(e.id) + '.html">' + R.eventEmojiHtml(e) + R.esc(e.title) + "</a> · " + (e.price ? "$" + e.price : "Free") + "</li>";
      }).join("") + "</ul>";
  }

  function mapFallback(msg) {
    mapEl.innerHTML = '<p class="muted" style="padding:1rem">' + R.esc(msg) + "</p>";
  }

  function drawEventMap() {
    var groups = groupByPlace(shownNow);
    if (navigator.onLine === false) { mapFallback("The live map needs a connection. The list below has the same events."); return; }
    PE.AccessMap.loadLibrary().then(function (lib) {
      if (state.view !== "map") return;
      if (!evMap) {
        mapEl.innerHTML = "";
        evMap = new lib.Map({ container: mapEl, style: PE.MAP_STYLE_URL, center: [151.0011, -33.8151], zoom: 14, attributionControl: { compact: true } });
        evMap.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        drawEventMarkers(lib, groups); // markers do not depend on tiles, so they show even if tiles are slow or blocked
        evMap.on("error", function () { /* tiles may fail offline; markers and the list still work */ });
      } else {
        evMap.resize();
        drawEventMarkers(lib, groupByPlace(shownNow));
      }
    }).catch(function () { mapFallback("The map could not load. The list below has the same events."); });
  }

  function drawEventMarkers(lib, groups) {
    evMarkers.forEach(function (m) { m.remove(); });
    evMarkers = groups.map(function (g) {
      var el = document.createElement("button");
      el.type = "button"; el.className = "ev-marker";
      el.setAttribute("aria-label", g.events.map(function (e) { return e.title; }).join(", "));
      el.textContent = g.events[0].emoji || "📍";
      if (g.events.length > 1) { var n = document.createElement("span"); n.className = "n"; n.textContent = String(g.events.length); el.appendChild(n); }
      var popup = new lib.Popup({ offset: 24, maxWidth: "280px" }).setHTML(popupHtml(g));
      return new lib.Marker({ element: el }).setLngLat([g.geo.lng, g.geo.lat]).setPopup(popup).addTo(evMap);
    });
    if (groups.length > 1) {
      var b = new lib.LngLatBounds();
      groups.forEach(function (g) { b.extend([g.geo.lng, g.geo.lat]); });
      evMap.fitBounds(b, { padding: 60, maxZoom: 16, duration: 0 });
    } else if (groups.length === 1) evMap.setCenter([groups[0].geo.lng, groups[0].geo.lat]);
  }

  function reset() {
    state = { q: "", cat: "All", price: maxPrice, view: state.view };
    input.value = "";
    if (priceEl) priceEl.value = String(maxPrice);
    renderChips();
    apply();
  }

  input.addEventListener("input", function () { state.q = input.value; apply(); });
  document.getElementById("clear-search").addEventListener("click", function () { state.q = ""; input.value = ""; apply(); input.focus(); });
  document.getElementById("reset-empty").addEventListener("click", reset);
  chipBox.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.getAttribute("data-reset")) { reset(); return; }
    state.cat = btn.getAttribute("data-cat");
    renderChips();
    apply();
    var again = chipBox.querySelector('[data-cat="' + state.cat + '"]');
    if (again) again.focus();
  });

  if (priceEl) priceEl.addEventListener("input", function () { state.price = Number(priceEl.value); apply(); });
  if (viewBox) viewBox.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setView(b.getAttribute("data-view")); });

  renderChips();
  apply();
})();
