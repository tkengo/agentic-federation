import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { requireSessionDir } from "../lib/session.js";

/** Resolve the artifacts directory for the current session. */
function artifactsDir(sessionDir: string): string {
  return path.join(sessionDir, "artifacts");
}

/** Append .md if the name has no file extension. */
function resolveArtifactName(name: string): string {
  return path.extname(name) === "" ? name + ".md" : name;
}

export function artifactReadCommand(name: string, nvim?: boolean): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(artifactsDir(sessionDir), resolveArtifactName(name));

  if (!fs.existsSync(filePath)) {
    console.error(`Error: Artifact '${name}' does not exist yet.`);
    process.exit(1);
  }

  if (nvim) {
    spawnSync("nvim", [filePath], { stdio: "inherit" });
    return;
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

/** Rotate existing artifact to a versioned backup (e.g. spec.md -> spec_v1.md). */
function rotateArtifact(dir: string, fileName: string): void {
  const filePath = path.join(dir, fileName);
  if (!fs.existsSync(filePath)) return;

  const ext = path.extname(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);

  // Find the highest existing version number
  const versionPattern = new RegExp(
    `^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_v(\\d+)${ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  );
  let maxVersion = 0;
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(versionPattern);
    if (m) {
      maxVersion = Math.max(maxVersion, parseInt(m[1], 10));
    }
  }

  const versionedName = `${base}_v${maxVersion + 1}${ext}`;
  fs.renameSync(filePath, path.join(dir, versionedName));
  console.error(`Versioned: ${fileName} -> ${versionedName}`);
}

export function artifactWriteCommand(
  name: string,
  options: { file?: string; keep?: boolean },
): void {
  const resolved = resolveArtifactName(name);
  const sessionDir = requireSessionDir();
  const dir = artifactsDir(sessionDir);
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, resolved);

  // Rotate existing artifact to versioned backup before overwriting
  rotateArtifact(dir, resolved);

  if (options.file) {
    if (!fs.existsSync(options.file)) {
      console.error(`Error: File '${options.file}' does not exist.`);
      process.exit(1);
    }
    // Use copyFileSync to support both text and binary files
    fs.copyFileSync(options.file, filePath);
    const stat = fs.statSync(filePath);
    console.error(`Written: ${resolved} (${stat.size} bytes)`);
    if (!options.keep) {
      fs.unlinkSync(options.file);
    }
  } else {
    // stdin: read as text
    const content = fs.readFileSync("/dev/stdin", "utf-8");
    fs.writeFileSync(filePath, content);
    console.error(`Written: ${resolved} (${content.length} bytes)`);
  }
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

export function artifactPathCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(artifactsDir(sessionDir), resolveArtifactName(name));

  if (!fs.existsSync(filePath)) {
    console.error(`Error: Artifact '${name}' does not exist yet.`);
    process.exit(1);
  }

  process.stdout.write(filePath);
}

export function artifactDeleteCommand(name: string): void {
  const sessionDir = requireSessionDir();
  const filePath = path.join(artifactsDir(sessionDir), resolveArtifactName(name));

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
