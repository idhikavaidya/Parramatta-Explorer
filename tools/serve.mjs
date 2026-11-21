// Tiny static file server so you don't need anything but Node to try the site.
//   npm run serve            -> http://localhost:8080
//   npm run serve -- 3000    -> http://localhost:3000
// (A service worker only works on localhost or https, so open it this way rather than double-clicking index.html.)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".png": "image/png", ".txt": "text/plain; charset=utf-8",
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || rel.includes("node_modules") || rel.startsWith("/tools")) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      fs.readFile(path.join(ROOT, "404.html"), (e2, nf) => { res.writeHead(404, { "Content-Type": TYPES[".html"] }); res.end(e2 ? "Not found" : nf); });
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Parramatta Explorer (static) on http://localhost:${PORT}`));
