import fs from "node:fs";
import { ALL_DIRS } from "../lib/paths.js";

export function initCommand(): void {
  console.log("Initializing ~/.fed/ directory structure...");
  let created = 0;
  for (const dir of ALL_DIRS) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`  Created: ${dir}`);
      created++;
    }
  }
  if (created === 0) {
    console.log("  All directories already exist.");
  }
  console.log("Done.");
}
