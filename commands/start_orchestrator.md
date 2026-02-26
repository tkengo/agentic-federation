# オーケストレータ起動（PLAN_REVIEW から）

plan.md の存在を確認し、オーケストレータを PLAN_REVIEW フェーズから開始します。

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
fed state update status PLAN_REVIEW
fed state update pending_reviews '["gemini_plan", "codex_plan"]'
```

### 3. stale watcher の再開

```bash
fed stale resume
```

### 4. オーケストレータ起動

`fed prompt read orchestrator` を実行してプロンプトを読み、オーケストレータとして動作を開始してください。
PLAN_REVIEW のアクションを実行してください。
