# Agentic Federation - Development Guide

## Project Overview

`fed` CLI tool that manages AI agent team development sessions via git worktree + tmux.
Runtime data lives in `~/.fed/`, code lives in this repo.

## Architecture

- **cli/** - Main CLI (TypeScript + Commander.js, ES module)
- **dashboard/** - Terminal UI (TypeScript + Ink/React)
- **workflows/** - Workflow definitions (YAML state machines)
- **commands/** - Claude Code skill definitions (.md), synced to `~/.claude/commands/` by `fed start`
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
| `types.ts` | Interfaces: `MetaJson`, `StateJson`, `RepoConfig` |
| `session.ts` | Session resolution: `requireSessionDir()`, `resolveSession()`, `readMeta()` |
| `tmux.ts` | tmux wrapper: `hasSession()`, `newSession()`, `sendKeys()`, etc. |
| `repo.ts` | Repo config: `loadRepoConfig()`, `listRepoConfigs()` |
| `workflow.ts` | Workflow loading, validation, utilities |
| `notification-watcher.ts` | Standalone process: watches notifications/ with chokidar |
| `stale-watcher.ts` | Standalone process: checks state.json staleness periodically |

## Workflow System

Workflows are defined in `workflows/*.yaml`. Each workflow defines:
- **windows**: tmux window/pane layout and agent assignments
- **states**: State machine with transitions, tasks, and decision logic
- **tasks**: Messages to dispatch to agent panes, with input/output artifacts and tracking keys
- **scripts**: Named scripts for pre/post-processing (e.g., commit & PR creation)

The orchestrator reads the workflow YAML at runtime via `fed workflow show <name>` and follows the state machine. Agent prompts are role-only; operational details (what to read, where to write, how to report completion) are assembled by the orchestrator from the workflow definition.

### Script Definitions

Scripts are defined in the `scripts:` section of workflow YAML. Environment variables and working directory are explicitly defined using template variables (`{{meta.*}}`, `{{repo.*}}`):

```yaml
scripts:
  worktree-merge:
    path: ./scripts/worktree-merge.sh
    description: "Rebase worktree branch onto main and fast-forward merge"
    cwd: "{{meta.worktree}}"
    env:
      FED_SESSION: "{{meta.tmux_session}}"
      FED_SESSION_DIR: "{{meta.session_dir}}"
      FED_REPO_DIR: "{{meta.worktree}}"
      FED_BRANCH: "{{meta.branch}}"
      FED_REPO: "{{meta.repo}}"
      FED_WORKFLOW: "{{meta.workflow}}"
      FED_REPO_ROOT: "{{repo.repo_root}}"
```

- `path`: Script file path (relative to repo worktree, or absolute)
- `description`: Human-readable description (shown in dashboard and `fed script list`)
- `env`: Environment variables passed to the script (use template variables for session context)
- `cwd`: Working directory (use template variables; defaults to session dir if omitted)

No environment variables are automatically injected — everything is explicitly declared in the YAML.

### Template Variables

Available template variables for `scripts.env` and `scripts.cwd`:

| Variable | Source | Value |
|---|---|---|
| `{{meta.repo}}` | meta.json | Repository name |
| `{{meta.branch}}` | meta.json | Branch name |
| `{{meta.workflow}}` | meta.json | Workflow name |
| `{{meta.worktree}}` | meta.json | Worktree path |
| `{{meta.tmux_session}}` | meta.json | tmux session name |
| `{{meta.session_dir}}` | meta.json | Session directory path |
| `{{repo.repo_root}}` | repo config | Main repository root path |
| `{{repo.worktree_base}}` | repo config | Worktree base directory |
| `{{repo.extra.*}}` | repo config | Custom repo config values |

Scripts are executed via `fed script run <name>` or from the dashboard detail panel.
Script logs are saved to `<sessionDir>/script-logs/<timestamp>_<id>_<name>.log`.

## Dashboard Structure (dashboard/src/)

Ink/React terminal UI. Components in `components/`, custom hooks in `hooks/`, shared types in `utils/types.ts`.
Dashboard duplicates minimal type definitions from cli/src/lib/ (MetaJson, StateJson, paths) to avoid cross-package import complexity.

## Key Design Decisions

- All agent communication via `fed` CLI commands (not direct file access)
- Agents detect their session automatically via `tmux display-message -p '#S'`
- `~/.fed/active/<tmux-session>` symlinks point to real session directories
- Watcher processes (notification, stale) write PID files to session dir for cleanup
- `fed stop` kills watchers via PID files, then kills tmux session, then archives
- Agent prompts are role-only; operational instructions come from workflow YAML via orchestrator
- `workflow` is a required positional argument to `fed start`
- Scripts defined in workflow YAML can be run via `fed script run` or from the dashboard

## Testing

No test framework yet. Manual testing via:
```bash
cd cli && npx tsx src/index.ts <command> [args]
cd dashboard && npx tsx src/index.tsx
```
