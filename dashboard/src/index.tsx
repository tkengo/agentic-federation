#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { App } from "./App.js";

// Enter alternate screen buffer for fullscreen mode
process.stdout.write("\x1b[?1049h");

const instance = render(<App />, { exitOnCtrlC: false });
instance.waitUntilExit().then(() => {
  // Leave alternate screen buffer and clear the terminal
  process.stdout.write("\x1b[?1049l\x1b[2J\x1b[H");
});
