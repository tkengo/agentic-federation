import fs from "node:fs";
import path from "node:path";

// ---- Template expansion ----

/** Resolve a dotted path like "repo.extra.dev_server" against a bindings object. */
function resolveBinding(keyPath: string, bindings: Record<string, unknown>): string {
  const parts = keyPath.split(".");
  let current: unknown = bindings;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return "";
  return String(current);
}

/** Expand {{path.to.value}} template variables in YAML content. */
export function expandTemplateVariables(
  yamlContent: string,
  bindings: Record<string, unknown>
): string {
  return yamlContent.replace(/\{\{([^}]+)\}\}/g, (_match, keyPath: string) => {
    return resolveBinding(keyPath.trim(), bindings);
  });
}

// ---- @include() expansion ----

// Regex patterns for @include directives
const RE_INCLUDE = /^@include\(([^)]+)\)\s*$/;
const RE_SLOT = /^@slot\(([a-zA-Z0-9-]+)\)\s*$/;
const RE_ENDSLOT = /^@endslot\s*$/;
const RE_ENDINCLUDE = /^@endinclude\s*$/;

/**
 * Read an included file with security checks.
 * Returns file content or null if rejected/missing.
 */
function readIncludeFile(filePath: string, baseDir: string): string | null {
  const trimmed = filePath.trim();

  // Security: reject absolute paths and path traversal
  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
    console.error(`Warning: @include path rejected (must be relative, no ..): ${trimmed}`);
    return null;
  }

  const resolved = path.resolve(baseDir, trimmed);
  if (!fs.existsSync(resolved)) {
    console.error(`Warning: @include file not found: ${resolved}`);
    return null;
  }
  return fs.readFileSync(resolved, "utf-8").trimEnd();
}

/**
 * Apply slot overrides to fragment content.
 * Replaces @slot(name)...@endslot blocks in the fragment with override content
 * or keeps the default content if no override is provided.
 */
function applySlotOverrides(
  fragmentContent: string,
  overrides: Record<string, string>,
  fragmentPath: string
): string {
  const lines = fragmentContent.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const slotMatch = lines[i].match(RE_SLOT);
    if (!slotMatch) {
      result.push(lines[i]);
      i++;
      continue;
    }

    const slotName = slotMatch[1];
    // Collect default content until @endslot
    const defaultLines: string[] = [];
    i++;
    while (i < lines.length && !RE_ENDSLOT.test(lines[i])) {
      defaultLines.push(lines[i]);
      i++;
    }
    // Skip @endslot line
    if (i < lines.length) i++;

    if (slotName in overrides) {
      // Use override content
      result.push(overrides[slotName]);
    } else if (defaultLines.length > 0) {
      // Use default content
      result.push(...defaultLines);
    } else {
      // No default and no override: warn and emit empty
      console.error(`Warning: slot "${slotName}" has no default and no override in ${fragmentPath}`);
    }
  }

  return result.join("\n");
}

/**
 * Expand @include() directives in agent instruction content.
 *
 * Supports two forms:
 * 1. Simple (single-line): `@include(path)` - replaced with file contents
 * 2. Block (with slots):
 *    ```
 *    @include(path)
 *    @slot(name)
 *    override content
 *    @endslot
 *    @endinclude
 *    ```
 *
 * Fragment files can define slots with default content:
 *    ```
 *    @slot(name)
 *    default content
 *    @endslot
 *    ```
 *
 * Nesting is not supported - @include() inside included files is ignored.
 * Paths are relative to baseDir (fed repo root).
 */
export function expandIncludes(
  content: string,
  baseDir: string
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const includeMatch = lines[i].match(RE_INCLUDE);
    if (!includeMatch) {
      result.push(lines[i]);
      i++;
      continue;
    }

    const filePath = includeMatch[1].trim();
    const includeLineIdx = i;
    i++;

    // Look ahead: is this a block include (with @slot/@endinclude)?
    const slotOverrides: Record<string, string> = {};
    let isBlock = false;
    const savedI = i;

    while (i < lines.length) {
      if (RE_ENDINCLUDE.test(lines[i])) {
        isBlock = true;
        i++; // skip @endinclude
        break;
      }

      const slotMatch = lines[i].match(RE_SLOT);
      if (slotMatch) {
        isBlock = true;
        const slotName = slotMatch[1];
        const slotLines: string[] = [];
        i++;
        while (i < lines.length && !RE_ENDSLOT.test(lines[i])) {
          slotLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip @endslot
        slotOverrides[slotName] = slotLines.join("\n");
        continue;
      }

      // Not a @slot or @endinclude: this is a simple include, rewind
      break;
    }

    if (!isBlock) {
      // Rewind - simple single-line include
      i = savedI;
    }

    // Read and expand the included file
    const fileContent = readIncludeFile(filePath, baseDir);
    if (fileContent === null) {
      const errorComment = path.isAbsolute(filePath) || filePath.includes("..")
        ? `<!-- @include rejected: ${filePath} -->`
        : `<!-- @include not found: ${filePath} -->`;
      result.push(errorComment);
      continue;
    }

    if (isBlock && Object.keys(slotOverrides).length > 0) {
      // Apply slot overrides to fragment content
      result.push(applySlotOverrides(fileContent, slotOverrides, filePath));
    } else {
      // No slots to override, just include as-is
      result.push(fileContent);
    }
  }

  return result.join("\n");
}

/**
 * Full compose pipeline for agent instructions:
 * 1. @include() expansion
 * 2. Template variable expansion ({{repo.*}}, {{meta.*}})
 */
export function composeAgentInstruction(
  content: string,
  fedRepoRoot: string,
  bindings: Record<string, unknown>
): string {
  let result = expandIncludes(content, fedRepoRoot);
  result = expandTemplateVariables(result, bindings);
  return result;
}

