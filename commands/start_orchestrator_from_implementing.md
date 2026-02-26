# オーケストレータ起動（implementing から）

plan アーティファクトを準備した上で、オーケストレータを implementing フェーズ（実装者起動）から開始します。
計画レビューをスキップして実装に入りたい場合に使用します。

## 入力

$ARGUMENTS

## 手順

### 1. plan アーティファクトの存在チェック

`fed artifact read plan` を実行して plan の存在を確認する。

- **存在しない場合**: 以下のメッセージを表示して**停止**する。
  ```
  エラー: plan アーティファクトが存在しません。
  先にプランナーで計画を作成してください。
  ```

- **存在する場合**: 次のステップへ進む。

### 2. state.json の更新

```bash
fed state update status implementing
```

### 3. オーケストレータ起動

以下の情報を読み込み、オーケストレータとして動作を開始する：

1. `fed prompt read orchestrator` でオーケストレータプロンプトを読む
2. `fed state read workflow` でワークフロー名を取得する
3. `fed workflow show <ワークフロー名>` でワークフロー定義を読む

implementing のアクションを実行してください。
