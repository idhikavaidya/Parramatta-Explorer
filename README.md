# Parramatta Explorer (static HTML version)

[**Live demo**](https://idhikavaidya.github.io/Parramatta-Explorer/)

> **Prototype.** Illustrative data. Not a Council service. (Same as the Next.js app.)

A plain **HTML + CSS + JavaScript** version of Parramatta Explorer. It has the same pages and features as the Next.js app, but needs no framework, no `npm install` and no build step to *run*. Any web server or static host can serve it.

## Contents

- [Highlights](#highlights)
- [Quick start](#quick-start)
- [Deploying](#deploying)
- [Pages](#pages)
- [Features](#features)
- [Known limits](#known-limits)

## Highlights

- **Works without JavaScript for reading.** Pages are pre-rendered, so the event list, every access feature and the text list under each map are real HTML.
- **Works offline.** A service worker stores the whole site on the device after the first visit.
- **Accessibility settings.** Dyslexia-friendly font, text spacing, reduced motion, and automatic support for Windows High Contrast.
- **No build step.** Serve the folder as it is.

## Quick start

You only need Node.js:

```bash
cd static-site
node tools/serve.mjs          # then open http://localhost:8080
# or: node tools/serve.mjs 3000
```

Python works too. From inside `static-site/`:

```bash
python3 -m http.server 8080
```

You can also double-click `index.html`. Everything works that way **except offline saving**: browsers only allow service workers on `https://` or `localhost`.

## Deploying

Upload the `static-site/` folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, and so on). It uses relative links, so it works at the site root or in a sub-folder. Use `https://` so the offline features work.

## Pages

| File | Same as Next.js route |
|---|---|
| `index.html` | `/` Explore |
| `plan/<event>.html` (16 pages) | `/plan/[eventId]` access plan |
| `organiser/<event>.html` (16 pages) | `/organiser/[eventId]` organiser workspace |
| `report.html` | `/report` |
| `signin.html` | `/signin` |
| `settings.html` | `/settings` |
| `guide.html`, `about.html` | `/guide`, `/about` |
| `offline.html`, `404.html` | (new) fallback pages |

## Features

### 1. Offline support (service worker): `sw.js`

- After the first visit, every page, script, font and the map library are stored on the device, so the whole site opens with no signal (tested by actually stopping the server).
- "Save this plan for offline" also pre-fetches map tiles around the venue, so the live map works offline. Where tiles aren't stored, the app falls back to the schematic map (and every map has a text list).
- Needs `https://` or `localhost`.

### 2. More display settings: `settings.html`

- Dyslexia-friendly font (OpenDyslexic, self-hosted), letter/word spacing, line spacing, and a reduce-motion switch.
- Windows High Contrast / forced-colours is supported automatically (selected states use system `Highlight` colours).
- Buttons, inputs, tabs and links in the navigation measure at least 44×44 px on every page (checkboxes are counted by their whole label).
- Printing always uses light colours.

### 3. One vote per device: `report.html`

- Voting twice with the same answer does nothing; picking a different answer *moves* your vote.
- Your own report counts as your vote.
- One flag per report per device.

## Known limits

- Filtering, tabs, the map and the forms need JavaScript. Reading the pages does not.
- Offline saving needs `https://` or `localhost`; it does not work when `index.html` is opened from disk.
- The small zoom buttons on the live map come from the MapLibre library and are smaller than 44×44 px.
- Data is illustrative only.
