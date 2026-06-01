import path from "node:path";
import os from "node:os";

export const FED_HOME = path.join(os.homedir(), ".fed");
export const ACTIVE_DIR = path.join(FED_HOME, "active");
