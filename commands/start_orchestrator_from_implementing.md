# オーケストレータ起動（IMPLEMENTING から）

plan.md を準備した上で、オーケストレータを IMPLEMENTING フェーズ（実装者起動）から開始します。
設計レビューをスキップして実装に入りたい場合に使用します。

## 入力

$ARGUMENTS

## 手順

### 1. plan.md の存在チェック

`fed artifact read plan` を実行して plan.md の存在を確認する。

- **存在しない場合**: 以下のメッセージを表示して**停止**する。オーケストレータは起動しない。
  ```
  エラー: plan.md が存在しません。
  先に /make_plan で plan.md を作成してください。
  ```

- **存在する場合**: 次のステップへ進む。

### 2. state.json の更新

```bash
fed state update status IMPLEMENTING
```

### 3. オーケストレータ起動

`fed prompt read orchestrator` を実行してプロンプトを読み、オーケストレータとして動作を開始してください。
IMPLEMENTING のアクションを実行してください。
