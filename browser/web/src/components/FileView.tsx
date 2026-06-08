import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FileResponse } from "../api.ts";
import { highlightCode, langForFile, renderMarkdown } from "../markdown.ts";
import type { FileKind, FlatFile } from "./FileSearch.tsx";
import { findFileMatch } from "../lib/pathLink.ts";

const HIGHLIGHT_MAX_BYTES = 256 * 1024;

/**
 * Walk the rendered HTML and tag inline <code> elements whose text content
 * matches a known file path, so that they can be rendered as clickable links.
 * Returns an updated HTML string with class and data attributes baked in.
 */
function decorateHtml(html: string, flatFiles: FlatFile[]): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const codes = doc.querySelectorAll<HTMLElement>("code");
  for (const code of codes) {
    if (code.parentElement?.tagName === "PRE") continue;
    const text = code.textContent ?? "";
    const match = findFileMatch(text, flatFiles);
    if (match) {
      code.classList.add("clickable-path");
      code.dataset.kind = match.kind;
      code.dataset.filePath = match.path;
    }
  }
  return doc.body.innerHTML;
}

interface Props {
  file: FileResponse | null;
  loading: boolean;
  error: string | null;
  flatFiles: FlatFile[];
  onPathClick: (kind: FileKind, path: string) => void;
}

type RenderMode = "markdown" | "highlight" | "plain" | "image";

function detectMode(file: FileResponse): RenderMode {
  if (file.dataUrl) return "image";
  if (file.ext === ".md" || file.ext === ".markdown") return "markdown";
  if (file.size > HIGHLIGHT_MAX_BYTES) return "plain";
  return langForFile(file.name, file.ext) ? "highlight" : "plain";
}

export function FileView({ file, loading, error, flatFiles, onPathClick }: Props): React.ReactElement {
  const [html, setHtml] = useState<string>("");
  const mode: RenderMode = file ? detectMode(file) : "plain";

  // Remember each tab's scroll offset (keyed by file path) so switching tabs
  // returns to where the user left off instead of jumping to the top. The map
  // lives in a ref so it survives re-renders without triggering them.
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentPath = file?.path ?? null;

  const handleScroll = (): void => {
    const el = scrollRef.current;
    if (!el || !currentPath) return;
    scrollPositions.current.set(currentPath, el.scrollTop);
  };

  // Restore the saved offset after the active file or its rendered content
  // changes. Rendered markup (markdown/highlight) arrives asynchronously, so
  // this re-runs on `html` to restore once the content is actually in the DOM.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !currentPath) return;
    el.scrollTop = scrollPositions.current.get(currentPath) ?? 0;
  }, [currentPath, html, mode]);

  useEffect(() => {
    let cancelled = false;
    if (!file) {
      setHtml("");
      return;
    }
    if (mode === "markdown") {
      renderMarkdown(file.content).then((rendered) => {
        if (!cancelled) setHtml(decorateHtml(rendered, flatFiles));
      });
    } else if (mode === "highlight") {
      const lang = langForFile(file.name, file.ext);
      if (lang) {
        highlightCode(file.content, lang).then((rendered) => {
          if (!cancelled) setHtml(rendered);
        });
      } else {
        setHtml("");
      }
    } else {
      setHtml("");
    }
    return () => {
      cancelled = true;
    };
  }, [file, mode, flatFiles]);

  const handleClick = (e: React.MouseEvent<HTMLElement>): void => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(".clickable-path");
    if (!target) return;
    const kind = target.dataset.kind as FileKind | undefined;
    const path = target.dataset.filePath;
    if (kind && path) {
      e.preventDefault();
      onPathClick(kind, path);
    }
  };

  if (error) {
    return <div className="file-view file-view--error">Error: {error}</div>;
  }
  if (loading) {
    return <div className="file-view file-view--loading">Loading…</div>;
  }
  if (!file) {
    return (
      <div className="file-view file-view--empty">
        <p>Select a file from the tree on the left.</p>
      </div>
    );
  }

  return (
    <div className="file-view" ref={scrollRef} onScroll={handleScroll}>
      <div className="file-view__header">
        <span className="file-view__path">{file.path}</span>
        <span className="file-view__size">{formatSize(file.size)}</span>
      </div>
      {mode === "markdown" && (
        <article
          className="markdown-body file-view__markdown"
          dangerouslySetInnerHTML={{ __html: html }}
          onClick={handleClick}
        />
      )}
      {mode === "highlight" && (
        <div
          className="file-view__code"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {mode === "image" && (
        <div className="file-view__image">
          <img src={file.dataUrl} alt={file.name} />
        </div>
      )}
      {mode === "plain" && <pre className="file-view__plain">{file.content}</pre>}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
