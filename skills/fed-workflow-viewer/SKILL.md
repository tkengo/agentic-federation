---
name: fed-workflow-viewer
description: |
  fedに登録されたワークフロー定義を参照・閲覧する。fed workflow listで一覧、fed workflow showで詳細YAMLを確認する。
  TRIGGER when: 「このワークフローどうなってる？」「ワークフローの状態遷移を教えて」「どんなワークフローがある？」など、既存ワークフローの内容を確認する必要があるとき。
  DO NOT TRIGGER when: ワークフローを新規作成・修正するとき（fed-workflow-builderを使う）。
user_invocable: false
---

## いつ使うか

以下のような状況でこのスキルを参照する：

- 既存ワークフローの一覧を確認したいとき
- ワークフローの定義内容（ウィンドウ構成、状態遷移など）を閲覧したいとき
- ワークフローのエージェント構成やペインレイアウトを把握したいとき

**注意:** ワークフローの新規作成・修正には `fed-workflow-builder` スキルを使うこと。このスキルは参照・閲覧専用。

## コマンドリファレンス

### `fed workflow list`

利用可能なワークフローの一覧を表示する。

```bash
fed workflow list
# 出力例:
#   dev-team-v2
#   light-dev
#   req-spec
#   solo-dev
#   standalone
#   test-brushup
#   ultra-debug
```

### `fed workflow show [name]`

ワークフロー定義のYAML全文を出力する。名前を省略すると現在のセッションのワークフローを表示する。

```bash
# 名前を指定して表示
fed workflow show solo-dev
# 出力例:
# name: solo-dev
# description: "ソロ開発用"
#
# focus: solo-dev
#
# windows:
#   - name: solo-dev
#     panes:
#       - id: developer
#         name: Developer
#         pane: 1
#         command: 'yoloclaude --agent __fed-{{meta.workflow}}-{{meta.tmux_session}}-developer-agent'
#       ...
#
# states:
#   planning:
#     description: "人間と対話しながら計画を策定する"
#     color: blue
#     entry_point: true
#   ...

# 現在のセッションのワークフローを表示（名前省略）
fed workflow show
```

## show の出力構造

ワークフローYAMLは以下の主要セクションで構成される：

| セクション | 説明 |
|---|---|
| `name` | ワークフロー名 |
| `description` | ワークフローの説明 |
| `focus` | 初期フォーカスするウィンドウ名 |
| `windows` | tmuxウィンドウ・ペインの定義（エージェント配置、レイアウト） |
| `states` | 状態マシン定義（状態遷移、エントリーポイント、表示色） |

### windows の構造

各ウィンドウは `panes`（エージェントやツールを配置するペイン）と `layout`（分割レイアウト）を持つ：

- `panes[].id` - ペインのグローバル一意な識別子
- `panes[].name` - ダッシュボード上の表示名
- `panes[].command` - 起動コマンド（`null` で空ペイン）
- `layout.splits` - ペイン分割の定義
- `layout.focus` - 初期フォーカスペイン番号

### states の構造

各状態は以下のフィールドを持つ：

- `description` - 状態の説明
- `color` - ダッシュボード表示色（blue / yellow / green / magenta）
- `entry_point` - 初期状態フラグ（ワークフロー内で1つだけ `true`）
- `mark` - ダッシュボードに表示する短いマーク（オプション）

## 典型的な使用フロー

```bash
# 1. どんなワークフローがあるか確認
fed workflow list

# 2. 気になるワークフローの詳細を閲覧
fed workflow show dev-team-v2

# 3. 出力されたYAMLからウィンドウ構成や状態遷移を読み取る
```
