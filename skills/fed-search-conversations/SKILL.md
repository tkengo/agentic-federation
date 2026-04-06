---
name: fed-search-conversations
description: |
  過去のfedセッションの会話をキーワードで横断検索する。
  TRIGGER when: 「過去のセッション探して」「あの時の会話どこ？」「前にやったXXXのセッション」など、過去セッションの会話を検索する必要があるとき。
  DO NOT TRIGGER when: 現在のセッション内の会話を参照するだけのとき。
user_invocable: false
---

## Overview

This skill searches past fed session conversations using `conversation_summary.md` files that are auto-generated at `fed session stop`.

## Search Flow

### Step 1: Grep for keywords

Search `conversation_summary.md` files across both active sessions and archives:

```bash
# Active sessions
grep -r "KEYWORD" ~/.fed/sessions/*/conversation_summary.md

# Archived sessions
grep -r "KEYWORD" ~/.fed/archive/*/*/conversation_summary.md
```

Use the **Grep tool** (not bash grep) with the pattern set to the user's keyword:
- Path: `~/.fed/sessions` for active sessions
- Path: `~/.fed/archive` for archived sessions
- Glob: `**/conversation_summary.md`
- Output mode: `content` with `-C 3` for context

### Step 2: Read matching summaries

For sessions that match, read the full `conversation_summary.md` to understand the session context:
- What workflow was used
- Session description
- First user messages from each pane

### Step 3: Read detailed conversations (if needed)

If the user wants to see the actual conversation, read the JSONL files in the session's `conversations/` directory:

```
<sessionDir>/conversations/*.jsonl
```

Each JSONL file has:
- Line 1: metadata (tool, pane, turn count)
- Lines 2+: conversation turns (role, content, tool_calls)

## Tips

- `conversation_summary.md` contains the first user message from each pane, which usually describes the task
- Session directories follow the pattern: `YYYYMMDDHHMMSS_<id>_<branch>`
- If no `conversation_summary.md` exists (older sessions), fall back to searching `description.txt`
- For broad searches, try `description.txt` as well: `grep -r "KEYWORD" ~/.fed/sessions/*/description.txt`
