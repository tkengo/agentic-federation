import { useState, useEffect } from "react";

/**
 * Toggles a boolean at the given interval (ms).
 * Used for blinking UI elements.
 *
 * When `enabled` is false the timer is stopped and the hook always
 * returns `true` (steady-on) without causing re-renders.
 */
export function useBlink(intervalMs = 500, enabled = true): boolean {
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setOn((prev) => !prev), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);

  return enabled ? on : true;
}
