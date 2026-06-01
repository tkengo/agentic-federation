import type { FlatFile } from "../components/FileSearch.tsx";

/**
 * Try to resolve a text snippet to a known file. Returns a match only when it
 * is unique to avoid false-positive linking (e.g. ambiguous suffixes).
 *
 * Resolution order:
 *   1. Exact path equality.
 *   2. Suffix match where `file.path` ends with `/<text>`.
 *
 * @returns the unique matching file, or null if there is no match or it is ambiguous.
 */
export function findFileMatch(text: string, files: FlatFile[]): FlatFile | null {
  const trimmed = text.trim();
  if (trimmed.length < 3) return null;
  // Quick filter: a path-like token must contain a slash or a dot.
  if (!trimmed.includes("/") && !trimmed.includes(".")) return null;

  const exact = files.filter((f) => f.path === trimmed);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const suffix = files.filter((f) => f.path.endsWith(`/${trimmed}`));
  if (suffix.length === 1) return suffix[0];
  return null;
}
