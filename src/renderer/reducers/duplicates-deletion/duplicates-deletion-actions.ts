import type {
  DeletionResult,
  DeletionSummary,
  DuplicatesDeletionAction,
} from "./duplicates-deletion-types";
import {
  DUPLICATES_DELETION_FINISH,
  DUPLICATES_DELETION_PROGRESS,
  DUPLICATES_DELETION_RESET,
  DUPLICATES_DELETION_START,
} from "./duplicates-deletion-types";

/** Marks the start of a deletion run of `total` copies. */
export const startDuplicatesDeletion = (
  total: number
): DuplicatesDeletionAction => ({
  total,
  type: DUPLICATES_DELETION_START,
});

/** Records the result of a single processed copy. */
export const reportDuplicatesDeletionProgress = (
  result: DeletionResult
): DuplicatesDeletionAction => ({
  result,
  type: DUPLICATES_DELETION_PROGRESS,
});

/** Marks the end of the run with its aggregated summary. */
export const finishDuplicatesDeletion = (
  summary: DeletionSummary
): DuplicatesDeletionAction => ({
  summary,
  type: DUPLICATES_DELETION_FINISH,
});

/** Clears the deletion state (e.g. before a new run). */
export const resetDuplicatesDeletion = (): DuplicatesDeletionAction => ({
  type: DUPLICATES_DELETION_RESET,
});
