import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";

/** Resolve the artifacts directory for the current session. */
function artifactsDir(sessionDir: string): string {
  return path.join(sessionDir, "artifacts");
}

export function artifactReadCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(artifactsDir(sessionDir), name);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: Artifact '${name}' does not exist yet.`);
    process.exit(1);
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

export function artifactWriteCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const dir = artifactsDir(sessionDir);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, name);

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
  const dir = artifactsDir(sessionDir);

  if (!fs.existsSync(dir)) {
    console.log("Artifacts:");
    console.log("  (none)");
    return;
  }

  const files = fs.readdirSync(dir).filter((f) => {
    const stat = fs.statSync(path.join(dir, f));
    return stat.isFile();
  });

  console.log("Artifacts:");
  if (files.length === 0) {
    console.log("  (none)");
    return;
  }
  for (const file of files) {
    const stat = fs.statSync(path.join(dir, file));
    const size = formatFileSize(stat.size);
    const modified = stat.mtime.toLocaleString();
    console.log(`  ${file.padEnd(30)} ${size.padStart(8)}  ${modified}`);
  }
}

export function artifactDeleteCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(artifactsDir(sessionDir), name);

  if (!fs.existsSync(filePath)) {
    console.error(`Error: Artifact '${name}' does not exist.`);
    process.exit(1);
  }

  fs.unlinkSync(filePath);
  console.log(`Deleted: ${name}`);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
