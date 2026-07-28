import type {
  DeletionResult,
  DeletionSummary,
  DuplicatesDeletionAction,
} from "./duplicates-deletion-types";
import {
  DUPLICATES_DELETION_CANCEL_REQUEST,
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

/** Records the results of a batch of processed copies. */
export const reportDuplicatesDeletionProgress = (
  results: DeletionResult[]
): DuplicatesDeletionAction => ({
  results,
  type: DUPLICATES_DELETION_PROGRESS,
});

/** Asks the running deletion to stop: remaining files are left untouched. */
export const requestDuplicatesDeletionCancel =
  (): DuplicatesDeletionAction => ({
    type: DUPLICATES_DELETION_CANCEL_REQUEST,
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
