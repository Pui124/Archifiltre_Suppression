import {
  finishDuplicatesDeletion,
  reportDuplicatesDeletionProgress,
  resetDuplicatesDeletion,
  startDuplicatesDeletion,
} from "@renderer/reducers/duplicates-deletion/duplicates-deletion-actions";
import {
  duplicatesDeletionReducer,
  initialState,
} from "@renderer/reducers/duplicates-deletion/duplicates-deletion-reducer";

describe("duplicates-deletion-reducer", () => {
  it("returns the initial state by default", () => {
    expect(duplicatesDeletionReducer(undefined)).toEqual(initialState);
  });

  it("START marks the run as running and resets counters", () => {
    const state = duplicatesDeletionReducer(
      { ...initialState, isRunning: false, processed: 5, total: 5 },
      startDuplicatesDeletion(3)
    );
    expect(state.isRunning).toBe(true);
    expect(state.total).toBe(3);
    expect(state.processed).toBe(0);
    expect(state.results).toEqual({});
    expect(state.summary).toBeNull();
    expect(state.startedAt).not.toBeNull();
  });

  it("PROGRESS accumulates results and increments processed", () => {
    let state = duplicatesDeletionReducer(undefined, startDuplicatesDeletion(2));
    state = duplicatesDeletionReducer(
      state,
      reportDuplicatesDeletionProgress({ id: "a", status: "deleted" })
    );
    state = duplicatesDeletionReducer(
      state,
      reportDuplicatesDeletionProgress({
        id: "b",
        message: "md5Mismatch",
        status: "skipped",
      })
    );
    expect(state.processed).toBe(2);
    expect(state.results.a.status).toBe("deleted");
    expect(state.results.b.status).toBe("skipped");
  });

  it("FINISH stops the run and stores the summary", () => {
    let state = duplicatesDeletionReducer(undefined, startDuplicatesDeletion(1));
    const summary = { deleted: 1, errors: 0, skipped: 0 };
    state = duplicatesDeletionReducer(state, finishDuplicatesDeletion(summary));
    expect(state.isRunning).toBe(false);
    expect(state.summary).toEqual(summary);
  });

  it("RESET clears the state", () => {
    let state = duplicatesDeletionReducer(undefined, startDuplicatesDeletion(1));
    state = duplicatesDeletionReducer(state, resetDuplicatesDeletion());
    expect(state).toEqual(initialState);
  });
});
