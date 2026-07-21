import type {
  DuplicatesDeletionAction,
  DuplicatesDeletionState,
} from "./duplicates-deletion-types";
import {
  DUPLICATES_DELETION_FINISH,
  DUPLICATES_DELETION_PROGRESS,
  DUPLICATES_DELETION_RESET,
  DUPLICATES_DELETION_START,
} from "./duplicates-deletion-types";

export const initialState: DuplicatesDeletionState = {
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
        isRunning: true,
        processed: 0,
        results: {},
        startedAt: Date.now(),
        summary: null,
        total: action.total,
      };
    case DUPLICATES_DELETION_PROGRESS:
      return {
        ...state,
        processed: state.processed + 1,
        results: { ...state.results, [action.result.id]: action.result },
      };
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
