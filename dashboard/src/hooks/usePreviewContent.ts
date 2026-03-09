import { useState, useEffect } from "react";
import fs from "node:fs";
import path from "node:path";
import type { ArtifactEntry } from "../components/ArtifactList.js";
import type { ScriptEntry, PaneEntry } from "../components/DetailPanel.js";
import { REPOS_DIR } from "../utils/types.js";
import { usePaneCapture } from "./usePaneCapture.js";

export interface PreviewData {
  title: string;
  lines: string[];
  type: "artifact" | "script" | "pane" | "none";
}

const MAX_PREVIEW_LINES = 200;

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico", ".tiff", ".tif",
]);

/**
 * Return preview content for the currently selected detail item.
 * - Artifact: reads file from <sessionDir>/artifacts/<name>
 * - Script: reads script file (resolved from REPOS_DIR)
 * - Pane: uses tmux capture-pane via usePaneCapture hook
 */
export function usePreviewContent(
  sessionDir: string,
  artifacts: ArtifactEntry[],
  scripts: ScriptEntry[],
  panes: PaneEntry[],
  selectedIndex: number,
): PreviewData {
  const artifactCount = artifacts.length;
  const scriptCount = scripts.length;

  // Determine which item type is selected
  let selectedType: "artifact" | "script" | "pane" | "none" = "none";
  let itemIndex = -1;

  if (selectedIndex < artifactCount) {
    selectedType = "artifact";
    itemIndex = selectedIndex;
  } else if (selectedIndex < artifactCount + scriptCount) {
    selectedType = "script";
    itemIndex = selectedIndex - artifactCount;
  } else if (selectedIndex < artifactCount + scriptCount + panes.length) {
    selectedType = "pane";
    itemIndex = selectedIndex - artifactCount - scriptCount;
  }

  // Pane capture (only active when a pane is selected)
  const paneTarget = selectedType === "pane"
    ? panes[itemIndex]?.tmuxTarget ?? null
    : null;
  const paneLines = usePaneCapture(paneTarget);

  // File-based preview (artifact / script)
  const [fileLines, setFileLines] = useState<string[]>([]);
  const [fileTitle, setFileTitle] = useState("");

  useEffect(() => {
    if (selectedType === "artifact") {
      const artifact = artifacts[itemIndex];
      if (!artifact) {
        setFileLines([]);
        setFileTitle("");
        return;
      }
      const ext = path.extname(artifact.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        setFileLines(["", "🖼  Image file — preview not available"]);
        setFileTitle(artifact.name);
        return;
      }
      const filePath = path.join(sessionDir, "artifacts", artifact.name);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        setFileLines(content.split("\n").slice(0, MAX_PREVIEW_LINES));
        setFileTitle(artifact.name);
      } catch {
        setFileLines(["(read error)"]);
        setFileTitle(artifact.name);
      }
    } else if (selectedType === "script") {
      const script = scripts[itemIndex];
      if (!script) {
        setFileLines([]);
        setFileTitle("");
        return;
      }
      // Resolve script path (relative paths resolve from REPOS_DIR)
      const scriptPath = path.isAbsolute(script.path)
        ? script.path
        : path.resolve(REPOS_DIR, script.path);
      try {
        const content = fs.readFileSync(scriptPath, "utf-8");
        setFileLines(content.split("\n").slice(0, MAX_PREVIEW_LINES));
        setFileTitle(script.name);
      } catch {
        setFileLines(["(read error)"]);
        setFileTitle(script.name);
      }
    } else {
      setFileLines([]);
      setFileTitle("");
    }
  }, [selectedType, itemIndex, sessionDir, artifacts, scripts]);

  if (selectedType === "pane") {
    const pane = panes[itemIndex];
    return {
      title: pane?.displayName ?? "",
      lines: paneLines,
      type: "pane",
    };
  }

  if (selectedType === "artifact" || selectedType === "script") {
    return {
      title: fileTitle,
      lines: fileLines,
      type: selectedType,
    };
  }

  return { title: "", lines: [], type: "none" };
}
