#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import chalk from "chalk";
import { App } from "./App.js";

// Ensure chalk color support is enabled for terminal UI.
// chalk's auto-detection via supports-color may fail in certain environments
// (e.g., launched through tmux send-keys or via execSync), causing
// chalk.inverse() to produce unstyled text and making the text input
// caret invisible.
if (!chalk.level) {
  chalk.level = 3;
}

// Enter alternate screen buffer for fullscreen mode
process.stdout.write("\x1b[?1049h");

const instance = render(<App />, {
  exitOnCtrlC: false,
  incrementalRendering: true,
});
instance.waitUntilExit().then(() => {
  // Leave alternate screen buffer and clear the terminal
  process.stdout.write("\x1b[?1049l\x1b[2J\x1b[H");
});
