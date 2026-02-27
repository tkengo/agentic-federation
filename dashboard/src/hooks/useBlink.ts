import { useState, useEffect } from "react";

/**
 * Toggles a boolean at the given interval (ms).
 * Used for blinking UI elements.
 */
export function useBlink(intervalMs = 500): boolean {
  const [on, setOn] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setOn((prev) => !prev), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return on;
}
