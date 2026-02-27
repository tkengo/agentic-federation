# Agentic Federation

AI エージェントチームによる開発セッションを統一管理する CLI ツール。

リポジトリごとに散在していた shell スクリプト群を `fed` コマンドに統合し、git worktree + tmux ベースの開発環境をワンコマンドで構築する。

## Prerequisites

- Node.js (v20+)
- tmux
- git

## Install

```bash
git clone <repo-url> ~/agentic-federation
cd ~/agentic-federation
bin/install
```

CLI と Dashboard のインストール・ビルド・`fed` コマンドのグローバル登録を一括で行う。

PATH を通す:

```bash
# ~/.zshrc に追加
export PATH="$HOME/agentic-federation/bin:$PATH"
```

アンインストール:

```bash
npm unlink -g fed
```

## Quick Start

```bash
# 1. ~/.fed/ ディレクトリ構造を初期化
fed init

# 2. リポジトリ定義を登録
fed repo add my-project

# 3. ソロモードで開発セッションを起動 (terminal + nvim)
fed start my-project feature-branch

# 4. チームモードで起動 (agent-team ウィンドウ付き)
fed start my-project feature-branch --workflow dev-team

# ダッシュボードを起動
fed dashboard
```

## Commands

### セッション管理

| Command | Description |
|---|---|
| `fed start <repo> <branch>` | ソロモードで開発セッションを起動 |
| `fed start <repo> <branch> --workflow <name>` | ワークフロー指定でチームモードを起動 |
| `fed stop [session-name]` | セッションを停止してアーカイブ |
| `fed list` (`fed ls`) | アクティブセッション一覧 |
| `fed info [session-name]` | セッション詳細表示 |
| `fed dashboard` (`fed dash`) | インタラクティブダッシュボード (Ink UI) |

### ワークフロー

| Command | Description |
|---|---|
| `fed workflow list` | 利用可能なワークフロー一覧 |
| `fed workflow show <name>` | ワークフロー YAML を表示 |
| `fed workflow validate <name>` | ワークフロー定義のバリデーション |

### アーカイブ / クリーンアップ

| Command | Description |
|---|---|
| `fed archive session <name>` | 指定セッションをアーカイブ |
| `fed archive completed` | COMPLETED/APPROVED な全セッションを一括アーカイブ |
| `fed clean [--dry-run] [--force]` | アーカイブ済みセッションの worktree を削除 |

### リポジトリ定義

| Command | Description |
|---|---|
| `fed repo add <name>` | 対話的に定義を作成 |
| `fed repo list` | 一覧表示 |
| `fed repo show <name>` | 詳細表示 |
| `fed repo edit <name>` | $EDITOR で編集 |

### エージェント連携 (セッション内で使用)

| Command | Description |
|---|---|
| `fed state read [field]` | ワークフロー状態の読み取り |
| `fed state update <field> <value>` | 状態の更新 |
| `fed artifact read <name>` | 成果物を stdout に出力 |
| `fed artifact write <name>` | stdin から成果物を書き込み |
| `fed artifact list` | 成果物一覧 |
| `fed artifact delete <name>` | 成果物を削除 |
| `fed notify <pane> <message>` | tmux ペインに通知を送信 |
| `fed feedback read` | 人間のフィードバックを読み取り |
| `fed feedback write` | stdin からフィードバックを追記 |
| `fed prompt read <name>` | エージェントプロンプトを読み取り |
| `fed prompt list` | プロンプト一覧 |
| `fed notify-human <title> <message>` | macOS 通知を送信 |
| `fed stale pause/resume/status` | stale watcher の制御 |

### 初期化

| Command | Description |
|---|---|
| `fed init` | `~/.fed/` ディレクトリ構造を作成 (冪等) |

## Workflow

ワークフローは `workflows/` ディレクトリに YAML で定義する。ステートマシン、ペイン構成、タスク定義を一つのファイルにまとめる。

```bash
# ワークフロー一覧
fed workflow list

# 内容を確認
fed workflow show dev-team

# バリデーション
fed workflow validate dev-team
```

`--workflow dev-team` で起動すると、YAML に基づいて tmux ペインが作成され、オーケストレータが自動起動する。

## Session Modes

**Solo mode** (default): terminal + nvim (+ dev server)

```
+-------------------+-------------------+
|    terminal       |      nvim         |
+-------------------+-------------------+
|           dev server (optional)       |
+---------------------------------------+
```

**Team mode** (`--workflow`): 上記 + ワークフロー定義に基づく agent-team ウィンドウ

## Runtime Data

`~/.fed/` にセッション・アーカイブ・ナレッジを格納:

```
~/.fed/
├── repos/         # リポジトリ定義 JSON
├── sessions/      # セッションデータ (リポジトリ別)
├── active/        # アクティブセッションへの symlink
├── archive/       # アーカイブ済みセッション
└── knowledge/     # セッション横断の蓄積知見
```

## Repository Definition

`~/.fed/repos/<name>.json`:

```json
{
  "repo_root": "/path/to/git/repo",
  "worktree_base": "/path/to/worktrees",
  "setup": "npm install",
  "dev_server": "npm run dev",
  "symlinks": [".claude"],
  "copies": [".env.local"],
  "cleanup_pattern": "*my-project*"
}
```

| Field | Description |
|---|---|
| `repo_root` | git リポジトリのルートパス |
| `worktree_base` | worktree を作成する親ディレクトリ |
| `setup` | worktree 作成後に実行するセットアップコマンド |
| `dev_server` | dev server 起動コマンド (null で省略) |
| `symlinks` | repo_root からの symlink 対象 |
| `copies` | repo_root からのコピー対象 |
| `cleanup_pattern` | Claude project data のクリーンアップ対象 glob |

## Dashboard

`fed dashboard` でインタラクティブなターミナル UI を起動。

| Key | Action |
|---|---|
| `Up/Down` | セッション選択 |
| `Enter` | tmux セッションに切替 |
| `p` | 成果物プレビュー |
| `a` | 承認 |
| `f` | フィードバック入力 |
| `k` | セッション終了 |
| `q` | ダッシュボード終了 |

## Development

ビルドせずに直接実行:

```bash
cd cli && npx tsx src/index.ts start my-project feature-test
cd dashboard && npx tsx src/index.tsx
```

ビルド:

```bash
cd cli && npm run build
cd dashboard && npm run build
```

## Project Structure

```
agentic-federation/
├── cli/                          # CLI パッケージ (TypeScript + Commander.js)
│   ├── src/
│   │   ├── index.ts              # エントリポイント
│   │   ├── commands/             # サブコマンド実装
│   │   │   ├── init.ts           # fed init
│   │   │   ├── repo.ts           # fed repo
│   │   │   ├── start.ts          # fed start
│   │   │   ├── stop.ts           # fed stop
│   │   │   ├── list.ts           # fed list
│   │   │   ├── info.ts           # fed info
│   │   │   ├── archive.ts        # fed archive
│   │   │   ├── clean.ts          # fed clean
│   │   │   ├── dash.ts           # fed dashboard
│   │   │   ├── state.ts          # fed state
│   │   │   ├── artifact.ts       # fed artifact
│   │   │   ├── notify.ts         # fed notify
│   │   │   ├── feedback.ts       # fed feedback
│   │   │   ├── prompt.ts         # fed prompt
│   │   │   ├── stale.ts          # fed stale
│   │   │   ├── workflow.ts       # fed workflow
│   │   │   └── notify-human.ts   # fed notify-human
│   │   └── lib/                  # 共通ライブラリ
│   │       ├── paths.ts          # ~/.fed/ パス定数
│   │       ├── types.ts          # MetaJson, StateJson, RepoConfig 型
│   │       ├── session.ts        # セッション管理
│   │       ├── tmux.ts           # tmux ヘルパー
│   │       ├── repo.ts           # リポジトリ定義管理
│   │       ├── workflow.ts       # ワークフロー定義の読み込み・バリデーション
│   │       ├── notification-watcher.ts  # 通知ファイル監視 (chokidar)
│   │       └── stale-watcher.ts  # 状態停滞検知
├── dashboard/                    # ダッシュボード (TypeScript + Ink/React)
│   ├── src/
│   │   ├── index.tsx             # エントリポイント
│   │   ├── App.tsx               # メインアプリ
│   │   ├── components/           # UI コンポーネント
│   │   ├── hooks/                # React hooks
│   │   └── utils/                # ユーティリティ
├── workflows/                    # ワークフロー定義 (YAML)
├── commands/                     # Claude Code スキル定義 (.md)
└── prompts/                      # エージェントプロンプト
```
