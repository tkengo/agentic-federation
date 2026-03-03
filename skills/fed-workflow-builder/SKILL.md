---
name: fed-workflow-builder
description: fedワークフロー定義（workflow.yaml + エージェントインストラクション）を構築するためのスキル。YAMLスキーマ、エージェントインストラクションのパターン、本番ワークフローから抽出した設計プラクティスを網羅。
user_invocable: true
---

## いつ使うか

以下のリクエストがあった場合にこのスキルを発動する：
- 新しいfedワークフローの作成（workflow.yaml + エージェントインストラクション .md ファイル）
- 既存ワークフローの修正・拡張
- 既存ワークフローへの新しいエージェントロールの追加
- ワークフローやエージェントインストラクションの構造についての質問

`workflows/` ディレクトリを含むリポジトリで作業している場合に適用される。

## 実行フロー

### Phase 1: 要件ヒアリング

ユーザーに以下を確認する（既に提供済みの項目はスキップ）：

1. **目的** - このワークフローで何を達成したいか？
2. **エージェントロール** - どんな役割が必要か？（例: プランナー、実装者、レビュアー）
3. **人間の関与** - どこで人間の承認・レビュー・判断が必要か？
4. **状態マシン** - どんなstatesと遷移があるか？（ユーザーと一緒に設計する）
5. **エージェントプロバイダー** - 各エージェントにどのモデル/ランナーを使うか？（`yoloclaude --agent <name>`, `yologemini`, `yolocodex`）
6. **tmuxレイアウト** - ウィンドウはいくつ？ ペインの配置は？

### Phase 2: 既存ワークフローの調査

何かを書く前に、参考として既存ワークフローを読む：

1. `workflows/` ディレクトリの一覧を確認
2. ユーザーの要件に最も近いワークフローを読む
3. 選んだワークフローの `agents/` ディレクトリ内のエージェントインストラクションを読む
4. 再利用可能なパターンやセクションを特定する

推測で書かないこと。新しいファイルを作成する前に、必ず実際のファイルを読むこと。

### Phase 3: workflow.yaml の作成

後述の「Workflow YAML リファレンス」に従ってワークフローYAMLを作成する。
配置先: `workflows/<workflow-name>/workflow.yaml`

### Phase 4: エージェントインストラクションの作成

`workflows/<workflow-name>/agents/` に、エージェントごとに1つの `.md` ファイルを作成する。
後述の「エージェントインストラクション リファレンス」に従う。

### Phase 5: バリデーション

まず `fed workflow validate <workflow-name>` を実行して、YAMLレベルのバリデーションを通す。
このコマンドは以下を自動チェックする：
- 必須トップレベルフィールド（name, description, windows, states）の存在
- ペイン `id` のグローバル一意性
- `entry_point: true` がちょうど1つであること

加えて、以下を手動で確認する：
- ペインコマンドの `--agent <name>` に対応する `agents/<name>.md` ファイルが存在すること
- エージェントインストラクション内の `fed notify <pane>` で参照されるペイン番号が正しいこと
- あるエージェントの出力artifact名が、次のエージェントの入力artifact名と一致すること

---

## Workflow YAML リファレンス

### トップレベル構造

```yaml
name: my-workflow
description: "ワークフローの説明"

windows:
  - name: <window-name>
    panes: [...]
    layout: { splits: [...], focus: <pane> }

states:
  <state-name>:
    description: "..."
    color: blue
    entry_point: true  # ちょうど1つのstateのみ
```

### ウィンドウとペイン

各ウィンドウにはエージェントやツールを配置したペイン（tmuxペイン）を含む：

```yaml
windows:
  - name: dev
    panes:
      - id: terminal       # グローバルに一意な識別子
        name: Terminal      # 表示名
        pane: 1             # ペイン番号（1始まり）
        command: 'yoloclaude --agent my-planner'  # null で空ペイン
      - id: editor
        name: Editor
        pane: 2
        command: nvim
    layout:
      splits:
        - { source: 1, direction: h, percent: 50 }  # ペイン1を水平分割
      focus: 1  # 初期フォーカスペイン
```

**ペインコマンドのパターン：**

| パターン | 用途 |
|---------|------|
| `'yoloclaude --agent <agent-name>'` | Claude Codeエージェント（agents/<agent-name>.mdから読み込み） |
| `yologemini` | Geminiエージェント（`fed notify` で指示を送信） |
| `yolocodex` | Codexエージェント（`fed notify` で指示を送信） |
| `nvim` | エディタペイン |
| `null` | 空ペイン（人間用ターミナル） |
| `"{{repo.extra.dev_server}}"` | テンプレート変数（`fed start` 時に展開） |

**レイアウト分割：**

- `source`: 分割するペイン番号
- `direction`: `h`（水平 = 左右に並べる）または `v`（垂直 = 上下に並べる）
- `percent`: 新しいペインのサイズ（パーセント）

複雑なレイアウトはASCIIアートのコメントで図示する：

```yaml
    # +---------------------+---------------------+
    # |                     |       human         |
    # |      planner        |      (pane 2)       |
    # |      (pane 1)       +----------+----------+
    # |                     |  revisor | reviewer |
    # |                     | (pane 3) | (pane 4) |
    # +---------------------+----------+----------+
```

### ステート

statesはワークフローの進行状況を表す。各stateは description と color を持つシンプルな定義。
エージェントが `fed state update status <next-state>` と `fed notify <pane> "message"` で自ら遷移を管理する。

```yaml
states:
  planning:
    description: "人間と対話しながら計画を策定する"
    color: blue          # blue | yellow | green | magenta
    entry_point: true    # ちょうど1つのstateのみ
    mark: "~"            # オプション、ダッシュボードに表示
  plan_review:
    description: "複数レビュアーによる並列計画レビュー"
    color: yellow
  plan_revision:
    description: "レビューフィードバックに基づく計画修正"
    color: yellow
  implementing:
    description: "計画に基づく実装フェーズ"
    color: blue
  code_review:
    description: "複数レビュアーによる並列コードレビュー"
    color: yellow
  code_revision:
    description: "レビューフィードバックに基づくコード修正"
    color: yellow
  completed:
    description: "全レビュー通過、人間の最終承認待ち"
    mark: "+"
    color: green
```

**stateフィールド：**

| フィールド | 必須 | 用途 |
|-----------|------|------|
| `description` | Yes | 説明テキスト |
| `color` | Yes | ダッシュボードの表示色 |
| `entry_point` | No | 初期状態を示す（ちょうど1つ） |
| `mark` | No | ダッシュボードに表示する短いマーク |

### テンプレート変数

workflow YAML内で使用可能。`fed start` 時に展開される：

| 変数 | ソース |
|------|--------|
| `{{meta.session}}` | tmuxセッション名 |
| `{{meta.repo}}` | リポジトリ名 |
| `{{meta.branch}}` | ブランチ名 |
| `{{repo.root}}` | メインリポジトリのルートパス |
| `{{repo.extra.*}}` | リポジトリ設定JSONのカスタムフィールド |

---

## エージェントインストラクション リファレンス

### ファイル配置と命名

配置先: `workflows/<workflow-name>/agents/<agent-name>.md`

`<agent-name>` はペインコマンドの `--agent` の値と一致させること。
命名規約: `<workflow-name>-<role>`（例: `dev-team-v2-planner`, `solo-dev-developer-agent`）

### フロントマター

```yaml
---
name: my-workflow-planner
description: English description of the agent's role.
model: opus
tools: Read, Write, Edit, Bash, Glob, Grep
---
```

### 必須セクション

すべてのエージェントインストラクションに以下のセクションが必要：

#### 1. 役割定義

アイデンティティと責務を1文で明確に定義する：

```markdown
# プランナー エージェント

あなたはエージェントチームのプランナーです。人間との対話を通じて要件を深掘りし、実装計画を策定します。
```

#### 2. フロー（ステップバイステップ手順）

具体的な `fed` コマンドを含む番号付きステップ。各ステップは具体的かつ曖昧さがないこと：

```markdown
## フロー

1. `fed artifact read plan` で現在の計画を読む
2. 後述のレビュー観点に従ってレビューする
3. Write ツールで `./tmp-review.md` にレビュー結果を書き出してから、`fed artifact write plan_review_gemini --file ./tmp-review.md` で保存する
4. `fed notify 3 "完了: plan_review_gemini"` を実行して完了報告
5. 再レビューの依頼があれば1から繰り返す
```

**重要: フローには必ず `artifact write` と `notify`/`state update` の両方を含めること。**

#### 3. 絶対ルール

禁止事項を太字で記述。エージェントが役割を逸脱するのを防ぐ：

```markdown
## 絶対ルール

1. **コードは書かない。** 作成するのは計画のみ。
2. **「実装に進みましょう」と言わない。** あなたの役割は計画の作成・修正で終わる。
3. **要件を勝手に解釈しない。** ユーザーに質問するかエスカレーションする。
4. **質問はなるべくまとめて一度に聞く。**
```

### 任意セクション

#### 4. 出力フォーマット

後続エージェントがパース可能な構造化Markdownテンプレートを定義する：

```markdown
## 出力フォーマット

\```markdown
# 計画レビュー

## 判定
（APPROVE | REQUEST_CHANGES | ESCALATE）

## サマリー
（1-2文で全体的な評価）

## 指摘事項
### 指摘1: （タイトル）
- **重要度**: High / Medium / Low
- **観点**: ...
- **内容**: ...
- **推奨対応**: ...
\```
```

#### 5. エスカレーション

人間にエスカレーションするタイミングと方法：

```markdown
## エスカレーション

### エスカレーションすべきケース
- 要件の解釈に複数の可能性がある
- トレードオフの判断が必要（例: パフォーマンス vs 保守性）
- 技術的な制約で要件を満たせない可能性がある
- セキュリティ上の懸念がある

### エスカレーション手順
1. アーティファクトに問題を記載：
   \```markdown
   ## エスカレーション事項
   ### 問題: （タイトル）
   - **状況**: （詳細な説明）
   - **選択肢A**: （説明、メリット/デメリット）
   - **選択肢B**: （説明、メリット/デメリット）
   - **推奨**: （あれば）
   \```
2. 回答を待つ
3. 回答を受けたら作業を継続
```

### オプションセクション（ロール別）

| セクション | 対象ロール | 用途 |
|-----------|-----------|------|
| 議論の進め方 | Planner | ユーザーへの要件深掘りの方法 |
| レビュー観点 | Reviewer | チェック項目（要件整合性、アーキテクチャ、一貫性） |
| 判定基準 | Reviewer | APPROVE / REQUEST_CHANGES / ESCALATE の判断基準 |
| 人間による確定事項の保護 | Revisor, Reviewer | 人間の決定を尊重するルール |
| 通知の送信方法 | Planner, Solo developer | `fed waiting-human set` の使い方 |
| 計画の形式 | Planner, Revisor | 実装計画のテンプレート |
| 実装サマリーの形式 | Implementer | 実装報告のテンプレート |
| 改訂履歴の形式 | Revisor, Implementer | リビジョン間の変更記録方法 |

---

## 設計パターン

### 1. 単一責任

各エージェントには明確な1つの役割を持たせ、絶対ルールで強制する。

- Planner: 計画を作成する。コードは書かない。
- Implementer: コードを書く。計画は変更しない。
- Reviewer: 評価する。コード/計画を修正しない。
- Revisor: レビューに基づき計画を修正する。人間とは対話しない。

### 2. アーティファクトベースの通信

エージェント間のデータ交換は、直接メッセージではなく名前付きアーティファクトで行う：

```
Planner --[plan]--> Reviewer --[plan_review_gemini]--> Revisor --[plan (更新)]--> ...
```

- `fed artifact write <name> --file <path>` で出力を保存
- `fed artifact read <name>` で入力を読み取り
- 必ず一時ファイルに書き出してから `--file` フラグを使う

**命名規約:** `<type>` または `<type>_<provider>`（例: `plan`, `plan_review_gemini`, `code_review_codex`, `implementation`）

### 3. 通知ベースの協調

エージェントは `fed notify` で完了を知らせたりアクションを要求する：

```bash
# エージェント間の直接通知
fed notify <target-pane> "計画が更新されています。再レビューしてください。"
# 完了シグナル
fed notify <target-pane> "完了: plan_review_gemini"
```

**複数エージェントの待ち合わせ:** 期待されるすべての通知が揃うまで待機する。これをインストラクションに明示的に記述すること：
> "完了: plan_review_gemini" と "完了: plan_review_codex" の両方の通知が来るまで待機する。両方揃ったら次に進む。

### 4. 状態管理

エージェントがインストラクション内から直接呼び出す：

```bash
fed state update status <state-name>
```

### 5. Human-in-the-Loop

エージェントが人間の入力を必要とする場合は `fed waiting-human set` を使用する：

```bash
fed waiting-human set --reason "計画のレビューをお願いします" --notify
```

- `--notify` でターミナル通知（ベル）を送信
- 人間が応答するとフック経由で待機状態が自動クリアされる
- `--reason` には必ず「なぜ待っているか」を説明する

### 6. 人間の決定の保護（3層パターン）

人間がAI生成の計画をレビューした際の決定は、後続のAIレビューサイクルを通じて保護される必要がある。

**第1層 - Plannerが記録：**
```markdown
## 人間による確定事項

以下は人間がレビューして確定した方針です。
AIによる計画レビューではこれらの項目を変更要求の対象にしてはいけません。

- 認証方式はJWTではなくセッションベースとする（2026-02-18）
- テーブル名は auth_sessions とする（2026-02-18）
```

**第2層 - Revisorが保護：**
- 人間による確定事項を絶対に変更・削除しない
- 確定事項と矛盾するAIレビューフィードバックは無視する
- 改訂履歴に記録する：「レビュー指摘: 〇〇 → 人間による確定事項のため変更せず」
- 確定事項が致命的な技術的問題を引き起こす場合に限りエスカレーションする

**第3層 - Reviewerが尊重：**
- 確定事項に対して REQUEST_CHANGES を出さない
- 確定事項が技術的に危険な場合は ESCALATE を使う（REQUEST_CHANGES ではない）
- 確定事項以外の部分は通常通りレビューする

### 7. ワークフロー停止防止

アーティファクトの書き出しや通知の送信を忘れると、ワークフロー全体が停止する。インストラクション内で強調して注意喚起する：

```markdown
**レビュー完了後の artifact write と notify は必ず実行すること。実行しなかった場合はワークフロー全体が停止してしまうため、絶対に実行を忘れてはならない。**

完了報告は人間の許可不要で即座に実行すること。
完了報告は毎回必ず送信すること（再実行時も含む）。
```

このパターンの配置場所：
- フローのステップの直後
- 太字で重要箇所に繰り返し記載
- 結果（ワークフロー停止）を明示した警告とセット

---

## 重要ルール

- ペイン `id` はワークフロー内の全ウィンドウを通じてグローバルに一意でなければならない
- `entry_point: true` を持つstateはちょうど1つだけ
- エージェントの `.md` ファイル名はペインコマンドの `--agent <name>` と一致させる
- 出力フォーマットのテンプレートはエージェント間の通信プロトコル。変更すると後続エージェントが壊れる
- エージェントが最初に人間から入力を受け取った際、最初のアクションとして `fed describe set <要約>` を実行する
- `yologemini` や `yolocodex` を使うエージェントには `fed notify` で指示を送信する（起動時に.mdファイルを読まない）
- `yoloclaude --agent <name>` を使うエージェントは.mdファイルから自動的にインストラクションを読み込む
- ワークフローのテストは、各エージェントのフローを1ステップずつ読み進め、すべての artifact write に対応する artifact read が後続に存在するかを検証する
