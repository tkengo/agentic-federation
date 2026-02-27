import { useEffect, useRef } from "react";
import { watch } from "chokidar";
import { ACTIVE_DIR, SESSIONS_DIR } from "../utils/types.js";

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
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    watcher.on("all", debouncedRefresh);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      watcher.close();
    };
  }, [refresh]);
}
