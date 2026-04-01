# Engine v2 Dashboard Design

## Overview

The engine v2 dashboard is an Ink-based terminal UI that runs in the [engine] tmux window.
It replaces the current console.log-based log output with a rich, interactive display.

This is separate from the existing `fed dash` (session management dashboard).
The engine dashboard is focused on a single running session's execution state.

| | Existing dashboard (`fed dash`) | Engine dashboard (new) |
|---|---|---|
| Scope | All sessions | Single running session |
| Content | Session list, status, operations | Step progress, logs, artifacts |
| Location | Any terminal | tmux [engine] window |
| Tech | Ink/React | Ink/React (same stack) |

## Layout

Two-panel layout:

### Upper panel: Step tree

Shows all workflow steps with their current status. Navigable with arrow keys.

```
  Steps                                    [↑↓ to navigate]
  ✓ planning                              done  16s
  ✓ human_plan_review_cycle               done   2m
  ⠋ plan_review_cycle                     1/5
    ⠋ plan_review (codex)                 running    ← selected
    ○ branch
  ○ test_phase
  ○ implementation
  ○ code_review_cycle
  ○ post_processing
  ○ final_review
```

Status icons:
- `✓` completed (green)
- `⠋` running (animated spinner, cyan)
- `◌` waiting for human (yellow)
- `○` not started (dim)
- `✗` failed (red)

Nested steps (loop sub-steps, parallel branches) are indented.

### Lower panel: Step log

Shows log output for the currently selected step. Changes when the user navigates
with arrow keys.

```
  ─── plan_review (codex) ─────────────────────────
  💬 Reading the plan artifact...
  🔧 exec: fed artifact read plan
  💬 The plan covers three phases...
  🔧 exec: cat > tmp-review.md
```

- Each step's log lines are stored in memory: `Map<stepPath, string[]>`
- Scrolls automatically when new lines are added (if selected step is active)
- Completed steps show their historical log
- Not-started steps show "(not started)"

### Parallel step display

When a parallel step is active, each branch appears as a navigable child:

```
  ⠋ code_review_parallel
    ⠋ review_diff (codex)         running  [3 tools]
    ⠋ review_history (codex)      running  [1 tool]
    ✓ review_impact (claude)      done     45s
    ⠋ review_conventions (claude) running  [2 tools]
```

Navigate to individual branches to see their logs. No log interleaving.

## Interaction

- **↑/↓ arrow keys**: Navigate step tree, change selected step
- **Auto-follow**: When no manual navigation, selection follows the currently active step
- Log panel shows the selected step's log

No respond UI for now — human uses `fed session respond-workflow` from the [human] window.

## Implementation

### Data flow

1. Engine core (`engine.ts`) emits events instead of calling `logger.info()` directly
2. Events are typed: `step_start`, `step_complete`, `step_log`, `loop_iteration`, etc.
3. Ink components subscribe to events and update React state
4. Log lines are stored per-step in `Map<stepPath, string[]>` in memory
5. `engine.log` file continues to receive all events for post-session review

### Key components

```
EngineApp (root)
├── StepTree
│   ├── StepRow (repeated, with indent for nesting)
│   └── cursor/selection state
├── Divider
└── LogPanel
    └── scrollable log lines for selected step
```

### Color scheme

- Green: completed steps, success messages
- Cyan: running steps, spinner
- Yellow: waiting for human
- Red: failed steps, errors
- Dim/gray: not started, timestamps
- Blue: step type labels (claude, codex, shell)
- Default: log content (💬 messages, 🔧 tool calls)

## Log storage

- **In memory**: `Map<stepPath, string[]>` — for dashboard display during session
- **On disk**: `engine.log` — full chronological log, same as today
- No per-step log files needed; engine.log suffices for post-session review

## Priority

Lower priority than core engine functionality. Implement after tdd-v4 workflow is stable.
Current console.log output works well enough for development and debugging.
