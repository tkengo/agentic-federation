#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionsRouter } from "./routes/sessions.js";
import { treeRouter } from "./routes/tree.js";
import { fileRouter } from "./routes/file.js";
import { eventsRouter } from "./routes/events.js";
import { panesRouter } from "./routes/panes.js";
import { commentsRouter } from "./routes/comments.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// dist/index.js から見た web/dist の場所
// browser/server/dist/index.js -> ../../web/dist
const WEB_DIST = path.resolve(__dirname, "..", "..", "web", "dist");

const PORT = Number(process.env.FED_BROWSE_PORT ?? 7777);

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.route("/api/sessions", sessionsRouter);
app.route("/api/tree", treeRouter);
app.route("/api/file", fileRouter);
app.route("/api/events", eventsRouter);
app.route("/api/panes", panesRouter);
app.route("/api/comments", commentsRouter);

// Serve Vite build output from WEB_DIST. SPA fallback: unknown paths -> index.html
app.get("/*", (c) => {
  const url = new URL(c.req.url);
  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(WEB_DIST, safePath);
  if (!filePath.startsWith(WEB_DIST)) {
    return c.notFound();
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(WEB_DIST, "index.html");
    if (!existsSync(filePath)) {
      return c.text("fed-browser web build not found. Run `npm run build` in browser/web.", 500);
    }
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] ?? "application/octet-stream";
  const body = readFileSync(filePath);
  return c.body(body, 200, { "Content-Type": mime });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`fed-browse-server listening on http://localhost:${info.port}`);
});
