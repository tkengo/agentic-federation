import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface EngineStartEvent {
  type: "engine_start";
  workflowName: string;
  stepCount: number;
}

export interface EngineCompleteEvent {
  type: "engine_complete";
  durationMs: number;
}

export interface EngineFailedEvent {
  type: "engine_failed";
  error: string;
}

export interface EngineAbortedEvent {
  type: "engine_aborted";
  mode: string;
}

export interface StepStartEvent {
  type: "step_start";
  stepPath: string;
  stepType: string;
  description?: string;
}

export interface StepCompleteEvent {
  type: "step_complete";
  stepPath: string;
  result?: string;
  durationMs: number;
}

export interface StepFailedEvent {
  type: "step_failed";
  stepPath: string;
  error: string;
  durationMs: number;
}

export interface StepLogEvent {
  type: "step_log";
  stepPath: string;
  message: string;
}

export interface LoopIterationEvent {
  type: "loop_iteration";
  stepPath: string;
  iteration: number;
  max: string; // "∞" or number string
}

export interface WaitingHumanEvent {
  type: "waiting_human";
  stepPath: string;
  message: string;
}

export interface WaitingNetworkEvent {
  type: "waiting_network";
  stepPath: string;
  message: string;
}

export interface ReplayEvent {
  type: "replay";
  from: string;
}

export type EngineEvent =
  | EngineStartEvent
  | EngineCompleteEvent
  | EngineFailedEvent
  | EngineAbortedEvent
  | StepStartEvent
  | StepCompleteEvent
  | StepFailedEvent
  | StepLogEvent
  | LoopIterationEvent
  | WaitingHumanEvent
  | WaitingNetworkEvent
  | ReplayEvent;

// ---------------------------------------------------------------------------
// Typed event emitter
// ---------------------------------------------------------------------------

export interface EngineEventMap {
  engine_start: [EngineStartEvent];
  engine_complete: [EngineCompleteEvent];
  engine_failed: [EngineFailedEvent];
  engine_aborted: [EngineAbortedEvent];
  step_start: [StepStartEvent];
  step_complete: [StepCompleteEvent];
  step_failed: [StepFailedEvent];
  step_log: [StepLogEvent];
  loop_iteration: [LoopIterationEvent];
  waiting_human: [WaitingHumanEvent];
  waiting_network: [WaitingNetworkEvent];
  replay: [ReplayEvent];
  event: [EngineEvent]; // catch-all for any event
}

export class EngineEventEmitter extends EventEmitter {
  override emit<K extends keyof EngineEventMap>(event: K, ...args: EngineEventMap[K]): boolean {
    // Also emit on the catch-all "event" channel
    if (event !== "event") {
      super.emit("event", args[0] as EngineEvent);
    }
    return super.emit(event, ...args);
  }

  override on<K extends keyof EngineEventMap>(event: K, listener: (...args: EngineEventMap[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }
}
