import { Select } from "@base-ui/react/select";
import type { SessionSummary } from "../api.ts";

interface Props {
  sessions: SessionSummary[];
  value: string | null;
  onChange: (name: string) => void;
}

const NO_REPO_LABEL = "(no repo)";

// Group sessions by repo, sorting both the groups and the sessions within them by name.
function groupByRepo(sessions: SessionSummary[]): Array<[string, SessionSummary[]]> {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    const key = s.repo || NO_REPO_LABEL;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repo, list]) => [
      repo,
      [...list].sort((a, b) => a.name.localeCompare(b.name)),
    ]);
}

export function SessionSelect({ sessions, value, onChange }: Props): React.ReactElement {
  const grouped = groupByRepo(sessions);

  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <Select.Trigger className="bu-select-trigger" aria-label="Active session">
        <Select.Value className="bu-select-value">
          {value ?? "Select session…"}
        </Select.Value>
        <Select.Icon className="bu-select-icon">▾</Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="bu-select-positioner" sideOffset={6}>
          <Select.Popup className="bu-select-popup">
            <Select.List>
              {sessions.length === 0 && (
                <div className="bu-select-empty">No active sessions</div>
              )}
              {grouped.map(([repo, items]) => (
                <Select.Group key={repo} className="bu-select-group">
                  <Select.GroupLabel className="bu-select-group-label">
                    {repo}
                  </Select.GroupLabel>
                  {items.map((s) => (
                    <Select.Item key={s.name} value={s.name} className="bu-select-item">
                      <Select.ItemIndicator className="bu-select-item-indicator">
                        •
                      </Select.ItemIndicator>
                      <Select.ItemText className="bu-select-item-text">
                        <span className="bu-select-item-head">
                          <span className="bu-select-item-name">{s.name}</span>
                          <span className="bu-select-item-meta">{s.workflow}</span>
                        </span>
                        {s.description && (
                          <span className="bu-select-item-desc">{s.description}</span>
                        )}
                      </Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
