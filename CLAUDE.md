# Agentic Federation - Development Guide

## Project Overview

`fed` CLI tool that manages AI agent team development sessions via git worktree + tmux.
Runtime data lives in `~/.fed/`, code lives in this repo.

## Architecture

- **cli/** - Main CLI (TypeScript + Commander.js, ES module)
- **dashboard/** - Terminal UI (TypeScript + Ink/React)
- **workflows/** - Workflow definitions (YAML state machines)
- **commands/** - Claude Code skill definitions (.md), synced to `~/.claude/commands/` by `fed session start`
- **workflow-components/** - Shared agent instruction fragments (used via `@include()` in agent .md files)
- **prompts/** - Agent role prompts (orchestrator, planner, implementer, reviewers)

## Build

```bash
# Full install (npm install + build + npm link)
bin/install

# Individual rebuilds
cd cli && npm run build
cd dashboard && npm run build
```

Both packages use `tsc` with `"type": "module"` (ES2022 target, Node16 module resolution).
Dashboard tsconfig additionally has `"jsx": "react-jsx"`.

## Code Conventions

- TypeScript strict mode enabled
- ES module imports with `.js` extension (required for Node16 module resolution)
- All comments in English
- No trailing whitespace

## Documentation

- When adding, modifying, or removing CLI commands/subcommands/options, update `docs/fed-cli-reference.md` accordingly

## CLI Command Pattern

Each command is a file in `cli/src/commands/<name>.ts`:

1. Export function(s) like `export function fooCommand(...): void`
2. Use `requireSessionDir()` to get current session (auto-detects via tmux)
3. Read/write files in session directory using `node:fs`
4. Output to stdout, errors to stderr, `process.exit(1)` on failure
5. Register in `cli/src/index.ts` with Commander.js

## Shared Libraries (cli/src/lib/)

| Module | Purpose |
|---|---|
| `paths.ts` | Constants: `FED_HOME`, `SESSIONS_DIR`, `ACTIVE_DIR`, `ARCHIVE_DIR`, etc. |
| `types.ts` | Interfaces: `MetaJson`, `StateJson`, `RepoConfig`, `ScriptDef`, `WorkflowOverride` |
| `session.ts` | Session resolution: `requireSessionDir()`, `resolveSession()`, `readMeta()` |
| `tmux.ts` | tmux wrapper: `hasSession()`, `newSession()`, `sendKeys()`, etc. |
| `repo.ts` | Repo config: `loadRepoConfig()`, `listRepoConfigs()`, `resolveRepoScriptPath()` |
| `workflow.ts` | Workflow loading, validation, template expansion, @include() composition, workflow overrides |
| `notification-watcher.ts` | Standalone process: watches notifications/ with chokidar |
| `stale-watcher.ts` | Standalone process: checks state.json staleness periodically |

## Workflow System

Workflows are defined in `workflows/*.yaml`. Each workflow defines:
- **windows**: tmux window/pane layout and agent assignments
- **states**: State machine with transitions, tasks, and decision logic
- **tasks**: Messages to dispatch to agent panes, with input/output artifacts and tracking keys
The orchestrator reads the workflow YAML at runtime via `fed workflow show <name>` and follows the state machine. Agent prompts are role-only; operational details (what to read, where to write, how to report completion) are assembled by the orchestrator from the workflow definition.

### Repo Scripts

Scripts are defined in the `scripts` field of repo config JSON (`~/.fed/repos/<name>.json`), not in workflow YAML. This keeps workflows reusable across different repositories.

```json
{
  "scripts": {
    "worktree-merge": {
      "path": "./scripts/worktree-merge.sh",
      "description": "Rebase worktree branch onto main and fast-forward merge"
    }
  }
}
```

- `path`: Script file path. Relative paths resolve from the JSON file location (`~/.fed/repos/`). Absolute paths used as-is.
- `description`: Human-readable description (shown in dashboard and `fed repo-script list`)
- `env`: Additional environment variables passed to the script (on top of auto-injected ones)
- `cwd`: Working directory (defaults to worktree path if omitted)

### Auto-injected Environment Variables

The following environment variables are automatically injected into every repo script at runtime. No need to declare them in the JSON config:

| Variable | Source | Value |
|---|---|---|
| `FED_SESSION` | meta.json | tmux session name |
| `FED_SESSION_DIR` | meta.json | Session directory path |
| `FED_REPO_DIR` | meta.json | Worktree path |
| `FED_BRANCH` | meta.json | Branch name |
| `FED_REPO` | meta.json | Repository name |
| `FED_WORKFLOW` | meta.json | Workflow name |
| `FED_REPO_ROOT` | repo config | Main repository root path |

Scripts can use these variables directly (e.g., `$FED_REPO_DIR`, `$FED_BRANCH`). Additional script-specific env vars can be defined in the `env` field of the script definition.

Scripts are executed via `fed repo-script run <name>` or from the dashboard detail panel.
Script logs are saved to `<sessionDir>/script-logs/<timestamp>_<id>_<name>.log`.

### Per-Pane Environment Variables

The following environment variables are set in each tmux pane at session start via `export` commands (not via `tmux setenv`):

| Variable | Value | Example |
|---|---|---|
| `FED_PANE` | Pane ID from workflow definition | `planner`, `test_implementer` |
| `FED_WINDOW` | Window name from workflow definition | `planner`, `implement` |

These are available in the shell environment of each pane. Used by `fed workflow-transition` (pane auto-detection), `fed claude` (session tracking), and the logger (context tagging).

### Template Variables

Template variables (`{{meta.*}}`, `{{repo.*}}`) are used in workflow YAML for pane commands and in agent instruction files. They are expanded at `fed session start` time. They are NOT used in repo script definitions.

### Agent Instruction Composition

Agent instruction files (`.md`) support `@include()` directives to eliminate duplication across workflows. Shared fragments live in `workflow-components/`.

**Simple include** (single-line, replaces with file contents):
```markdown
@include(workflow-components/discussion/approach.md)
```

**Block include with slots** (override customizable sections in fragments):
```markdown
@include(workflow-components/escalation/to-orchestrator.md)
@slot(cases)
- Custom case 1
- Custom case 2
@endslot
@endinclude
```

Fragment files define slots with `@slot(name)...@endslot`. If the caller provides an override, it replaces the default content. If not, the default is kept.

```markdown
### Cases
@slot(cases)
- Default case 1
- Default case 2
@endslot
```

At `fed session start`, agent instructions go through a compose pipeline:
1. `@include()` directives are expanded with slot overrides (no nesting)
2. `{{repo.*}}` / `{{meta.*}}` template variables are expanded
3. Composed files are written to `<sessionDir>/agents/<name>.md`

Agents read their instructions via `fed prompt read <name>` at runtime.

### Workflow Overrides

Repo config can override pane commands per workflow via `workflow_overrides`:

```json
{
  "workflow_overrides": {
    "tdd-v2": {
      "windows": {
        "human": {
          "panes": {
            "human": { "command": "source .venv/bin/activate && cd {{meta.session_dir}} && nvim" }
          }
        }
      }
    }
  }
}
```

Overrides are applied after template expansion during `fed session start`.

## Dashboard Structure (dashboard/src/)

Ink/React terminal UI. Components in `components/`, custom hooks in `hooks/`, shared types in `utils/types.ts`.
Dashboard duplicates minimal type definitions from cli/src/lib/ (MetaJson, StateJson, paths) to avoid cross-package import complexity.

## Key Design Decisions

- All agent communication via `fed` CLI commands (not direct file access)
- Agents detect their session automatically via `tmux display-message -p '#S'`
- `~/.fed/active/<tmux-session>` symlinks point to real session directories
- Watcher processes (notification, stale) write PID files to session dir for cleanup
- `fed session stop` kills watchers via PID files, then kills tmux session, then archives
- Agent prompts are role-only; operational instructions come from workflow YAML via orchestrator
- Composed agent instructions are written to `<sessionDir>/agents/<name>.md`
- `workflow` is a required positional argument to `fed session start`
- Scripts defined in repo config JSON can be run via `fed repo-script run` or from the dashboard

## Testing

No test framework yet. Manual testing via:
```bash
cd cli && npx tsx src/index.ts <command> [args]
cd dashboard && npx tsx src/index.tsx
```
