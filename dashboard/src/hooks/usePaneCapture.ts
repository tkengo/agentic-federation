import { useState, useEffect, useRef } from "react";
import { execSync } from "node:child_process";

// Shell-safe quoting
function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Poll `tmux capture-pane` at a fixed interval and return captured lines.
 * Returns empty array when tmuxTarget is null/empty.
 */
export function usePaneCapture(
  tmuxTarget: string | null,
  intervalMs: number = 5000
): string[] {
  const [lines, setLines] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tmuxTarget) {
      setLines([]);
      return;
    }

    const capture = () => {
      try {
        const output = execSync(
          `tmux capture-pane -p -t ${quote(tmuxTarget)}`,
          { encoding: "utf-8", timeout: 3000 }
        );
        setLines(output.split("\n"));
      } catch {
        setLines(["(capture failed)"]);
      }
    };

    capture(); // Initial capture immediately
    timerRef.current = setInterval(capture, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [tmuxTarget, intervalMs]);

  return lines;
}
