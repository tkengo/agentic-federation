import dns from "node:dns/promises";

const CHECK_HOST = "api.anthropic.com";

/**
 * Check if network is available by attempting DNS resolution.
 * Returns true if online, false if offline.
 */
export async function isNetworkAvailable(): Promise<boolean> {
  try {
    await dns.resolve(CHECK_HOST);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wait until network becomes available, polling at the given interval.
 * Calls onPoll before each check (for abort handling).
 * Returns when network is restored.
 */
export async function waitForNetwork(
  intervalMs: number,
  onPoll?: () => void,
): Promise<void> {
  while (true) {
    onPoll?.();
    if (await isNetworkAvailable()) return;
    await sleep(intervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
