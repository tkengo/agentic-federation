/**
 * Test script for engine dashboard rendering.
 * Sends fake events to exercise the UI without running real workflows.
 *
 * Usage: npx tsx src/lib/engine-v2/dashboard-test.ts
 */

import { render } from "ink";
import React from "react";
import { EngineEventEmitter } from "./events.js";
import { EngineApp } from "./dashboard/EngineApp.js";
import { patchStdoutBuffering } from "./dashboard/buffered-stdout.js";
import type { StepNode } from "./dashboard/types.js";

// Fake step tree
const steps: StepNode[] = [
  { stepPath: "planning", label: "planning", stepType: "human", depth: 0, status: "not_started" },
  { stepPath: "plan_review_cycle", label: "plan_review_cycle", stepType: "loop", depth: 0, status: "not_started" },
  { stepPath: "plan_review_cycle.plan_review", label: "plan_review", stepType: "codex", depth: 1, status: "not_started" },
  { stepPath: "plan_review_cycle.branch", label: "branch", stepType: "branch", depth: 1, status: "not_started" },
  { stepPath: "plan_review_cycle.branch.escalation", label: "escalation", stepType: "human", depth: 2, status: "not_started", condition: '${{ steps.plan_review.result == "escalate" }}' },
  { stepPath: "plan_review_cycle.branch.revision", label: "revision", stepType: "claude", depth: 2, status: "not_started", condition: '${{ steps.plan_review.result == "revise" }}' },
  { stepPath: "test_phase", label: "test_phase", stepType: "loop", depth: 0, status: "not_started" },
  { stepPath: "test_phase.test_impl", label: "test_impl", stepType: "claude", depth: 1, status: "not_started" },
  { stepPath: "implementation", label: "implementation", stepType: "claude", depth: 0, status: "not_started" },
  { stepPath: "code_review", label: "code_review", stepType: "parallel", depth: 0, status: "not_started" },
  { stepPath: "code_review.review_diff", label: "review_diff", stepType: "codex", depth: 1, status: "not_started" },
  { stepPath: "code_review.review_history", label: "review_history", stepType: "codex", depth: 1, status: "not_started" },
  { stepPath: "code_review.review_impact", label: "review_impact", stepType: "claude", depth: 1, status: "not_started" },
  { stepPath: "final_review", label: "final_review", stepType: "human", depth: 0, status: "not_started" },
];

const emitter = new EngineEventEmitter();

process.stdout.write("\x1b[2J\x1b[H");
const restoreStdout = patchStdoutBuffering();

// Suppress console output (Ink's patchConsole would insert lines above the dashboard)
console.log = () => {};
console.error = () => {};
console.warn = () => {};

const app = render(
  React.createElement(EngineApp, {
    emitter,
    initialSteps: steps,
    workflowName: "test-dashboard",
    sessionDir: process.argv[2] || "/tmp/test-session",
  }),
  { patchConsole: false },
);

// Simulate engine events
async function simulate(): Promise<void> {
  await wait(500);

  // Step 1: planning (human) - quick
  emitter.emit("step_start", { type: "step_start", stepPath: "planning", stepType: "human", description: "Create plan" });
  await wait(1500);
  emitter.emit("step_log", { type: "step_log", stepPath: "planning", message: "◌ Waiting for human..." });
  await wait(1000);
  emitter.emit("step_complete", { type: "step_complete", stepPath: "planning", result: "done", durationMs: 2500 });

  // Step 2: plan_review_cycle (loop)
  emitter.emit("loop_iteration", { type: "loop_iteration", stepPath: "plan_review_cycle", iteration: 1, max: "5" });

  // plan_review (codex) - running with logs
  emitter.emit("step_start", { type: "step_start", stepPath: "plan_review_cycle.plan_review", stepType: "codex", description: "Review the plan" });
  for (let i = 0; i < 8; i++) {
    await wait(400);
    const msgs = [
      "    💬 Reading the plan artifact...",
      "    🔧 exec: fed artifact read plan",
      "    💬 The plan covers three phases...",
      "    🔧 exec: cat > tmp-review.md",
      "    💬 Checking test coverage requirements...",
      "    🔧 Read: /src/lib/engine.ts",
      "    💬 All acceptance criteria are addressed",
      "    🔧 exec: fed workflow respond approved",
    ];
    emitter.emit("step_log", { type: "step_log", stepPath: "plan_review_cycle.plan_review", message: msgs[i] });
  }
  emitter.emit("step_complete", { type: "step_complete", stepPath: "plan_review_cycle.plan_review", result: "approved", durationMs: 3200 });
  await wait(200);
  emitter.emit("step_complete", { type: "step_complete", stepPath: "plan_review_cycle", durationMs: 3500 });

  await wait(500);

  // test_phase starts
  emitter.emit("loop_iteration", { type: "loop_iteration", stepPath: "test_phase", iteration: 1, max: "3" });
  emitter.emit("step_start", { type: "step_start", stepPath: "test_phase.test_impl", stepType: "claude", description: "Implement tests" });

  // Keep generating logs to show spinner
  for (let i = 0; i < 20; i++) {
    await wait(300);
    emitter.emit("step_log", { type: "step_log", stepPath: "test_phase.test_impl", message: `    💬 Writing test case ${i + 1}...` });
    if (i % 3 === 0) {
      emitter.emit("step_log", { type: "step_log", stepPath: "test_phase.test_impl", message: `    🔧 Write: /tests/test_${i}.ts` });
    }
  }
  emitter.emit("step_complete", { type: "step_complete", stepPath: "test_phase.test_impl", durationMs: 6000 });
  await wait(200);
  emitter.emit("step_complete", { type: "step_complete", stepPath: "test_phase", durationMs: 6200 });

  await wait(500);

  // Parallel code review
  emitter.emit("step_start", { type: "step_start", stepPath: "code_review.review_diff", stepType: "codex", description: "Review diff" });
  emitter.emit("step_start", { type: "step_start", stepPath: "code_review.review_history", stepType: "codex", description: "Review history" });
  emitter.emit("step_start", { type: "step_start", stepPath: "code_review.review_impact", stepType: "claude", description: "Review impact" });

  // Generate parallel logs
  for (let i = 0; i < 30; i++) {
    await wait(200);
    const branch = ["review_diff", "review_history", "review_impact"][i % 3];
    emitter.emit("step_log", { type: "step_log", stepPath: `code_review.${branch}`, message: `    💬 Analyzing ${branch} step ${i}...` });
  }

  // Complete one by one
  emitter.emit("step_complete", { type: "step_complete", stepPath: "code_review.review_impact", result: "pass", durationMs: 4500 });
  await wait(1000);
  emitter.emit("step_complete", { type: "step_complete", stepPath: "code_review.review_diff", result: "pass", durationMs: 5500 });
  await wait(500);
  emitter.emit("step_complete", { type: "step_complete", stepPath: "code_review.review_history", result: "pass", durationMs: 6000 });
  await wait(200);
  emitter.emit("step_complete", { type: "step_complete", stepPath: "code_review", durationMs: 6200 });

  await wait(500);
  emitter.emit("engine_complete", { type: "engine_complete", durationMs: 25000 });
}

simulate();

// q or ctrl+c to exit
process.stdin.setRawMode?.(true);
process.stdin.resume();
process.stdin.on("data", (data: Buffer) => {
  const key = data.toString();
  if (key === "q" || key === "\x03") {
    app.unmount();
    restoreStdout();
    process.exit(0);
  }
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
