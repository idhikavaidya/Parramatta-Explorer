/* Access plan page (mirrors src/components/PlanView.tsx), plus:
   - real offline saving via the service worker (pre-fetches map tiles for the venue)
   The server-rendered HTML already contains every feature, so the page is useful without JS. */
(function () {
  "use strict";
  var PE = window.PE, D = window.PE_DATA, R = window.PERender;
  var eventId = document.body.getAttribute("data-event");
  var meta = R.planMeta(eventId);
  if (!meta) return;
  var features = D.features;
  var $ = function (id) { return document.getElementById(id); };

  var needs = PE.ls.getJSON("pe-needs", ["mobility"]);
  if (!Array.isArray(needs)) needs = ["mobility"];

  /* ---------- Rendering ---------- */
  var maps = {};
  var catSel = "all";
  function keep(f) {
    return catSel === "all" || R.typeMeta(f.type).cat === catSel;
  }
  function pointsFor() {
    var vis = R.visibleFeatures(features, needs).filter(keep);
    return vis.length || catSel !== "all" ? vis : features;
  }
  function nearestHtml(vis) {
    var items = vis.filter(function (f) { return ["toilet", "accessible_toilet", "quiet_space", "entrance", "lift"].indexOf(f.type) !== -1; });
    if (!items.length) return '<li class="muted">None of the selected needs use these facilities.</li>';
    return items.map(function (f) { return "<li><span class=\"semibold\">" + R.esc(f.name) + "</span> — " + R.esc(f.locationNote) + "</li>"; }).join("");
  }
  function render() {
    var vis = R.visibleFeatures(features, needs);
    $("glance").innerHTML = R.glanceHtml(vis);
    $("feature-list").innerHTML = R.featureList(vis.filter(keep), PE.root, eventId);
    $("nearest-list").innerHTML = nearestHtml(vis);
    var pts = pointsFor();
    $("access-list-before").innerHTML = R.accessListHtml(pts);
    $("access-list-during").innerHTML = R.accessListHtml(pts);
    Object.keys(maps).forEach(function (k) { maps[k].update(); });
  }

  /* ---------- Map filters: pin category + sample pins ---------- */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".cat-chip");
    if (!b) return;
    catSel = b.getAttribute("data-cat");
    Array.prototype.forEach.call(document.querySelectorAll(".cat-chip"), function (c) { c.setAttribute("aria-pressed", String(c.getAttribute("data-cat") === catSel)); });
    render();
  });

  /* ---------- Needs ---------- */
  var needsBox = $("needs-wrap");
  needsBox.innerHTML = R.needSelector(needs);
  needsBox.addEventListener("change", function (e) {
    if (!e.target || e.target.name !== "need") return;
    needs = Array.prototype.slice.call(needsBox.querySelectorAll('input[name="need"]:checked')).map(function (i) { return i.value; });
    Array.prototype.forEach.call(needsBox.querySelectorAll("label.need"), function (l) {
      l.classList.toggle("is-checked", l.querySelector("input").checked);
    });
    PE.ls.setJSON("pe-needs", needs);
    render();
  });

  /* ---------- Maps (mounted lazily when visible) ---------- */
  function ensureMap(which) {
    var panel = $("panel-" + which);
    var canvas = $("map-" + which);
    if (!canvas || panel.hidden || canvas.offsetParent === null) return;
    if (!maps[which]) {
      maps[which] = PE.AccessMap.mount(canvas, {
        features: features,
        getNeeds: function () { return needs; },
        getPoints: pointsFor,
        onModeChange: function (mode) {
          var label = $("map-mode-" + which);
          if (label) label.textContent = mode === "live" ? "Live map · OpenStreetMap" : "Schematic map · works without a signal";
        }
      });
    } else { maps[which].resize(); }
  }

  /* ---------- Tabs (arrow keys, Home/End, #hash deep links) ---------- */
  var TAB_IDS = ["before", "during", "after"];
  function selectTab(id, focus) {
    TAB_IDS.forEach(function (t) {
      var btn = $("tab-" + t), panel = $("panel-" + t);
      var on = t === id;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    if (focus) $("tab-" + id).focus();
    try { history.replaceState(null, "", "#" + id); } catch (e) { /* ignore */ }
    ensureMap("before"); ensureMap("during");
  }
  var tablist = $("tablist");
  tablist.hidden = false;
  document.documentElement.classList.add("js-tabs");
  tablist.addEventListener("click", function (e) {
    var btn = e.target.closest("[role=tab]");
    if (btn) selectTab(btn.id.replace("tab-", ""), false);
  });
  tablist.addEventListener("keydown", function (e) {
    var i = TAB_IDS.indexOf(document.activeElement.id.replace("tab-", ""));
    if (i === -1) return;
    var next = null;
    if (e.key === "ArrowRight") next = (i + 1) % TAB_IDS.length;
    else if (e.key === "ArrowLeft") next = (i + TAB_IDS.length - 1) % TAB_IDS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TAB_IDS.length - 1;
    if (next !== null) { e.preventDefault(); selectTab(TAB_IDS[next], true); }
  });

  /* ---------- Save for offline ---------- */
  var saveBtn = $("save-btn"), saveMsg = $("save-msg");
  function savedIds() { var s = PE.ls.getJSON("pe-saved-plans", []); return Array.isArray(s) ? s : []; }
  function showSaved(n) {
    saveBtn.textContent = "Saved for offline ✓ (refresh)";
    saveMsg.textContent = n > 0
      ? "This plan works without a signal. " + n + " map tiles for the venue are stored on your device."
      : "This plan works without a signal. Map tiles could not be stored (the map service was unreachable), so the offline schematic map will be used.";
  }
  if (savedIds().indexOf(eventId) !== -1) { saveBtn.textContent = "Saved for offline ✓ (refresh)"; saveMsg.textContent = "This plan is saved on your device and works without a signal."; }

  function bbox() {
    var lats = features.map(function (f) { return f.geo.lat; }), lngs = features.map(function (f) { return f.geo.lng; });
    var pad = 0.004;
    return { minLat: Math.min.apply(null, lats) - pad, maxLat: Math.max.apply(null, lats) + pad, minLng: Math.min.apply(null, lngs) - pad, maxLng: Math.max.apply(null, lngs) + pad };
  }
  saveBtn.addEventListener("click", function () {
    if (!PE.swSupported) {
      saveMsg.textContent = "Offline saving needs a browser with service-worker support and an https:// (or localhost) address. You can still read this page.";
      return;
    }
    saveBtn.disabled = true;
    saveMsg.textContent = "Saving…";
    PE.callSW({ type: "SAVE_PLAN", styleUrl: PE.MAP_STYLE_URL, bbox: bbox() }, 60000).then(function (res) {
      var ids = savedIds();
      if (ids.indexOf(eventId) === -1) { ids.push(eventId); PE.ls.setJSON("pe-saved-plans", ids); }
      showSaved(res && res.tiles ? res.tiles : 0);
    }).catch(function () {
      saveMsg.textContent = "Could not save right now. Try again once the page has finished loading.";
    }).then(function () { saveBtn.disabled = false; });
  });

  /* ---------- After-event review: standard 5-star rating (radio group), access accuracy, optional comment ---------- */
  var STAR_LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very good", 5: "Excellent" };
  var STAR_PATH = "M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.4l-5.7 3 1.1-6.4L2.8 9.5l6.4-.9z";
  function starIcon() {
    return '<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true" focusable="false"><path d="' + STAR_PATH + '" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  }
  var ACC = [["yes", "Yes, it matched"], ["mostly", "Mostly"], ["no", "No, something was different"], ["unused", "I didn't use it"]];
  var fbRoot = $("feedback-root");
  var starsHtml = [1, 2, 3, 4, 5].map(function (n) {
    return '<input type="radio" class="star-input" name="stars" id="star-' + n + '" value="' + n + '">' +
      '<label class="star-label" for="star-' + n + '">' + starIcon() + '<span class="sr-only">' + n + (n === 1 ? " star" : " stars") + ", " + STAR_LABELS[n] + "</span></label>";
  }).join("");
  fbRoot.innerHTML =
    '<form id="fb-form" class="card stack" novalidate>' +
    '<h3>Review this event</h3>' +
    '<p class="muted small">Your review helps the next person know what to expect. It is anonymous. In this static version reviews are saved on this device only.</p>' +
    '<fieldset class="stack-sm" style="border:0;padding:0"><legend class="semibold">Your rating</legend>' +
    '<div class="stars" role="presentation">' + starsHtml + '</div>' +
    '<p id="star-text" class="muted small" aria-live="polite">Select 1 to 5 stars.</p></fieldset>' +
    '<fieldset class="stack-sm" style="border:0;padding:0"><legend class="semibold">Did the access information match what you found?</legend>' +
    '<div class="acc-row">' + ACC.map(function (o, i) {
      return '<label class="acc"><input type="radio" name="acc" value="' + o[0] + '"' + (i === 3 ? "" : "") + "><span>" + o[1] + "</span></label>";
    }).join("") + '</div>' +
    '<p id="acc-help" class="small" hidden>Thanks for noticing. Please <a class="link" href="' + PE.root + "report.html?event=" + encodeURIComponent(eventId) + '">report the problem</a> so others can see it.</p></fieldset>' +
    '<label class="field"><span class="semibold">Comments (optional)</span><textarea id="fb-details" rows="3" maxlength="240" placeholder="Please don\'t include personal information."></textarea></label>' +
    '<div><button type="submit" class="btn btn-primary" id="fb-send">Submit review</button></div>' +
    '<p id="fb-msg" role="status" class="notice" hidden></p></form>' +
    '<section class="card stack-sm" aria-labelledby="rv-h" style="margin-top:1rem"><h3 id="rv-h">Reviews on this device</h3><div id="fb-summary"></div></section>';
  var fbMsg = $("fb-msg"), starText = $("star-text"), accHelp = $("acc-help");
  function showSummary() {
    var s = PE.store.feedbackSummary(eventId), box = $("fb-summary");
    if (!s.total) { box.innerHTML = '<p class="muted small">No reviews yet.</p>'; return; }
    var rows = [5, 4, 3, 2, 1].map(function (n) {
      var pct = Math.round((s.counts[n] / s.total) * 100);
      return '<div class="dist-row"><span>' + n + ' star' + (n === 1 ? "" : "s") + '</span><div class="dist-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></div><span>' + s.counts[n] + "</span></div>";
    }).join("");
    box.innerHTML = '<p class="avg"><strong>' + s.average.toFixed(1) + '</strong> out of 5 <span class="muted small">from ' + s.total + " review" + (s.total === 1 ? "" : "s") + "</span></p>" + rows +
      '<p class="muted xsmall">Saved on this device only. No personal details are stored.</p>';
  }
  showSummary();
  fbRoot.addEventListener("change", function (e) {
    if (e.target.name === "stars") starText.textContent = e.target.value + (e.target.value === "1" ? " star" : " stars") + " · " + STAR_LABELS[e.target.value];
    if (e.target.name === "acc") accHelp.hidden = !(e.target.value === "no" || e.target.value === "mostly");
  });
  $("fb-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var st = fbRoot.querySelector('input[name="stars"]:checked'), ac = fbRoot.querySelector('input[name="acc"]:checked');
    var res = PE.store.addFeedback({ eventId: eventId, stars: st ? st.value : 0, accuracy: ac ? ac.value : "", details: $("fb-details").value });
    fbMsg.hidden = false;
    fbMsg.className = "notice" + (res.ok ? "" : " notice-error");
    fbMsg.textContent = res.ok ? "Thanks. Your review has been saved on this device. No personal details were stored." : res.error;
    if (res.ok) {
      $("fb-details").value = "";
      Array.prototype.forEach.call(fbRoot.querySelectorAll("input:checked"), function (i) { i.checked = false; });
      starText.textContent = "Select 1 to 5 stars."; accHelp.hidden = true;
      showSummary();
    } else if (!st) { fbRoot.querySelector(".star-input").focus(); }
  });

  /* ---------- Organiser shortcut ---------- */
  if (PE.role() === "organiser") {
    var link = $("organiser-link");
    link.hidden = false;
    link.querySelector("a").href = PE.root + "organiser/" + encodeURIComponent(eventId) + ".html";
  }

  /* ---------- Go ---------- */
  render();
  ensureMap("before");
  var start = (location.hash || "").replace("#", "");
  selectTab(TAB_IDS.indexOf(start) !== -1 ? start : "before", false);
})();
