/* Shared rendering helpers (pure functions that return HTML strings).
 *
 * This file runs in two places:
 *   1. In Node, during `npm run build`, to pre-render pages (so they work without JavaScript).
 *   2. In the browser, to re-render the same markup when the user filters, changes needs, etc.
 *
 * Data comes from assets/js/data.js (generated from the Next.js app's src/lib files).
 * Status/provenance logic mirrors src/lib/status.ts.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.PERender = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function data() { return root.PE_DATA; }

  function esc(value) {
    return String(value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- Status model (src/lib/status.ts) ---------- */
  var STATUS_META = {
    verified: {
      label: "Verified", symbol: "✔",
      description: "Confirmed by a human (organiser or Council access officer) with a recorded source and date.",
      cssVar: "verified"
    },
    requires_confirmation: {
      label: "Requires confirmation", symbol: "?",
      description: "Unconfirmed or AI-suggested. Treat as unverified until a human approves it.",
      cssVar: "confirm"
    },
    missing: {
      label: "Missing", symbol: "–",
      description: "No information is available. We show this openly rather than guessing.",
      cssVar: "missing"
    }
  };
  var STATUS_ORDER = ["verified", "requires_confirmation", "missing"];

  var DECAY_PERIOD_DAYS = 30, DECAY_STEP = 5, STALE_AFTER_DAYS = 90;

  function featureStatus(feature) {
    if (feature.attributes.some(function (a) { return a.status === "requires_confirmation"; })) return "requires_confirmation";
    if (feature.attributes.some(function (a) { return a.status === "missing"; })) return "missing";
    return "verified";
  }
  function effectiveStatus(status, daysAgo) {
    if (status !== "verified") return status;
    return daysAgo > STALE_AFTER_DAYS ? "requires_confirmation" : "verified";
  }
  function decayedConfidence(base, daysAgo) {
    var periods = Math.floor(daysAgo / DECAY_PERIOD_DAYS);
    return Math.max(20, Math.min(100, base - periods * DECAY_STEP));
  }
  function freshnessText(days) {
    if (days === 0) return "verified today";
    if (days === 1) return "verified yesterday";
    if (days < 30) return "verified " + days + " days ago";
    var months = Math.floor(days / 30);
    return "verified " + months + " month" + (months > 1 ? "s" : "") + " ago";
  }
  var STATUS_FALLBACK = { verified: "#34d399", requires_confirmation: "#fbbf24", missing: "#a1a1aa" };
  function statusFill(status) { return "var(--status-" + STATUS_META[status].cssVar + "-border," + STATUS_FALLBACK[status] + ")"; }

  /* ---------- Feature-type icons (24x24, stroke icons; no fonts or network needed) ---------- */
  var F = ' fill="currentColor" stroke="none"';
  var TOILET_SVG = '<circle cx="7" cy="5" r="1.7"' + F + '/><path d="M5 9h4v5.5H8V20H6v-5.5H5z"' + F + '/><circle cx="17" cy="5" r="1.7"' + F + '/><path d="M17 8.5l-3.4 7h2.4V20h2v-4.5h2.4z"' + F + '/><path d="M12 3v18"/>';
  var TYPE_ICONS = {
    entrance: { label: "Entrance", svg: '<path d="M6 21V4h12v17M3 21h18"/><circle cx="14.5" cy="12.5" r="1" ' + F.trim() + '/>' },
    toilet: { label: "Toilet", svg: '<circle cx="7" cy="5" r="1.7"' + F + '/><path d="M5 9h4v5.5H8V20H6v-5.5H5z"' + F + '/><circle cx="17" cy="5" r="1.7"' + F + '/><path d="M17 8.5l-3.4 7h2.4V20h2v-4.5h2.4z"' + F + '/><path d="M12 3v18"/>' },
    changing_places: { label: "Adult changing room (Changing Places)", svg: '<rect x="2.5" y="12" width="13" height="3.2" rx="1"/><path d="M5 15.2v5M13 15.2v5M20 7v8"/><path d="M20 3.5l-3 3.6h6zM20 18.5l-3-3.6h6z"' + F + '/>' },
    lift: { label: "Lift", svg: '<rect x="4.5" y="3" width="15" height="18" rx="2"/><path d="M8.5 10.5l3.5-4 3.5 4zM8.5 13.5l3.5 4 3.5-4z"' + F + '/>' },
    parking_bay: { label: "Accessible parking bay", svg: '<rect x="3" y="3" width="18" height="18" rx="3"/><g transform="translate(6.2 6) scale(0.5)" stroke-width="3.4"><circle cx="10" cy="4.5" r="1.8"' + F + '/><path d="M10 8v6h5l3 5M10 11h5"/><path d="M7 13.5a5 5 0 1 0 6.5 6"/></g>' },
    curb_cut: { label: "Curb ramp", svg: '<path d="M3 20h18M4 20l13-8v8"/><path d="M17 12V6"/>' },
    stop: { label: "Transport stop", svg: '<path d="M5 3.5h14a1 1 0 0 1 1 1V17H4V4.5a1 1 0 0 1 1-1z"/><path d="M4 10h16"/><circle cx="8" cy="19.5" r="1.4"/><circle cx="16" cy="19.5" r="1.4"/>' },
    quiet_space: { label: "Quiet space", svg: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
    hearing_loop: { label: "Hearing loop", svg: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a2.5 2.5 0 0 1-5 0"/><path d="M11 9a1.5 1.5 0 0 1 3 0"/>' },
    changing_table: { label: "Baby change table", svg: '<circle cx="12" cy="6" r="2.4"' + F + '/><path d="M4 13h16M6 13v7M18 13v7"/>' },
    pram_parking: { label: "Pram parking", svg: '<path d="M9 14l1-7a6 6 0 0 1 8 7z"/><path d="M4 5h3l2 9h9"/><circle cx="10" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>' },
    tactile_path: { label: "Tactile path", svg: '<g' + F + '><circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></g>' }
    ,
    station_entrance: { label: "Station entrance", svg: '<path d="M4 21V3h16v18M2.5 21h19"/><path d="M9 21V7.5l6-2V19"/><circle cx="13" cy="13.5" r="0.9"' + F + '/>' },
    train: { label: "Train station", svg: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M8 21l2-4M16 21l-2-4"/><circle cx="9" cy="14" r="1"' + F + '/><circle cx="15" cy="14" r="1"' + F + '/>' },
    light_rail: { label: "Light rail stop", svg: '<rect x="5" y="6" width="14" height="12" rx="2"/><path d="M5 12h14M9 3l3 3 3-3M8 21l1.5-3M16 21l-1.5-3"/>' },
    ferry: { label: "Ferry wharf", svg: '<path d="M3 14l2 5h14l2-5zM6 14V9h12v5M9 9V5h6v4M2 22q2.5-2 5 0t5 0 5 0 5 0"/>' },
    car_park: { label: "Car park", svg: '<circle cx="12" cy="12" r="9"/><path d="M10 17V7h3a3 3 0 0 1 0 6h-3"/>' },
    bike: { label: "Bike rack / path", svg: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8H8M13 8l-3 8"/>' },
    taxi: { label: "Taxi / rideshare drop-off", svg: '<path d="M4 16v-4l2-5h12l2 5v4zM4 16v3h3v-3M17 16v3h3v-3M9 4h6"/><circle cx="8" cy="13" r="1"' + F + '/><circle cx="16" cy="13" r="1"' + F + '/>' },
    boarding: { label: "Wheelchair boarding", svg: '<path d="M4 3.5h12v12H4zM4 9h12M3 21h18M16 21l4-5"/>' },
    step_free_route: { label: "Step-free route", svg: '<path d="M4 12h14M13 7l5 5-5 5M4 19h16"/>' },
    wide_path: { label: "Wide, smooth path", svg: '<path d="M8 3L5 21M16 3l3 18M12 5v3M12 11v3M12 17v3"/>' },
    stairs: { label: "Stairs", svg: '<path d="M4 20h4v-4h4v-4h4V8h4M4 20h16"/>' },
    escalator: { label: "Escalator", svg: '<path d="M3 20h5v-4h5v-4h5V8h3M5 11l9-6"/>' },
    ticket_gate: { label: "Ticket / entry gate", svg: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 8v8" stroke-dasharray="2 2"/>' },
    auto_door: { label: "Automatic door", svg: '<path d="M5 21V3h14v18M12 3v18M9 12H7M15 12h2"/>' },
    accessible_toilet: { label: "Accessible toilet", svg: '<g transform="translate(0 5) scale(.78)" stroke-width="2.5">' + TOILET_SVG + '</g><g transform="translate(12.2 0) scale(.5)" stroke-width="4"><circle cx="10" cy="4.5" r="1.8"' + F + '/><path d="M10 8v6h5l3 5M10 11h5"/><path d="M7 13.5a5 5 0 1 0 6.5 6"/></g>' },
    parent_room: { label: "Parent / family room", svg: '<circle cx="8" cy="5" r="2.2"/><path d="M8 8.2c-2.5 0-4 1.8-4 4.3V20h8v-7.5c0-2.5-1.5-4.3-4-4.3z"/><circle cx="17" cy="11" r="1.7"/><path d="M13.8 20v-4c0-2 1.4-3.3 3.2-3.3s3.2 1.3 3.2 3.3v4z"/>' },
    food: { label: "Food / café", svg: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2.5 1.5-3 5-3 8h3"/>' },
    water: { label: "Drinking water", svg: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>' },
    seating: { label: "Seating / rest area", svg: '<path d="M5 11V7h14v4M3 11h18v4H3zM6 15v5M18 15v5"/>' },
    shade: { label: "Shade / shelter", svg: '<path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 1-4 0"/>' },
    info: { label: "Information desk", svg: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r="1"' + F + '/>' },
    first_aid: { label: "First aid", svg: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 7v10M7 12h10"/>' },
    atm: { label: "ATM / payments", svg: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M6 15h4"/>' },
    charging: { label: "Phone charging", svg: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>' },
    playground: { label: "Playground", svg: '<path d="M3 21L8 4M21 21L16 4M8 4h8M10 4v10M14 4v10M8 14h4M12 14h4"/>' },
    lost_child: { label: "Lost child point", svg: '<circle cx="8" cy="5" r="2"/><path d="M8 8v7M5 21l3-6 3 6"/><circle cx="17" cy="11" r="1.6"/><path d="M17 13.5v4M15 21l2-3.5 2 3.5M10 12h4"/>' },
    emergency_exit: { label: "Emergency exit", svg: '<path d="M13 3h7v18h-7M3 12h11M10 8l4 4-4 4"/>' },
    security: { label: "Security / police", svg: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>' },
    crowd: { label: "Crowd level", svg: '<circle cx="8" cy="8" r="2.3"/><circle cx="16" cy="8" r="2.3"/><path d="M3 20c0-4 2-6 5-6s5 2 5 6M11 20c0-4 2-6 5-6s5 2 5 6"/>' },
    auslan: { label: "Auslan interpreter", svg: '<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-5-2-6-5l-1-3a1.5 1.5 0 0 1 3-.8L8 14"/>' },
    captions: { label: "Captions", svg: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 10a2.5 2.5 0 1 0 0 4M17 10a2.5 2.5 0 1 0 0 4"/>' },
    visual_alert: { label: "Visual alert (flashing light)", svg: '<path d="M9 18h6M10 21h4M12 2v2M4 7l1.5 1M20 7l-1.5 1"/><path d="M8 14a5 5 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4z"/>' },
    audio_guidance: { label: "Audio guidance", svg: '<path d="M4 13a8 8 0 0 1 16 0"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/>' },
    low_stim: { label: "Low-noise / low-light zone", svg: '<circle cx="12" cy="12" r="4" stroke-dasharray="2 2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" stroke-dasharray="1.5 2"/>' },
    dog_relief: { label: "Assistance dog area", svg: '<circle cx="7" cy="10" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="10" r="2"/><path d="M12 12c-3 0-5 3-5 5.5 0 2 2 2.5 5 1.5 3 1 5 .5 5-1.5C17 15 15 12 12 12z"/>' },
    easy_read: { label: "Plain language / Easy Read", svg: '<path d="M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z"/>' },
    translated: { label: "Translated info", svg: '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 4-3 7-6 8M13 20l4-9 4 9M14.5 17h5"/>' }
  };
  var FALLBACK_ICON = { label: "Access feature", svg: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/>' };

  /* Categories (colour-coded tint behind each icon) and who each icon is mainly for. */
  var TYPE_CATS = [
    { id: "getting", label: "Getting there", tint: "#bcd9f5" },
    { id: "entry", label: "Entry & levels", tint: "#fde3a1" },
    { id: "toilets", label: "Toilets & baby care", tint: "#d6cdf8" },
    { id: "onsite", label: "On site", tint: "#bdeed6" },
    { id: "safety", label: "Safety", tint: "#f9c9c9" },
    { id: "comms", label: "Communication & sensory", tint: "#ffd7ae" }
  ];
  var CAT_OF = {
    getting: ["station_entrance:e", "stop:e", "train:e", "light_rail:e", "ferry:e", "car_park:e", "bike:e", "taxi:e", "parking_bay:a", "boarding:a", "curb_cut:a", "step_free_route:a", "tactile_path:a", "wide_path:a"],
    entry: ["entrance:e", "stairs:e", "escalator:e", "lift:e", "ticket_gate:e", "auto_door:a"],
    toilets: ["toilet:e", "accessible_toilet:a", "changing_places:a", "changing_table:e", "parent_room:e", "pram_parking:e"],
    onsite: ["food:e", "water:e", "seating:e", "shade:e", "info:e", "first_aid:e", "atm:e", "charging:e", "playground:e", "lost_child:e"],
    safety: ["emergency_exit:e", "security:e", "crowd:e"],
    comms: ["hearing_loop:a", "auslan:a", "captions:a", "visual_alert:a", "audio_guidance:a", "quiet_space:a", "low_stim:a", "dog_relief:a", "easy_read:a", "translated:e"]
  };
  TYPE_CATS.forEach(function (c) {
    CAT_OF[c.id].forEach(function (t) {
      var k = t.split(":"); if (TYPE_ICONS[k[0]]) { TYPE_ICONS[k[0]].cat = c.id; TYPE_ICONS[k[0]].aud = k[1] === "a" ? "Access" : "Everyone"; }
    });
  });
  function catOf(id) { return TYPE_CATS.filter(function (c) { return c.id === id; })[0]; }
  function catTint(type) { var c = catOf(typeMeta(type).cat); return c ? c.tint : "#ffffff"; }
  function typeKeyHtml(present, always) {
    return TYPE_CATS.map(function (c) {
      var items = CAT_OF[c.id].filter(function (t) { var k0 = t.split(":")[0]; return !present || present.has(k0) || (always && always.has(k0)); }).map(function (t) {
        var k = t.split(":")[0], m = TYPE_ICONS[k];
        var none = present && !present.has(k) ? ' <span class="none-rec">None recorded yet</span>' : "";
        return '<li><span class="pin pin-sm" style="background:' + c.tint + '" aria-hidden="true">' + typeIcon(k, 16) + "</span><span>" + esc(m.label) + none + '</span><span class="aud aud-' + m.aud.toLowerCase() + '">' + m.aud + "</span></li>";
      }).join("");
      if (!items) return "";
      return '<div class="key-group"><h4><span class="swatch" style="background:' + c.tint + '" aria-hidden="true"></span>' + esc(c.label) + '</h4><ul class="key-list">' + items + "</ul></div>";
    }).join("");
  }

  function typeMeta(type) { return TYPE_ICONS[type] || FALLBACK_ICON; }
  function typeIconInner(type) { return typeMeta(type).svg; }
  function typeIcon(type, px) {
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + typeMeta(type).svg + "</svg>";
  }
  /* A map pin / list marker: icon in a white disc, ring colour = status, plus a status symbol so colour is never the only cue. */
  function pinHtml(type, status, size) {
    var px = size === "sm" ? 16 : 22;
    return '<span class="pin pin-' + (size || "md") + '" style="border-color:' + statusFill(status) + ';background:' + catTint(type) + '" aria-hidden="true">' +
      typeIcon(type, px) + '<span class="pin-s" style="background:' + statusFill(status) + '">' + STATUS_META[status].symbol + "</span></span>";
  }

  function formatValue(attr) {
    var v = attr.value;
    if (typeof v === "boolean") return v ? "Yes" : "No";
    return attr.unit ? v + " " + attr.unit : String(v);
  }

  function statusBadge(status) {
    var m = STATUS_META[status];
    return '<span class="badge badge-' + status + '" title="' + esc(m.description) + '">' +
      '<span aria-hidden="true">' + m.symbol + "</span> " + esc(m.label) + "</span>";
  }

  function provLine(attr) {
    var p = attr.provenance;
    var eff = effectiveStatus(attr.status, p.daysAgo);
    var conf = decayedConfidence(p.confidence, p.daysAgo);
    return "Source: " + esc(p.sourceLabel) + " · " + freshnessText(p.daysAgo) + " · confidence " + conf + "%" +
      (eff !== attr.status ? " · downgraded (stale)" : "");
  }

  /* ---------- Events ---------- */
  function eventEmojiHtml(e) { return e && e.emoji ? '<span class="ev-emoji" aria-hidden="true">' + e.emoji + "</span> " : ""; }

  /* Months an event runs, read from its listed timing text (no dates are invented).
     Returns an array of 1-12, or null for recurring/undated timing like "Every Friday". */
  var MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
  function eventMonths(when) {
    var t = String(when || "").toLowerCase(), found = [];
    MONTHS.forEach(function (m, i) { var at = t.indexOf(m); if (at !== -1) found.push({ n: i + 1, at: at }); });
    if (!found.length) return null;
    found.sort(function (a, b) { return a.at - b.at; });
    if (found.length === 2 && /[–-]/.test(t) && !/\//.test(t)) {
      var out = [], a = found[0].n, b = found[1].n, guard = 0;
      for (var m = a; guard < 12; guard++) { out.push(m); if (m === b) break; m = m % 12 + 1; }
      return out;
    }
    return found.map(function (x) { return x.n; });
  }

  function eventCard(e, prefix) {
    return '<li><a class="event-card" href="' + prefix + "plan/" + esc(e.id) + '.html">' +
      '<div class="event-card-top" style="background:' + esc(e.color) + '">' +
      '<span class="tag">' + esc(e.categories.slice(0, 2).join(" / ")) + "</span>" +
      '<span class="price">' + (e.price === 0 ? "Free" : "$" + e.price) + "</span></div>" +
      '<div class="event-card-body"><h3>' + eventEmojiHtml(e) + esc(e.title) + "</h3>" +
      '<p class="muted small">' + esc(e.when) + "</p>" +
      '<p class="muted small">' + esc(e.blurb) + "</p>" +
      '<span class="cta">Event details · Access plan · Booking <span aria-hidden="true">→</span></span></div></a></li>';
  }

  function eventDateLabel(ev) {
    if (ev.when) return ev.when;
    if (ev.start) {
      return new Date(ev.start).toLocaleDateString("en-AU", {
        weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney"
      });
    }
    return "See organiser for dates";
  }

  /* ---------- Plan ---------- */
  /* Mirrors getPlan() in src/lib/data/seed.ts: the seeded example event, or a real Council event
     (which currently shares the same example venue and feature set). */
  function planIds() {
    var d = data();
    var ids = d.planEvents.map(function (e) { return e.id; });
    d.events.forEach(function (e) { if (ids.indexOf(e.id) === -1) ids.push(e.id); });
    return ids;
  }
  function planMeta(id) {
    var d = data();
    var seed = d.planEvents.filter(function (e) { return e.id === id; })[0];
    if (seed) {
      var v = d.venues.filter(function (x) { return x.id === seed.venueId; })[0];
      return v ? { event: seed, venue: v } : null;
    }
    var pe = d.events.filter(function (e) { return e.id === id; })[0];
    if (!pe) return null;
    var venue = d.venues.filter(function (x) { return x.id === pe.venueId; })[0] || d.venues[0];
    return {
      venue: venue,
      event: {
        id: pe.id, title: pe.title, organiser: "City of Parramatta (example organiser)", councilOwned: true,
        hypothetical: false, venueId: venue.id, start: "", end: "", when: pe.when, status: "scheduled",
        languages: ["English", "Arabic", "Mandarin", "Hindi"]
      }
    };
  }

  function visibleFeatures(features, selected) {
    return features.filter(function (f) { return f.needs.some(function (n) { return selected.indexOf(n) !== -1; }); });
  }

  function featureCard(f, prefix, eventId) {
    var rows = f.attributes.map(function (a) {
      return '<div class="attr"><div class="attr-row"><dt>' + esc(a.label) + "</dt>" +
        "<dd>" + esc(formatValue(a)) + " " + statusBadge(a.status) + "</dd></div>" +
        '<p class="prov">' + provLine(a) + "</p></div>";
    }).join("");
    return '<article class="feature" data-feature="' + esc(f.id) + '">' +
      '<div class="head"><div><h3>' + esc(f.name) + (f.sample ? ' <span class="tag tag-sample">Sample pin</span>' : '') + '</h3><p class="muted small">' + esc(f.locationNote) + "</p></div>" +
      statusBadge(featureStatus(f)) + "</div>" +
      "<details><summary>More details</summary><dl class=\"attrs\">" + rows + "</dl>" +
      '<a class="btn btn-outline btn-small" style="margin-top:0.75rem" href="' + prefix + "report.html?event=" +
      encodeURIComponent(eventId) + "&amp;feature=" + encodeURIComponent(f.id) + '">Report a problem with this</a>' +
      "</details></article>";
  }

  function real(features) { return features.filter(function (f) { return !f.sample; }); }
  function featureList(features, prefix, eventId) {
    features = real(features);
    if (!features.length) return '<p class="muted small">Select a need above to see relevant features.</p>';
    return features.map(function (f) { return featureCard(f, prefix, eventId); }).join("");
  }

  function glanceHtml(features) {
    features = real(features);
    var all = [];
    features.forEach(function (f) { all = all.concat(f.attributes); });
    function n(s) { return all.filter(function (a) { return a.status === s; }).length; }
    return STATUS_ORDER.map(function (s) {
      return '<span class="row row-tight small">' + statusBadge(s) + " <strong>" + n(s) + "</strong></span>";
    }).join("");
  }

  function accessListHtml(points) {
    return points.map(function (f) {
      var s = featureStatus(f);
      return '<li>' + pinHtml(f.type, s, "sm") +
        '<span class="semibold">' + esc(f.name) + '</span><span class="muted">— ' + (f.sample ? "Sample pin, " : "") + esc(STATUS_META[s].label) + "</span></li>";
    }).join("");
  }

  function legendHtml() {
    return '<span class="muted">Ring colour and symbol show the status:</span>' + STATUS_ORDER.map(function (s) {
      return '<span><span class="dot" aria-hidden="true" style="background:' + statusFill(s) + '"></span>' + esc(STATUS_META[s].label) + "</span>";
    }).join("");
  }

  function needSelector(selected) {
    var items = data().needs.map(function (n) {
      var checked = selected.indexOf(n.id) !== -1;
      return '<label class="need' + (checked ? " is-checked" : "") + '">' +
        '<input type="checkbox" name="need" value="' + esc(n.id) + '"' + (checked ? " checked" : "") + ">" +
        "<span><strong>" + esc(n.label) + "</strong><small>" + esc(n.description) + "</small></span></label>";
    }).join("");
    return '<fieldset id="needs"><legend>What do you need? <span class="muted" style="font-weight:400">(select any)</span></legend>' +
      '<div class="need-grid">' + items + "</div></fieldset>";
  }

  /* ---------- Easy Read ---------- */
  var ICONS = {
    entrance: '<rect x="5" y="3" width="10" height="18" rx="1"/><circle cx="12" cy="12" r=".9" fill="currentColor"/><path d="M17 12h4M19 10l2 2-2 2"/>',
    lift: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 7l-2.6 3.2h5.2zM12 17l-2.6-3.2h5.2z" fill="currentColor"/>',
    toilet: '<circle cx="10" cy="4.5" r="1.8" fill="currentColor"/><path d="M10 8v6h5l2.5 5M10 11h5"/><path d="M7 11.5a5 5 0 1 0 7 6.5"/>',
    changing_places: '<circle cx="10" cy="4.5" r="1.8" fill="currentColor"/><path d="M10 8v6h5l2.5 5M10 11h5"/><path d="M7 11.5a5 5 0 1 0 7 6.5"/><path d="M19 3v4M17 5h4"/>',
    quiet_space: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l4 6M21 9l-4 6"/>',
    hearing_loop: '<path d="M8 10a4 4 0 1 1 8 0c0 2.5-2 3-2 5a2.5 2.5 0 0 1-5 .5"/><path d="M12 9.2a1.4 1.4 0 0 1 1.4 1.4"/><path d="M3 8a8 8 0 0 0 0 8M21 8a8 8 0 0 1 0 8" opacity=".6"/>',
    changing_table: '<circle cx="12" cy="7" r="3"/><path d="M6 21v-4a6 6 0 0 1 12 0v4z"/>',
    stop: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l2-4M15 21l-2-4"/><circle cx="9.5" cy="14" r=".9" fill="currentColor"/><circle cx="14.5" cy="14" r=".9" fill="currentColor"/>',
    curb_cut: '<path d="M3 20L9 4M21 20L15 4"/><path d="M6 14h12M5 17h14M7.5 10h9"/>',
    fallback: '<path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>'
  };
  function icon(type) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (ICONS[type] || ICONS.fallback) + "</svg>";
  }

  var EASY_TITLES = {
    entrance: "Main door", lift: "Lift", toilet: "Accessible toilet", changing_places: "Changing Places room",
    quiet_space: "Quiet room", hearing_loop: "Hearing loop", changing_table: "Baby change room",
    stop: "Train station", curb_cut: "Road crossing"
  };

  function isUnknown(v) { return v === "unknown"; }

  /* One short sentence per attribute. Falls back to "Label: value." for keys we have no wording for. */
  function easyLine(a) {
    var v = a.value;
    switch (a.key) {
      case "step_free": return v ? "There are no steps." : "There are steps.";
      case "door_width_cm": return "The door is about " + v + " cm wide.";
      case "surface": return "The ground is " + v + ".";
      case "lip_cm": return "There is a small lip, about " + v + " cm high.";
      case "lift_status": return isUnknown(v) ? "We do not know if the lift works today." : "Lift: " + v + ".";
      case "toilet_gender_access": return v === "any" ? "Anyone can use it." : "Who can use it: " + v + ".";
      case "changing_table_type": return isUnknown(v) ? "We do not know what changing table it has." : "Changing table: " + v + ".";
      case "hoist": return v ? "There is a hoist." : "There is no hoist.";
      case "quiet": return v ? "There is a quiet space." : "There is no quiet space.";
      case "noise_level": return isUnknown(v) ? "We do not know how loud it is." : "How loud it is: " + v + ".";
      case "lighting": return "The lights are " + v + ".";
      case "crowd_level": return "How busy it will be: " + v + ".";
      case "hearing_loop": return v ? "There is a hearing loop." : "There is no hearing loop.";
      case "auslan": return "Auslan interpreter: " + v + ".";
      case "captions": return v ? "There are captions." : "There are no captions yet.";
      case "pram_accessible": return isUnknown(v) ? "We do not know if a pram can fit." : (v ? "A pram can fit." : "A pram may not fit.");
      case "parent_room": return v ? "There is a parent room." : "There is no parent room.";
      case "accessible_stop": return v ? "The station has step-free access." : "The station does not have step-free access.";
      case "wheelchair_boarding": return v ? "You can get on the train in a wheelchair." : "You may not be able to get on the train in a wheelchair.";
      case "last_mile_confidence": return "Getting from the station to the door: we are " + v + " sure it works.";
      case "tactile_paving": return v ? "There are bumps on the ground to guide people with low vision." : "There are no guide bumps on the ground.";
      default: return a.label + ": " + formatValue(a) + ".";
    }
  }

  var EASY_STATUS = {
    verified: "A person has checked this.",
    requires_confirmation: "Not checked yet. Ask the organiser before you go.",
    missing: "We do not have this information yet."
  };

  function easyReadHtml(features) {
    features = real(features);
    if (!features.length) return '<p class="muted">Select a need above to see relevant places.</p>';
    var key = '<div class="er-key" aria-label="What the signs mean">' + STATUS_ORDER.map(function (s) {
      var word = s === "verified" ? "Checked" : s === "requires_confirmation" ? "Not checked yet" : "We do not know";
      return '<span><span class="er-mark er-mark-' + s + '" aria-hidden="true">' + STATUS_META[s].symbol + "</span>" + word + "</span>";
    }).join("") + "</div>";
    var items = features.map(function (f) {
      var s = featureStatus(f);
      var lines = f.attributes.map(function (a) {
        var word = a.status === "verified" ? "Checked" : a.status === "requires_confirmation" ? "Not checked yet" : "We do not know";
        return '<li><span class="er-mark er-mark-' + a.status + '" role="img" aria-label="' + word + '">' + STATUS_META[a.status].symbol + "</span><span>" + esc(easyLine(a)) + "</span></li>";
      }).join("");
      return '<li class="er-item"><div class="er-icon">' + icon(f.type) + "</div><div>" +
        "<h3>" + esc(EASY_TITLES[f.type] || f.name) + "</h3>" +
        '<p class="muted small" style="font-size:1rem">' + esc(f.locationNote) + ".</p>" +
        '<ul class="er-lines">' + lines + "</ul>" +
        '<p class="er-status">' + esc(EASY_STATUS[s]) + "</p></div></li>";
    }).join("");
    return key + '<ul class="er-list" style="margin-top:1.25rem">' + items + "</ul>";
  }

  return {
    esc: esc, STATUS_META: STATUS_META, STATUS_ORDER: STATUS_ORDER,
    featureStatus: featureStatus, effectiveStatus: effectiveStatus, decayedConfidence: decayedConfidence,
    freshnessText: freshnessText, statusFill: statusFill, formatValue: formatValue, statusBadge: statusBadge,
    provLine: provLine, eventCard: eventCard, eventEmojiHtml: eventEmojiHtml, eventMonths: eventMonths, MONTH_NAMES: MONTHS, typeIcon: typeIcon, TYPE_CATS: TYPE_CATS, catTint: catTint, typeKeyHtml: typeKeyHtml, typeIconInner: typeIconInner, typeMeta: typeMeta, pinHtml: pinHtml, eventDateLabel: eventDateLabel, visibleFeatures: visibleFeatures,
    planIds: planIds, planMeta: planMeta,
    featureCard: featureCard, featureList: featureList, glanceHtml: glanceHtml, accessListHtml: accessListHtml,
    legendHtml: legendHtml, needSelector: needSelector, easyReadHtml: easyReadHtml, easyLine: easyLine, icon: icon
  };
});
