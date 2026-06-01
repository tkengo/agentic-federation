import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import fs from "node:fs";
import { ACTIVE_DIR } from "../lib/paths.js";

export const eventsRouter = new Hono();

/**
 * GET /api/events
 * Server-Sent Events stream. Emits `sessions` event whenever the active
 * sessions directory changes (symlink added / removed).
 */
eventsRouter.get("/", (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0;
    let watcher: fs.FSWatcher | null = null;
    let debounceTimer: NodeJS.Timeout | null = null;

    const sendSessionsEvent = async (): Promise<void> => {
      try {
        await stream.writeSSE({
          event: "sessions",
          data: JSON.stringify({ at: Date.now() }),
          id: String(++id),
        });
      } catch {
        // Connection closed
      }
    };

    // Initial hello so clients can confirm the stream is open
    await stream.writeSSE({ event: "ready", data: "ok", id: String(++id) });

    if (fs.existsSync(ACTIVE_DIR)) {
      watcher = fs.watch(ACTIVE_DIR, { persistent: false }, () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          void sendSessionsEvent();
        }, 100);
      });
    }

    // Heartbeat every 25s to keep the connection alive through proxies
    const heartbeat = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: String(Date.now()), id: String(++id) }).catch(
        () => {},
      );
    }, 25000);

    stream.onAbort(() => {
      if (watcher) watcher.close();
      if (debounceTimer) clearTimeout(debounceTimer);
      clearInterval(heartbeat);
    });

    // Block until aborted
    await new Promise<void>((resolve) => {
      stream.onAbort(() => resolve());
    });
  });
});
