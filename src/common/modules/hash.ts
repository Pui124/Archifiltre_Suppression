import { ipcMain } from "../ipc";
import { mapWithConcurrency } from "../utils/concurrency";
import type { HashComputingResult } from "../utils/hash";
import { computeHash, HASH_PROGRESS_CHANNEL } from "../utils/hash";
import type { HashComputingError } from "../utils/hash/hash-errors";

// Chaque hachage sur un lecteur cloud (Box, OneDrive...) hydrate le fichier,
// c'est-à-dire le télécharge en entier. Sur ces lecteurs, la latence par
// fichier domine (plusieurs secondes par hydratation) : 16 flux parallèles
// amortissent cette latence sans saturer le démon cloud ni le disque local.
const HASH_CONCURRENCY = 16;

// Intervalle minimal entre deux notifications de progression vers le renderer.
const HASH_PROGRESS_NOTIFY_INTERVAL = 300;

declare module "../ipc/event" {
  interface AsyncIpcMapping {
    "hash.computeHash": IpcConfig<
      [filePaths: string[]],
      (HashComputingError | HashComputingResult)[]
    >;
  }
}

export const loadHash = (): void => {
  ipcMain.handle("hash.computeHash", async (event, filePaths) => {
    let completedCount = 0;
    let lastNotifiedAt = Date.now();

    return mapWithConcurrency(filePaths, HASH_CONCURRENCY, async (filePath) => {
      const result = await computeHash(filePath);
      completedCount++;
      const now = Date.now();
      if (
        now - lastNotifiedAt >= HASH_PROGRESS_NOTIFY_INTERVAL &&
        !event.sender.isDestroyed()
      ) {
        lastNotifiedAt = now;
        event.sender.send(HASH_PROGRESS_CHANNEL, completedCount);
      }
      return result;
    });
  });
};
