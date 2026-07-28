import { deleteSelectedDuplicates } from "../../components/main-space/workspace/duplicates/duplicates-deletion/delete-selected-duplicates";
import {
  buildDeletionReport,
  writeDeletionReport,
} from "../../components/main-space/workspace/duplicates/duplicates-deletion/deletion-report";
import { translations } from "../../translations/translations";
import type { DuplicateGroup } from "../../utils/duplicates-deletion";
import {
  notifyError,
  notifyInfo,
  notifySuccess,
} from "../../utils/notifications";
import type { ArchifiltreDocsThunkAction } from "../archifiltre-types";
import { removeElementsFromStore } from "../files-and-folders/files-and-folders-thunks";
import {
  completeLoadingAction,
  updateLoadingAction,
} from "../loading-info/loading-info-actions";
import { startLoading } from "../loading-info/loading-info-operations";
import { LoadingInfoTypes } from "../loading-info/loading-info-types";
import {
  finishDuplicatesDeletion,
  reportDuplicatesDeletionProgress,
  startDuplicatesDeletion,
} from "./duplicates-deletion-actions";
import { getDuplicatesDeletionState } from "./duplicates-deletion-selectors";
import type { DeletionResult } from "./duplicates-deletion-types";

export interface RunDuplicatesDeletionParams {
  groups: DuplicateGroup[];
  /** absolute path where a .txt report should be written, if any */
  reportPath?: string;
  /** analysed folder path, for the report header */
  rootPath?: string;
  selectedIds: Set<string>;
  verifyMd5: boolean;
}

// Fenêtre de regroupement de la progression : dispatcher un résultat par
// fichier déclenchait un rendu React par fichier supprimé et saturait le
// renderer sur les grosses sélections (même maladie que les erreurs de
// chargement, regroupées elles aussi par lots). Quatre rafraîchissements par
// seconde suffisent largement pour une barre de progression.
const PROGRESS_FLUSH_INTERVAL_MS = 250;

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

    // Relaye aussi la progression dans l'indicateur global (en bas à gauche) :
    // la suppression continue quand l'utilisateur quitte l'onglet Redondances,
    // elle doit donc rester visible ailleurs que dans le panneau.
    const loadingId = dispatch(
      startLoading(
        LoadingInfoTypes.DUPLICATES_DELETION,
        total,
        translations.t("duplicates.deletion.loadingInfoLabel"),
        translations.t("duplicates.deletion.loadedInfoLabel")
      )
    );

    let processedCount = 0;
    let progressBuffer: DeletionResult[] = [];
    const flushProgress = () => {
      if (progressBuffer.length === 0) {
        return;
      }
      const batch = progressBuffer;
      progressBuffer = [];
      processedCount += batch.length;
      dispatch(reportDuplicatesDeletionProgress(batch));
      dispatch(updateLoadingAction(loadingId, processedCount));
    };
    const flushTimer = setInterval(flushProgress, PROGRESS_FLUSH_INTERVAL_MS);

    let results: DeletionResult[];
    try {
      results = await deleteSelectedDuplicates(
        params.groups,
        params.selectedIds,
        {
          shouldCancel: () =>
            getDuplicatesDeletionState(getState()).cancelRequested,
          verifyMd5: params.verifyMd5,
        },
        (result) => {
          progressBuffer.push(result);
        }
      );
    } finally {
      clearInterval(flushTimer);
      flushProgress();
    }

    const wasCancelled = getDuplicatesDeletionState(getState()).cancelRequested;
    if (wasCancelled && results.length > 0) {
      // Cale la jauge sur ce qui a réellement été traité, pour que
      // l'indicateur global affiche un état final cohérent (barre pleine).
      dispatch(updateLoadingAction(loadingId, results.length, results.length));
    }
    dispatch(completeLoadingAction(loadingId));

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

    if (wasCancelled) {
      notifyInfo(
        translations.t("duplicates.deletion.reportBody", summary),
        translations.t("duplicates.deletion.cancelledTitle")
      );
    } else {
      notifySuccess(
        translations.t("duplicates.deletion.reportBody", summary),
        translations.t("duplicates.deletion.reportTitle")
      );
    }
  };
