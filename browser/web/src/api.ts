export interface SessionSummary {
  name: string;
  session_dir: string;
  worktree: string;
  repo: string;
  branch: string;
  workflow: string;
  created_at: string;
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
