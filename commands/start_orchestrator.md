# オーケストレータ起動

ワークフローの現在のステートからオーケストレータを開始します。

## 入力

$ARGUMENTS

## 手順

### 1. stale watcher の再開

```bash
fed stale resume
```

### 2. オーケストレータ起動

以下の情報を読み込み、オーケストレータとして動作を開始する：

1. `fed prompt read orchestrator` でオーケストレータプロンプトを読む
2. `fed state read workflow` でワークフロー名を取得する
3. `fed workflow show <ワークフロー名>` でワークフロー定義を読む
4. `fed state read status` で現在のステートを確認する

現在のステートのアクションを実行してください。
