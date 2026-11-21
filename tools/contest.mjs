// Generates landing.html: one self-contained pitch page (inline CSS) that links to index.html (the prototype)
// Run: node tools/contest.mjs   (reads assets/js/data.js, so run `npm run build` first if data changed)
import { heroScene, lantern } from "./art.mjs";
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm"; import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets/js/data.js"), "utf8"), ctx);
const D = ctx.PE_DATA;
const out = root;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ST = { verified: ["Verified", "✓"], requires_confirmation: ["Needs confirming", "!"], missing: ["Not known yet", "?"] };
const badge = s => `<span class="st st-${s}"><span aria-hidden="true">${ST[s][1]}</span> ${ST[s][0]}</span>`;
const price = e => e.price ? `$${e.price}` : "Free";
const venue = id => D.venues.find(v => v.id === id);
const NEED_SHORT = { mobility: "Wheelchair / mobility", sensory: "Sensory-friendly", deaf_hoh: "Deaf / hard of hearing", family: "Young children", vision: "Blind / low vision", cognitive: "Simple & predictable", language: "Other languages", transport: "Public transport" };
function tally(venueId, need) {
  const t = { verified: 0, requires_confirmation: 0, missing: 0 };
  for (const f of D.features.filter(f => f.venueId === venueId && need.featureTypes.includes(f.type)))
    for (const a of f.attributes.filter(a => need.attributeKeys.includes(a.key))) t[a.status]++;
  t.total = t.verified + t.requires_confirmation + t.missing; return t;
}
const tallyText = t => t.total ? `${t.verified} verified · ${t.requires_confirmation} to confirm · ${t.missing} not known` : "No sample data yet";
const head = (title, desc, rel, extra = "") => `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#034f84"><link rel="icon" href="${rel}favicon.ico"><style>${CSS}</style>${extra}</head><body>`;
const R = p => p; // helper for readability
const nav = () => `<a class="skip" href="#main">Skip to content</a><header class="top"><div class="wrap bar"><a class="brand" href="#top"><span class="logo" aria-hidden="true">P</span> Parramatta Explorer</a><nav aria-label="Main"><a href="#community">Why it matters</a><a href="#who">Who we are</a><a href="#data">Data and sources</a><a href="#council">Council</a><a class="navcta" href="index.html">Open the prototype</a></nav></div></header>`;
const foot = rel => `<footer class="foot"><div class="wrap"><p><strong>Independent student prototype</strong> for WSTI Festi 2026, created by Idhika Vaidya and Eraj Basheer. Not affiliated with or endorsed by the City of Parramatta. Prototype content is illustrative. Event details come from public Council listings; always confirm with the organiser.</p><p>In an emergency call <strong>000</strong>.</p><p>We acknowledge the Baramadagal clan of the Dharug Nation as the Traditional Owners of the land on which Parramatta stands, and pay respect to Elders past and present. Map data © OpenStreetMap contributors.</p></div></footer></body></html>`;

/* ---------- shared CSS ---------- */
const CSS = `
@font-face{font-family:Inter;font-weight:400 700;font-display:swap;src:url("../assets/fonts/inter-latin-400-normal.woff2") format("woff2")}
@font-face{font-family:Inter;font-weight:700;font-display:swap;src:url("../assets/fonts/inter-latin-700-normal.woff2") format("woff2")}
@font-face{font-family:"Space Grotesk";font-weight:700;font-display:swap;src:url("../assets/fonts/space-grotesk-latin-700-normal.woff2") format("woff2")}
:root{--brand:#034f84;--deep:#02385f;--sky:#92a8d1;--mist:#e6ecf6;--sun:#ffc93c;--mint:#8fe3c2;--lav:#cfc2f7;--ink:#02385f;--soft:#35678f}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:1.0625rem/1.6 Inter,system-ui,sans-serif;color:var(--ink);background:#fff}
h1,h2,h3{font-family:"Space Grotesk",Inter,sans-serif;line-height:1.15;margin:0 0 .5em;color:var(--brand)}
h1{font-size:clamp(2.2rem,5vw,3.6rem)}h2{font-size:clamp(1.6rem,3vw,2.2rem)}h3{font-size:1.2rem}
a{color:var(--brand)}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--sun);outline-offset:2px;box-shadow:0 0 0 5px var(--deep)}
.wrap{max-width:1100px;margin:0 auto;padding:0 1.25rem}
.skip{position:absolute;left:-999px;top:0;background:var(--sun);color:var(--deep);padding:.6rem 1rem;z-index:99}.skip:focus{left:0}
.top{background:var(--brand);color:#fff}.bar{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;min-height:64px}
.top a{color:#fff;text-decoration:none;font-weight:600}.top nav{display:flex;gap:1.25rem;flex-wrap:wrap}.top nav a{padding:.5rem 0;border-bottom:3px solid transparent}.top nav a[aria-current]{border-color:var(--sun)}
.brand{display:flex;align-items:center;gap:.6rem;font-family:"Space Grotesk",sans-serif;font-size:1.2rem}.logo{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--sun);color:var(--deep);font-weight:700}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:.65rem 1.4rem;border-radius:999px;font-weight:700;text-decoration:none;border:2px solid var(--brand);background:var(--brand);color:#fff;cursor:pointer;font:inherit;font-weight:700}
.btn:hover{background:var(--deep)}.btn.alt{background:#fff;color:var(--brand)}.btn.alt:hover{background:var(--mist)}.btn.sun{background:var(--sun);border-color:var(--sun);color:var(--deep)}
.hero{background:linear-gradient(180deg,var(--mist),#fff);padding:4rem 0 3rem}.hero .grid{display:grid;grid-template-columns:1.1fr .9fr;gap:2.5rem;align-items:center}
.eyebrow{display:inline-block;background:var(--mint);color:var(--deep);font-weight:700;font-size:.85rem;letter-spacing:.04em;text-transform:uppercase;padding:.3rem .8rem;border-radius:999px;margin-bottom:1rem}
.lead{font-size:1.2rem;color:var(--soft);max-width:36em}.row{display:flex;gap:.8rem;flex-wrap:wrap;margin-top:1.5rem}
.card{background:#fff;border:2px solid var(--sky);border-radius:18px;padding:1.25rem}
.mock{box-shadow:0 18px 40px -20px rgba(3,79,132,.5)}.mock h2{margin-bottom:.2rem}.mock ul{list-style:none;margin:.8rem 0 0;padding:0;display:grid;gap:.6rem}.mock li{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;align-items:center;padding:.6rem .8rem;background:var(--mist);border-radius:12px}
.st{display:inline-flex;gap:.35rem;align-items:center;font-size:.85rem;font-weight:700;padding:.15rem .65rem;border-radius:999px;border:2px solid}
.st-verified{background:#d1fae5;color:#065f46;border-color:#34d399}.st-requires_confirmation{background:#fef3c7;color:#92400e;border-color:#fbbf24}.st-missing{background:#e4e4e7;color:#3f3f46;border-color:#a1a1aa}
section.s{padding:3.5rem 0}section.alt{background:var(--mist)}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.25rem}
.num{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--brand);color:#fff;font-weight:700;margin-bottom:.8rem;font-family:"Space Grotesk",sans-serif}
.chips{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0}.chip{min-height:44px;padding:.4rem 1rem;border-radius:999px;border:2px solid var(--brand);background:#fff;color:var(--brand);font:inherit;font-weight:600;cursor:pointer}
.chip[aria-pressed=true]{background:var(--brand);color:#fff}.chip:hover{background:var(--mist)}.chip[aria-pressed=true]:hover{background:var(--deep)}
.ev{display:flex;flex-direction:column;gap:.5rem;border-top-width:10px}.ev h3 a{text-decoration:none}.ev h3 a:hover{text-decoration:underline}.meta{font-size:.9rem;color:var(--soft);font-weight:600}
.tag{display:inline-block;background:var(--mist);border:1px solid var(--sky);border-radius:999px;padding:.05rem .6rem;font-size:.8rem;font-weight:600;margin:0 .3rem .3rem 0}
.glance{margin:.2rem 0 0;padding:0;list-style:none;font-size:.9rem;display:grid;gap:.25rem}.glance[hidden]{display:none}
input[type=search]{width:100%;max-width:520px;min-height:48px;padding:.5rem 1rem;border:2px solid var(--brand);border-radius:12px;font:inherit}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.65rem .8rem;border-bottom:1px solid var(--sky);vertical-align:top}th{background:var(--mist)}
.note{border-left:6px solid var(--sun);background:#fffaeb;padding:.9rem 1.1rem;border-radius:8px}
.evhero{padding:3rem 0 2rem}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1rem;margin:1.5rem 0}.facts div{background:#fff;border:2px solid var(--sky);border-radius:14px;padding:.8rem 1rem}.facts dt{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;font-weight:700;color:var(--soft)}.facts dd{margin:0;font-weight:700}
.foot{background:var(--deep);color:#fff;padding:2rem 0;font-size:.95rem}.foot p{max-width:60em}.pn{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-top:2rem}
@media(max-width:800px){.hero .grid{grid-template-columns:1fr}.hero{padding:2.5rem 0}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media(forced-colors:active){.chip[aria-pressed=true]{background:Highlight;color:HighlightText}.st{border-color:CanvasText}}
`.replace(/\.\.\/assets\//g, "assets/");

/* ---------- LANDING ---------- */
const sq = venue("venue-square");
const demo = D.features.find(f => f.id === "f-entrance-square");
const demoRows = demo.attributes.slice(0, 4).map(a => `<li><span>${esc(a.label)}</span>${badge(a.status)}</li>`).join("");
const people = [
  { name: "Idhika Vaidya", role: "Data scientist · Parramatta local", initials: "IV", url: "https://www.linkedin.com/in/idhika-vaidya/",
    lines: ["Idhika is a data scientist who lives in Parramatta, and a co-creator of Parramatta Explorer.", "The project starts from one everyday question: can I actually get in, before I leave home?", "She and Eraj want accessibility information to be open and honest, and improved together by the community and Council."] },
  { name: "Eraj Basheer", role: "IT and Cybersecurity student", initials: "EB", url: "https://www.linkedin.com/in/eraj-basheer/",
    lines: ["Eraj is an IT and Cybersecurity student and a co-creator of Parramatta Explorer.", "He and Idhika created the prototype as an independent student project for WSTI Festi 2026.", "They share the vision of open, honest accessibility information that the community and Council improve together."] },
];
const personCard = p => `<article class="card person"><div class="avatar" aria-hidden="true">${p.initials}</div><h3>${esc(p.name)}</h3><p class="role">${esc(p.role)}</p><p>${p.lines.map(esc).join(" ")}</p><p><a class="btn alt small" href="${p.url}" target="_blank" rel="noopener noreferrer">${esc(p.name.split(" ")[0])} on LinkedIn<span class="sr"> (opens in a new tab)</span> <span aria-hidden="true">↗</span></a></p></article>`;
fs.writeFileSync(path.join(out, "landing.html"), head("Parramatta Explorer: plan events you can actually access", "Parramatta Explorer gives every City of Parramatta event an access plan, so people can check they can get in before they leave home.", "", "<style>.hero2{position:relative;overflow:hidden;color:#fff;background:#021e36;min-height:640px}.hero2 .scene{position:absolute;inset:0;width:100%;height:100%}.hero2 .scrim{position:absolute;inset:0;background:linear-gradient(90deg,rgba(2,30,54,.82),rgba(2,30,54,.5) 45%,rgba(2,30,54,.05) 75%)}.hero2 .in{position:relative;z-index:2;padding:80px 0 120px;max-width:600px}.hero2 .mock,.hero2 .mock li,.hero2 .mock li span{color:#0b2a4a}.hero2 .mock{background:#fff}.hero2 h1{color:#fff;font-size:clamp(2.4rem,4.6vw,3.9rem);text-shadow:0 4px 24px rgba(2,30,54,.5)}.hero2 .lead{color:#eaf1fa;text-shadow:0 2px 10px rgba(2,30,54,.6)}.hero2 .eyebrow{background:#ffffff26;color:#fff;border:1.5px solid #ffffff66}.hero2 .btn.alt{background:#ffffff22;color:#fff;border-color:#fff}.hero2 .mockwrap{position:absolute;z-index:2;right:max(1.25rem,calc((100vw - 1100px)/2));top:90px;width:min(340px,30vw)}.wave{position:absolute;bottom:-1px;left:0;right:0;height:50px;width:100%;z-index:2}@media(max-width:900px){.hero2 .mockwrap{display:none}.hero2 .scrim{background:rgba(2,30,54,.65)}}.person{text-align:left}.avatar{width:64px;height:64px;border-radius:50%;background:var(--sun);color:var(--deep);display:grid;place-items:center;font:700 1.4rem 'Space Grotesk',sans-serif;margin-bottom:.8rem}.role{color:var(--soft);font-weight:600;margin:-.2rem 0 .7rem}.btn.small{min-height:44px;padding:.4rem 1.1rem;font-size:.95rem}.sr{position:absolute;left:-999px}ul.tick{padding-left:1.2rem}ul.tick li{margin:.3rem 0}.band2{background:var(--brand);color:#fff;border-radius:28px;padding:2.5rem;display:flex;gap:1.5rem;align-items:center;justify-content:space-between;flex-wrap:wrap}.band2 h2{color:#fff;margin:0}.band2 p{margin:.4rem 0 0;color:#e6ecf6}.navcta{background:var(--sun);color:var(--deep)!important;padding:.45rem 1.1rem!important;border-radius:99px;border-bottom:0!important}</style>") + nav() + `
<main id="main">
<section class="hero2" id="top" aria-labelledby="top-h">${heroScene}<div class="scrim"></div>
<div class="wrap"><div class="in"><span class="eyebrow">WSTI Festi 2026 · City Challenge 2</span>
<h1 id="top-h">Parramatta Explorer</h1>
<p class="lead" style="font-size:1.4rem;color:#fff;font-weight:600;margin-bottom:.4rem">Plan events you can actually access.</p>
<p class="lead">An accessible plan for every City of Parramatta event, so you know you can get in before you leave home.</p><p class="lead" style="font-size:1rem">A prototype by Idhika Vaidya &amp; Eraj Basheer. Not affiliated with or endorsed by the City of Parramatta.</p>
<div class="row"><a class="btn sun" href="index.html">Open the prototype</a><a class="btn alt" href="#who">Who we are</a></div>
</div>
<div class="mockwrap"><aside class="card mock" aria-label="Example access plan"><p class="meta">Example · ${esc(sq.name)} · ${esc(demo.name)}</p><h2 style="font-size:1.2rem;margin:.1rem 0 0">Access plan</h2><ul>${demoRows}</ul><p class="meta">Sample prototype data. Statuses use words and symbols, never colour alone.</p></aside></div></div>
<svg class="wave" viewBox="0 0 1440 50" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50V25Q180 0 360 25T720 25T1080 25T1440 25V50Z" fill="#fff"/></svg></section>

<section class="s" id="community"><div class="wrap"><h2>When people can trust the information, more of them take part.</h2>
<p class="lead" style="max-width:48em">Deciding whether to attend an event is hard for people with disability, older residents and families, who often can't tell if they can get in, move around or take part. That affects:</p>
<ul class="cols" style="list-style:none;padding:0;margin:1.2rem 0">
<li class="card">Wheelchair and mobility users</li><li class="card">Blind and low-vision people</li><li class="card">Deaf and hard-of-hearing people</li><li class="card">Autistic and sensory-sensitive people</li><li class="card">Older residents, carers and families</li><li class="card">Culturally diverse communities</li></ul>
<div class="cols"><div class="card"><h3>Fewer wasted trips</h3><p>Checking access details first avoids wasted trips and makes attendance more likely. The same data shows Council which gaps to fix for future events.</p></div>
<div class="card"><h3>How we'll measure it</h3><p>Success is measured by verified event access details, gaps closed, and post-event feedback on whether people could take part, not just attendance. These are plans for a pilot, not results we already have.</p></div></div></div></section>

<section class="s alt" id="who"><div class="wrap"><h2>Who we are</h2>
<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${people.map(personCard).join("")}</div>
<div class="card" style="margin-top:1.5rem"><h3>Our vision</h3><p>A Parramatta where everyone, including disabled people, older residents and families, can attend events with confidence. We propose a simple tool that gives people confidence before they travel and gives Council a live view of the barriers.</p></div></div></section>

<section class="s" id="told"><div class="wrap"><h2>We asked the people of Parramatta.</h2>
<p class="lead" style="max-width:48em">Feedback from PHIVE said the event page was too text-heavy, so access details now sit behind a "More details" button.</p>
<div class="cols"><figure class="card" style="margin:0"><blockquote style="margin:0;font-size:1.15rem">“I like that you can report a problem and see what other people have reported.”</blockquote><figcaption class="meta" style="margin-top:.6rem">Mother, Parramatta</figcaption></figure>
<figure class="card" style="margin:0"><blockquote style="margin:0;font-size:1.15rem">“I can see myself using this, and telling a friend about it.”</blockquote><figcaption class="meta" style="margin-top:.6rem">Carer, Parramatta</figcaption></figure></div>
<p class="meta">Feedback as reported by the team.</p></div></section>

<section class="s alt" id="data"><div class="wrap"><h2>Where the information comes from</h2>
<ol class="tick" style="max-width:52em"><li>OpenStreetMap accessibility tags: candidate venue attributes (ODbL licence)</li><li>Transport for NSW Open Data: accessible stops and journey context</li><li>City of Parramatta event listings: name, date, venue, description</li><li>Major Events and Festivals Strategy 2025–2030: engagement facts and context</li><li>Council strategy documents: Disability Inclusion Action Plan, Social Sustainability Strategy, Smart City and Innovation Strategy</li><li>Synthetic attendance and resource scenarios, clearly labelled as not real Council data</li><li>MapLibre and OpenStreetMap tiles via OpenFreeMap for the base map</li></ol></div></section>

<section class="s" id="ai"><div class="wrap"><h2>AI helps, but a person always decides</h2>
<div class="cols"><div class="card"><h3>Privacy</h3><p>No attendee accounts or health data. Your chosen needs stay on your device and are never sent to a server.</p></div>
<div class="card"><h3>Tools</h3><p>AI tools were used to build the website and its design.</p></div>
<div class="card"><h3>Human check</h3><p>AI only suggests access attributes or risks. A person confirms each item before publication, and each item shows its source and last-checked date.</p></div>
<div class="card"><h3>Risks we manage</h3><p>Stale or incomplete data, over-trust in AI, and exclusion when data is missing. We show where information came from and state what is unknown.</p></div></div></div></section>

<section class="s alt" id="council"><div class="wrap"><h2>We'd ask Council to partner and advocate</h2>
<div class="cols"><div class="card"><h3>Partner</h3><p>Share event and venue information and provide access to spaces, so the plan is accurate.</p></div>
<div class="card"><h3>Advocate</h3><p>Encourage venues and organisers to publish accessible information.</p></div>
<div class="card"><h3>Scope</h3><p>We are not asking Council to fund or deliver a new platform, or to regulate. We propose a small shared pilot.</p></div></div>
<p style="margin-top:1.2rem"><strong>Fits with Council plans:</strong> Major Events and Festivals Strategy 2025–2030 (Measurement and Evaluation), Disability Inclusion Action Plan, Smart City and Innovation Strategy, Social Sustainability Strategy.</p></div></section>

<section class="s"><div class="wrap"><div class="band2"><div><h2>Try it now</h2><p>Search a Parramatta event, choose your needs, and review the access plan before, during and after the event.</p></div><div class="row" style="margin:0"><a class="btn sun" href="index.html">Open the prototype</a></div></div></div></section>
</main>` + foot(""));

console.log("landing.html written");
