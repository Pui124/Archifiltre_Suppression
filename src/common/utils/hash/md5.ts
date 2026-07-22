import { createHash } from "crypto";
import { createReadStream } from "fs";
import type { Readable } from "stream";

// Délai sans réception de données au-delà duquel le hachage est considéré
// bloqué (lecteur cloud qui ne répond plus). Un timeout global serait faux :
// un gros fichier sur Box se télécharge légitimement pendant longtemps ; tant
// que des octets arrivent, on attend.
export const HASH_INACTIVITY_TIMEOUT = 60_000;

/**
 * Computes the MD5 of a readable stream. Rejects if no data has been
 * received for inactivityTimeout ms.
 */
export const md5FromStream = async (
  stream: Readable,
  inactivityTimeout: number = HASH_INACTIVITY_TIMEOUT
): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash("md5");
    let settled = false;
    let watchdog: NodeJS.Timeout | undefined;

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
      }
      callback();
    };

    const armWatchdog = () => {
      if (watchdog !== undefined) {
        clearTimeout(watchdog);
      }
      watchdog = setTimeout(() => {
        stream.destroy(
          new Error(
            `MD5 timed out: no data received for ${inactivityTimeout}ms`
          )
        );
      }, inactivityTimeout);
    };

    armWatchdog();

    stream.on("data", (chunk: Buffer) => {
      hash.update(chunk);
      armWatchdog();
    });
    stream.on("end", () => {
      settle(() => {
        resolve(hash.digest("hex"));
      });
    });
    stream.on("error", (error) => {
      settle(() => {
        reject(error);
      });
    });
  });

/**
 * Computes the MD5 hash of a file with an inactivity watchdog.
 */
export const computeMd5 = async (
  filePath: string,
  inactivityTimeout: number = HASH_INACTIVITY_TIMEOUT
): Promise<string> =>
  md5FromStream(createReadStream(filePath), inactivityTimeout);
