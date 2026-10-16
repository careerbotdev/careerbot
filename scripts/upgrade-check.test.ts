// @vitest-environment node
import { expect, test, vi } from "vitest";
import { currentRegistries, retryColdStart } from "./upgrade-check-helpers";

test("an older compose file pulls Convex's images from ghcr.io/convex, same tags, nothing else changed", () => {
  const old = [
    "services:",
    "  convex-backend:",
    "    image: ghcr.io/get-convex/convex-backend:${CONVEX_RELEASE:-abc123}",
    "  convex-dashboard:",
    "    image: ghcr.io/get-convex/convex-dashboard:abc123",
    "  web:",
    "    image: ghcr.io/example/careerbot-web:${CAREERBOT_VERSION:-1.2.0}",
    "",
  ].join("\n");
  expect(currentRegistries(old)).toBe(
    old
      .replace("ghcr.io/get-convex/convex-backend:", "ghcr.io/convex/convex-backend:")
      .replace("ghcr.io/get-convex/convex-dashboard:", "ghcr.io/convex/convex-dashboard:"),
  );
  expect(currentRegistries(old)).not.toContain("get-convex");
});

test("a call that hits the cold-start time limit is tried again, up to three times", async () => {
  const call = vi
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(new Error("[Request ID: x] Server Error\nFunction execution timed out (maximum duration: 1s)"))
    .mockRejectedValueOnce(new Error("Function execution timed out"))
    .mockResolvedValue("ok");
  await expect(retryColdStart(call, 3, 0)).resolves.toBe("ok");
  expect(call).toHaveBeenCalledTimes(3);
});

test("any other error goes straight through, untried", async () => {
  const call = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("InvalidSecret")).mockResolvedValue("ok");
  await expect(retryColdStart(call, 3, 0)).rejects.toThrow("InvalidSecret");
  expect(call).toHaveBeenCalledTimes(1);
});

test("the cold-start error stops after three tries", async () => {
  const call = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("Function execution timed out"));
  await expect(retryColdStart(call, 3, 0)).rejects.toThrow("Function execution timed out");
  expect(call).toHaveBeenCalledTimes(3);
});
