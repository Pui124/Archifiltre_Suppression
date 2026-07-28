import {
  finishDuplicatesDeletion,
  reportDuplicatesDeletionProgress,
  requestDuplicatesDeletionCancel,
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

  it("PROGRESS accumulates batched results and increments processed", () => {
    let state = duplicatesDeletionReducer(
      undefined,
      startDuplicatesDeletion(3)
    );
    state = duplicatesDeletionReducer(
      state,
      reportDuplicatesDeletionProgress([{ id: "a", status: "deleted" }])
    );
    state = duplicatesDeletionReducer(
      state,
      reportDuplicatesDeletionProgress([
        { id: "b", message: "md5Mismatch", status: "skipped" },
        { id: "c", status: "deleted" },
      ])
    );
    expect(state.processed).toBe(3);
    expect(state.results.a.status).toBe("deleted");
    expect(state.results.b.status).toBe("skipped");
    expect(state.results.c.status).toBe("deleted");
  });

  it("PROGRESS with an empty batch leaves the state untouched", () => {
    const state = duplicatesDeletionReducer(
      undefined,
      startDuplicatesDeletion(1)
    );
    expect(
      duplicatesDeletionReducer(state, reportDuplicatesDeletionProgress([]))
    ).toBe(state);
  });

  it("CANCEL_REQUEST flags a running deletion, and only a running one", () => {
    const running = duplicatesDeletionReducer(
      undefined,
      startDuplicatesDeletion(2)
    );
    const cancelled = duplicatesDeletionReducer(
      running,
      requestDuplicatesDeletionCancel()
    );
    expect(cancelled.cancelRequested).toBe(true);
    expect(cancelled.isRunning).toBe(true);

    expect(
      duplicatesDeletionReducer(initialState, requestDuplicatesDeletionCancel())
    ).toBe(initialState);
  });

  it("START clears a previous cancel request", () => {
    let state = duplicatesDeletionReducer(
      undefined,
      startDuplicatesDeletion(2)
    );
    state = duplicatesDeletionReducer(state, requestDuplicatesDeletionCancel());
    state = duplicatesDeletionReducer(state, startDuplicatesDeletion(1));
    expect(state.cancelRequested).toBe(false);
  });

  it("FINISH stops the run and stores the summary", () => {
    let state = duplicatesDeletionReducer(
      undefined,
      startDuplicatesDeletion(1)
    );
    const summary = { deleted: 1, errors: 0, skipped: 0 };
    state = duplicatesDeletionReducer(state, finishDuplicatesDeletion(summary));
    expect(state.isRunning).toBe(false);
    expect(state.summary).toEqual(summary);
  });

  it("RESET clears the state", () => {
    let state = duplicatesDeletionReducer(
      undefined,
      startDuplicatesDeletion(1)
    );
    state = duplicatesDeletionReducer(state, resetDuplicatesDeletion());
    expect(state).toEqual(initialState);
  });
});
