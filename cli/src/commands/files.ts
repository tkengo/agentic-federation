import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { KNOWLEDGE_DIR } from "../lib/paths.js";
import { readConfig } from "./config.js";

const DEFAULT_LIMIT = 50;

/** Resolve the files storage directory from config or default. */
function filesDir(): string {
  const config = readConfig();
  const files = config["files"] as Record<string, unknown> | undefined;
  const dir = files?.["dir"] as string | undefined;
  return dir || KNOWLEDGE_DIR;
}

/** Generate filename: YYYYMMDD_<6hexID>_<name>.md */
function generateFileName(name: string): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  const id = crypto.randomBytes(3).toString("hex");
  const ext = path.extname(name) === "" ? ".md" : "";
  return `${date}_${id}_${name}${ext}`;
}

export function filesSaveCommand(
  name: string,
  options: { file?: string; keep?: boolean },
): void {
  const dir = filesDir();
  fs.mkdirSync(dir, { recursive: true });

  const fileName = generateFileName(name);
  const destPath = path.join(dir, fileName);

  if (options.file) {
    if (!fs.existsSync(options.file)) {
      console.error(`Error: File '${options.file}' does not exist.`);
      process.exit(1);
    }
    fs.copyFileSync(options.file, destPath);
    const stat = fs.statSync(destPath);
    console.error(`Saved: ${fileName} (${stat.size} bytes)`);
    if (!options.keep) {
      fs.unlinkSync(options.file);
    }
  } else {
    const content = fs.readFileSync("/dev/stdin", "utf-8");
    fs.writeFileSync(destPath, content);
    console.error(`Saved: ${fileName} (${content.length} bytes)`);
  }
}

export function filesReadCommand(name: string): void {
  const dir = filesDir();
  const filePath = resolveFile(dir, name);

  if (!filePath) {
    console.error(`Error: File '${name}' not found.`);
    process.exit(1);
  }

  process.stdout.write(fs.readFileSync(filePath, "utf-8"));
}

export function filesListCommand(options: {
  limit?: number;
  offset?: number;
}): void {
  const dir = filesDir();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? 0;

  if (!fs.existsSync(dir)) {
    console.log("Files:");
    console.log("  (none)");
    return;
  }

  // Sort by name (which starts with date, so oldest first)
  const allFiles = fs
    .readdirSync(dir)
    .filter((f) => fs.statSync(path.join(dir, f)).isFile())
    .sort();

  const total = allFiles.length;

  if (total === 0) {
    console.log("Files:");
    console.log("  (none)");
    return;
  }

  const paged = allFiles.slice(offset, offset + limit);

  console.log(`Files (${offset + 1}-${offset + paged.length} of ${total}):`);
  for (const file of paged) {
    const stat = fs.statSync(path.join(dir, file));
    const size = formatFileSize(stat.size);
    console.log(`  ${file.padEnd(50)} ${size.padStart(8)}`);
  }

  if (offset + limit < total) {
    console.log(
      `  ... ${total - offset - limit} more (use --offset ${offset + limit})`,
    );
  }
}

export function filesDirCommand(): void {
  console.log(filesDir());
}

/**
 * Resolve a file by exact filename or partial match (name part without date prefix).
 * Exact match takes priority. If no exact match, try suffix match.
 */
function resolveFile(dir: string, name: string): string | null {
  if (!fs.existsSync(dir)) return null;

  // Exact match
  const exact = path.join(dir, name);
  if (fs.existsSync(exact)) return exact;

  // Also try with .md appended
  const withMd = path.join(dir, name.endsWith(".md") ? name : name + ".md");
  if (fs.existsSync(withMd)) return withMd;

  // Suffix match: find files ending with _<name>.md or _<name>
  const files = fs.readdirSync(dir);
  const suffixPattern = `_${name}`;
  const suffixPatternMd = `_${name}.md`;

  const match = files.find(
    (f) => f.endsWith(suffixPattern) || f.endsWith(suffixPatternMd),
  );

  if (match) return path.join(dir, match);

  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
