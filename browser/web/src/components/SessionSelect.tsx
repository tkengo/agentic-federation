import { Select } from "@base-ui/react/select";
import type { SessionSummary } from "../api.ts";

interface Props {
  sessions: SessionSummary[];
  value: string | null;
  onChange: (name: string) => void;
}

export function SessionSelect({ sessions, value, onChange }: Props): React.ReactElement {
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
              {sessions.map((s) => (
                <Select.Item key={s.name} value={s.name} className="bu-select-item">
                  <Select.ItemIndicator className="bu-select-item-indicator">
                    •
                  </Select.ItemIndicator>
                  <Select.ItemText className="bu-select-item-text">
                    <span className="bu-select-item-name">{s.name}</span>
                    <span className="bu-select-item-meta">
                      {s.workflow}
                      {s.repo ? ` · ${s.repo}` : ""}
                    </span>
                    {s.description && (
                      <span className="bu-select-item-desc">{s.description}</span>
                    )}
                  </Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
