---
name: fed-pr-creator
description: fedの計画アーティファクト（`fed artifact read plan`）の内容を反映したチームレビュー用のdraft PRを作成する。
user_invocable: true
disable-model-invocation: true
---

## いつ使うか

ユーザーが計画アーティファクト（`fed artifact read plan` で読めるもの）の内容を反映したdraft PRをチームレビュー用に作成したい場合にこのスキルを発動する。

## 前提条件

- 現在のセッションに `plan` という名前のアーティファクトが存在すること（`fed artifact list` で確認）
- 計画は `# [タスク名] 実装計画（TDD）` というタイトル形式で、`## 背景・ユーザーストーリー` `## 要件` `## 完了条件` セクションを含むこと
- 現在のブランチが main/master ではないこと
- `gh` CLIが認証済みで、PR作成権限があること

## 実行フロー

### Step 1: 前提チェック

以下を確認し、満たしていない場合はその旨を出力して中断する:

1. `fed artifact list` で `plan` アーティファクトが存在すること
2. `git branch --show-current` で main/master 以外であること
3. `gh pr view --json url 2>/dev/null` で既存PRがないこと（既にある場合はそのURLを表示して終了）

### Step 2: プッシュの確認

`gh pr create` はブランチがリモートにプッシュ済みであることを前提とするため、PR作成前に確認する。このマシンではユーザーが全てのgit操作を手動で行うルールがあるため、プッシュ自体はユーザーに任せる。

1. `git log "origin/$(git branch --show-current)..HEAD" 2>/dev/null` でリモートとの差分がないこと（push 済み）を確認する
2. 未プッシュのコミットがある場合は、その旨を出力してユーザーにプッシュをお願いし、完了を待ってから再確認する
3. リモートに対応するブランチが存在しない場合も同様に、ユーザーにプッシュをお願いする

未プッシュの場合は次のステップに進まず中断する。

### Step 3: PRボディの組み立て

`fed artifact read plan` で計画アーティファクトを読み、以下のセクションを抽出してPRボディを構成する:

| 抽出元 | PR上の見出し | 変換ルール |
|---|---|---|
| `# [タスク名] 実装計画（TDD）` | PRタイトル | `[タスク名]` をそのまま使用（70文字以内） |
| `## 背景・ユーザーストーリー` | `## Background & User Story` | `### 背景` `### ユーザーストーリー` `### ユースケース` のサブセクションを見出しごとそのまま転記 |
| `## 要件` | `## Requirements` | 内容をそのまま箇条書きで転記 |
| `## 完了条件` | `## Completion Criteria` | 各 `- 条件` を `- [ ] 条件` のチェックボックス形式に変換 |

PRボディフォーマット:

```markdown
## Background & User Story

### 背景
（計画の「### 背景」セクションの内容）

### ユーザーストーリー
（計画の「### ユーザーストーリー」セクションの内容）

### ユースケース
（計画の「### ユースケース」セクションの内容）

## Requirements

（計画の「## 要件」セクションの内容をそのまま箇条書きで）

## Completion Criteria

- [ ] 条件1
- [ ] 条件2
- ...
```

計画に `## 背景・ユーザーストーリー` セクションがない場合は、その見出しごとPRボディから省略する。

### Step 4: PRの作成

`gh pr create --draft --title "<title>" --body "<body>"` でdraft PRを作成する。

bodyはHEREDOCで渡す（フォーマット崩れ防止）:

```bash
gh pr create --draft --title "[タスク名]" --body "$(cat <<'EOF'
## Background & User Story
...
EOF
)"
```

### Step 5: 完了報告

作成したPRのURLを出力する。

## 注意事項

- **計画の内容を一切変更しない**: PRボディは計画アーティファクトの内容をそのまま転記する（チェックボックス変換を除く）
- **コミット/プッシュはユーザーに任せる**: スキル側で `git commit` や `git push` を実行しない
- **既存PRがある場合**: 新規作成せず、そのURLを表示して終了する
