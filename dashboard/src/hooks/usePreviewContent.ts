import { useState, useEffect } from "react";
import fs from "node:fs";
import path from "node:path";
import type { ScriptEntry } from "../components/DetailPanel.js";
import { REPOS_DIR } from "../utils/types.js";

export interface PreviewData {
  title: string;
  lines: string[];
  type: "script" | "none";
}

const MAX_PREVIEW_LINES = 200;

/**
 * Return preview content for the currently selected detail item.
 * - Script: reads script file (resolved from REPOS_DIR)
 */
export function usePreviewContent(
  scripts: ScriptEntry[],
  selectedIndex: number,
): PreviewData {
  const scriptCount = scripts.length;

  // Determine which item type is selected
  let selectedType: "script" | "none" = "none";
  let itemIndex = -1;

  if (selectedIndex < scriptCount) {
    selectedType = "script";
    itemIndex = selectedIndex;
  }

  // File-based preview (script)
  const [fileLines, setFileLines] = useState<string[]>([]);
  const [fileTitle, setFileTitle] = useState("");

  useEffect(() => {
    if (selectedType === "script") {
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
  }, [selectedType, itemIndex, scripts]);

  if (selectedType === "script") {
    return {
      title: fileTitle,
      lines: fileLines,
      type: "script",
    };
  }

  return { title: "", lines: [], type: "none" };
}
