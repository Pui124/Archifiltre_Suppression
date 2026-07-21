import { deleteSelectedDuplicates } from "../../components/main-space/workspace/duplicates/duplicates-deletion/delete-selected-duplicates";
import {
  buildDeletionReport,
  writeDeletionReport,
} from "../../components/main-space/workspace/duplicates/duplicates-deletion/deletion-report";
import { translations } from "../../translations/translations";
import type { DuplicateGroup } from "../../utils/duplicates-deletion";
import { notifyError, notifySuccess } from "../../utils/notifications";
import type { ArchifiltreDocsThunkAction } from "../archifiltre-types";
import { removeElementsFromStore } from "../files-and-folders/files-and-folders-thunks";
import {
  finishDuplicatesDeletion,
  reportDuplicatesDeletionProgress,
  startDuplicatesDeletion,
} from "./duplicates-deletion-actions";
import { getDuplicatesDeletionState } from "./duplicates-deletion-selectors";

export interface RunDuplicatesDeletionParams {
  groups: DuplicateGroup[];
  /** absolute path where a .txt report should be written, if any */
  reportPath?: string;
  /** analysed folder path, for the report header */
  rootPath?: string;
  selectedIds: Set<string>;
  verifyMd5: boolean;
}

const countSelectedCopies = (
  groups: DuplicateGroup[],
  selectedIds: Set<string>
): number =>
  groups.reduce(
    (total, group) =>
      total +
      group.files.filter((file) => !file.isOriginal && selectedIds.has(file.id))
        .length,
    0
  );

/**
 * Orchestrates a mass duplicate-deletion at the store level, decoupled from the
 * Redondances panel's lifecycle: the deletion keeps running (and stays visible
 * through the global indicator) even when the user leaves the tab, which
 * unmounts the panel. Progress is streamed into the store one file at a time.
 */
export const runDuplicatesDeletion =
  (
    params: RunDuplicatesDeletionParams
  ): ArchifiltreDocsThunkAction<Promise<void>> =>
  async (dispatch, getState) => {
    if (getDuplicatesDeletionState(getState()).isRunning) {
      return;
    }

    const total = countSelectedCopies(params.groups, params.selectedIds);
    if (total === 0) {
      return;
    }

    dispatch(startDuplicatesDeletion(total));

    const results = await deleteSelectedDuplicates(
      params.groups,
      params.selectedIds,
      { verifyMd5: params.verifyMd5 },
      (result) => {
        dispatch(reportDuplicatesDeletionProgress(result));
      }
    );

    const deletedIds = results
      .filter((result) => result.status === "deleted")
      .map((result) => result.id);
    if (deletedIds.length > 0) {
      // Refresh the analysis (tree, duplicates count, distribution, ...).
      void dispatch(removeElementsFromStore(deletedIds));
    }

    if (params.reportPath) {
      try {
        const { content } = buildDeletionReport(params.groups, results, {
          rootPath: params.rootPath,
        });
        await writeDeletionReport(params.reportPath, content);
      } catch (error: unknown) {
        notifyError(
          error instanceof Error ? error.message : String(error),
          translations.t("duplicates.deletion.reportError")
        );
      }
    }

    const summary = {
      deleted: deletedIds.length,
      errors: results.filter((result) => result.status === "error").length,
      skipped: results.filter((result) => result.status === "skipped").length,
    };
    dispatch(finishDuplicatesDeletion(summary));

    notifySuccess(
      translations.t("duplicates.deletion.reportBody", summary),
      translations.t("duplicates.deletion.reportTitle")
    );
  };
