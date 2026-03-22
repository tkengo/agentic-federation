import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";

const MAX_LENGTH = 200;

export function describeSetCommand(text: string): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(sessionDir, "description.txt");
  let desc = text.trim().replace(/\n/g, " ");
  if (desc.length > MAX_LENGTH) {
    desc = desc.slice(0, MAX_LENGTH - 1) + "\u2026";
    console.error(`Warning: Description truncated to ${MAX_LENGTH} characters.`);
  }
  fs.writeFileSync(filePath, desc + "\n");
  console.log(`Description: ${desc}`);
}

export function describeShowCommand(): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(sessionDir, "description.txt");

  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf-8").trim();
  if (content) {
    console.log(content);
  }
}
