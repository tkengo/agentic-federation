---
name: claude-md-brushup
description: CLAUDE.md と docs/ をコードベースの実態および開発知見に基づいて最適化する
user_invocable: true
---

## いつ使うか

ユーザーが CLAUDE.md や docs/ の最適化・ブラッシュアップを依頼した場合にこのスキルを発動する。

## 実行フロー

### Step 1: 情報収集

以下を順に収集する:

1. **CLAUDE.md** を読む
2. **docs/ ディレクトリ** の全ファイルを読む（存在する場合）
3. **プロジェクト構造** を調査:
   - ディレクトリ構造を Glob / ls で把握
   - プロジェクト設定ファイルを読む（package.json / pyproject.toml / Cargo.toml 等）
   - ツール設定を読む（tsconfig.json / ruff.toml / eslint.config.* / vitest.config.* 等）
   - テスト構造とテストコマンドを確認
   - 主要なソースコードをサンプリングして設計パターンを把握
4. **learnings アーティファクト** を収集:
   - プロジェクト名を特定（CLAUDE.md やディレクトリ名から推定）
   - `~/.fed/archive/<project>/` 配下の全セッションから `artifacts/learnings.md` を探す
   - 存在するものをすべて読む（存在しない場合はスキップ）

### Step 2: 分析

以下の4つの観点で分析する。

#### A) 乖離検出

CLAUDE.md + docs/ の記述とコードベースの実態を比較し、ズレを検出する:

- ディレクトリ構造の記述が実際と異なる
- 言及されているファイル・モジュールが存在しない、または名前が変わっている
- ビルド/テスト手順・コマンドが古い
- 依存関係やツール設定の記述が実態と異なる
- 記載されている API やインターフェースが変更されている

#### B) 分割提案

CLAUDE.md が肥大化している場合、docs/ への分割を提案する。

**判断基準**:

| CLAUDE.md に残す | docs/ に移す |
|-----------------|-------------|
| プロジェクト概要 | サブシステムの詳細な仕様 |
| リポジトリマップ（簡潔な表） | 各コンポーネントのアーキテクチャ詳細 |
| Quick Reference（主要コマンド） | 詳細な開発ガイド |
| Critical Rules（常に適用） | 詳細なコーディングルール（例示付き） |
| docs/ への参照テーブル | 環境設定、デプロイ手順 |

**docs/ の標準構造** (既存プロジェクトのパターンに準拠):

```
docs/
├── architecture/     # アーキテクチャ詳細
│   └── overview.md   # 全体構成、技術スタック、レイヤー依存関係
├── coding-rules/     # コーディングルール
│   └── rules.md      # lint、型チェック、テストパターン、コメント規約
├── guides/           # ガイド
│   └── development.md # セットアップ、コマンド、テスト、コード品質
└── references/       # 参考情報
    └── related-repos.md # 関連リポジトリの概要とリンク
```

**CLAUDE.md に追加する参照テーブルの形式**:

```markdown
## Documentation

| Document | What it covers |
|----------|----------------|
| [Architecture](docs/architecture/overview.md) | Components, tech stack, layer dependencies |
| [Coding Rules](docs/coding-rules/rules.md) | Lint, type checking, test patterns |
| [Development Guide](docs/guides/development.md) | Setup, commands, testing |
```

CLAUDE.md が既にコンパクトで docs/ への参照が適切な場合は「分割不要」と判定する。

#### C) 不足情報の追加提案

コードベースから読み取れるが CLAUDE.md / docs/ に記載されていない情報を特定する:

- 使用ライブラリ・フレームワークの重要な規約やバージョン
- テスト方法（テストフレームワーク、実行コマンド、カバレッジ）
- lint / format の設定・コマンド
- 重要な設計パターン（コードから読み取れるもの）
- ディレクトリ規約（新規ファイルをどこに置くべきか）
- エラーハンドリングのパターン

#### D) learnings 知見の反映提案

過去の開発セッションで抽出された知見を docs/ に反映する提案:

- 各 learnings アーティファクトの「推奨アクション」フィールドを確認
- まだ CLAUDE.md や docs/ に反映されていない知見を抽出
- 反映先を提案（CLAUDE.md の Critical Rules / docs/ のどのファイル）
- 既に反映済みの知見は除外
- learnings アーティファクトが1つも存在しない場合は「対象なし」とする

### Step 3: 提案レポート出力

以下の形式で提案レポートを出力する:

```markdown
# CLAUDE.md Brushup 提案

## サマリー
- 乖離: X件
- 分割提案: X件
- 不足情報: X件
- learnings 反映: X件

---

## 1. 乖離検出

### 1.1 [対象セクション/ファイル]
- **現在の記述**: ...
- **実態**: ...
- **修正案**: ...

（問題がない場合は「乖離なし」と記載）

---

## 2. 分割提案

（CLAUDE.md が既にコンパクトな場合は「分割不要」と記載）

### CLAUDE.md に残す内容
（残す内容の概要）

### docs/ に移す内容
| ファイル | 内容 | 移動元 |
|---------|------|-------|
| `docs/architecture/overview.md` | ... | CLAUDE.md ## XXX |

### CLAUDE.md に追加する参照テーブル
（具体的な Markdown プレビュー）

---

## 3. 不足情報

### 3.1 [追加提案タイトル]
- **追加先**: CLAUDE.md / docs/xxx.md
- **根拠**: （コードベースのどこから読み取ったか）
- **追加内容案**:
  （具体的な追加テキスト）

（不足がない場合は「不足なし」と記載）

---

## 4. learnings 反映提案

（learnings が存在しない場合は「対象なし」と記載）

### 4.1 [知見タイトル]（元セッション: xxx）
- **反映先**: docs/coding-rules/rules.md 等
- **内容**: ...
```

### Step 4: 人間の承認

提案レポートを出力したら、AskUserQuestion ツールで人間に承認を求める。
選択肢: 全体承認 / 個別に取捨選択 / 修正指示あり

### Step 5: 承認された提案の適用

人間が承認した提案のみを適用する:
- CLAUDE.md の更新
- docs/ ファイルの新規作成・更新
- 適用完了後に変更サマリーを報告

**重要: 人間の承認なしに CLAUDE.md や docs/ を変更してはならない。**
