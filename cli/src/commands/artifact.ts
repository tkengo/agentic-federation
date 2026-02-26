import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";
import { ARTIFACT_MAP } from "../lib/types.js";

export function artifactReadCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const relPath = ARTIFACT_MAP[name];
  if (!relPath) {
    console.error(
      `Error: Unknown artifact '${name}'. Run 'fed artifact list' to see available artifacts.`
    );
    process.exit(1);
  }

  const filePath = path.join(sessionDir, relPath);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Artifact '${name}' does not exist yet.`);
    process.exit(1);
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

export function artifactWriteCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const relPath = ARTIFACT_MAP[name];
  if (!relPath) {
    console.error(
      `Error: Unknown artifact '${name}'. Run 'fed artifact list' to see available artifacts.`
    );
    process.exit(1);
  }

  const filePath = path.join(sessionDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  // Read from stdin
  const chunks: Buffer[] = [];
  const fd = fs.openSync("/dev/stdin", "r");
  const buf = Buffer.alloc(4096);
  let bytesRead: number;
  while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
    chunks.push(buf.subarray(0, bytesRead));
  }
  fs.closeSync(fd);

  const content = Buffer.concat(chunks).toString("utf-8");
  fs.writeFileSync(filePath, content);
  console.error(`Written: ${name} (${content.length} bytes)`);
}

export function artifactListCommand(): void {
  const sessionDir = requireSessionDir();

  console.log("Artifacts:");
  for (const [name, relPath] of Object.entries(ARTIFACT_MAP)) {
    const filePath = path.join(sessionDir, relPath);
    const exists = fs.existsSync(filePath);
    const marker = exists ? "*" : " ";
    console.log(`  ${marker} ${name.padEnd(24)} ${relPath}`);
  }
  console.log("");
  console.log("  * = exists in current session");
}

export function artifactDeleteCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const relPath = ARTIFACT_MAP[name];
  if (!relPath) {
    console.error(
      `Error: Unknown artifact '${name}'. Run 'fed artifact list' to see available artifacts.`
    );
    process.exit(1);
  }

  const filePath = path.join(sessionDir, relPath);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: Artifact '${name}' does not exist.`);
    process.exit(1);
  }

  fs.unlinkSync(filePath);
  console.log(`Deleted: ${name}`);
}
