import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readUrlState, writeUrlState } from "./lib/urlState.ts";
import {
  fetchFile,
  fetchSessions,
  fetchTree,
  type FileResponse,
  type SessionSummary,
  type TreeResponse,
} from "./api.ts";
import { Tooltip } from "@base-ui/react/tooltip";
import {
  RiMenuFoldLine,
  RiMenuUnfoldLine,
  RiArrowLeftDoubleLine,
  RiArrowRightDoubleLine,
  RiSplitCellsHorizontal,
} from "@remixicon/react";
import { SessionSelect } from "./components/SessionSelect.tsx";
import { FileTree } from "./components/FileTree.tsx";
import { FileView } from "./components/FileView.tsx";
import { FileSearch, flattenFiles, type FlatFile } from "./components/FileSearch.tsx";
import { TabBar } from "./components/TabBar.tsx";

type FileKind = "session" | "repo";

interface Tab {
  path: string;
  file: FileResponse | null;
  loading: boolean;
  error: string | null;
}

interface PaneState {
  tabs: Tab[];
  activePath: string | null;
}

const initialPaneState: PaneState = { tabs: [], activePath: null };

// localStorage key for the persisted artifact/code pane split percentage.
const SPLIT_KEY = "fed-browse-split";

function getActiveTab(pane: PaneState): Tab | null {
  if (!pane.activePath) return null;
  return pane.tabs.find((t) => t.path === pane.activePath) ?? null;
}

interface TitleWithTooltipProps {
  text: string;
  tooltip: string;
  withMargin?: boolean;
}

function TitleWithTooltip({ text, tooltip, withMargin }: TitleWithTooltipProps): React.ReactElement {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <h2
            className={`sidebar__title sidebar__title--tooltip${withMargin ? " sidebar__title--mt" : ""}`}
          />
        }
      >
        {text}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} side="right">
          <Tooltip.Popup className="bu-tooltip">{tooltip}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function App(): React.ReactElement {
  // Read the URL once so reload restores selection.
  const initialUrl = useMemo(() => readUrlState(), []);
  const pendingUrlRef = useRef({ artifact: initialUrl.artifact, repo: initialUrl.repo });

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(initialUrl.session);
  const [tree, setTree] = useState<TreeResponse | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [artifactPane, setArtifactPane] = useState<PaneState>(initialPaneState);
  const [repoPane, setRepoPane] = useState<PaneState>(initialPaneState);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Width of the artifact pane as a percentage of the content area. The code
  // pane fills the rest. Persisted so reloads keep the same split.
  const [split, setSplit] = useState<number>(() => {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SPLIT_KEY) : null;
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 50;
  });
  const [dragging, setDragging] = useState(false);
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    localStorage.setItem(SPLIT_KEY, String(split));
  }, [split]);

  // Drag the splitter: translate the pointer's x position within the content
  // area into a percentage and clamp it so the gutter stays grabbable.
  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const el = contentRef.current;
    if (!el) return;
    setDragging(true);
    const move = (ev: PointerEvent): void => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(97, Math.max(3, pct)));
    };
    const up = (): void => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  // Load sessions on mount, and refresh on SSE events
  useEffect(() => {
    let cancelled = false;

    const refresh = (): void => {
      fetchSessions()
        .then((list) => {
          if (cancelled) return;
          setSessions(list);
          setSelectedSession((current) => {
            // Preserve current selection if it still exists; else pick first.
            if (current && list.some((s) => s.name === current)) return current;
            return list[0]?.name ?? null;
          });
        })
        .catch((err: unknown) => {
          console.error(err);
        });
    };

    refresh();

    const source = new EventSource("/api/events");
    source.addEventListener("sessions", () => refresh());

    return () => {
      cancelled = true;
      source.close();
    };
  }, []);

  // Load tree when session changes
  useEffect(() => {
    if (!selectedSession) return;
    setTreeError(null);
    setTree(null);
    setArtifactPane(initialPaneState);
    setRepoPane(initialPaneState);
    fetchTree(selectedSession)
      .then(setTree)
      .catch((err: unknown) => {
        setTreeError(err instanceof Error ? err.message : String(err));
      });
  }, [selectedSession]);

  // Open a file in the given pane: switch to existing tab if it is already
  // open, otherwise add a new tab and fetch its content.
  const openTab = useCallback(
    (
      kind: FileKind,
      setPane: React.Dispatch<React.SetStateAction<PaneState>>,
      path: string,
    ) => {
      if (!selectedSession) return;

      setPane((p) => {
        const existing = p.tabs.find((t) => t.path === path);
        if (existing) {
          return { ...p, activePath: path };
        }
        return {
          tabs: [...p.tabs, { path, file: null, loading: true, error: null }],
          activePath: path,
        };
      });

      // Only fetch when the tab is new — existing tabs keep their content.
      let alreadyLoaded = false;
      setPane((p) => {
        const tab = p.tabs.find((t) => t.path === path);
        if (tab && tab.file) alreadyLoaded = true;
        return p;
      });
      if (alreadyLoaded) return;

      fetchFile(selectedSession, kind, path)
        .then((f) => {
          setPane((p) => ({
            ...p,
            tabs: p.tabs.map((t) =>
              t.path === path ? { ...t, file: f, loading: false, error: null } : t,
            ),
          }));
        })
        .catch((err: unknown) => {
          setPane((p) => ({
            ...p,
            tabs: p.tabs.map((t) =>
              t.path === path
                ? {
                    ...t,
                    file: null,
                    loading: false,
                    error: err instanceof Error ? err.message : String(err),
                  }
                : t,
            ),
          }));
        });
    },
    [selectedSession],
  );

  const handleSelectFile = useCallback(
    (kind: FileKind, path: string) => {
      if (kind === "session") {
        openTab("session", setArtifactPane, path);
      } else {
        openTab("repo", setRepoPane, path);
      }
    },
    [openTab],
  );

  const closeTab = useCallback(
    (
      setPane: React.Dispatch<React.SetStateAction<PaneState>>,
      path: string,
    ) => {
      setPane((p) => {
        const idx = p.tabs.findIndex((t) => t.path === path);
        if (idx < 0) return p;
        const nextTabs = p.tabs.filter((t) => t.path !== path);
        let nextActive = p.activePath;
        if (p.activePath === path) {
          const neighbour = nextTabs[idx] ?? nextTabs[idx - 1] ?? null;
          nextActive = neighbour ? neighbour.path : null;
        }
        return { tabs: nextTabs, activePath: nextActive };
      });
    },
    [],
  );

  const activateTab = useCallback(
    (
      setPane: React.Dispatch<React.SetStateAction<PaneState>>,
      path: string,
    ) => {
      setPane((p) => ({ ...p, activePath: path }));
    },
    [],
  );

  const flatFiles = useMemo<FlatFile[]>(() => {
    if (!tree) return [];
    return [
      ...flattenFiles(tree.session.tree, "session"),
      ...flattenFiles(tree.repo.tree, "repo"),
    ];
  }, [tree]);

  // Once the tree loads after a reload, apply any artifact/repo paths from the
  // URL so the previous state is restored. Consume the pending ref so it only
  // runs once per page load.
  useEffect(() => {
    if (!tree || !selectedSession) return;
    const pending = pendingUrlRef.current;
    if (!pending.artifact && !pending.repo) return;
    if (pending.artifact) openTab("session", setArtifactPane, pending.artifact);
    if (pending.repo) openTab("repo", setRepoPane, pending.repo);
    pendingUrlRef.current = { artifact: null, repo: null };
  }, [tree, selectedSession, openTab]);

  // Sync state to URL so reloads restore the same view.
  useEffect(() => {
    writeUrlState({
      session: selectedSession,
      artifact: artifactPane.activePath,
      repo: repoPane.activePath,
    });
  }, [selectedSession, artifactPane.activePath, repoPane.activePath]);

  // Global shortcut: 'o' opens the file search palette. Ignore when typing in
  // form fields or when a modifier key is held.
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key !== "o" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      if (!tree) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tree]);

  // Standalone sessions have no worktree; the second tree shows the session dir.
  const isStandalone = !sessions.find((s) => s.name === selectedSession)?.worktree;

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          type="button"
          className="app-header__icon-btn"
          aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          onClick={() => setSidebarOpen((v) => !v)}
        >
          {sidebarOpen ? <RiMenuFoldLine size={18} /> : <RiMenuUnfoldLine size={18} />}
        </button>
        <h1>fed browse</h1>
        <SessionSelect
          sessions={sessions}
          value={selectedSession}
          onChange={setSelectedSession}
        />
      </header>
      <div className="app-body">
        <aside className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`}>
          <section className="sidebar__section sidebar__section--scroll">
            {treeError && <div className="empty">Error: {treeError}</div>}
            {tree && (
              <Tooltip.Provider delay={300}>
                <TitleWithTooltip text="Artifacts" tooltip={tree.session.root} />
                <FileTree
                  nodes={tree.session.tree}
                  selectedPath={artifactPane.activePath}
                  onSelectFile={(p) => handleSelectFile("session", p)}
                />
                {tree.repo.root && (
                  <>
                    <TitleWithTooltip
                      text={isStandalone ? "Session files" : "Repo files"}
                      tooltip={tree.repo.root}
                      withMargin
                    />
                    <FileTree
                      nodes={tree.repo.tree}
                      selectedPath={repoPane.activePath}
                      onSelectFile={(p) => handleSelectFile("repo", p)}
                    />
                  </>
                )}
              </Tooltip.Provider>
            )}
          </section>
        </aside>
        <main className={`content${dragging ? " content--dragging" : ""}`} ref={contentRef}>
          <PaneRenderer
            label="ARTIFACT"
            modifier="artifact"
            basis={split}
            pane={artifactPane}
            flatFiles={flatFiles}
            onPathClick={handleSelectFile}
            onActivate={(p) => activateTab(setArtifactPane, p)}
            onClose={(p) => closeTab(setArtifactPane, p)}
          />
          <Splitter
            onResizeStart={startDrag}
            onCollapseLeft={() => setSplit(0)}
            onReset={() => setSplit(50)}
            onCollapseRight={() => setSplit(100)}
          />
          <PaneRenderer
            label="CODE"
            modifier="repo"
            basis={100 - split}
            pane={repoPane}
            flatFiles={flatFiles}
            onPathClick={handleSelectFile}
            onActivate={(p) => activateTab(setRepoPane, p)}
            onClose={(p) => closeTab(setRepoPane, p)}
          />
        </main>
      </div>
      {tree && (
        <FileSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          sessionTree={tree.session.tree}
          repoTree={tree.repo.tree}
          onSelect={handleSelectFile}
        />
      )}
    </div>
  );
}

interface SplitterProps {
  onResizeStart: (e: React.PointerEvent) => void;
  onCollapseLeft: () => void;
  onReset: () => void;
  onCollapseRight: () => void;
}

// Draggable gutter between the two panes, with controls to maximize either
// side or restore an even 50/50 split.
function Splitter({
  onResizeStart,
  onCollapseLeft,
  onReset,
  onCollapseRight,
}: SplitterProps): React.ReactElement {
  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onResizeStart}
    >
      {/* Stop pointerdown here so clicking a control does not start a drag. */}
      <div className="splitter__controls" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="splitter__btn"
          aria-label="Maximize code pane"
          title="Maximize code pane"
          onClick={onCollapseLeft}
        >
          <RiArrowLeftDoubleLine size={14} />
        </button>
        <button
          type="button"
          className="splitter__btn"
          aria-label="Reset to 50/50"
          title="Reset to 50/50"
          onClick={onReset}
        >
          <RiSplitCellsHorizontal size={14} />
        </button>
        <button
          type="button"
          className="splitter__btn"
          aria-label="Maximize artifact pane"
          title="Maximize artifact pane"
          onClick={onCollapseRight}
        >
          <RiArrowRightDoubleLine size={14} />
        </button>
      </div>
    </div>
  );
}

interface PaneRendererProps {
  label: string;
  modifier: "artifact" | "repo";
  basis: number;
  pane: PaneState;
  flatFiles: FlatFile[];
  onPathClick: (kind: FileKind, path: string) => void;
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}

function PaneRenderer({
  label,
  modifier,
  basis,
  pane,
  flatFiles,
  onPathClick,
  onActivate,
  onClose,
}: PaneRendererProps): React.ReactElement {
  const active = getActiveTab(pane);
  return (
    <section className={`pane pane--${modifier}`} style={{ flex: `0 1 ${basis}%` }}>
      <div className="pane__label">{label}</div>
      <TabBar
        tabs={pane.tabs.map((t) => ({
          path: t.path,
          loading: t.loading,
          hasError: t.error !== null,
        }))}
        activePath={pane.activePath}
        onActivate={onActivate}
        onClose={onClose}
      />
      <FileView
        file={active?.file ?? null}
        loading={active?.loading ?? false}
        error={active?.error ?? null}
        flatFiles={flatFiles}
        onPathClick={onPathClick}
      />
    </section>
  );
}
