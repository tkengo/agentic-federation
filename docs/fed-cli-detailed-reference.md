# fed CLI Detailed Reference

Agentic Federation CLI - full command reference with all options.

See [fed-cli-reference.md](./fed-cli-reference.md) for a quick overview.

## Global Options

| Option | Description |
|---|---|
| `-V, --version` | Output the version number |
| `--session <name>` | Override tmux session name for session resolution |
| `-h, --help` | Display help for command |

---

## `fed init`

Initialize `~/.fed/` directory structure.

```
fed init
```

---

## `fed repo`

Manage repository definitions.

### `fed repo add`

Clone a repository and register it.

```
fed repo add [options] <clone-url> [base-path]
```

| Option | Description |
|---|---|
| `--base-branch <branch>` | Base branch for worktree creation (default: main) |

### `fed repo add-local`

Register an existing local repository.

```
fed repo add-local [options] <repo-path> [base-path]
```

| Option | Description |
|---|---|
| `--base-branch <branch>` | Base branch for worktree creation (default: main) |

### `fed repo list`

List all repository definitions.

```
fed repo list
```

### `fed repo show`

Show repository definition details.

```
fed repo show <name>
```

### `fed repo edit`

Edit repository definition with `$EDITOR`.

```
fed repo edit <name>
```

---

## `fed session`

Manage development sessions.

### `fed session start`

Start a development session with a workflow.

```
fed session start [options] <workflow> [repo] [branch]
```

| Option | Description |
|---|---|
| `--no-attach` | Skip tmux attach after creation |
| `--session-name <name>` | Custom tmux session name (auto-generated for standalone if omitted) |
| `-e, --env <KEY=VALUE...>` | Environment variables to set in all panes (repeatable) |

### `fed session stop`

Stop a session (current tmux session if not specified).

```
fed session stop [session-name]
```

### `fed session list`

List sessions.

```
fed session list [options]
```

Aliases: `fed session ls`

| Option | Description |
|---|---|
| `--active` | Show active sessions (default: true) |
| `--no-active` | Hide active sessions |
| `--archive` | Show archived sessions |
| `--no-archive` | Hide archived sessions (default) |
| `--restorable` | Show only restorable sessions (tmux dead) |
| `--limit <n>` | Max sessions to show (default: 20) |

### `fed session show`

Show detailed session information.

```
fed session show [session-name]
```

### `fed session archive`

Archive a specific session.

```
fed session archive <session-name>
```

### `fed session restore`

Restore a session after tmux loss.

```
fed session restore [options] <session-name>
```

| Option | Description |
|---|---|
| `--no-attach` | Skip tmux attach after restore |

---

## `fed state`

Read/update workflow state (`state.json`).

### `fed state read`

Read `state.json` (optionally a specific field, e.g. `status`).

```
fed state read [options] [field]
```

| Option | Description |
|---|---|
| `--nvim` | Open the file in nvim instead of printing to stdout |

### `fed state update`

Update a field in `state.json`.

```
fed state update <field> <value>
```

---

## `fed artifact`

Read/write session artifacts.

### `fed artifact read`

Read an artifact to stdout.

```
fed artifact read [options] <name>
```

| Option | Description |
|---|---|
| `--nvim` | Open the file in nvim instead of printing to stdout |

### `fed artifact write`

Write an artifact from stdin or file.

```
fed artifact write [options] <name>
```

| Option | Description |
|---|---|
| `--file <path>` | Read content from file instead of stdin (file is deleted after write) |
| `--keep` | Keep the source file when using `--file` |

### `fed artifact list`

List available artifacts.

```
fed artifact list
```

### `fed artifact delete`

Delete an artifact.

```
fed artifact delete <name>
```

---

## `fed notify`

Send a notification to a tmux pane.

```
fed notify <pane> <message>
```

---

## `fed prompt`

Read agent prompts.

### `fed prompt read`

Read a prompt by name.

```
fed prompt read [options] <name>
```

| Option | Description |
|---|---|
| `--nvim` | Open the file in nvim instead of printing to stdout |

### `fed prompt list`

List available prompts.

```
fed prompt list
```

---

## `fed notify-human`

Send macOS notification to human.

```
fed notify-human <title> <message>
```

---

## `fed waiting-human`

Manage waiting-for-human state.

### `fed waiting-human set`

Set waiting-for-human state with a reason.

```
fed waiting-human set [options]
```

| Option | Description |
|---|---|
| `--reason <reason>` | Reason for waiting |
| `--notify` | Also send macOS notification |

### `fed waiting-human clear`

Clear waiting-for-human state.

```
fed waiting-human clear
```

### `fed waiting-human show`

Show current waiting-for-human state.

```
fed waiting-human show
```

---

## `fed clean`

Clean up worktrees of archived sessions.

```
fed clean [options]
```

| Option | Description |
|---|---|
| `--dry-run` | Show what would be deleted without deleting |
| `--force` | Force removal even with uncommitted changes |

---

## `fed describe`

Get or set session description.

### `fed describe set`

Set session description.

```
fed describe set <text>
```

### `fed describe show`

Show current session description.

```
fed describe show
```

---

## `fed dashboard`

Launch interactive dashboard (Ink terminal UI).

```
fed dashboard
```

Aliases: `fed dash`

---

## `fed workflow`

Manage workflow definitions.

### `fed workflow list`

List available workflows.

```
fed workflow list
```

### `fed workflow show`

Show workflow YAML content (omit name for current session).

```
fed workflow show [name]
```

### `fed workflow validate`

Validate a workflow definition.

```
fed workflow validate <name>
```

---

## `fed repo-script`

Run repo-defined scripts.

### `fed repo-script list`

List available scripts.

```
fed repo-script list
```

### `fed repo-script show`

Show script details.

```
fed repo-script show <name>
```

### `fed repo-script run`

Run a script.

```
fed repo-script run <name>
```

---

## `fed conv`

View collected conversations from AI tools.

### `fed conv list`

List collected conversation files.

```
fed conv list
```

### `fed conv show`

Show a conversation in human-readable format.

```
fed conv show [options] <name>
```

| Option | Description |
|---|---|
| `--raw` | Output raw JSONL instead of formatted text |

---

## `fed config`

Manage fed configuration (`~/.fed/config.json`).

### `fed config get`

Get a config value (or all config if no key).

```
fed config get [key]
```

### `fed config set`

Set a config value (dot notation supported, e.g. `files.dir`).

```
fed config set <key> <value>
```

---

## `fed files`

Manage knowledge base files.

### `fed files save`

Save a file to the knowledge base.

```
fed files save [options] <name>
```

| Option | Description |
|---|---|
| `--file <path>` | Read content from file instead of stdin (file is deleted after write) |
| `--keep` | Keep the source file when using `--file` |

### `fed files read`

Read a file from the knowledge base.

```
fed files read <name>
```

### `fed files list`

List knowledge base files.

```
fed files list [options]
```

| Option | Description |
|---|---|
| `--limit <n>` | Max files to show (default: 50) |
| `--offset <n>` | Start from this index (default: 0) |

### `fed files dir`

Print the knowledge base directory path.

```
fed files dir
```

---

## `fed claude`

Launch Claude Code with automatic session ID tracking.

```
fed claude
```
