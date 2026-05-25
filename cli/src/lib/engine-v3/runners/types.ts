// Shared runner types for engine v2

export interface RunnerHandle {
  promise: Promise<number>;
  kill: () => void;
  sessionId?: string;  // Captured from stream output (set asynchronously during execution)
}
