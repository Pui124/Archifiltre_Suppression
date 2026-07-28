import type {
  DuplicatesDeletionAction,
  DuplicatesDeletionState,
} from "./duplicates-deletion-types";
import {
  DUPLICATES_DELETION_CANCEL_REQUEST,
  DUPLICATES_DELETION_FINISH,
  DUPLICATES_DELETION_PROGRESS,
  DUPLICATES_DELETION_RESET,
  DUPLICATES_DELETION_START,
} from "./duplicates-deletion-types";

export const initialState: DuplicatesDeletionState = {
  cancelRequested: false,
  isRunning: false,
  processed: 0,
  results: {},
  startedAt: null,
  summary: null,
  total: 0,
};

export const duplicatesDeletionReducer = (
  state = initialState,
  action?: DuplicatesDeletionAction
): DuplicatesDeletionState => {
  switch (action?.type) {
    case DUPLICATES_DELETION_START:
      return {
        cancelRequested: false,
        isRunning: true,
        processed: 0,
        results: {},
        startedAt: Date.now(),
        summary: null,
        total: action.total,
      };
    case DUPLICATES_DELETION_PROGRESS: {
      if (action.results.length === 0) {
        return state;
      }
      // Un seul nouvel objet par lot : appliquer les résultats un par un
      // copiait `results` en entier à chaque fichier (quadratique sur les
      // grosses suppressions) et déclenchait un rendu React par fichier.
      const results = { ...state.results };
      action.results.forEach((result) => {
        results[result.id] = result;
      });
      return {
        ...state,
        processed: state.processed + action.results.length,
        results,
      };
    }
    case DUPLICATES_DELETION_CANCEL_REQUEST:
      return state.isRunning ? { ...state, cancelRequested: true } : state;
    case DUPLICATES_DELETION_FINISH:
      return {
        ...state,
        isRunning: false,
        summary: action.summary,
      };
    case DUPLICATES_DELETION_RESET:
      return initialState;
    default:
      return state;
  }
};
