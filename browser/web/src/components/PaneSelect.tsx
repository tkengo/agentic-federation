import { useEffect, useRef, useState } from "react";
import { Select } from "@base-ui/react/select";
import { RiRefreshLine } from "@remixicon/react";
import { fetchPanes, type PaneInfo } from "../api.ts";
import { paneDescriptor, paneLabel, paneRole, pickDefault } from "../lib/panes.ts";

interface Props {
  session: string;
  value: string | null;
  onChange: (id: string) => void;
}

// A pane picker for the given session. Loads the session's panes on mount and
// when the session changes, defaulting the selection if none is chosen yet.
// Used by both the feedback panel and the line-comment submit bar.
export function PaneSelect({ session, value, onChange }: Props): React.ReactElement {
  const [panes, setPanes] = useState<PaneInfo[]>([]);
  // Default to agent panes only (planner/implementer/reviewer/codex, etc.);
  // the user can reveal shells/editors with the "All" toggle.
  const [showAll, setShowAll] = useState(false);

  // Keep the latest value/onChange reachable from the session effect without
  // making it re-run (and re-fetch) on every selection change.
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = (): void => {
    fetchPanes(session)
      .then((list) => {
        setPanes(list);
        const cur = valueRef.current;
        if (!(cur && list.some((p) => p.id === cur))) {
          const def = pickDefault(list, session);
          if (def) onChangeRef.current(def);
        }
      })
      .catch(() => setPanes([]));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // The selection label is looked up across all panes so it stays visible even
  // when the chosen pane is filtered out of the dropdown list.
  const selected = panes.find((p) => p.id === value);

  const agentPanes = panes.filter((p) => paneRole(p, session) !== null);
  // When there are no agent panes, fall back to showing everything so the list
  // is never empty just because of the filter.
  const visible = showAll || agentPanes.length === 0 ? panes : agentPanes;
  const canToggle = agentPanes.length > 0 && panes.length > agentPanes.length;

  return (
    <div className="pane-select">
      <Select.Root
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
      >
        <Select.Trigger className="bu-select-trigger pane-select__trigger" aria-label="Target pane">
          <Select.Value className="bu-select-value">
            {selected ? paneLabel(selected, session) : panes.length ? "Select pane…" : "No panes"}
          </Select.Value>
          <Select.Icon className="bu-select-icon">▾</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner className="bu-select-positioner" sideOffset={6}>
            <Select.Popup className="bu-select-popup">
              <Select.List>
                {panes.length === 0 && (
                  <div className="bu-select-empty">No panes (session not running?)</div>
                )}
                {visible.map((p) => (
                  <Select.Item key={p.id} value={p.id} className="bu-select-item">
                    <Select.ItemIndicator className="bu-select-item-indicator">•</Select.ItemIndicator>
                    <Select.ItemText className="bu-select-item-text">
                      <span className="bu-select-item-head">
                        <span className="bu-select-item-name">{p.windowName}</span>
                        <span className="bu-select-item-meta">{paneDescriptor(p, session)}</span>
                      </span>
                      <span className="bu-select-item-desc">
                        #{p.windowIndex}.{p.paneIndex} · {p.id}
                        {p.active ? " · active" : ""}
                      </span>
                    </Select.ItemText>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
      {canToggle && (
        <label
          className="pane-select__filter"
          title="Show non-agent panes (shells, editors) too"
        >
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          All
        </label>
      )}
      <button
        type="button"
        className="pane-select__reload"
        onClick={load}
        title="Reload panes"
        aria-label="Reload panes"
      >
        <RiRefreshLine size={15} />
      </button>
    </div>
  );
}
