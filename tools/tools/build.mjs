// Build script for the static (plain HTML/CSS/JS) version of Parramatta Explorer.
//
//   npm install      (once, in this folder)
//   npm run build
//
// What it does:
//   1. Reads the event / access-plan data from the Next.js app's TypeScript (../src/lib) and writes
//      assets/js/data.js, so both versions always share one dataset.
//   2. Copies MapLibre GL and the fonts from node_modules into assets/ (self-hosted, no CDN needed).
//   3. Writes every HTML page, pre-rendered so they work without JavaScript.
//   4. Writes sw.js (service worker, with a precache list and version) and manifest.webmanifest.

import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SRC = path.resolve(ROOT, "..", "src");
const require = createRequire(import.meta.url);

const write = (rel, content) => {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

/* ------------------------------------------------------------------ 1. data.js */
async function buildData() {
  const entry = `
    export { PARRAMATTA_EVENTS, EVENT_CATEGORIES } from "./lib/events";
    export { venues, events, features, checklist, risks } from "./lib/data/seed";
    export { NEED_PROFILES } from "./lib/needs";
    export { FEATURE_OPTIONS, ISSUE_TYPES } from "./lib/reportOptions";
  `;
  const out = await build({
    stdin: { contents: entry, resolveDir: SRC, sourcefile: "entry.ts", loader: "ts" },
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  });
  const tmp = path.join(HERE, ".tmp-data.mjs");
  fs.writeFileSync(tmp, out.outputFiles[0].text);
  const mod = await import(pathToFileURL(tmp).href + "?t=" + Date.now());
  fs.unlinkSync(tmp);

  const now = Date.now();
  const toDaysAgo = (iso) => Math.max(0, Math.round((now - Date.parse(iso)) / 86_400_000));
  const features = mod.features.map((f) => ({
    ...f,
    type: f.id === "f-toilet-square" ? "accessible_toilet" : f.id === "f-stop-station" ? "station_entrance" : f.type, // seeded as an accessible toilet / a station entrance

    attributes: f.attributes.map(({ provenance, ...a }) => ({
      ...a,
      provenance: {
        source: provenance.source,
        sourceLabel: provenance.sourceLabel,
        daysAgo: toDaysAgo(provenance.lastVerifiedAt), // relative to page load, like the Next.js app
        confidence: provenance.confidence,
      },
    })),
  }));

  // Abuse-screening word list: read from src/lib/moderation.ts so it is not duplicated by hand.
  const modSrc = fs.readFileSync(path.join(SRC, "lib", "moderation.ts"), "utf8");
  const m = modSrc.match(/const BLOCKLIST = (\[[\s\S]*?\]);/);
  const blocklist = m ? JSON.parse(m[1].replace(/,\s*\]$/, "]")) : [];

  const data = {
    categories: mod.EVENT_CATEGORIES,
    events: mod.PARRAMATTA_EVENTS.map((e) => ({ ...e, ...EVENT_EXTRAS[e.id] })),
    planEvents: mod.events,
    venues: mod.venues,
    features,
    needs: mod.NEED_PROFILES.map((n) => ({ ...n, featureTypes: [...n.featureTypes, ...(n.featureTypes.includes("toilet") ? ["accessible_toilet"] : []), ...(n.featureTypes.includes("stop") ? ["station_entrance"] : [])] })),
    checklist: mod.checklist,
    risks: mod.risks,
    featureOptions: mod.FEATURE_OPTIONS,
    issueTypes: mod.ISSUE_TYPES,
    blocklist,

    // Hand-ported from src/lib/community.ts (module-private there).
    seedIssues: [
      {
        id: "iss-001", eventId: "diwali", eventTitle: "Diwali", featureId: "f-toilet-square",
        featureLabel: "Accessible toilet", issueType: "Feature not working",
        note: "Example report: the accessible toilet near the stage was locked during the evening.",
        createdAt: "2026-11-01T02:00:00.000Z", state: "still_there",
        counts: { still_there: 4, being_resolved: 1, resolved: 0 }, flags: 0, hidden: false,
      },
      {
        id: "iss-002", eventId: "parramatta-lanes", eventTitle: "Parramatta Lanes", featureId: "f-curb-church",
        featureLabel: "Crossing / curb cut", issueType: "Path blocked",
        note: "Example report: a stall blocked the kerb ramp on Church Street for about an hour.",
        createdAt: "2026-10-20T09:00:00.000Z", state: "resolved",
        counts: { still_there: 1, being_resolved: 2, resolved: 5 }, flags: 0, hidden: false,
      },
    ],

    // Hand-ported from src/app/api/ai/suggest/route.ts (deterministic stand-in for the AI step).
    suggestionLibrary: {
      mobility: [
        { key: "door_width_cm", label: "Door width", proposedValue: 90, unit: "cm", reason: "Comparable venue entrances average 85–95 cm. Needs a tape-measure check." },
        { key: "turning_circle_cm", label: "Turning circle", proposedValue: 150, unit: "cm", reason: "AS 1428.1 suggests ≥150 cm. Unverified." },
      ],
      sensory: [
        { key: "noise_level", label: "Typical noise level", proposedValue: "moderate", reason: "Inferred from room type and location; not measured." },
      ],
      deaf_hoh: [
        { key: "hearing_loop", label: "Hearing loop installed", proposedValue: true, reason: "Auditorium of this type often has a loop. Must be confirmed with the venue." },
      ],
    },
    riskDrafts: [
      { id: "ai-R-a", description: "Accessible toilet reported locked or used for storage during the event" },
      { id: "ai-R-b", description: "Crowd level exceeds the scenario range and blocks step-free routes" },
    ],
  };

  const js =
    "/* GENERATED by tools/build.mjs from ../src/lib/*.ts. Do not edit by hand; edit the TypeScript and re-run `npm run build`. */\n" +
    "(function (root) { root.PE_DATA = " + JSON.stringify(data) + "; })(typeof globalThis !== \"undefined\" ? globalThis : this);\n";
  write("assets/js/data.js", js);
  return data;
}

/* ------------------------------------------------------------------ 2. vendor + fonts */
function copyVendor() {
  const nm = (p) => path.join(ROOT, "node_modules", p);
  const copy = (from, to) => { fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true }); fs.copyFileSync(from, path.join(ROOT, to)); };
  copy(nm("maplibre-gl/dist/maplibre-gl.js"), "assets/vendor/maplibre-gl.js");
  copy(nm("maplibre-gl/dist/maplibre-gl.css"), "assets/vendor/maplibre-gl.css");
  copy(nm("maplibre-gl/LICENSE.txt"), "assets/vendor/maplibre-gl.LICENSE.txt");
  const fonts = [
    ["inter", [400, 500, 600, 700], "@fontsource/inter"],
    ["space-grotesk", [500, 700], "@fontsource/space-grotesk"],
    ["opendyslexic", [400, 700], "@fontsource/opendyslexic"],
  ];
  for (const [name, weights, pkg] of fonts) {
    for (const w of weights) {
      const f = `${name}-latin-${w}-normal.woff2`;
      copy(nm(`${pkg}/files/${f}`), `assets/fonts/${f}`);
    }
  }
}

/* ------------------------------------------------------------------ 3. pages */
let D, R;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const THEME_INIT = `(function(){var d=document.documentElement;d.classList.add('js');try{var k={theme:'pe-theme',cb:'pe-cb',text:'pe-text',motion:'pe-motion',font:'pe-font',ls:'pe-ls',lh:'pe-lh'},f={theme:'light',cb:'none',text:'base',motion:'auto',font:'default',ls:'normal',lh:'normal'};for(var n in k){d.setAttribute('data-'+n,localStorage.getItem(k[n])||f[n]);}}catch(e){}})();`;

const NAV = [
  ["index.html", "Explore", "home"],
  ["guide.html", "How to use", "guide"],
  ["report.html", "Report a problem", "report"],
  ["about.html", "About & data", "about"],
  ["settings.html", "Settings", "settings"],
];

const speakIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18 6a9 9 0 0 1 0 12"/></svg>';
/** Read-aloud button. Hidden until core.js confirms the browser supports speech synthesis. */
const speak = (label = "Listen", text = "") =>
  `<button type="button" class="speak" hidden aria-pressed="false" data-label="${esc(label)}"${text ? ` data-speak="${esc(text)}"` : ""}>${speakIcon}<span class="speak-text">${esc(label)}</span></button>`;

const bunting = (extra = "") => `<div aria-hidden="true" class="bunting ${extra}"><span class="b-accent"></span><span class="b-sun"></span><span class="b-mint"></span><span class="b-lav"></span><span class="b-sky"></span>${extra ? "" : '<span class="b-brand"></span>'}</div>`;


const bookingBtn = (cls = "btn btn-sun") => `<a class="${cls}" href="#booking">Book tickets <span aria-hidden="true">↓</span></a>`;
/* Presentation extras for the static site only: one emoji per event and an APPROXIMATE map position.
   Positions are hand-estimated around the named place (not surveyed) and are labelled "approximate" on the map. */
const SQ = { lat: -33.8151, lng: 151.0011 };
const EVENT_EXTRAS = {
  "parramatta-lanes": { emoji: "🎶", geo: { lat: -33.8165, lng: 151.0033 }, place: "CBD laneways" },
  "diwali": { emoji: "🪔", geo: SQ, place: "Parramatta Square" },
  "christmas-in-parramatta": { emoji: "🎄", geo: { lat: -33.8156, lng: 151.0020 }, place: "Parramatta Square and CBD" },
  "new-years-eve": { emoji: "🎆", geo: { lat: -33.8100, lng: 151.0000 }, place: "Parramatta Park and CBD" },
  "lunar-new-year": { emoji: "🧧", geo: { lat: -33.8148, lng: 151.0007 }, place: "Parramatta Square" },
  "australia-day": { emoji: "🇦🇺", geo: { lat: -33.8112, lng: 151.0035 }, place: "Parramatta Park and riverfront" },
  "warami": { emoji: "🎨", geo: { lat: -33.8140, lng: 151.0025 }, place: "Across Parramatta (CBD centre shown)" },
  "burramatta-naidoc": { emoji: "🌅", geo: { lat: -33.8090, lng: 150.9990 }, place: "Parramatta Park" },
  "make-music-day": { emoji: "🎸", geo: { lat: -33.8160, lng: 151.0015 }, place: "Parramatta CBD" },
  "winterlight": { emoji: "⛸️", geo: { lat: -33.8154, lng: 151.0014 }, place: "Parramatta Square" },
  "farmers-market": { emoji: "🥕", geo: { lat: -33.8149, lng: 151.0028 }, place: "Centenary Square" },
  "riverside-food-market": { emoji: "🍜", geo: { lat: -33.8127, lng: 151.0052 }, place: "Parramatta River foreshore" },
  "family-movie-night": { emoji: "🎬", geo: { lat: -33.8145, lng: 151.0016 }, place: "Outdoor venue (position approximate)" },
  "seniors-festival": { emoji: "🌻", geo: { lat: -33.8158, lng: 151.0025 }, place: "Parramatta CBD" },
  "youth-week": { emoji: "🛹", geo: { lat: -33.8152, lng: 151.0003 }, place: "Parramatta CBD" },
};

function layout({ file, title, description, active, body, scripts = [], bodyAttrs = "" }) {
  const depth = file.split("/").length - 1;
  const base = depth === 0 ? "./" : "../".repeat(depth);
  const fullTitle = title === "Parramatta Explorer" ? title : `${title} · Parramatta Explorer`;
  const nav = NAV.map(([href, label, key]) =>
    `<li><a href="${base}${href}"${key === active ? ' aria-current="page"' : ""}>${esc(label)}</a></li>`).join("");
  const scriptTags = ["data.js", "render.js", "core.js", ...scripts].map((s) => `<script src="${base}assets/js/${s}"></script>`).join("\n");
  return `<!doctype html>
<html lang="en-AU" data-root="${base}" data-theme="light" data-cb="none" data-text="base" data-motion="auto" data-font="default" data-ls="normal" data-lh="normal">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="theme-color" content="#034f84">
<link rel="manifest" href="${base}manifest.webmanifest">
<link rel="icon" href="${base}assets/img/icon.svg" type="image/svg+xml">
<link rel="icon" href="${base}favicon.ico" sizes="any">
<link rel="stylesheet" href="${base}assets/css/styles.css">
<script>${THEME_INIT}</script>
</head>
<body${bodyAttrs ? " " + bodyAttrs : ""}>
<a class="skip-link" href="#main">Skip to content</a>
<div id="net-banner" class="net-banner" role="status" hidden>You're offline. Pages you've already opened, and the offline schematic map, still work.</div>

<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${base}index.html">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.5" stroke="#92a8d1" stroke-width="1.6"/><path d="M16 8l-2.4 5.6L8 16l2.4-5.6z" fill="#FFC93C"/></svg>
      <span>Parramatta Explorer</span>
    </a>
    <div class="header-actions">
      <nav class="site-nav" aria-label="Primary"><ul>${nav}</ul></nav>
      ${speak("Read page")}
      <a class="btn btn-sun btn-small" href="${base}signin.html">Sign in</a>
    </div>
  </div>
</header>

<main id="main" class="container">
${body}
</main>

<footer class="site-footer">
  ${bunting()}
  <div class="container footer-grid">
    <div class="stack-sm">
      <p style="font-family:var(--font-display);font-weight:700;font-size:1rem">Parramatta Explorer</p>
      <p>A student prototype for the Build with AI Challenge. Independent — not affiliated with or endorsed by the City of Parramatta.</p>
      <p>In an emergency call <strong>000</strong>.</p>
    </div>
    <div class="stack-sm">
      <p>We acknowledge the Baramadagal clan of the Dharug Nation, the Traditional Owners of the land and waters of Parramatta, and pay respect to Elders past and present.</p>
      <p>Event details are drawn from public City of Parramatta information and must be confirmed with the organiser. See <a class="link" href="${base}about.html">About &amp; data</a>.</p>
    </div>
  </div>
</footer>
${scriptTags}
</body>
</html>
`;
}

const DISCLAIMER = `<p class="disclaimer"><strong>Prototype — illustrative data.</strong> This is a student prototype using clearly-labelled synthetic and public seed data. It is best-effort and community-verified, is <strong>not a substitute for official venue information</strong>, and is <strong>not endorsed, funded or procured by Council</strong>. In an emergency call 000.</p>`;

const pageHeader = (title, intro, extraHtml = "") => `
<header class="stack" style="margin-bottom:2rem">
  <div class="row"><h1>${title}</h1>${speak("Listen")}</div>
  ${intro ? `<p class="muted">${intro}</p>` : ""}${extraHtml}
</header>`;

const sectionHead = (title, label, text) => `<div class="row"><h2>${title}</h2>${speak(label, text)}</div>`;

/* ---------- Explore ---------- */
function indexPage() {
  const cards = D.events.map((e) => R.eventCard(e, "./")).join("\n");
  const body = `
<div class="stack-lg">
  <section class="hero">
    ${bunting("hero-bunting")}
    <div class="hero-body">
      <div class="hero-copy">
        <p class="eyebrow">Events across Parramatta</p>
        <h1>Find <mark>what's on</mark> in Parramatta.</h1>
        <p class="lead">Festivals, markets, gigs and free community events — with an accessible access plan for each one, so you can plan before you leave home.</p>
        <div class="row" style="padding-top:0.25rem">
          <a class="btn btn-sun" href="guide.html">How to use the app</a>
          <a class="btn btn-ghost-light" href="signin.html">Sign in</a>
        </div>
      </div>
      <span style="color:#fff">${speak("Listen to this page")}</span>
    </div>
  </section>

  <section class="stack" aria-labelledby="explore-h">
    <div class="row between" style="align-items:flex-end">
      <div class="stack-sm">
        <h2 id="explore-h" style="font-size:1.875rem">Search what's on</h2>
        <p class="muted">Real events across Parramatta. Filter, then open an event to see its access plan.</p>
      </div>
      ${speak("Listen to this section", "Search what's on. Real events across Parramatta. Use the search box and the category buttons to narrow the list. Each result links to that event's access plan.")}
    </div>
    <div class="searchbar js-only">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <label class="sr-only" for="q">Search events</label>
      <input id="q" type="search" placeholder="Search events, e.g. market, music, kids" autocomplete="off">
      <button type="button" id="clear-search" class="btn btn-primary btn-small">Clear</button>
    </div>
    <div id="chips" class="chips js-only" role="group" aria-label="Filter by category"></div>
    <div class="price-filter js-only">
      <label for="price-max"><strong>Maximum price:</strong> <output id="price-out" for="price-max">Any price</output></label>
      <input id="price-max" type="range" min="0" max="${Math.max(...D.events.map((e) => e.price))}" step="1" value="${Math.max(...D.events.map((e) => e.price))}" aria-describedby="price-help">
      <span id="price-help" class="muted small">Drag to the left for free events only.</span>
    </div>
    <div class="row between js-only" style="align-items:center">
      <p id="result-count" aria-live="polite" class="semibold">Showing ${D.events.length} of ${D.events.length} events</p>
      <div class="view-switch" id="view-switch" role="group" aria-label="Choose how to view events">
        <button type="button" data-view="list" aria-pressed="true">☰ List</button>
        <button type="button" data-view="map" aria-pressed="false">📍 Map</button>
        <button type="button" data-view="calendar" aria-pressed="false">📅 Calendar</button>
      </div>
    </div>
    <div id="events-map-wrap" hidden>
      <div id="events-map" class="map-canvas events-map" aria-label="Map of event locations. The list below has the same events."></div>
      <p class="muted small" id="events-map-note">Map data © OpenStreetMap contributors. Event positions are approximate; open an event for details. Where several events share a spot, they are grouped.</p>
    </div>
    <div id="events-calendar" hidden></div>
    <ul id="event-grid" class="grid-cards">
${cards}
    </ul>
    <div id="no-results" class="empty" hidden>
      <h3 style="font-size:1.25rem">No events match.</h3>
      <p style="margin-top:0.25rem">Try a different search or pick another category.</p>
      <button type="button" id="reset-empty" class="btn btn-accent" style="margin-top:1rem">Reset filters</button>
    </div>
  </section>

  <section class="card-soft">
    <div class="row"><h2 style="font-size:1.25rem">Built around what locals asked for</h2>${speak("Listen to this section", "Built around what locals asked for. The categories and event types here reflect what the community told the City of Parramatta it wants more of: free and family events, regular markets, riverside events, food, live music and cultural celebrations. See the About and data page for sources.")}</div>
    <p class="muted" style="margin-top:0.5rem">The categories reflect what the community told the City of Parramatta it wants more of: free and family events, regular markets, riverside events, food, live music and cultural celebrations. Event details come from public Council listings — always confirm with the organiser.</p>
  </section>
</div>`;
  return layout({
    file: "index.html", title: "Parramatta Explorer", active: "home", body, scripts: ["map.js", "explore.js"],
    description: "Find what's on across Parramatta and plan an event that works for everyone. Accessible, offline-ready event information for the community.",
  });
}

/* ---------- Plan (one page per event) ---------- */
function planPage(id) {
  const { event, venue } = R.planMeta(id);
  const base = "../";
  const all = D.features;
  const tabs = [
    ["before", "1", "Before you leave", "Plan at home"],
    ["during", "2", "During the event", "On site, works offline"],
    ["after", "3", "After", "Help the next person"],
  ].map(([k, n, label, hint]) =>
    `<button type="button" role="tab" id="tab-${k}" class="tab tab-${k}" aria-selected="${k === "before"}" aria-controls="panel-${k}"><span class="t-title"><span class="num" aria-hidden="true">${n}</span>${label}</span><span class="t-hint">${hint}</span></button>`).join("");

  const presentTypes = new Set(all.map((f) => f.type));
  const KEY_ALWAYS = new Set(["toilet", "accessible_toilet", "car_park", "parking_bay"]);
  const presentCats = new Set([...presentTypes].map((t) => R.typeMeta(t).cat));
  const mapBox = (which) => `
    <div class="map-box">
      <div class="row between"><h3 style="font-size:0.95rem">Map of access features</h3><span class="muted xsmall js-only" id="map-mode-${which}" aria-live="polite">Loading map…</span></div>
      <div id="map-${which}" class="map-canvas js-only" style="margin-top:0.5rem"></div>
      <div class="map-controls js-only" role="group" aria-label="Choose which kinds of pins to show">
        <button type="button" class="chip cat-chip" data-cat="all" aria-pressed="true">All</button>
        ${R.TYPE_CATS.filter((c) => presentCats.has(c.id)).map((c) => `<button type="button" class="chip cat-chip" data-cat="${c.id}" aria-pressed="false" style="background:${c.tint}">${esc(c.label)}</button>`).join("")}
      </div>
      <div class="legend muted">${R.legendHtml()}</div>
      <p class="muted xsmall">Tint shows the type of place; ring colour and symbol show the status. Pins appear only for places that are in the plan data.</p>
      <details class="map-key"><summary>Map key</summary>${R.typeKeyHtml(presentTypes, KEY_ALWAYS)}</details>
      <ul id="access-list-${which}" class="access-list">${R.accessListHtml(all)}</ul>
    </div>`;

  const nearest = all.filter((f) => ["toilet", "accessible_toilet", "quiet_space", "entrance", "lift"].includes(f.type))
    .map((f) => `<li><span class="semibold">${esc(f.name)}</span> — ${esc(f.locationNote)}</li>`).join("");

  const body = `
<div class="stack-lg">
  <header class="stack">
    ${event.hypothetical ? '<div class="row row-tight xsmall"><span class="pill pill-soft">Hypothetical test event</span></div>' : ""}
    <div class="row"><h1>${R.eventEmojiHtml(D.events.find((x) => x.id === id))}${esc(event.title)}</h1>${speak("Listen")}</div>
    <p class="muted">${esc(venue.name)} · ${esc(R.eventDateLabel(event))}</p>
    ${DISCLAIMER}
    <p id="organiser-link" class="small" hidden><a class="link" href="#">Open the organiser workspace →</a></p>
  </header>

  <section class="card event-details" aria-labelledby="details-h">
    <div class="row between" style="align-items:flex-start">
      <div class="stack-sm" style="flex:1;min-width:16rem">
        <h2 id="details-h" style="font-size:1.25rem">Event details</h2>
        ${(() => { const ed = D.events.find((x) => x.id === id); return ed ? `
        <p>${esc(ed.blurb)}</p>
        <p><strong>When:</strong> ${esc(ed.when)} · <strong>Cost:</strong> ${ed.price ? "$" + ed.price : "Free"} · <strong>Where:</strong> ${esc(ed.venue)}</p>
        <p class="muted small">Source: ${esc(ed.source)}. Dates recur annually, so confirm the current date and any ticket needs with the organiser.</p>` : `
        <p>${esc(event.title)} is a hypothetical test event used to try out the organiser workspace.</p>
        <p><strong>When:</strong> ${esc(R.eventDateLabel(event))} · <strong>Where:</strong> ${esc(venue.name)}</p>
        <p class="muted small">Organiser: ${esc(event.organiser)}. Details are examples only.</p>`; })()}
      </div>
      <div class="stack-sm" style="max-width:20rem">
        ${bookingBtn()}
        <p class="muted xsmall">Prototype demo: the booking form below doesn't issue real tickets.</p>
      </div>
    </div>
  </section>

  <p class="row row-tight xsmall" style="margin-bottom:-0.75rem"><span class="pill">Access &amp; Inclusion Plan</span></p>
  <section class="card" aria-labelledby="glance-h">
    <h2 id="glance-h" style="font-size:1.125rem">At a glance</h2>
    <div id="glance" class="glance">${R.glanceHtml(all)}</div>
    <p class="muted small" style="margin-top:0.75rem">Confirmed, missing, or still to check — we never guess.</p>
  </section>

  <div id="needs-wrap" class="js-only"></div>
  <noscript><p class="notice">JavaScript is off, so this page shows every access feature. Turn it on to filter by your needs and to use the map.</p></noscript>

  <section class="stack-sm" aria-labelledby="visit-h">
    <div class="row between">
      <h2 id="visit-h" style="font-size:1.125rem">Your visit, step by step</h2>
    </div>
    <div id="tablist" role="tablist" aria-label="Journey stage" class="tablist" hidden>${tabs}</div>
  </section>

  <section id="panel-before" role="tabpanel" aria-labelledby="tab-before" class="stack">
    <h2 class="panel-title" style="font-size:1.25rem">Before you leave</h2>
    <div class="row">${speak("Listen to this section", "Before you leave. A map of the access features, a button to save the plan for offline use, and a card for each feature showing whether it is verified, needs checking, or is missing.")}</div>
    <div id="standard-before" class="stack">
      ${mapBox("before")}
      <div class="row js-only">
        <button type="button" id="save-btn" class="btn btn-primary btn-small">Save this plan for offline</button>
        <span id="save-msg" class="muted small" role="status">Works without a signal — the venue is where the network is not.</span>
      </div>
      <div id="feature-list" class="stack-sm">${R.featureList(all, base, id)}</div>
    </div>
  </section>

  <section id="panel-during" role="tabpanel" aria-labelledby="tab-during" class="stack">
    <h2 class="panel-title" style="font-size:1.25rem">During the event</h2>
    <div class="row">${speak("Listen to this section", "During the event. This section works offline. It shows the map and the nearest facilities such as accessible toilets, quiet spaces, entrances and lifts. You can report a problem from here.")}</div>
    ${mapBox("during")}
    <div class="card">
      <h3>Nearest facilities right now</h3>
      <ul id="nearest-list" class="small stack-sm" style="margin-top:0.5rem;padding-left:1.1rem">${nearest}</ul>
    </div>
    <div><a class="btn btn-accent" href="${base}report.html?event=${encodeURIComponent(id)}">Report a problem</a></div>
  </section>

  <section id="panel-after" role="tabpanel" aria-labelledby="tab-after" class="stack">
    <h2 class="panel-title" style="font-size:1.25rem">After</h2>
    <div id="feedback-root"></div>
    <noscript><p class="notice">Ratings need JavaScript.</p></noscript>
  </section>

  <section id="booking" class="card stack" aria-labelledby="book-h" data-price="${(() => { const ed = D.events.find((x) => x.id === id); return ed ? ed.price : 0; })()}">
    <h2 id="book-h" style="font-size:1.25rem">Booking</h2>
    <p class="notice"><strong>Prototype demo.</strong> This form shows how booking could work. It does not buy a ticket, take payment or contact anyone. It is saved only in this browser.</p>
    <noscript><p class="notice">The booking demo needs JavaScript.</p></noscript>
    <form id="book-form" class="stack js-only" novalidate>
      <div class="row">
        <label class="stack-sm" style="flex:1;min-width:12rem"><span class="semibold">Tickets</span>
          <input id="book-qty" type="number" inputmode="numeric" min="1" max="10" value="1" style="min-height:44px;padding:0.4rem 0.75rem;border:2px solid var(--brand);border-radius:12px;font:inherit"></label>
        <p class="stack-sm" style="flex:1;min-width:12rem"><span class="semibold">Estimated cost</span><output id="book-total" class="big-total" for="book-qty" aria-live="polite"></output></p>
      </div>
      <p class="muted small">Don't enter your name, email or health details. This demo doesn't need them.</p>
      <div class="row"><button type="submit" class="btn btn-primary">Request demo booking</button></div>
    </form>
    <div id="book-result" role="status" aria-live="polite" tabindex="-1"></div>
  </section>
</div>`;
  return layout({
    file: `plan/${id}.html`, title: `${event.title} — details, access plan and booking`, active: "home", body,
    scripts: ["store.js", "map.js", "plan.js", "booking.js"], bodyAttrs: `data-event="${esc(id)}"`,
    description: `Access and inclusion plan for ${event.title} in Parramatta: what is verified, missing or needs confirming.`,
  });
}

/* ---------- Organiser (one page per event) ---------- */
function organiserPage(id) {
  const { event } = R.planMeta(id);
  const body = `
<div class="stack-lg">
  <header class="stack">
    <div class="row row-tight xsmall"><span class="pill">Organiser workspace</span>${event.hypothetical ? '<span class="pill pill-soft">Hypothetical test event</span>' : ""}</div>
    <div class="row"><h1>Readiness check: ${esc(event.title)}</h1>${speak("Listen")}</div>
    <p class="muted">Build the verified access &amp; inclusion plan. AI suggests; you decide.</p>
    ${DISCLAIMER}
    <noscript><p class="notice">The organiser workspace needs JavaScript.</p></noscript>
  </header>

  <section class="card" style="border-width:1px" aria-labelledby="chk-h">
    <div class="row between">
      <div><h2 id="chk-h" style="font-size:1.125rem">Readiness checklist</h2>
      <p class="muted small">Test the plan against mobility, sensory, cognitive, language, cultural, family and digital-access needs.</p></div>
      <span class="score" id="score" role="status">0% verified</span>
    </div>
    <div id="checklist-body" class="stack" style="margin-top:1rem"></div>
  </section>

  <section class="ai-panel" aria-labelledby="ai-h">
    <div class="row between">
      <div><h2 id="ai-h" style="font-size:1.125rem">AI assist (human-approved)</h2>
      <p class="muted small">AI drafts suggested attributes and risks. Nothing is published until you approve it.</p></div>
      <button type="button" id="ai-run" class="btn btn-violet btn-small">Ask AI for suggestions</button>
    </div>
    <p id="ai-disclosure" class="small muted card" style="margin-top:0.75rem;border-width:1px" hidden></p>
    <div id="ai-results"></div>
  </section>

  <section class="card" style="border-width:1px" aria-labelledby="risk-h">
    <h2 id="risk-h" style="font-size:1.125rem">Risk register (PS-09)</h2>
    <p class="muted small">AI may suggest risks, but a human event planner must review and approve them.</p>
    <ul id="risk-list" style="list-style:none;padding:0;margin:1rem 0 0" class="stack-sm"></ul>
  </section>

  <section class="card">
    <h2 style="font-size:1.125rem">Publish the plan</h2>
    <p class="muted small" style="margin-top:0.25rem">Publishing records who approved each field and stamps a last-verified date. Unconfirmed fields stay labelled as such.</p>
    <button type="button" id="publish-btn" class="btn btn-primary" style="margin-top:0.75rem">Publish verified plan</button>
    <p id="publish-msg" role="status" class="small semibold" style="margin-top:0.75rem" hidden>Published (demo). In the full system a change is written to the append-only verification history and the attendee plan updates. In this static prototype nothing is actually saved or sent.</p>
  </section>

  <p class="small"><a class="link" href="../plan/${esc(id)}.html">View the attendee access plan →</a></p>
</div>`;
  return layout({
    file: `organiser/${id}.html`, title: `Organiser — ${event.title}`, active: "", body, scripts: ["organiser.js"],
    description: `Organiser readiness check for ${event.title}.`,
  });
}

/* ---------- Report ---------- */
function reportPage() {
  const body = `
${pageHeader("Report a problem", "Spot something wrong with an access feature? Report it in three steps. There is no moderator — other attendees confirm what is true, and abusive or private content is filtered automatically.")}
<noscript><p class="notice">Reporting needs JavaScript.</p></noscript>
<div class="stack-lg js-only">
  <section class="stack">
    ${sectionHead("Report a problem", "Listen to this section", "Report a problem. First choose the event, then the feature, then the type of issue. If none of the issue types fit, choose Other and describe it. You can add an optional note. Your report is shown to other attendees, who can confirm whether it is still there, being resolved, or resolved.")}
    <form id="r-form" class="card stack" novalidate>
      <label class="field"><span>1. Which event?</span><select id="r-event"></select></label>
      <label class="field"><span>2. Which feature?</span><select id="r-feature"></select></label>
      <label class="field"><span>3. What is the issue?</span><select id="r-type"></select></label>
      <label class="field" id="r-other-wrap" hidden><span>Describe the issue type</span><input type="text" id="r-other" maxlength="120"></label>
      <label class="field"><span>Anything to add? (optional — please don't include personal information)</span><textarea id="r-note" rows="3" maxlength="240"></textarea></label>
      <div><button type="submit" class="btn btn-primary">Submit report</button></div>
      <p id="r-msg" role="status" class="notice" hidden></p>
    </form>
    <p class="muted small"><strong>Static version:</strong> reports are saved in this browser only. Sharing them between people needs a server (the Next.js app has one, with in-memory storage).</p>
  </section>

  <section class="stack">
    ${sectionHead("Community status", "Listen to this section", "Community status. Every report is shown to everyone. Instead of a moderator deciding, other attendees vote whether an issue is still there, being resolved, or resolved. The most-voted status is shown. Each device gets one vote per report, which you can change. Anyone can also flag a report as inappropriate.")}
    <p class="muted">No moderator decides. Attendees confirm what is true right now — the community keeps the information honest. Each device gets one vote per report, and you can change it.</p>
    <p id="flag-status" role="status" class="small semibold"></p>
    <ul id="issue-list" class="issue-list"></ul>
  </section>
</div>`;
  return layout({ file: "report.html", title: "Report a problem", active: "report", body, scripts: ["store.js", "report.js"], description: "Report an access problem at a Parramatta event and see what others have confirmed." });
}

/* ---------- Sign in ---------- */
function signinPage() {
  const body = `
${pageHeader("Sign in", "Attendees and organisers see different things. Attendees never need an account; organisers are verified so published access information can be trusted.")}
<noscript><p class="notice">Sign-in needs JavaScript. Attendees don't need to sign in to use the rest of the site.</p></noscript>
<div class="stack-lg">
  <div id="si-saved" class="card row between" style="border-color:var(--brand)" hidden>
    <p>Signed in as <strong id="si-saved-role"></strong>.</p>
    <button type="button" id="si-signout" class="btn btn-outline btn-small">Sign out</button>
  </div>
  <p id="si-org-links" class="small" hidden>Organisers: open the workspace for an event, for example <a class="link" href="organiser/community-day.html">Parramatta Square Community Day</a>, or use the link on any event's access plan page.</p>

  <section class="stack js-only">
    ${sectionHead("Who are you?", "Listen to this section", "Who are you? Choose attendee to browse and plan events without an account. Choose Council organiser to build and verify an event's access plan. Organisers are verified because their email address or invite code proves they work for the council.")}
    <p class="muted">Attendees need no account. Organisers are verified because they publish official information.</p>
    <div style="display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))">
      <button type="button" id="si-choose-attendee" class="choice card" aria-pressed="false" style="border-width:2px;padding:1.25rem"><strong style="font-family:var(--font-display);font-size:1.125rem">I'm attending</strong><small style="font-size:0.875rem">Browse events, view access plans, report problems and leave feedback. No account, no personal details.</small></button>
      <button type="button" id="si-choose-organiser" class="choice card" aria-pressed="false" style="border-width:2px;padding:1.25rem"><strong style="font-family:var(--font-display);font-size:1.125rem">I'm a Council organiser</strong><small style="font-size:0.875rem">Build, verify and publish an event's access plan.</small></button>
    </div>
  </section>

  <section id="si-attendee" class="card stack" hidden>
    <h2 style="font-size:1.125rem">Browse as an attendee</h2>
    <p class="muted">We don't ask for your name, email or any health information. If you choose a need profile, it stays on your device and is never uploaded or stored on a server.</p>
    <div><button type="button" id="si-continue" class="btn btn-primary">Continue without an account</button></div>
  </section>

  <section id="si-organiser" class="card stack" hidden>
    <h2 style="font-size:1.125rem">Verify you work for Council</h2>
    <p class="muted">We verify you the same way most workplaces do — no documents, no invasive checks. Use your <strong>@cityofparramatta.nsw.gov.au</strong> work email and we send a one-time link, or enter an invite code from your events team. If neither works, a Council admin can verify you manually. <strong>Demo only:</strong> no email is sent, and this check runs in your browser, so it protects nothing.</p>
    <form id="si-form" class="stack" novalidate>
      <label class="field"><span>Council work email</span><input type="email" id="si-email" placeholder="name@cityofparramatta.nsw.gov.au" autocomplete="off"></label>
      <label class="field"><span>Or an invite code (demo: PARRA-2026)</span><input type="text" id="si-code" placeholder="Invite code" autocomplete="off"></label>
      <div><button type="submit" class="btn btn-primary">Verify and sign in</button></div>
    </form>
  </section>

  <p id="si-result" role="status" class="notice" hidden></p>
  <p id="si-error" role="alert" class="notice notice-error" hidden></p>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">How your privacy is protected</h2>
    <ul class="muted stack-sm" style="padding-left:1.25rem">
      <li><strong>Attendees:</strong> no name, no email, no health or disability information is collected or stored. Any need profile you pick is kept only in your browser.</li>
      <li><strong>Organisers:</strong> verified by a work-email link or invite code — we never ask for identity documents, and we don't store more than your verified role.</li>
      <li>This is a prototype. See the <a class="link" href="about.html">About &amp; data</a> page for the full data approach.</li>
    </ul>
  </section>
</div>`;
  return layout({ file: "signin.html", title: "Sign in", active: "", body, scripts: ["signin.js"], description: "Sign in as an attendee (no account) or a verified Council organiser." });
}

/* ---------- Settings ---------- */
function settingsPage() {
  const body = `
${pageHeader("Settings", "Adjust the display to suit your needs. Your choices are saved on this device only.")}
<div class="stack-lg">
  <noscript><p class="notice">Settings need JavaScript to change and save.</p></noscript>
  <div id="settings-groups" class="stack js-only"></div>

  <section class="card js-only">
    <p style="font-family:var(--font-display);font-weight:700;font-size:0.9rem">Preview</p>
    <p class="muted xsmall" style="margin-top:0.25rem">Colour mode changes the status colours used across the app. Font and spacing settings change this sample text.</p>
    <div class="row row-tight" style="margin-top:0.75rem">${R.statusBadge("verified")}${R.statusBadge("requires_confirmation")}${R.statusBadge("missing")}</div>
    <p style="margin-top:0.75rem">The accessible toilet is on level 1, near the event stage. A person has checked that the route has no steps, but the lift is not confirmed for today.</p>
    <div class="row" style="margin-top:0.75rem"><button type="button" id="settings-reset" class="btn btn-outline btn-small">Reset to defaults</button><span id="settings-reset-msg" role="status" class="small muted"></span></div>
  </section>

  <section class="stack">
    ${sectionHead("Why these options", "Listen to this section", "Why these options. Theme switches between light and dark for comfort and low light. Colour mode offers palettes that stay distinguishable for the most common types of colour blindness, and a high contrast monochrome mode. Text size scales the whole interface up to 137 percent. Font and spacing options help some people with dyslexia or low vision read more comfortably. Motion lets you turn animations off. No colour is ever the only signal: every status also has a text label.")}
    <ul class="muted stack-sm" style="padding-left:1.25rem">
      <li><strong>Theme</strong> — light or dark, for comfort in bright or low light.</li>
      <li><strong>Colour mode</strong> — palettes tuned for protanopia, deuteranopia and tritanopia, plus a high-contrast monochrome option. Status is always paired with a text label, so colour is never the only signal.</li>
      <li><strong>Text size</strong> — scales the whole interface, not just body text.</li>
      <li><strong>Font</strong> — a dyslexia-friendly typeface (OpenDyslexic). Research on whether special fonts improve reading is mixed, so treat it as a preference, and try the spacing options too, which some readers find more useful.</li>
      <li><strong>Letter, word and line spacing</strong> — more space between letters, words and lines.</li>
      <li><strong>Motion</strong> — turn off animations and transitions. "Match my device" follows your system's reduce-motion setting.</li>
      <li><strong>Windows High Contrast / forced colours</strong> — supported automatically when your system has it switched on; no setting needed.</li>
    </ul>
  </section>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">Text to speech</h2>
    <p class="muted">Every page and every section has a <strong>Listen</strong> button. It uses your browser or device voice, so no audio is sent to us. If your browser does not support it, the button is hidden automatically.</p>
  </section>
</div>`;
  return layout({ file: "settings.html", title: "Settings", active: "settings", body, scripts: ["settings.js"], description: "Display settings: theme, colour-blind palettes, text size, font, spacing and motion." });
}

/* ---------- Guide ---------- */
function guidePage() {
  const steps = [
    ["1. Explore what's on", "On the home page, search for events or filter by category. Every event is real and comes from public City of Parramatta listings."],
    ["2. Open an access plan", "Pick an event to open its Access & Inclusion Plan. You choose your needs, and the plan shows the features that matter to you."],
    ["3. Before you leave", "Check the map and each feature card. A tick means verified, a question mark means it still needs checking, and a dash means missing — the words are always shown too. Save the plan to use offline."],
    ["4. During the event", "The during section works without a signal. It shows the map and nearest facilities, and lets you report a problem on the spot."],
    ["5. After the event", "Rate how it went with one tap — good, okay or not good. It's anonymous and helps the next person."],
  ];
  const body = `
${pageHeader("How to use Parramatta Explorer", `A quick tour. You can listen to any section with the speaker button, and change colours, contrast, text size, fonts and spacing in <a class="link" href="settings.html">Settings</a>.`)}
<div class="stack-lg">
  <section class="stack">
    ${sectionHead("For attendees", "Listen to this section", "For attendees. You never need an account. Explore events, open an access plan, pick your needs, and use the before, during and after sections. Your needs are only kept in your browser and are never uploaded.")}
    <ol style="list-style:none;padding:0" class="stack-sm">
      ${steps.map(([t, b]) => `<li class="card"><h3>${esc(t)}</h3><p class="muted small" style="margin-top:0.25rem">${esc(b)}</p></li>`).join("\n")}
    </ol>
  </section>


  <section class="stack">
    ${sectionHead("For Council organisers", "Listen to this section", "For Council organisers. Sign in with your council work email or an invite code. You get a readiness checklist, AI suggestions you must approve yourself, and a risk register. Nothing is published as fact until a person approves it, and publishing records who approved each field.")}
    <p class="muted">Sign in with your Council work email or an invite code. You get a readiness checklist, AI suggestions that you must approve yourself, and a risk register. Nothing is published as fact until a person approves it.</p>
    <p><a class="link semibold" href="signin.html">Go to sign in →</a></p>
  </section>

  <section class="stack">
    ${sectionHead("Accessibility features", "Listen to this section", "Accessibility features. Read aloud on every page and section. Light and dark mode. Colourblind-friendly palettes. Bigger text sizes. A dyslexia-friendly font and spacing controls. A reduce motion option. Windows high contrast support. An Offline maps during an event. A text version of every map. And a five-star review after an event.")}
    <ul class="muted stack-sm" style="padding-left:1.25rem">
      <li>Read aloud on every page and every section</li>
      <li>Light and dark mode</li>
      <li>Colourblind-friendly status palettes (protan, deuteran, tritan and monochrome)</li>
      <li>Larger text sizes, a dyslexia-friendly font option, and letter, word and line spacing controls</li>
      <li>Reduce-motion option, and automatic support for Windows High Contrast (forced colours)</li>
      <li>Works offline: pages, plans and (once saved) the venue map</li>
      <li>A plain-text list version of every map</li>
      <li>Star rating and review after an event</li>
    </ul>
  </section>
</div>`;
  return layout({ file: "guide.html", title: "How to use", active: "guide", body, description: "How to use Parramatta Explorer: find events, read access plans, report problems and give feedback." });
}

/* ---------- About ---------- */
function aboutPage() {
  const body = `
${pageHeader("About & data", `How Parramatta Explorer works, where the data comes from, and how to add more. Full detail lives in the <code>docs/</code> folder of this project.`)}
<div class="stack-lg">
  ${DISCLAIMER}

  <section class="stack-sm">
    ${sectionHead("Datasets used", "Listen to this section", "Datasets used. Event listings come from public City of Parramatta pages and the Major Events and Festivals Strategy 2025 to 2030. Map and venue geometry come from OpenStreetMap under ODbL. Transport stops come from Transport for NSW Open Data. Community reports are created by participants.")}
    <ul class="muted small stack-sm" style="padding-left:1.25rem">
      <li><strong>Event listings</strong> — public City of Parramatta event pages and the Major Events and Festivals Strategy 2025–2030. Attribution required.</li>
      <li><strong>Venue and map geometry</strong> — OpenStreetMap, licensed ODbL. Attribution required.</li>
      <li><strong>Transport</strong> — Transport for NSW Open Data (stops, wheelchair boarding).</li>
      <li><strong>Access features</strong> — Council records where available; otherwise clearly marked as “requires confirmation”.</li>
      <li><strong>Community reports</strong> — created by participants; confirmed by other attendees rather than a moderator.</li>
    </ul>
    <p class="muted small">Every fact carries a source, a last-verified date and a status. Nothing is shown as fact unless a person has verified it. The “verified N days ago” figures in this prototype are example values counted from the moment you load a page.</p>
  </section>

  <section class="stack-sm">
    ${sectionHead("How to add map data", "Listen to this section", "How to add map data. Add a venue with its latitude and longitude. Add each access feature with its own coordinates, the needs it serves, and attributes with a source and a verification status. Then rebuild the static site so the pages update.")}
    <ol class="muted small stack-sm" style="padding-left:1.25rem">
      <li>Add the venue to <code>src/lib/data/seed.ts</code> with a name, address and <code>geo</code> latitude/longitude.</li>
      <li>Add each access feature with its own <code>geo</code>, the <code>needs</code> it serves, and <code>attributes</code> — each with a <code>source</code> and a <code>status</code> (verified, requires confirmation, or missing).</li>
      <li>Run <code>npm run build</code> inside <code>static-site/</code> to regenerate this site from that data.</li>
      <li>Keep the plain-text list in sync so every map has a non-visual equivalent (the build does this for you).</li>
    </ol>
  </section>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">Working offline</h2>
    <p class="muted small">After your first visit over <code>https://</code> (or <code>localhost</code>), a service worker stores every page, the scripts, fonts and map library on your device, so the whole site opens with no signal. “Save this plan for offline” also stores map tiles around the venue. Where tiles aren't stored, the app shows the offline schematic map, and every map has a text list of the same information.</p>
  </section>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">Where your information is stored</h2>
    <p class="muted small">This static version has no server. Your display settings, need selections, reports, votes and ratings are kept in this browser's local storage and are not sent anywhere. That also means reports are not shared between people. A shared community board needs a backend (the Next.js app in this project has the API routes for it, backed by in-memory storage that resets on restart).</p>
  </section>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">Responsible AI</h2>
    <p class="muted small">AI helps turn messy text into structured access attributes, retrieve requirements from approved Council documents, and draft a risk register. Every AI output is labelled <strong>“AI-suggested — requires human confirmation”</strong> and cannot be published without an approver recorded. AI never makes a consequential decision autonomously, and any output can be removed, corrected, suspended and reviewed. In this prototype the AI step is a fixed stand-in, not a live model.</p>
  </section>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">Privacy</h2>
    <ul class="muted small stack-sm" style="padding-left:1.25rem">
      <li><strong>Attendees:</strong> no name, email, health or disability information is collected. Any need profile stays in your browser.</li>
      <li><strong>Organisers:</strong> verified by a work-email link or invite code — no identity documents.</li>
      <li><strong>Reports:</strong> notes are screened to remove personal information and abusive language before they appear.</li>
    </ul>
  </section>

  <section class="stack-sm">
    <h2 style="font-size:1.25rem">Council boundary</h2>
    <p class="muted small"><strong>Partner:</strong> Council hosts the readiness workflow and owns verified data. <strong>Facilitate:</strong> distribute the plan through existing event channels. <strong>Advocate:</strong> for access conditions Council does not control (station lifts, private venues), the tool produces an advocacy brief for the relevant operator.</p>
  </section>

  <p class="small"><a class="link" href="index.html">← Back to explore</a></p>
</div>`;
  return layout({ file: "about.html", title: "About & data", active: "about", body, description: "Data sources, offline behaviour, privacy and responsible-AI notes for Parramatta Explorer." });
}

/* ---------- Offline + 404 ---------- */
function offlinePage() {
  const body = `
<div class="stack" style="max-width:40rem">
  <h1>You're offline</h1>
  <p class="muted">This page hasn't been saved on your device yet. Pages you have already opened still work without a signal.</p>
  <p><a class="btn btn-primary" href="index.html">Go to the home page</a></p>
</div>`;
  return layout({ file: "offline.html", title: "Offline", active: "", body, description: "You are offline." });
}
function notFoundPage() {
  const body = `
<div class="stack" style="max-width:40rem">
  <h1>Page not found</h1>
  <p class="muted">We couldn't find that page.</p>
  <p><a class="btn btn-primary" href="index.html">Go to the home page</a></p>
</div>`;
  return layout({ file: "404.html", title: "Page not found", active: "", body, description: "Page not found." });
}

/* ------------------------------------------------------------------ 4. SW + manifest */
function writeIcons() {
  write("assets/img/icon.svg",
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#034f84"/><circle cx="32" cy="32" r="23" fill="none" stroke="#92a8d1" stroke-width="3.5"/><path d="M42 21l-6.4 14.8L21 42l6.4-14.8z" fill="#ffc93c"/></svg>\n`);
  write("manifest.webmanifest", JSON.stringify({
    name: "Parramatta Explorer",
    short_name: "Parra Explorer",
    description: "Find what's on across Parramatta and plan events that work for everyone. Offline-ready event and access information.",
    start_url: "./index.html",
    scope: "./",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#034f84",
    icons: [
      { src: "assets/img/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
  }, null, 2) + "\n");
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}

function writeServiceWorker() {
  const skip = (rel) => rel.startsWith("node_modules/") || rel.startsWith("tools/") || rel === "sw.js" ||
    rel === "package.json" || rel === "package-lock.json" || rel === "README.md" || rel.endsWith(".LICENSE.txt") || rel.startsWith(".");
  const files = walk(ROOT).map((f) => path.relative(ROOT, f).split(path.sep).join("/")).filter((r) => !skip(r)).sort();
  const hash = crypto.createHash("sha1");
  for (const f of files) { hash.update(f); hash.update(fs.readFileSync(path.join(ROOT, f))); }
  const version = hash.digest("hex").slice(0, 10);
  const precache = ["./", ...files];
  const tpl = fs.readFileSync(path.join(HERE, "sw.template.js"), "utf8");
  write("sw.js", tpl.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(precache, null, 2)));
  return { version, count: precache.length };
}

/* ------------------------------------------------------------------ run */
async function main() {
  D = await buildData();
  globalThis.PE_DATA = D;
  R = require(path.join(ROOT, "assets/js/render.js"));
  copyVendor();

  write("index.html", indexPage());
  const ids = R.planIds();
  for (const id of ids) { write(`plan/${id}.html`, planPage(id)); write(`organiser/${id}.html`, organiserPage(id)); }
  write("report.html", reportPage());
  write("signin.html", signinPage());
  write("settings.html", settingsPage());
  write("guide.html", guidePage());
  write("about.html", aboutPage());
  write("offline.html", offlinePage());
  write("404.html", notFoundPage());
  writeIcons();
  const sw = writeServiceWorker();
  console.log(`Built ${ids.length} plan pages, ${ids.length} organiser pages and 9 other pages. Service worker v${sw.version} precaches ${sw.count} files.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
