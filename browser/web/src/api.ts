export interface SessionSummary {
  name: string;
  session_dir: string;
  worktree: string;
  repo: string;
  branch: string;
  workflow: string;
  created_at: string;
  description?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
}

export interface TreeResponse {
  session: { root: string; tree: TreeNode[] };
  repo: { root: string; tree: TreeNode[] };
}

export interface FileResponse {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  content: string;
  // Present only for image files: MIME type and a base64 data URL for <img> rendering.
  mime?: string;
  dataUrl?: string;
}

export interface PaneInfo {
  id: string;
  windowIndex: number;
  windowName: string;
  paneIndex: number;
  active: boolean;
  command: string;
  title: string;
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const data = (await res.json()) as { sessions: SessionSummary[] };
  return data.sessions;
}

export async function fetchTree(session: string): Promise<TreeResponse> {
  const res = await fetch(`/api/tree/${encodeURIComponent(session)}`);
  if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
  return (await res.json()) as TreeResponse;
}

export async function fetchFile(
  session: string,
  kind: "session" | "repo",
  filePath: string,
): Promise<FileResponse> {
  const params = new URLSearchParams({ kind, path: filePath });
  const res = await fetch(`/api/file/${encodeURIComponent(session)}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  return (await res.json()) as FileResponse;
}

export interface LineComment {
  id: string;
  line: number;
  text: string;
  created_at: string;
}

export interface CommentDraft {
  kind: "session" | "repo";
  path: string;
  comments: LineComment[];
}

export interface DraftSummary {
  kind: "session" | "repo";
  path: string;
  count: number;
}

export async function fetchComments(
  session: string,
  kind: "session" | "repo",
  filePath: string,
): Promise<CommentDraft> {
  const params = new URLSearchParams({ kind, path: filePath });
  const res = await fetch(`/api/comments/${encodeURIComponent(session)}?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch comments: ${res.status}`);
  return (await res.json()) as CommentDraft;
}

// Replace the whole draft for a file. An empty comments array clears it.
export async function saveComments(session: string, draft: CommentDraft): Promise<CommentDraft> {
  const res = await fetch(`/api/comments/${encodeURIComponent(session)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  });
  if (!res.ok) throw new Error(`Failed to save comments: ${res.status}`);
  return (await res.json()) as CommentDraft;
}

// List a summary of every draft in the session (which files have comments).
export async function fetchDraftList(session: string): Promise<DraftSummary[]> {
  const res = await fetch(`/api/comments/${encodeURIComponent(session)}`);
  if (!res.ok) throw new Error(`Failed to fetch drafts: ${res.status}`);
  const data = (await res.json()) as { drafts: DraftSummary[] };
  return data.drafts;
}

// Send an optional message plus every draft in the session to a pane as one
// message, and mark all drafts posted.
export async function submitAllComments(
  session: string,
  target: string,
  message: string,
): Promise<{ count: number; files: number }> {
  const res = await fetch(`/api/comments/${encodeURIComponent(session)}/submit-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, message }),
  });
  if (!res.ok) {
    let msg = `Failed to submit comments: ${res.status}`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      // Non-JSON error response; keep the status-based message.
    }
    throw new Error(msg);
  }
  return (await res.json()) as { count: number; files: number };
}

export async function fetchPanes(session: string): Promise<PaneInfo[]> {
  const res = await fetch(`/api/panes/${encodeURIComponent(session)}`);
  if (!res.ok) throw new Error(`Failed to fetch panes: ${res.status}`);
  const data = (await res.json()) as { panes: PaneInfo[] };
  return data.panes;
}

export interface GitLink {
  kind: "pr" | "branch" | "none";
  url?: string;
}

// Resolve the GitHub web link for a repo-relative file (open PR diff if any,
// else the file on its branch).
export async function fetchGitLink(session: string, filePath: string): Promise<GitLink> {
  const params = new URLSearchParams({ path: filePath });
  const res = await fetch(`/api/git-link/${encodeURIComponent(session)}?${params}`);
  if (!res.ok) throw new Error(`Failed to resolve GitHub link: ${res.status}`);
  return (await res.json()) as GitLink;
}
