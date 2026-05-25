/**
 * Double-buffered terminal renderer using ANSI escape sequences.
 * Draws frames by moving the cursor to home position and overwriting —
 * no erase-then-redraw gap, so zero flicker.
 */

// ANSI escape sequences
const ESC = "\x1b";
const ALT_SCREEN_ON = `${ESC}[?1049h`;
const ALT_SCREEN_OFF = `${ESC}[?1049l`;
const CURSOR_HOME = `${ESC}[H`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const RESET = `${ESC}[0m`;

// Color helpers
export const color = {
  green: (s: string) => `${ESC}[32m${s}${RESET}`,
  cyan: (s: string) => `${ESC}[36m${s}${RESET}`,
  yellow: (s: string) => `${ESC}[33m${s}${RESET}`,
  red: (s: string) => `${ESC}[31m${s}${RESET}`,
  blue: (s: string) => `${ESC}[34m${s}${RESET}`,
  dim: (s: string) => `${ESC}[2m${s}${RESET}`,
  bold: (s: string) => `${ESC}[1m${s}${RESET}`,
  boldCyan: (s: string) => `${ESC}[1;36m${s}${RESET}`,
  magenta: (s: string) => `${ESC}[35m${s}${RESET}`,
};

// Strip ANSI escape sequences to measure visible string length
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export class TerminalRenderer {
  private rows: number;
  private cols: number;

  constructor() {
    this.rows = process.stdout.rows ?? 40;
    this.cols = process.stdout.columns ?? 120;

    process.stdout.on("resize", () => {
      this.rows = process.stdout.rows ?? 40;
      this.cols = process.stdout.columns ?? 120;
    });
  }

  /** Enter alternate screen and hide cursor */
  enter(): void {
    process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE);
  }

  /** Leave alternate screen and show cursor */
  exit(): void {
    process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
  }

  /** Get terminal dimensions */
  getSize(): { rows: number; cols: number } {
    return { rows: this.rows, cols: this.cols };
  }

  /**
   * Render a frame. Each string in `lines` is one row.
   * Each line is padded with spaces to fill the terminal width, so previous
   * content is overwritten without needing CLEAR_LINE. The entire frame is
   * written as a single stdout.write() call — true double buffering.
   */
  draw(lines: string[]): void {
    let frame = CURSOR_HOME;

    for (let i = 0; i < this.rows; i++) {
      const line = i < lines.length ? lines[i] : "";
      // Pad the visible portion to fill the terminal width.
      // ANSI sequences are zero-width, so we strip them to measure visible length.
      const visibleLen = stripAnsi(line).length;
      const pad = Math.max(0, this.cols - visibleLen);
      frame += line + " ".repeat(pad);
      // Use \r\n except on the last row (avoids scrolling the screen)
      if (i < this.rows - 1) frame += "\r\n";
    }

    process.stdout.write(frame);
  }
}
