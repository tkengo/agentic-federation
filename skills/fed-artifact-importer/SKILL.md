---
name: fed-artifact-importer
description: 指定されたパスのファイルを、指定された名前のfedアーティファクトとして書き出す（元ファイルは保持）。
user_invocable: true
disable-model-invocation: true
arguments: [filepath, artifact_name]
argument-hint: "<filepath> <artifact-name>"
---

## 呼び出し方

```text
/fed-artifact-importer <filepath> <artifact-name>
```

例:

```text
/fed-artifact-importer ./tmp/draft-plan.md plan
/fed-artifact-importer docs/spec.md spec
```

引数:

- `$filepath` = `$0`: 取り込み元ファイルのパス（絶対 or 相対）
- `$artifact_name` = `$1`: 書き出し先のアーティファクト名

## 入力検証

実行前に以下を確認する。不足や問題がある場合は、その旨を出力して中断する（推測で補完しない）。

1. `$filepath` と `$artifact_name` の両方が空でないこと
   - どちらかが空の場合: 使い方を表示して終了
2. `$filepath` のファイルが実在すること（`test -f "$filepath"`）
3. `fed artifact list` で `$artifact_name` と同名のアーティファクトが既存でないこと
   - 既存の場合: 上書きしてよいかユーザーに確認する。許可されない場合は中断

## 実行

```bash
fed artifact write "$artifact_name" --file "$filepath" --keep
```

ポイント:
- `--file` で取り込み元ファイルを指定
- `--keep` を **必ず付ける**（元ファイルを残す。デフォルトでは元ファイルが削除される）

## 完了報告

1. 書き出したアーティファクト名（`$artifact_name`）
2. アーティファクトの保存先絶対パス（`fed artifact path "$artifact_name"` で取得）
3. 元ファイル（`$filepath`）が保持されている旨

## 注意事項

- **`--keep` を必ず付ける**: 付け忘れると元ファイルが削除されてしまう（「インポート」のセマンティクスに反する）
- **ファイル内容を改変しない**: バイト列をそのままアーティファクトとして取り込む
- **アーティファクト名を推測しない**: 引数から明示されていない場合は中断する（ファイル名のbasenameから決め打ちしない）
