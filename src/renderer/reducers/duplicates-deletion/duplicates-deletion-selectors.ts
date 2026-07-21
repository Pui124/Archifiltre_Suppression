import { useSelector } from "react-redux";

import type { StoreState } from "../store";
import type { DuplicatesDeletionState } from "./duplicates-deletion-types";

/** Retrieves the global mass-deletion state from the store. */
export const getDuplicatesDeletionState = (
  store: StoreState
): DuplicatesDeletionState => store.duplicatesDeletion;

/** Hook returning the global mass-deletion state. */
export const useDuplicatesDeletionState = (): DuplicatesDeletionState =>
  useSelector(getDuplicatesDeletionState);
