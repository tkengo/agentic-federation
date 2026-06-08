export interface UrlState {
  session: string | null;
  // All open tab paths per pane, plus which one is active. Tabs are stored as
  // repeated query params (e.g. ?artifact=a&artifact=b) so file paths never
  // need a separator that might collide with their contents.
  artifacts: string[];
  artifactActive: string | null;
  repos: string[];
  repoActive: string | null;
}

export function readUrlState(): UrlState {
  if (typeof window === "undefined") {
    return { session: null, artifacts: [], artifactActive: null, repos: [], repoActive: null };
  }
  const params = new URLSearchParams(window.location.search);
  const artifacts = params.getAll("artifact");
  const repos = params.getAll("repo");
  // Fall back to the active tab if no explicit active marker is present (e.g.
  // older single-tab URLs), so previously shared links keep working.
  return {
    session: params.get("session"),
    artifacts,
    artifactActive: params.get("artifactActive") ?? artifacts[artifacts.length - 1] ?? null,
    repos,
    repoActive: params.get("repoActive") ?? repos[repos.length - 1] ?? null,
  };
}

export function writeUrlState(state: UrlState): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state.session) params.set("session", state.session);
  for (const path of state.artifacts) params.append("artifact", path);
  for (const path of state.repos) params.append("repo", path);
  if (state.artifactActive) params.set("artifactActive", state.artifactActive);
  if (state.repoActive) params.set("repoActive", state.repoActive);
  const query = params.toString();
  const next = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, "", next);
  }
}
