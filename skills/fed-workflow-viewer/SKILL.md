---
name: fed-workflow-viewer
description: |
  fedに登録されたワークフロー定義を参照・閲覧する。workflows/ディレクトリのYAMLファイルを直接読む。
  TRIGGER when: 「このワークフローどうなってる？」「ワークフローの状態遷移を教えて」「どんなワークフローがある？」など、既存ワークフローの内容を確認する必要があるとき。
  DO NOT TRIGGER when: ワークフローを新規作成・修正するとき（fed-workflow-builderを使う）。
user_invocable: false
---

## いつ使うか

以下のような状況でこのスキルを参照する：

- 既存ワークフローの一覧を確認したいとき
- ワークフローの定義内容（ウィンドウ構成、ステップ構成など）を閲覧したいとき
- ワークフローのエージェント構成やペインレイアウトを把握したいとき

**注意:** ワークフローの新規作成・修正には `fed-workflow-builder` スキルを使うこと。このスキルは参照・閲覧専用。

## コマンドリファレンス

### ワークフロー一覧

ワークフローは `workflows/` ディレクトリに格納されている。一覧を確認するには：

```bash
ls workflows/
```

### ワークフロー定義の閲覧

v2ワークフロー定義を直接読む：

```bash
cat workflows/<name>/workflow-v2.yaml
```

### ワークフローのバリデーション

```bash
fed workflow validate <name>
```

## 典型的な使用フロー

```bash
# 1. どんなワークフローがあるか確認
ls workflows/

# 2. 気になるワークフローの詳細を閲覧
cat workflows/solo-dev/workflow-v2.yaml

# 3. バリデーション
fed workflow validate solo-dev
```
