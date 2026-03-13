# 会話記録自動収集 (conv-store) 実装計画

## 概要

`fed stop` 実行時に、セッション中に使われた AI ツール (Claude Code / Codex / Gemini) の会話ログを自動収集し、共通 JSONL フォーマットに正規化してセッションディレクトリに保存する機能を追加する。

## 要件

- Claude Code, Codex, Gemini の 3 ツールの会話ログを対象とする
- `fed stop` 時に一括収集する（リアルタイム収集はスコープ外）
- 各ツールの生ログを共通 JSONL フォーマットに正規化する
- セッション単位でセッションディレクトリに保存する
- 用途はデバッグ・監査 + 振り返り・学習

## 完了条件

- [ ] `fed stop` 実行時に自動的に会話ログが収集される
- [ ] Claude Code / Codex / Gemini の 3 ツールすべてに対応
- [ ] 共通 JSONL フォーマットに正規化して保存される
- [ ] 対象セッションが見つからない場合も stop がエラーにならない（best-effort）
- [ ] `fed conv list` で収集済み会話一覧を確認できる
- [ ] `fed conv show <id>` で会話内容を閲覧できる
- [ ] ビルドが通り、lint エラーがないこと

## 制約・注意事項

- Codex にはフック機構がないため、`~/.codex/state_5.sqlite` + rollout JSONL から収集
- 各ツールのログ保存場所はバージョンにより変わる可能性があるため、パスを定数化する
- 会話収集の失敗がセッション停止をブロックしてはならない（try-catch で囲む）
- SQLite アクセスには `better-sqlite3` を使う（同期 API で既存パターンに合致）

---

## Phase 1: 共通フォーマット定義 & ライブラリ

### 1.1 正規化後の共通 JSONL フォーマット定義

**ファイル**: `cli/src/lib/conv-store.ts`

各ツールの会話ログを以下の共通フォーマットに正規化する。1 ファイル = 1 セッション分の会話、各行が 1 ターン。

```typescript
// Normalized conversation turn
export interface ConvTurn {
  tool: "claude" | "codex" | "gemini";
  session_id: string;          // Tool-native session ID
  timestamp: string;           // ISO 8601
  role: "user" | "assistant";  // Only user/assistant (tool calls excluded from top-level)
  content: string;             // Text content of the turn
  tool_calls?: ConvToolCall[]; // Tool calls within this turn (optional)
  metadata?: Record<string, unknown>; // Tool-specific metadata (model, tokens, etc.)
}

export interface ConvToolCall {
  name: string;
  input?: string;   // Truncated to reasonable length
  output?: string;  // Truncated to reasonable length
}

// Conversation file metadata (first line of each JSONL, type discriminated)
export interface ConvMeta {
  type: "meta";
  tool: "claude" | "codex" | "gemini";
  session_id: string;
  pane: string;               // tmux pane identifier (e.g. "solo-dev.0")
  started_at: string;
  collected_at: string;
  turn_count: number;
  source_path: string;        // Original log file path
}
```

### 1.2 収集先ディレクトリとファイル命名

保存先: `<sessionDir>/conversations/`

ファイル名: `<pane>_<tool>.jsonl`
例: `solo-dev.0_claude.jsonl`, `solo-dev.1_codex.jsonl`

### 1.3 ツールごとのログパス定数

```typescript
import os from "node:os";
import path from "node:path";

export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
export const CODEX_DB_PATH = path.join(os.homedir(), ".codex", "state_5.sqlite");
export const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");
export const GEMINI_TMP_DIR = path.join(os.homedir(), ".gemini", "tmp");
```

---

## Phase 2: 各ツールのコレクター実装

### 2.1 Claude Code コレクター

**ファイル**: `cli/src/lib/collectors/claude.ts`

**収集ロジック**:
1. `<sessionDir>/claude-sessions/*.json` を読んで session_id を取得（既存の `fed claude` が記録済み）
2. `~/.claude/projects/` 配下を走査して `<session-id>.jsonl` を探す
3. JSONL をパースして共通フォーマットに変換

**Claude Code JSONL の構造**（実データから確認済み）:
- 各行は `type` フィールドで識別
- `type: "user"` → `message.content` にユーザーの発言
- `type: "assistant"` → `message.content` に AI 応答（content blocks 配列）
- `type: "file-history-snapshot"` → スキップ

```typescript
export interface ClaudeCollectorResult {
  pane: string;
  sessionId: string;
  turns: ConvTurn[];
  sourcePath: string;
}

export function collectClaude(sessionDir: string): ClaudeCollectorResult[];
```

### 2.2 Codex コレクター

**ファイル**: `cli/src/lib/collectors/codex.ts`

**収集ロジック**:
1. `meta.json` から `worktree` パスとセッション開始時刻を取得
2. `~/.codex/state_5.sqlite` の `threads` テーブルを照会:
   - `cwd` が worktree パスに一致
   - `created_at` がセッション開始時刻以降
3. `rollout_path` から JSONL を読み取り
4. 共通フォーマットに変換

**Codex rollout JSONL の構造**（実データから確認済み）:
- `type: "event_msg"` + `payload.type: "user_message"` → ユーザー発言
- `type: "event_msg"` + `payload.type: "agent_message"` → AI 応答
- `type: "response_item"` + `payload.type: "message"` + `payload.role: "user"` → ユーザー（詳細）
- `type: "response_item"` + `payload.type: "function_call"` → ツール呼び出し
- `type: "session_meta"` → セッションメタデータ

```typescript
export function collectCodex(sessionDir: string, meta: MetaJson): CodexCollectorResult[];
```

**注意**: `better-sqlite3` を使用して SQLite を読む。npm dependency の追加が必要。

### 2.3 Gemini コレクター

**ファイル**: `cli/src/lib/collectors/gemini.ts`

**収集ロジック**:
1. `meta.json` から `worktree` パスとセッション開始時刻を取得
2. worktree パスから SHA-256 ハッシュを計算してプロジェクトハッシュを特定
3. `~/.gemini/tmp/<hash>/chats/session-*.json` を走査
4. `startTime` がセッション開始時刻以降のファイルをフィルタ
5. JSON をパースして共通フォーマットに変換

**Gemini session JSON の構造**（実データから確認済み）:
- トップレベル: `sessionId`, `projectHash`, `startTime`, `lastUpdated`, `messages`, `kind`
- `messages[].type`: `"user"` or `"gemini"`
- `messages[].content`: `[{text: "..."}]`
- `messages[].toolCalls`: ツール呼び出し配列（オプション）
- `messages[].tokens`: トークン情報

```typescript
export function collectGemini(sessionDir: string, meta: MetaJson): GeminiCollectorResult[];
```

**注意**: Gemini のプロジェクトハッシュ生成ロジックを確認する必要がある。一致しない場合は全ディレクトリを走査して `startTime` + ファイル内の初回メッセージのマッチングで特定する。

---

## Phase 3: `fed stop` への統合

### 3.1 収集オーケストレーション関数

**ファイル**: `cli/src/lib/conv-store.ts`（Phase 1 のファイルに追加）

```typescript
export function collectConversations(sessionDir: string, meta: MetaJson): void {
  const convDir = path.join(sessionDir, "conversations");
  fs.mkdirSync(convDir, { recursive: true });

  // Collect from each tool (best-effort, errors logged but not thrown)
  const collectors = [
    () => collectClaude(sessionDir),
    () => collectCodex(sessionDir, meta),
    () => collectGemini(sessionDir, meta),
  ];

  for (const collect of collectors) {
    try {
      const results = collect();
      for (const result of results) {
        writeConversationFile(convDir, result);
      }
    } catch (err) {
      console.error(`  Warning: conversation collection failed: ${err}`);
    }
  }
}
```

### 3.2 `stop.ts` への統合

**ファイル**: `cli/src/commands/stop.ts`

`stopCommand` の watcher 停止後、tmux kill-session の**前**に会話収集を挿入する。
tmux を殺す前に実行することで、セッション情報がまだ利用可能な状態で収集できる。

```typescript
// 既存: 1. Stop watcher processes via PID files
stopWatcherProcesses(sessionDir);

// NEW: 1.5. Collect conversations from AI tools
console.log("  Collecting conversations...");
collectConversations(sessionDir, meta);

// 既存: 2. Kill artifact viewer tmux sessions
killArtifactSessions(targetSession);
```

---

## Phase 4: 閲覧コマンド

### 4.1 `fed conv list`

**ファイル**: `cli/src/commands/conv.ts`

セッションディレクトリの `conversations/` を走査し、各ファイルの meta 行を読んで一覧表示する。

出力例:
```
Conversations for session 'conv-store':

  Pane            Tool     Turns  Collected At
  solo-dev.0      claude     42   2026-03-13T12:00:00Z
  solo-dev.1      codex      18   2026-03-13T12:00:00Z
  solo-dev.2      gemini     25   2026-03-13T12:00:00Z
```

### 4.2 `fed conv show <file>`

ファイル名（例: `solo-dev.0_claude`）を指定して、正規化された会話を human-readable に表示する。

出力例:
```
=== solo-dev.0 (claude) ===
[2026-03-13T10:00:00Z] USER:
  sshのconfigにgithub-privateというホストを登録して...

[2026-03-13T10:00:05Z] ASSISTANT:
  けんごさん、確認したところ...
  [Tool: Bash] ls ~/.ssh/config
  [Tool: Read] /Users/ke_tateishi/.ssh/config

---
42 turns | Source: ~/.claude/projects/...
```

`--raw` オプションで生 JSONL をそのまま出力。

---

## Phase 5: better-sqlite3 依存の追加

### 5.1 npm パッケージ追加

```bash
cd cli && npm install better-sqlite3 && npm install -D @types/better-sqlite3
```

### 5.2 tsconfig への考慮

`better-sqlite3` はネイティブモジュール。ESM 環境で動作することを確認。
`import Database from "better-sqlite3"` で使用可能。

---

## 実装順序

1. **Phase 5**: better-sqlite3 依存追加（先に入れないとビルドできない）
2. **Phase 1**: 共通フォーマット定義 (`conv-store.ts`)
3. **Phase 2.1**: Claude コレクター（最も既存連携が充実しているため先に）
4. **Phase 2.3**: Gemini コレクター（JSON なので SQLite 不要でシンプル）
5. **Phase 2.2**: Codex コレクター（SQLite 依存あり）
6. **Phase 3**: `fed stop` への統合
7. **Phase 4**: 閲覧コマンド

## 修正対象ファイル一覧

### 新規作成
| ファイル | 説明 |
|---------|------|
| `cli/src/lib/conv-store.ts` | 共通型定義、オーケストレーション、ファイル I/O |
| `cli/src/lib/collectors/claude.ts` | Claude Code ログコレクター |
| `cli/src/lib/collectors/codex.ts` | Codex ログコレクター |
| `cli/src/lib/collectors/gemini.ts` | Gemini ログコレクター |
| `cli/src/commands/conv.ts` | `fed conv list` / `fed conv show` コマンド |

### 既存修正
| ファイル | 変更内容 |
|---------|---------|
| `cli/src/commands/stop.ts` | 会話収集呼び出しを追加 |
| `cli/src/index.ts` | `conv` サブコマンドの登録 |
| `cli/package.json` | `better-sqlite3` 依存追加 |

---

## セキュリティ考慮事項

- 会話ログにはセンシティブな情報（API キー、パスワード等）が含まれる可能性がある
- 保存先はセッションディレクトリ（`~/.fed/sessions/`）内なので、既存のアクセス制御に準拠
- Codex の SQLite は読み取りのみ（`PRAGMA query_only = ON` を設定）
- ツール呼び出しの input/output は長大になる可能性があるため、truncation を検討

## 検証方法

### 手動テスト
1. `fed start solo-dev agentic-federation test-conv` でセッション作成
2. セッション内で Claude Code / Codex / Gemini を使って会話
3. `fed stop test-conv` でセッション停止
4. アーカイブされたセッションの `conversations/` ディレクトリを確認
5. `fed conv list` / `fed conv show` で閲覧確認

### 自動テスト
- 各コレクターに対してモックデータで単体テスト（将来対応）
- 正規化ロジックのスナップショットテスト（将来対応）
