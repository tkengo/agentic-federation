import fs from "node:fs";
import path from "node:path";
import { PROMPTS_DIR } from "../lib/paths.js";

export function promptReadCommand(name: string): void {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    console.error(
      `Error: Prompt '${name}' not found. Run 'fed prompt list' to see available prompts.`
    );
    process.exit(1);
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

export function promptListCommand(): void {
  if (!fs.existsSync(PROMPTS_DIR)) {
    console.log("No prompts directory found.");
    return;
  }

  const prompts = fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));

  if (prompts.length === 0) {
    console.log("No prompts found.");
    return;
  }

  console.log("Prompts:");
  for (const name of prompts) {
    console.log(`  ${name}`);
  }
}
