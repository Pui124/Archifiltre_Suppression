import { computeMd5, md5FromStream } from "@common/utils/hash/md5";
import { createHash } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

describe("md5", () => {
  describe("computeMd5", () => {
    it("should compute the md5 of a file", async () => {
      const content = "archifiltre md5 test content";
      const filePath = path.join(os.tmpdir(), `archifiltre-md5-${Date.now()}`);
      fs.writeFileSync(filePath, content);

      try {
        const expected = createHash("md5").update(content).digest("hex");
        await expect(computeMd5(filePath)).resolves.toBe(expected);
      } finally {
        fs.unlinkSync(filePath);
      }
    });

    it("should reject with ENOENT for a missing file", async () => {
      await expect(
        computeMd5(path.join(os.tmpdir(), "archifiltre-md5-missing"))
      ).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("md5FromStream", () => {
    it("should reject when no data is received before the inactivity timeout", async () => {
      const silentStream = new PassThrough();

      await expect(md5FromStream(silentStream, 50)).rejects.toThrow(
        "no data received for 50ms"
      );
    });

    it("should resolve when data keeps flowing slower than the timeout", async () => {
      const stream = new PassThrough();
      const promise = md5FromStream(stream, 200);

      stream.write("part1");
      setTimeout(() => stream.write("part2"), 100);
      setTimeout(() => stream.end(), 150);

      const expected = createHash("md5").update("part1part2").digest("hex");
      await expect(promise).resolves.toBe(expected);
    });
  });
});
