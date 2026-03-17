---
name: fed-repo
description: "fedに登録されたリポジトリのローカルパスを取得する。fed repo listで一覧、fed repo showでrepo_rootパスを確認してコードを読む。\nTRIGGER when: 「このリポジトリ調べて」「XXXのコード見て」「リポジトリのパス教えて」など、別リポジトリのコードを参照する必要があるとき。\nDO NOT TRIGGER when: 現在のリポジトリ内だけで作業しているとき、またはGitHub上のリモートリポジトリの話題のみのとき。"
user_invocable: false
---

## いつ使うか

以下のような状況でこのスキルを参照する：

- ユーザーが「このリポジトリを調べて」「XXXのコードを見て」などローカルリポジトリの参照を要求したとき
- 別リポジトリのコードを読む必要があるとき
- リポジトリのパスやディレクトリ構造を確認する必要があるとき

## コマンドリファレンス

### `fed repo list`

登録済みリポジトリの一覧を表示する（名前 + メインパス）。

```bash
fed repo list
# 出力例:
#   meap - /Users/xxx/fed/repos/meap-workspace/main
#   oasis-core - /Users/xxx/fed/repos/oasis-core-workspace/main
#   ...
```

### `fed repo show <name>`

リポジトリ定義の詳細をJSON形式で出力する。

```bash
fed repo show meap
# 出力例:
# {
#   "repo_root": "/Users/xxx/fed/repos/meap-workspace/main",
#   "worktree_base": "/Users/xxx/fed/repos/meap-workspace",
#   "base_branch": "origin/main",
#   "scripts": { ... },
#   ...
# }
```

## `fed repo show` の出力スキーマ

| フィールド | 説明 |
|---|---|
| `repo_root` | **最重要**。メインブランチのローカルパス。コードを読むときはこのパスを起点にする |
| `worktree_base` | worktree用ベースディレクトリ |
| `base_branch` | ベースブランチ（デフォルト `origin/main`） |
| `scripts` | リポスクリプト定義 |
| `setup_scripts` | セットアップ時に実行されるスクリプト |
| `symlinks` | worktree作成時にシンボリックリンクされるパス |

## 典型的な使用フロー

```bash
# 1. リポジトリ名を確認
fed repo list

# 2. パスを取得
fed repo show meap
# → "repo_root": "/Users/xxx/fed/repos/meap-workspace/main"

# 3. repo_root のパスを使って Read / Grep / Glob ツールでコードを読む
```
