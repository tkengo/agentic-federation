import { useEffect } from "react";
import { watch } from "chokidar";
import { ACTIVE_DIR, SESSIONS_DIR } from "../utils/types.js";

// Watch ~/.fed/active/ and ~/.fed/sessions/ for changes and call refresh
export function useSessionWatcher(refresh: () => void) {
  useEffect(() => {
    const watcher = watch([ACTIVE_DIR, SESSIONS_DIR], {
      ignoreInitial: true,
      depth: 3,
      // Watch for meta.json, state.json, and symlink changes
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    watcher.on("all", () => {
      refresh();
    });

    return () => {
      watcher.close();
    };
  }, [refresh]);
}
