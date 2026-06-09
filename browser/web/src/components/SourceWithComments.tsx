import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { RiAddLine } from "@remixicon/react";
import { fetchComments, saveComments, type LineComment } from "../api.ts";
import { highlightCodeLines } from "../markdown.ts";
import type { FileKind } from "./FileSearch.tsx";

interface Props {
  session: string;
  kind: FileKind;
  path: string;
  content: string;
  // Language for syntax highlighting the lines (null = plain text).
  lang: string | null;
  // Scroll position to restore for this file (used for tab-switch memory).
  initialScroll?: number;
  onScrollChange?: (top: number) => void;
}

// Imperative handle so the parent can scroll-sync this view with the preview.
export interface SourceHandle {
  scrollToLine: (line: number) => void;
  getTopLine: () => number | null;
}

function splitLines(content: string): string[] {
  const lines = content.split("\n");
  // Drop the trailing empty element produced by a final newline.
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

// A line-numbered source view that lets the user attach comments to individual
// lines, persist them as a draft, and submit them all to a chosen pane.
export const SourceWithComments = forwardRef<SourceHandle, Props>(function SourceWithComments(
  { session, kind, path, content, lang, initialScroll, onScrollChange },
  ref,
): React.ReactElement {
  const lines = useMemo(() => splitLines(content), [content]);
  const codeRef = useRef<HTMLDivElement>(null);

  const [lineHtml, setLineHtml] = useState<string[] | null>(null);

  const [comments, setComments] = useState<LineComment[]>([]);
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Syntax-highlight the content per line when a language is known.
  useEffect(() => {
    let cancelled = false;
    if (!lang) {
      setLineHtml(null);
      return;
    }
    highlightCodeLines(content, lang)
      .then((html) => {
        if (!cancelled) setLineHtml(html);
      })
      .catch(() => {
        if (!cancelled) setLineHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [content, lang]);

  // Restore the saved scroll position when the file changes.
  useLayoutEffect(() => {
    const el = codeRef.current;
    if (el) el.scrollTop = initialScroll ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Load the draft whenever the file changes.
  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setActiveLine(null);
    setEditingId(null);
    fetchComments(session, kind, path)
      .then((draft) => {
        if (!cancelled) setComments(draft.comments);
      })
      .catch(() => {
        // A missing draft is not an error; leave the list empty.
      });
    return () => {
      cancelled = true;
    };
  }, [session, kind, path]);

  // Expose scroll-sync helpers to the parent (used by the markdown toggle).
  useImperativeHandle(
    ref,
    () => ({
      scrollToLine(line: number): void {
        const el = codeRef.current;
        if (!el) return;
        const target = el.querySelector<HTMLElement>(`[data-line="${line}"]`);
        if (!target) return;
        el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top;
      },
      getTopLine(): number | null {
        const el = codeRef.current;
        if (!el) return null;
        const cTop = el.getBoundingClientRect().top;
        let line: number | null = null;
        for (const le of el.querySelectorAll<HTMLElement>("[data-line]")) {
          if (le.getBoundingClientRect().top - cTop <= 4) line = Number(le.dataset.line);
          else break;
        }
        return line;
      },
    }),
    [],
  );

  const persist = (next: LineComment[]): void => {
    setComments(next);
    setSaveError(null);
    saveComments(session, { kind, path, comments: next }).catch((err: unknown) => {
      setSaveError(err instanceof Error ? err.message : String(err));
    });
  };

  const byLine = useMemo(() => {
    const map = new Map<number, LineComment[]>();
    for (const c of comments) {
      const list = map.get(c.line);
      if (list) list.push(c);
      else map.set(c.line, [c]);
    }
    return map;
  }, [comments]);

  const openAdd = (line: number): void => {
    setActiveLine(line);
    setEditingId(null);
    setDraftText("");
  };

  const openEdit = (c: LineComment): void => {
    setActiveLine(c.line);
    setEditingId(c.id);
    setDraftText(c.text);
  };

  const cancelForm = (): void => {
    setActiveLine(null);
    setEditingId(null);
    setDraftText("");
  };

  const saveForm = (line: number): void => {
    const text = draftText.trim();
    if (!text) return;
    if (editingId) {
      persist(comments.map((c) => (c.id === editingId ? { ...c, text } : c)));
    } else {
      persist([...comments, { id: newId(), line, text, created_at: new Date().toISOString() }]);
    }
    cancelForm();
  };

  const remove = (id: string): void => {
    if (typeof window !== "undefined" && !window.confirm("このコメントを削除しますか？")) return;
    persist(comments.filter((c) => c.id !== id));
  };

  const onFormKeyDown = (e: React.KeyboardEvent, line: number): void => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveForm(line);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelForm();
    }
  };

  const renderForm = (line: number): React.ReactElement => (
    <div className="src-comment src-comment--form">
      <textarea
        className="src-comment__textarea"
        autoFocus
        value={draftText}
        placeholder="Comment on this line… (⌘/Ctrl+Enter to save, Esc to cancel)"
        onChange={(e) => setDraftText(e.target.value)}
        onKeyDown={(e) => onFormKeyDown(e, line)}
        rows={2}
      />
      <div className="src-comment__form-actions">
        <button type="button" className="src-comment__btn" onClick={cancelForm}>
          Cancel
        </button>
        <button
          type="button"
          className="src-comment__btn src-comment__btn--primary"
          onClick={() => saveForm(line)}
          disabled={!draftText.trim()}
        >
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="source-comments">
      <div className="source-comments__bar">
        <span className="source-comments__count">
          {comments.length} comment{comments.length === 1 ? "" : "s"} on this file
        </span>
        <span className="source-comments__hint">Send from the Comments panel ↗</span>
      </div>
      {saveError && (
        <div className="source-comments__status source-comments__status--error">
          Save failed: {saveError}
        </div>
      )}

      <div className="source-comments__code" ref={codeRef} onScroll={() => onScrollChange?.(codeRef.current?.scrollTop ?? 0)}>
        {lines.map((text, i) => {
          const ln = i + 1;
          const lineComments = byLine.get(ln) ?? [];
          const adding = activeLine === ln && editingId === null;
          const lh = lineHtml?.[i];
          return (
            <div className="src-line-group" key={ln}>
              <div className="src-line" data-line={ln}>
                <button
                  type="button"
                  className="src-line__num"
                  onClick={() => openAdd(ln)}
                  title="Add a comment on this line"
                >
                  {ln}
                </button>
                {lh != null ? (
                  <span className="src-line__text" dangerouslySetInnerHTML={{ __html: lh || " " }} />
                ) : (
                  <span className="src-line__text">{text === "" ? " " : text}</span>
                )}
                <button
                  type="button"
                  className="src-line__add"
                  onClick={() => openAdd(ln)}
                  aria-label={`Comment on line ${ln}`}
                  title="Add a comment"
                >
                  <RiAddLine size={13} />
                </button>
              </div>
              {lineComments.map((c) =>
                editingId === c.id ? (
                  <div key={c.id}>{renderForm(ln)}</div>
                ) : (
                  <div className="src-comment" key={c.id}>
                    <div className="src-comment__text">{c.text}</div>
                    <div className="src-comment__actions">
                      <button type="button" className="src-comment__btn" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <button type="button" className="src-comment__btn" onClick={() => remove(c.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ),
              )}
              {adding && renderForm(ln)}
            </div>
          );
        })}
      </div>
    </div>
  );
});
