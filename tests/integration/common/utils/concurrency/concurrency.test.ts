import {
  makeConcurrencyLimiter,
  mapWithConcurrency,
  withTimeout,
} from "@common/utils/concurrency";

const wait = async (delay: number) =>
  new Promise((resolve) => setTimeout(resolve, delay));

describe("concurrency", () => {
  describe("makeConcurrencyLimiter", () => {
    it("should never run more than maxConcurrency tasks at once", async () => {
      const limit = makeConcurrencyLimiter(3);
      let running = 0;
      let maxRunning = 0;

      await Promise.all(
        Array.from({ length: 20 }, async () =>
          limit(async () => {
            running++;
            maxRunning = Math.max(maxRunning, running);
            await wait(10);
            running--;
          })
        )
      );

      expect(maxRunning).toBeLessThanOrEqual(3);
      expect(running).toBe(0);
    });

    it("should release the slot when a task rejects", async () => {
      const limit = makeConcurrencyLimiter(1);

      await expect(
        limit(async () => Promise.reject(new Error("boom")))
      ).rejects.toThrow("boom");

      // If the slot leaked, this task would never start
      await expect(limit(async () => Promise.resolve("ok"))).resolves.toBe(
        "ok"
      );
    });
  });

  describe("mapWithConcurrency", () => {
    it("should preserve input order in results", async () => {
      const values = [50, 10, 30, 0, 20];

      const results = await mapWithConcurrency(values, 2, async (delay) => {
        await wait(delay);
        return delay * 2;
      });

      expect(results).toEqual([100, 20, 60, 0, 40]);
    });
  });

  describe("withTimeout", () => {
    it("should resolve when the task settles before the timeout", async () => {
      await expect(
        withTimeout(async () => Promise.resolve("value"), 1000, "fast task")
      ).resolves.toBe("value");
    });

    it("should reject when the task exceeds the timeout", async () => {
      const slowTask = wait(100);
      await expect(
        withTimeout(async () => slowTask, 20, "slow task")
      ).rejects.toThrow("slow task timed out after 20ms");
      // Let the underlying timer expire so jest can exit cleanly
      await slowTask;
    });
  });
});
