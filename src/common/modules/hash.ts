import { ipcMain } from "../ipc";
import { mapWithConcurrency } from "../utils/concurrency";
import type { HashComputingResult } from "../utils/hash";
import { computeHash } from "../utils/hash";
import type { HashComputingError } from "../utils/hash/hash-errors";

// Chaque hachage sur un lecteur cloud (Box, OneDrive...) hydrate le fichier,
// c'est-à-dire le télécharge en entier. Sur ces lecteurs, la latence par
// fichier domine (plusieurs secondes par hydratation) : 16 flux parallèles
// amortissent cette latence sans saturer le démon cloud ni le disque local.
const HASH_CONCURRENCY = 16;

declare module "../ipc/event" {
  interface AsyncIpcMapping {
    "hash.computeHash": IpcConfig<
      [filePaths: string[]],
      (HashComputingError | HashComputingResult)[]
    >;
  }
}

export const loadHash = (): void => {
  ipcMain.handle("hash.computeHash", async (_event, filePaths) => {
    return mapWithConcurrency(filePaths, HASH_CONCURRENCY, computeHash);
  });
};
