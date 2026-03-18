---
name: fed-files-viewer
description: |
  調査結果やナレッジをfedナレッジベースに保存・読み出しする。セッション横断で永続化される。
  TRIGGER when: 「調査結果を保存して」「前に調べたやつ見て」「ナレッジに残して」など、調査結果の保存や過去の知見の参照が必要なとき。
  DO NOT TRIGGER when: 通常のプロジェクトファイルの読み書きや、現セッション内のみのアーティファクト保存のとき。
user_invocable: false
---

## いつ使うか

以下のような状況でこのスキルを参照する：

- 調査結果やナレッジを保存・共有する必要があるとき
- 過去の調査結果を参照する必要があるとき
- セッション横断で情報を永続化したいとき

## コマンドリファレンス

### `fed files save <name>`

ファイルをナレッジベースに保存する。

```bash
# ファイルを指定して保存
fed files save my-investigation --file ./tmp-result.md

# 元ファイルを削除せずに保存
fed files save my-investigation --file ./tmp-result.md --keep
```

**オプション:**

| オプション | 説明 |
|---|---|
| `--file <path>` | 保存するファイルのパス（省略時はstdinから読み取り） |
| `--keep` | 保存後に元ファイルを削除しない（**デフォルトでは元ファイルは削除される**） |

**保存ファイル名形式:** `YYYYMMDD_<6hexID>_<name>.md`

### `fed files read <name>`

ナレッジベースからファイルを読み出す。

```bash
fed files read survey-type-architecture
# → 20260317_209e78_survey-type-architecture.md の内容が出力される
```

### `fed files list`

ナレッジベースのファイル一覧を表示する。

```bash
fed files list
# 出力例:
# Files (1-3 of 3):
#   20260316_b699f6_wg-goal-draft.md                      5.9KB
#   20260317_209e78_survey-type-architecture.md          19.6KB
#   20260317_a4ff41_panelist-persona-system.md            9.9KB
```

**オプション:**

| オプション | 説明 |
|---|---|
| `--limit <n>` | 表示件数制限 |
| `--offset <n>` | オフセット指定 |

### `fed files dir`

ナレッジベースディレクトリのパスを表示する。このパスを取得すれば、Read / Grep / Glob ツールで直接ディレクトリ内を検索・閲覧してもよい。

```bash
fed files dir
# → /Users/xxx/fed/repos/ai-documentation-workspace/main
```

## ファイル名解決ルール

`fed files read` はファイル名を以下の順序で解決する：

1. 正確なファイル名マッチ
2. `.md` を付与した検索
3. `_<name>` または `_<name>.md` のサフィックスマッチ

つまり、日付やIDを覚える必要はない。名前の一部だけで読み出せる：

```bash
# これらはすべて 20260317_209e78_survey-type-architecture.md にマッチする
fed files read 20260317_209e78_survey-type-architecture.md  # 完全一致
fed files read survey-type-architecture.md                  # サフィックス + .md
fed files read survey-type-architecture                     # サフィックスのみ
```

## 典型的な使用フロー

### 調査結果を保存する

```bash
# 1. 一旦tmpファイルに書く（Write ツールを使う）
# 2. fed files save で保存
fed files save my-investigation --file ./tmp-result.md
# → 元ファイル（tmp-result.md）は自動削除される
```

### 過去の調査結果を参照する

```bash
# 1. 一覧確認
fed files list

# 2. 名前の一部で読み出し
fed files read survey-type-architecture
```
