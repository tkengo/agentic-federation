# Agentic Federation - Development Guide

## Project Overview

`fed` CLI tool that manages AI agent team development sessions via git worktree + tmux.
Runtime data lives in `~/.fed/`, code lives in this repo.

## Architecture

- **cli/** - Main CLI (TypeScript + Commander.js, ES module)
- **dashboard/** - Terminal UI (TypeScript + Ink/React)
- **commands/** - Claude Code skill definitions (.md), synced to `~/.claude/commands/` by `fed start`
- **prompts/** - Agent role prompts (orchestrator, implementer, reviewers, plan reviser)

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
| `types.ts` | Interfaces: `MetaJson`, `StateJson`, `RepoConfig`, `ARTIFACT_MAP` |
| `session.ts` | Session resolution: `requireSessionDir()`, `resolveSession()`, `readMeta()` |
| `tmux.ts` | tmux wrapper: `hasSession()`, `newSession()`, `sendKeys()`, etc. |
| `repo.ts` | Repo config: `loadRepoConfig()`, `listRepoConfigs()` |
| `notification-watcher.ts` | Standalone process: watches notifications/ with chokidar |
| `stale-watcher.ts` | Standalone process: checks state.json staleness periodically |

## Dashboard Structure (dashboard/src/)

Ink/React terminal UI. Components in `components/`, custom hooks in `hooks/`, shared types in `utils/types.ts`.
Dashboard duplicates minimal type definitions from cli/src/lib/ (MetaJson, StateJson, paths) to avoid cross-package import complexity.

## Key Design Decisions

- All agent communication via `fed` CLI commands (not direct file access)
- Agents detect their session automatically via `tmux display-message -p '#S'`
- `~/.fed/active/<tmux-session>` symlinks point to real session directories
- Watcher processes (notification, stale) write PID files to session dir for cleanup
- `fed stop` kills watchers via PID files, then kills tmux session, then archives

## Testing

No test framework yet. Manual testing via:
```bash
cd cli && npx tsx src/index.ts <command> [args]
cd dashboard && npx tsx src/index.tsx
```
