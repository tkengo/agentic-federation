export interface UrlState {
  session: string | null;
  artifact: string | null;
  repo: string | null;
}

export function readUrlState(): UrlState {
  if (typeof window === "undefined") {
    return { session: null, artifact: null, repo: null };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    session: params.get("session"),
    artifact: params.get("artifact"),
    repo: params.get("repo"),
  };
}

export function writeUrlState(state: UrlState): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  if (state.session) params.set("session", state.session);
  if (state.artifact) params.set("artifact", state.artifact);
  if (state.repo) params.set("repo", state.repo);
  const query = params.toString();
  const next = query
    ? `${window.location.pathname}?${query}`
    : window.location.pathname;
  if (`${window.location.pathname}${window.location.search}` !== next) {
    window.history.replaceState(null, "", next);
  }
}
