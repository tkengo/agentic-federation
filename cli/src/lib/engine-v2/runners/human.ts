import fs from "node:fs";
import path from "node:path";
import { watch } from "chokidar";
import type { V2Step } from "../types.js";
import type { EngineLogger } from "../logger.js";
import { sendOsNotification } from "../../../commands/notify-human.js";

export interface HumanRunnerOptions {
  step: V2Step;
  stepPath: string;
  sessionDir: string;
  logger: EngineLogger;
}

/**
 * Wait for human to respond via `fed workflow respond`.
 * Watches for a .respond file in <sessionDir>/respond/.
 */
export function runHumanStep(options: HumanRunnerOptions): Promise<string> {
  const { step, stepPath, sessionDir, logger } = options;

  return new Promise((resolve, reject) => {
    const respondDir = path.join(sessionDir, "respond");
    fs.mkdirSync(respondDir, { recursive: true });

    // Encode step path for filename (replace dots/slashes with underscores)
    const safeStepPath = stepPath.replace(/[./]/g, "_");
    const respondFile = path.join(respondDir, `${safeStepPath}.respond`);

    // Clean up any leftover respond file from a previous run
    if (fs.existsSync(respondFile)) {
      fs.unlinkSync(respondFile);
    }

    // Notify human (OS notification only, no console output — dashboard owns stdout)
    const desc = step.description ?? stepPath;
    const prompt = step.prompt ?? desc;
    sendOsNotification("ACTION REQUIRED", prompt);
    logger.waiting(`Human respond needed: ${prompt}`);

    // Check if respond file already exists (race condition guard)
    if (fs.existsSync(respondFile)) {
      const value = fs.readFileSync(respondFile, "utf-8").trim();
      resolve(value);
      return;
    }

    // Watch for the respond file
    const watcher = watch(respondDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    const cleanup = () => {
      watcher.close().catch(() => {});
    };

    watcher.on("add", (filePath: string) => {
      if (path.basename(filePath) === `${safeStepPath}.respond`) {
        try {
          const value = fs.readFileSync(filePath, "utf-8").trim();
          cleanup();
          resolve(value || "done");
        } catch (err) {
          cleanup();
          reject(new Error(`Failed to read respond file: ${err}`));
        }
      }
    });

    watcher.on("error", (err) => {
      cleanup();
      reject(new Error(`Watcher error: ${err}`));
    });
  });
}
