#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import { App } from "./App.js";

// Enter alternate screen buffer for fullscreen mode
process.stdout.write("\x1b[?1049h");

const instance = render(<App />);
instance.waitUntilExit().then(() => {
  // Leave alternate screen buffer, restoring previous terminal content
  process.stdout.write("\x1b[?1049l");
});
