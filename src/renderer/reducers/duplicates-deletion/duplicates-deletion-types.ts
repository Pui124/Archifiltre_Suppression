export const DUPLICATES_DELETION_START = "DUPLICATES_DELETION/START";
export const DUPLICATES_DELETION_PROGRESS = "DUPLICATES_DELETION/PROGRESS";
export const DUPLICATES_DELETION_FINISH = "DUPLICATES_DELETION/FINISH";
export const DUPLICATES_DELETION_RESET = "DUPLICATES_DELETION/RESET";

export type DeletionStatus = "deleted" | "error" | "skipped";

export interface DeletionResult {
  id: string;
  message?: string;
  status: DeletionStatus;
}

export interface DeletionSummary {
  deleted: number;
  errors: number;
  skipped: number;
}

/**
 * Global state of the mass duplicate-deletion. Lives above the component tree so
 * the operation keeps running (and stays visible) when the user leaves the
 * Redondances tab, which unmounts the deletion panel.
 */
export interface DuplicatesDeletionState {
  isRunning: boolean;
  /** number of processed copies so far (deleted + skipped + errored) */
  processed: number;
  /** per-file result, keyed by element id */
  results: Record<string, DeletionResult>;
  startedAt: number | null;
  /** filled once the run is over */
  summary: DeletionSummary | null;
  /** number of copies to process in the current run */
  total: number;
}

interface StartAction {
  total: number;
  type: typeof DUPLICATES_DELETION_START;
}

interface ProgressAction {
  result: DeletionResult;
  type: typeof DUPLICATES_DELETION_PROGRESS;
}

interface FinishAction {
  summary: DeletionSummary;
  type: typeof DUPLICATES_DELETION_FINISH;
}

interface ResetAction {
  type: typeof DUPLICATES_DELETION_RESET;
}

export type DuplicatesDeletionAction =
  | FinishAction
  | ProgressAction
  | ResetAction
  | StartAction;
