# fed CLI Reference

Agentic Federation CLI - unified development session manager.

For detailed options and usage of each command, see [fed-cli-detailed-reference.md](./fed-cli-detailed-reference.md).

## Commands

| Command | Description |
|---|---|
| `fed init` | Initialize `~/.fed/` directory structure |
| `fed repo` | Manage repository definitions |
| `fed session` | Manage development sessions |
| `fed artifact` | Read/write session artifacts |
| `fed notify` | Send a notification to a tmux pane |
| `fed prompt` | Read agent prompts |
| `fed waiting-human` | Manage waiting-for-human state |
| `fed clean` | Clean up worktrees of archived sessions |
| `fed worktree` | Manage worktrees and their protection |
| `fed dashboard` | Launch interactive dashboard (Ink terminal UI) |
| `fed workflow` | Manage workflow definitions |
| `fed repo-script` | Run repo-defined scripts |
| `fed config` | Manage fed configuration (`~/.fed/config.json`) |
| `fed files` | Manage knowledge base files |

## Subcommands

### `fed repo`

| Subcommand | Description |
|---|---|
| `fed repo add <clone-url> [base-path]` | Clone a repository and register it |
| `fed repo add-local <repo-path> [base-path]` | Register an existing local repository |
| `fed repo list` | List all repository definitions |
| `fed repo show <name>` | Show repository definition details |
| `fed repo edit <name>` | Edit repository definition with `$EDITOR` |
| `fed repo rename <old-name> <new-name>` | Rename a repository (config, workspace, sessions, archives) |
| `fed repo delete <name>` | Delete a repository and its workspace |

### `fed session`

| Subcommand | Description |
|---|---|
| `fed session start <workflow> [repo] [branch]` | Start a v2 engine-driven development session |
| `fed session recover [session-name]` | Recover a session whose tmux session has been lost (v2 only) |
| `fed session stop [session-name]` | Stop a session |
| `fed session list` | List sessions |
| `fed session status [session-name]` | Show current workflow step status |
| `fed session start-engine [session-name]` | Start the v2 workflow engine (resumes from last completed step). `--from <step>` to replay from a specific step. |
| `fed session respond-workflow [value]` | Report step result to the v2 workflow engine |
| `fed session abort-workflow` | Abort the running v2 workflow |
| `fed session archive <session-name>` | Archive a specific session |
| `fed session describe [text]` | Get or set session description |

### `fed artifact`

| Subcommand | Description |
|---|---|
| `fed artifact read <name>` | Read an artifact to stdout |
| `fed artifact write <name>` | Write an artifact from stdin or file |
| `fed artifact list` | List available artifacts |
| `fed artifact path <name>` | Print the absolute file path of an artifact |
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

### `fed workflow`

| Subcommand | Description |
|---|---|
| `fed workflow validate <name>` | Validate a v2 workflow definition |

### `fed repo-script`

| Subcommand | Description |
|---|---|
| `fed repo-script list` | List available scripts |
| `fed repo-script show <name>` | Show script details |
| `fed repo-script run <name>` | Run a script |

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

