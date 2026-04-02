import os from "node:os";

// Replace home directory prefix with ~/
export function shortenHome(filepath: string): string {
  const home = os.homedir();
  if (filepath === home) return "~";
  if (filepath.startsWith(home + "/")) return "~/" + filepath.slice(home.length + 1);
  return filepath;
}

// Format elapsed time as human-readable short string
export function formatAge(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = now - created;

  if (isNaN(created)) return "?";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

// Format created_at as "MM/DD HH:MM (age)"
export function formatCreated(createdAt: string): string {
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return "?";

  const mm = String(created.getMonth() + 1).padStart(2, "0");
  const dd = String(created.getDate()).padStart(2, "0");
  const hh = String(created.getHours()).padStart(2, "0");
  const min = String(created.getMinutes()).padStart(2, "0");
  const age = formatAge(createdAt);

  return `${mm}/${dd} ${hh}:${min} (${age})`;
}

// Format current time as HH:MM
export function formatTime(): string {
  const now = new Date();
  return [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join(":");
}
