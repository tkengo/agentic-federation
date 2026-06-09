import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { RiGithubFill } from "@remixicon/react";
import { fetchGitLink, type FileResponse } from "../api.ts";
import { highlightCode, langForFile, renderMarkdown } from "../markdown.ts";
import type { FileKind, FlatFile } from "./FileSearch.tsx";
import { findFileMatch } from "../lib/pathLink.ts";
import { SourceWithComments, type SourceHandle } from "./SourceWithComments.tsx";

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
  // The active session and which tree this file belongs to — needed to load
  // and submit line comments in source view.
  session: string | null;
  kind: FileKind;
  // Called when line comments are added/removed so the header badge can update.
  onCommentsChanged: () => void;
}

type RenderMode = "markdown" | "highlight" | "plain" | "image";

function detectMode(file: FileResponse): RenderMode {
  if (file.dataUrl) return "image";
  if (file.ext === ".md" || file.ext === ".markdown") return "markdown";
  if (file.size > HIGHLIGHT_MAX_BYTES) return "plain";
  return langForFile(file.name, file.ext) ? "highlight" : "plain";
}

export function FileView({ file, loading, error, flatFiles, onPathClick, session, kind, onCommentsChanged }: Props): React.ReactElement {
  const [html, setHtml] = useState<string>("");
  const [viewMode, setViewMode] = useState<"preview" | "source">("preview");
  const [ghLoading, setGhLoading] = useState(false);
  const mode: RenderMode = file ? detectMode(file) : "plain";

  // Remember each tab's scroll offset (keyed by file path) so switching tabs
  // returns to where the user left off instead of jumping to the top. The map
  // lives in a ref so it survives re-renders without triggering them.
  // Preview scroll offsets, keyed by file path, kept separately from the source
  // view's so each mode restores its own position. Refs survive re-renders.
  const scrollPositions = useRef<Map<string, number>>(new Map());
  const sourceScroll = useRef<Map<string, number>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<SourceHandle>(null);
  const syncTargetRef = useRef<number | null>(null);
  const currentPath = file?.path ?? null;

  // Default back to preview whenever the active file changes.
  useEffect(() => {
    setViewMode("preview");
  }, [currentPath]);

  // Line comments only make sense for text files in a known session.
  const canComment = !!file && !!session && mode !== "image";
  const isMarkdown = mode === "markdown";
  // Code/plain files render the same with or without highlighting, so they are
  // always shown in the commentable line view (no toggle needed). Only markdown
  // — which renders differently as preview vs. source — gets a toggle.
  const commentInline = canComment && !isMarkdown;
  const markdownSource = canComment && isMarkdown && viewMode === "source";
  const showSource = commentInline || markdownSource;
  const showToggle = canComment && isMarkdown;
  // Only repo (CODE pane) files have a GitHub counterpart.
  const showGithub = !!file && !!session && kind === "repo";

  const openGithub = async (): Promise<void> => {
    if (!session || !file) return;
    setGhLoading(true);
    try {
      const link = await fetchGitLink(session, file.path);
      if (link.url) window.open(link.url, "_blank", "noopener,noreferrer");
      else window.alert("GitHub のリンクが見つかりませんでした（リモート未設定かもしれません）。");
    } catch {
      window.alert("GitHub のリンク取得に失敗しました。");
    } finally {
      setGhLoading(false);
    }
  };

  const handleScroll = (): void => {
    // The source view manages its own scroll container, so only record the
    // preview offset here.
    if (showSource) return;
    const el = scrollRef.current;
    if (!el || !currentPath) return;
    scrollPositions.current.set(currentPath, el.scrollTop);
  };

  // Restore the saved preview offset after the active file, its rendered
  // content, or the view mode changes. Rendered markup (markdown/highlight)
  // arrives asynchronously, so this re-runs on `html` to restore once the
  // content is actually in the DOM. Skipped in source view (it scrolls itself).
  useLayoutEffect(() => {
    if (showSource) return;
    const el = scrollRef.current;
    if (!el || !currentPath) return;
    el.scrollTop = scrollPositions.current.get(currentPath) ?? 0;
  }, [currentPath, html, mode, showSource]);

  // The source line currently at the top of the markdown preview, derived from
  // the data-source-line attributes markdown-it emits on each block.
  const previewTopLine = (): number | null => {
    const container = scrollRef.current;
    if (!container) return null;
    const cTop = container.getBoundingClientRect().top;
    let line: number | null = null;
    for (const el of container.querySelectorAll<HTMLElement>("[data-source-line]")) {
      if (el.getBoundingClientRect().top - cTop <= 4) line = Number(el.dataset.sourceLine);
      else break;
    }
    return line;
  };

  const scrollPreviewToLine = (line: number): void => {
    const container = scrollRef.current;
    if (!container) return;
    let target: HTMLElement | null = null;
    for (const el of container.querySelectorAll<HTMLElement>("[data-source-line]")) {
      if (Number(el.dataset.sourceLine) <= line) target = el;
      else break;
    }
    if (!target) return;
    container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top;
  };

  // Toggle markdown view, capturing the logical line at the top of the view we
  // are leaving so the new view can be scrolled to the same place.
  const switchMode = (next: "preview" | "source"): void => {
    if (next === viewMode) return;
    syncTargetRef.current =
      viewMode === "preview" ? previewTopLine() : (sourceRef.current?.getTopLine() ?? null);
    setViewMode(next);
  };

  // After a markdown toggle, scroll the now-visible view to the captured line.
  // Declared after the preview-restore effect so it runs last and wins.
  useLayoutEffect(() => {
    if (!isMarkdown) return;
    const line = syncTargetRef.current;
    if (line == null) return;
    syncTargetRef.current = null;
    if (viewMode === "source") sourceRef.current?.scrollToLine(line);
    else scrollPreviewToLine(line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

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
        <div className="file-view__header-right">
          {showToggle && (
            <div className="file-view__viewtoggle" role="group" aria-label="View mode">
              <button
                type="button"
                className={`file-view__viewtoggle-btn${viewMode === "preview" ? " is-active" : ""}`}
                onClick={() => switchMode("preview")}
              >
                Preview
              </button>
              <button
                type="button"
                className={`file-view__viewtoggle-btn${viewMode === "source" ? " is-active" : ""}`}
                onClick={() => switchMode("source")}
              >
                Source
              </button>
            </div>
          )}
          <span className="file-view__size">{formatSize(file.size)}</span>
          {showGithub && (
            <button
              type="button"
              className="file-view__gh"
              onClick={openGithub}
              disabled={ghLoading}
              title="Open on GitHub (PR diff, or the file on its branch)"
              aria-label="Open on GitHub"
            >
              <RiGithubFill size={16} />
            </button>
          )}
        </div>
      </div>
      {showSource && session ? (
        <SourceWithComments
          ref={sourceRef}
          session={session}
          kind={kind}
          path={file.path}
          content={file.content}
          lang={mode === "highlight" ? langForFile(file.name, file.ext) : null}
          initialScroll={sourceScroll.current.get(file.path) ?? 0}
          onScrollChange={(top) => sourceScroll.current.set(file.path, top)}
          onCommentsChanged={onCommentsChanged}
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
