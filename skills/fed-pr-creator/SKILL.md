---
name: fed-pr-creator
description: fedの計画アーティファクトを `docs/plans/YYYYMM/YYYYMMDD-{task-name}.md` に書き出し、その内容からチームレビュー用のdraft PRを作成する。
user_invocable: true
disable-model-invocation: true
---

## いつ使うか

ユーザーが計画アーティファクト（`fed artifact read plan` で読めるもの）をリポジトリの `docs/plans/` に書き出し、その計画の内容を反映したdraft PRをチームレビュー用に作成したい場合にこのスキルを発動する。

## 前提条件

- 現在のセッションに `plan` という名前のアーティファクトが存在すること（`fed artifact list` で確認）
- 計画は `# [タスク名] 実装計画（TDD）` というタイトル形式で、`## 概要` `## 要件` `## 完了条件` セクションを含むこと
- 現在のブランチが main/master ではないこと
- `gh` CLIが認証済みで、PR作成権限があること

## 実行フロー

### Step 1: 前提チェック

以下を確認し、満たしていない場合はその旨を出力して中断する:

1. `fed artifact list` で `plan` アーティファクトが存在すること
2. `git branch --show-current` で main/master 以外であること
3. `gh pr view --json url 2>/dev/null` で既存PRがないこと（既にある場合はそのURLを表示して終了）

### Step 2: 計画のエクスポート

1. `fed artifact read plan` で計画アーティファクトを読む
2. タイトル `# [タスク名] 実装計画（TDD）` から `[タスク名]` 部分を抽出する
3. タスク名をケバブケースに変換する（日本語の場合は意味を英訳してケバブケース化。例: `ユーザー認証` → `user-auth`）
4. 保存先パスを決定する:
   - ディレクトリ: `docs/plans/YYYYMM/`（YYYYMM は `date +%Y%m` で取得）
   - ファイル名: `YYYYMMDD-{task-name}.md`（YYYYMMDD は `date +%Y%m%d` で取得）
   - フルパス例: `docs/plans/202604/20260415-user-auth.md`
5. `mkdir -p docs/plans/YYYYMM` でディレクトリを作成する
6. `cp "$(fed artifact path plan)" docs/plans/YYYYMM/YYYYMMDD-{task-name}.md` でアーティファクトをコピーする（**内容は一切変更しない**）

### Step 3: コミット & プッシュの確認

書き出したファイルをユーザーに **自分でコミット & プッシュしてもらう**。理由は、このマシンではユーザーが全てのgitコミットを手動で行うルールがあるため。

1. ファイルを書き出した旨と、コミット & プッシュをお願いする旨を出力する
2. ユーザーがコミット & プッシュを完了するのを待つ
3. 以下を確認してから次のステップへ進む:
   - `git status --porcelain` で書き出したファイルがコミット済みであること
   - `git log "origin/$(git branch --show-current)..HEAD" 2>/dev/null` でリモートとの差分がないこと（push 済み）

未コミット or 未プッシュの場合は、その旨を出力して中断する。

### Step 4: PRボディの組み立て

計画から以下のセクションを抽出し、PRボディを構成する:

| 抽出元 | PR上の見出し | 変換ルール |
|---|---|---|
| `# [タスク名] 実装計画（TDD）` | PRタイトル | `[タスク名]` をそのまま使用（70文字以内） |
| `## 概要` | `## Overview` | 内容をそのまま転記 |
| `## 要件` | `## Requirements` | 内容をそのまま箇条書きで転記 |
| `## 完了条件` | `## Completion Criteria` | 各 `- 条件` を `- [ ] 条件` のチェックボックス形式に変換 |

PRボディフォーマット:

```markdown
## Overview

（計画の「## 概要」セクションの内容）

## Requirements

（計画の「## 要件」セクションの内容をそのまま箇条書きで）

## Completion Criteria

- [ ] 条件1
- [ ] 条件2
- ...
```

### Step 5: PRの作成

`gh pr create --draft --title "<title>" --body "<body>"` でdraft PRを作成する。

bodyはHEREDOCで渡す（フォーマット崩れ防止）:

```bash
gh pr create --draft --title "[タスク名]" --body "$(cat <<'EOF'
## Overview
...
EOF
)"
```

### Step 6: 完了報告

作成したPRのURLを出力する。

## 注意事項

- **計画の内容を一切変更しない**: docs/plans/ に書き出すファイルは計画アーティファクトのバイト列をそのままコピーする
- **コミット/プッシュはユーザーに任せる**: スキル側で `git commit` や `git push` を実行しない
- **既存PRがある場合**: 新規作成せず、そのURLを表示して終了する
- **日付は実行時点のもの**: `date` コマンドで取得する（ハードコードしない）
