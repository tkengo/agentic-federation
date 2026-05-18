// Backward-compatible aliases for `fed waiting-human` that delegate to
// `fed agent-state`. The legacy file `waiting_human.json` is read as a
// fallback by readAgentState, but new writes go to `agent_state.json`.

import {
  agentStateProcessingCommand,
  agentStateWaitingCommand,
  agentStateShowCommand,
} from "./agent-state.js";

export function waitingHumanSetCommand(reason: string, notify: boolean): void {
  // `waiting-human set` always meant "the agent is now blocked on the human",
  // which maps directly to the new `agent-state waiting`.
  agentStateWaitingCommand(reason, notify);
}

export function waitingHumanClearCommand(): void {
  // `waiting-human clear` is wired to UserPromptSubmit / PostToolUse hooks,
  // i.e. the user (or a tool result) has just spoken — the agent is processing.
  agentStateProcessingCommand();
}

export function waitingHumanShowCommand(): void {
  agentStateShowCommand();
}
