import crypto from "crypto";
import fs from "fs";

import type { DuplicateGroup } from "../../../../../utils/duplicates-deletion";
import { moveElementToTrash } from "../../../../../utils/file-system/file-system-util";

export type DeletionStatus = "deleted" | "error" | "skipped";

export interface DeletionResult {
  id: string;
  message?: string;
  status: DeletionStatus;
}

export interface DeleteOptions {
  /** re-hash the copy and its original and only delete on a content match */
  verifyMd5: boolean;
}

/** Streams the file through an MD5 digest (chunked, handles large files). */
const computeMd5 = async (absolutePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("md5");
    const stream = fs.createReadStream(absolutePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });

/**
 * Deletes (to the trash) every selected copy across the given groups. The
 * protected original of each group is never deleted. When `verifyMd5` is set,
 * each copy's content is compared to its original's before deletion, so a file
 * that changed on disk since hashing is skipped rather than lost.
 *
 * Results are reported one by one through `onProgress` for live UI feedback.
 */
export const deleteSelectedDuplicates = async (
  groups: DuplicateGroup[],
  selectedIds: Set<string>,
  options: DeleteOptions,
  onProgress?: (result: DeletionResult) => void
): Promise<DeletionResult[]> => {
  const results: DeletionResult[] = [];

  const report = (result: DeletionResult) => {
    results.push(result);
    onProgress?.(result);
  };

  for (const group of groups) {
    const original =
      group.files.find((file) => file.isOriginal) ?? group.files[0];
    let originalMd5: string | undefined;

    for (const file of group.files) {
      if (file.isOriginal || !selectedIds.has(file.id)) {
        continue;
      }

      try {
        if (options.verifyMd5) {
          if (originalMd5 === undefined) {
            originalMd5 = await computeMd5(original.absolutePath);
          }
          const copyMd5 = await computeMd5(file.absolutePath);
          if (copyMd5 !== originalMd5) {
            report({
              id: file.id,
              message: "md5Mismatch",
              status: "skipped",
            });
            continue;
          }
        }

        await moveElementToTrash(file.absolutePath);
        report({ id: file.id, status: "deleted" });
      } catch (error) {
        report({
          id: file.id,
          message: error instanceof Error ? error.message : String(error),
          status: "error",
        });
      }
    }
  }

  return results;
};
