import { useEffect, useRef } from "react";
import { watch } from "chokidar";
import path from "node:path";
import { ACTIVE_DIR, SESSIONS_DIR } from "../utils/types.js";

// Only these per-session files affect what the dashboard renders. Watching
// everything (artifacts, script-logs, agent output) under depth:3 fired the
// refresh on changes the UI never shows, causing needless re-render churn.
const WATCHED_FILES = new Set([
  "meta.json",
  "state-v2.json",
  "agent_state.json",
  "waiting_human.json",
  "description.txt",
]);

// Watch ~/.fed/active/ and ~/.fed/sessions/ for changes and call refresh.
// Debounces rapid file changes into a single refresh call.
export function useSessionWatcher(refresh: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const debouncedRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        refresh();
      }, 300);
    };

    const watcher = watch([ACTIVE_DIR, SESSIONS_DIR], {
      ignoreInitial: true,
      depth: 3,
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
      // Keep directories and ACTIVE_DIR symlinks watchable (session add/remove),
      // but ignore any file under SESSIONS_DIR that the dashboard doesn't read.
      ignored: (p, stats) => {
        if (p === ACTIVE_DIR || p === SESSIONS_DIR) return false;
        if (p.startsWith(ACTIVE_DIR)) return false;
        const isFile = stats ? stats.isFile() : path.extname(p) !== "";
        if (isFile) return !WATCHED_FILES.has(path.basename(p));
        return false;
      },
    });

    watcher.on("all", debouncedRefresh);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      watcher.close();
    };
  }, [refresh]);
}
