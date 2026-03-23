# fed CLI Reference

Agentic Federation CLI - unified development session manager.

For detailed options and usage of each command, see [fed-cli-detailed-reference.md](./fed-cli-detailed-reference.md).

## Commands

| Command | Description |
|---|---|
| `fed init` | Initialize `~/.fed/` directory structure |
| `fed repo` | Manage repository definitions |
| `fed session` | Manage development sessions |
| `fed state` | Read/update workflow state (`state.json`) |
| `fed artifact` | Read/write session artifacts |
| `fed notify` | Send a notification to a tmux pane |
| `fed prompt` | Read agent prompts |
| `fed notify-human` | Send macOS notification to human |
| `fed waiting-human` | Manage waiting-for-human state |
| `fed clean` | Clean up worktrees of archived sessions |
| `fed worktree` | Manage worktrees and their protection |
| `fed describe` | Get or set session description |
| `fed dashboard` | Launch interactive dashboard (Ink terminal UI) |
| `fed workflow` | Manage workflow definitions |
| `fed repo-script` | Run repo-defined scripts |
| `fed conv` | View collected conversations from AI tools |
| `fed config` | Manage fed configuration (`~/.fed/config.json`) |
| `fed files` | Manage knowledge base files |
| `fed workflow-transition` | Report task completion and trigger workflow state transition |
| `fed claude` | Launch Claude Code with automatic session ID tracking and agent resolution |

## Subcommands

### `fed repo`

| Subcommand | Description |
|---|---|
| `fed repo add <clone-url> [base-path]` | Clone a repository and register it |
| `fed repo add-local <repo-path> [base-path]` | Register an existing local repository |
| `fed repo list` | List all repository definitions |
| `fed repo show <name>` | Show repository definition details |
| `fed repo edit <name>` | Edit repository definition with `$EDITOR` |

### `fed session`

| Subcommand | Description |
|---|---|
| `fed session start <workflow> [repo] [branch]` | Start a development session with a workflow |
| `fed session stop [session-name]` | Stop a session |
| `fed session list` | List sessions |
| `fed session show [session-name]` | Show detailed session information |
| `fed session archive <session-name>` | Archive a specific session |
| `fed session restore <session-name>` | Restore a session after tmux loss |

### `fed state`

| Subcommand | Description |
|---|---|
| `fed state read [field]` | Read `state.json` (optionally a specific field) |
| `fed state update <field> <value>` | Update a field in `state.json` |

### `fed artifact`

| Subcommand | Description |
|---|---|
| `fed artifact read <name>` | Read an artifact to stdout |
| `fed artifact write <name>` | Write an artifact from stdin or file |
| `fed artifact list` | List available artifacts |
| `fed artifact delete <name>` | Delete an artifact |

### `fed prompt`

| Subcommand | Description |
|---|---|
| `fed prompt read <name>` | Read a prompt by name |
| `fed prompt list` | List available prompts |

### `fed waiting-human`

| Subcommand | Description |
|---|---|
| `fed waiting-human set` | Set waiting-for-human state with a reason |
| `fed waiting-human clear` | Clear waiting-for-human state |
| `fed waiting-human show` | Show current waiting-for-human state |

### `fed describe`

| Subcommand | Description |
|---|---|
| `fed describe set <text>` | Set session description |
| `fed describe show` | Show current session description |

### `fed workflow`

| Subcommand | Description |
|---|---|
| `fed workflow list` | List available workflows |
| `fed workflow show [name]` | Show workflow YAML content |
| `fed workflow validate <name>` | Validate a workflow definition |

### `fed repo-script`

| Subcommand | Description |
|---|---|
| `fed repo-script list` | List available scripts |
| `fed repo-script show <name>` | Show script details |
| `fed repo-script run <name>` | Run a script |

### `fed conv`

| Subcommand | Description |
|---|---|
| `fed conv list` | List collected conversation files |
| `fed conv show <name>` | Show a conversation in human-readable format |

### `fed config`

| Subcommand | Description |
|---|---|
| `fed config get [key]` | Get a config value (or all config if no key) |
| `fed config set <key> <value>` | Set a config value (dot notation supported) |
| `fed config show` | Show all config keys with current values and defaults |

### `fed files`

| Subcommand | Description |
|---|---|
| `fed files save <name>` | Save a file to the knowledge base |
| `fed files read <name>` | Read a file from the knowledge base |
| `fed files list` | List knowledge base files |
| `fed files dir` | Print the knowledge base directory path |

### `fed worktree`

| Subcommand | Description |
|---|---|
| `fed worktree list` | List all worktrees with protection status |
| `fed worktree protect <repo> <branch>` | Protect a worktree from cleanup |
| `fed worktree unprotect <repo> <branch>` | Remove worktree cleanup protection |

Options for `fed worktree list`:
- `--protected` - Show only protected worktrees
- `--no-protected` - Show only unprotected worktrees

### `fed claude`

Launch Claude Code with automatic session ID tracking and agent name resolution.

```
fed claude [options] [-- claude-args...]
```

Options:
- `--new` - Force create a new session instead of resuming existing one
- `--agent <name>` - Specify agent name to use. Resolves short name (e.g., `planner`) to the full composed name (e.g., `dev-team-v4-myrepo-1234-abcd-planner`) and passes it to `claude --agent`. When `--agent` is specified, always creates a new session (no resume).

Agent name resolution:
1. Exact match against composed file names in `<sessionDir>/agents/`
2. Suffix match: `planner` matches `*-planner.md`
3. If multiple suffix matches, an error is shown with available options
