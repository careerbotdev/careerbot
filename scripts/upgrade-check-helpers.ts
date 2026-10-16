// Pure pieces of scripts/upgrade-check.ts, apart so tests can import them without starting the check.
import { setTimeout as sleep } from "node:timers/promises";

// Convex moved its images from ghcr.io/get-convex to ghcr.io/convex (same tags), and the old address now refuses
// pulls, so an older release's compose file is pointed at where the images are now.
export function currentRegistries(compose: string): string {
  return compose.replaceAll("ghcr.io/get-convex/", "ghcr.io/convex/");
}

// A freshly started backend can take longer than Convex's 1 s limit on its first calls. Only that error is retried
// (up to `tries` times); any other error is the check's answer and goes straight through.
export async function retryColdStart<T>(call: () => Promise<T>, tries = 3, waitMs = 1000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (e) {
      const coldStart = e instanceof Error && e.message.includes("Function execution timed out");
      if (!coldStart || attempt >= tries) throw e;
      await sleep(waitMs);
    }
  }
}
