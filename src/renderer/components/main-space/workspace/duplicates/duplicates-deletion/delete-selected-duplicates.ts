import { makeConcurrencyLimiter } from "@common/utils/concurrency";
import { computeMd5 } from "@common/utils/hash/md5";

import type { DeletionResult } from "../../../../../reducers/duplicates-deletion/duplicates-deletion-types";
import type {
  DuplicateFile,
  DuplicateGroup,
} from "../../../../../utils/duplicates-deletion";
import { moveElementToTrash } from "../../../../../utils/file-system/file-system-util";

export type {
  DeletionResult,
  DeletionStatus,
} from "../../../../../reducers/duplicates-deletion/duplicates-deletion-types";

export interface DeleteOptions {
  /**
   * Polled before each file: once it returns true, remaining files are left
   * untouched (files already sent to the trash stay there).
   */
  shouldCancel?: () => boolean;
  /** re-hash the copy and its original and only delete on a content match */
  verifyMd5: boolean;
}

// Nombre d'opérations fichier (vérification MD5 + envoi à la corbeille) menées
// de front. La suppression était séquentielle : chaque fichier attendait un
// aller-retour IPC `shell.trashItem` (et deux hachages avec verifyMd5), ce qui
// dominait la durée totale sur les grosses sélections. Une petite concurrence
// masque ces latences sans saturer le disque ni un lecteur cloud.
export const DELETION_CONCURRENCY = 4;

interface DeletionTask {
  file: DuplicateFile;
  group: DuplicateGroup;
  original: DuplicateFile;
}

/**
 * Deletes (to the trash) every selected copy across the given groups, with a
 * bounded concurrency of DELETION_CONCURRENCY. The protected original of each
 * group is never deleted. When `verifyMd5` is set, each copy's content is
 * compared to its original's before deletion, so a file that changed on disk
 * since hashing is skipped rather than lost. Hashing goes through the shared
 * MD5 helper, whose inactivity watchdog turns a hung read (unresponsive cloud
 * drive) into a per-file error instead of stalling the whole run.
 *
 * Results keep the input (group) order; `onProgress` fires as files complete.
 * When `options.shouldCancel` flips to true, files not yet started are left
 * untouched and absent from the returned results.
 */
export const deleteSelectedDuplicates = async (
  groups: DuplicateGroup[],
  selectedIds: Set<string>,
  options: DeleteOptions,
  onProgress?: (result: DeletionResult) => void
): Promise<DeletionResult[]> => {
  const limit = makeConcurrencyLimiter(DELETION_CONCURRENCY);

  // L'original de chaque groupe n'est haché qu'une fois : toutes ses copies
  // partagent la même promesse. Un échec est aussi partagé — inutile de
  // relire un original illisible pour chaque copie.
  const originalMd5ByGroup = new Map<string, Promise<string>>();
  const getOriginalMd5 = async (
    group: DuplicateGroup,
    original: DuplicateFile
  ) => {
    let md5Promise = originalMd5ByGroup.get(group.hash);
    if (!md5Promise) {
      md5Promise = computeMd5(original.absolutePath);
      originalMd5ByGroup.set(group.hash, md5Promise);
    }
    return md5Promise;
  };

  const tasks: DeletionTask[] = [];
  for (const group of groups) {
    const original =
      group.files.find((file) => file.isOriginal) ?? group.files[0];
    for (const file of group.files) {
      if (!file.isOriginal && selectedIds.has(file.id)) {
        tasks.push({ file, group, original });
      }
    }
  }

  const processed = await Promise.all(
    tasks.map(async ({ file, group, original }) =>
      limit(async (): Promise<DeletionResult | null> => {
        if (options.shouldCancel?.()) {
          return null;
        }

        let result: DeletionResult;
        try {
          if (options.verifyMd5) {
            const originalMd5 = await getOriginalMd5(group, original);
            const copyMd5 = await computeMd5(file.absolutePath);
            if (copyMd5 !== originalMd5) {
              result = {
                id: file.id,
                message: "md5Mismatch",
                status: "skipped",
              };
              onProgress?.(result);
              return result;
            }
          }

          await moveElementToTrash(file.absolutePath);
          result = { id: file.id, status: "deleted" };
        } catch (error: unknown) {
          result = {
            id: file.id,
            message: error instanceof Error ? error.message : String(error),
            status: "error",
          };
        }
        onProgress?.(result);
        return result;
      })
    )
  );

  return processed.filter(
    (result): result is DeletionResult => result !== null
  );
};
