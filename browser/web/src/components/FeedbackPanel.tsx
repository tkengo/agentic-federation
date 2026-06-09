import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RiCloseLine, RiRefreshLine, RiSendPlaneFill } from "@remixicon/react";
import { fetchDraftList, submitAllComments, type DraftSummary } from "../api.ts";
import type { FileKind } from "./FileSearch.tsx";
import { PaneSelect } from "./PaneSelect.tsx";

interface Props {
  session: string;
  // The header button to anchor the panel under.
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  onOpenFile: (kind: FileKind, path: string) => void;
  // Called after submit clears the drafts, so the header badge can update.
  onChanged: () => void;
}

type Status = "idle" | "sending" | "sent" | "error";

// Unified feedback panel (GitHub review style): submit the session's line
// comments together with an optional free-form message, in one delivery. Either
// part may be empty, but not both.
export function FeedbackPanel({ session, anchorRef, onClose, onOpenFile, onChanged }: Props): React.ReactElement {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [target, setTarget] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Anchor the panel just below the button that opened it, left-aligned to it,
  // clamped so a near-the-edge button does not push the panel off-screen.
  const PANEL_WIDTH = 380;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8));
    setPos({ top: r.bottom + 6, left });
  }, [anchorRef]);

  const load = useCallback(() => {
    fetchDraftList(session)
      .then(setDrafts)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const total = drafts.reduce((n, d) => n + d.count, 0);
  const canSubmit = !!target && (total > 0 || message.trim().length > 0) && status !== "sending";

  const submit = (): void => {
    if (!canSubmit || !target) return;
    setStatus("sending");
    setError(null);
    submitAllComments(session, target, message)
      .then(() => {
        setDrafts([]);
        setMessage("");
        setStatus("sent");
        onChanged();
      })
      .catch((err: unknown) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <>
      <div className="feedback-overlay" onClick={onClose} />
      <div
        className="feedback-panel"
        role="dialog"
        aria-label="Send feedback"
        style={pos ? { top: pos.top, left: pos.left, right: "auto" } : undefined}
      >
        <div className="feedback-panel__header">
          <span className="feedback-panel__title">Send feedback</span>
          <button
            type="button"
            className="feedback-panel__icon-btn"
            onClick={load}
            title="Reload comments"
            aria-label="Reload comments"
          >
            <RiRefreshLine size={16} />
          </button>
          <button
            type="button"
            className="feedback-panel__icon-btn"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            <RiCloseLine size={16} />
          </button>
        </div>

        {drafts.length > 0 && (
          <>
            <span className="feedback-panel__label">
              Review comments ({total} on {drafts.length} file{drafts.length === 1 ? "" : "s"})
            </span>
            <div className="comments-panel__list">
              {drafts.map((d) => (
                <button
                  type="button"
                  key={`${d.kind}:${d.path}`}
                  className="comments-panel__file"
                  onClick={() => {
                    onOpenFile(d.kind, d.path);
                    onClose();
                  }}
                  title={`Open ${d.path}`}
                >
                  <span className="comments-panel__file-path">{d.path}</span>
                  <span className="comments-panel__file-count">{d.count}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <span className="feedback-panel__label">Message</span>
        <textarea
          ref={textareaRef}
          className="feedback-panel__textarea"
          placeholder={
            drafts.length > 0
              ? "Optional message to send along with the comments… (⌘/Ctrl+Enter to submit)"
              : "Message to send to the pane… (⌘/Ctrl+Enter to submit)"
          }
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          onKeyDown={onKeyDown}
          rows={4}
        />

        <span className="feedback-panel__label">Target pane</span>
        <PaneSelect session={session} value={target} onChange={setTarget} />

        <div className="feedback-panel__footer">
          <span className={`feedback-panel__status feedback-panel__status--${status}`}>
            {status === "sending" && "Submitting…"}
            {status === "sent" && "Submitted ✓"}
            {status === "error" && (error ?? "Submit failed")}
            {status === "idle" && error}
          </span>
          <button
            type="button"
            className="feedback-panel__send"
            onClick={submit}
            disabled={!canSubmit}
          >
            <RiSendPlaneFill size={14} />
            {total > 0 ? `Submit (${total})` : "Send"}
          </button>
        </div>
      </div>
    </>
  );
}
