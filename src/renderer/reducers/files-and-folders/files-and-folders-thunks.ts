import { getTrackerProvider } from "@common/modules/tracker";
import { bytesToMegabytes } from "@common/utils/numbers";
import { omit } from "lodash";
import { batch } from "react-redux";

import { createFilesAndFoldersMetadataDataStructure } from "../../files-and-folders-loader/file-system-loading-process-utils";
import { updateFilesAndFoldersMetadataForAncestors } from "../../files-and-folders-loader/files-and-folders-metadata-incremental-update";
import { translations } from "../../translations/translations";
import { isFile, isFolder } from "../../utils";
import { isExactFileOrAncestor } from "../../utils/file-and-folders";
import { notifyInfo } from "../../utils/notifications";
import type { ArchifiltreDocsThunkAction } from "../archifiltre-types";
import { commitAction } from "../enhancers/undoable/undoable-actions";
import { initFilesAndFoldersMetatada } from "../files-and-folders-metadata/files-and-folders-metadata-actions";
import { getFilesAndFoldersMetadataFromStore } from "../files-and-folders-metadata/files-and-folders-metadata-selectors";
import type { FilesAndFoldersMetadataMap } from "../files-and-folders-metadata/files-and-folders-metadata-types";
import {
  addChild,
  addCommentsOnFilesAndFolders,
  deleteFilesAndFolders,
  overrideLastModified,
  removeChild,
  setFilesAndFoldersAliases,
} from "./files-and-folders-actions";
import {
  findElementParent,
  getFilesAndFoldersFromStore,
  getLastModifiedDateOverrides,
} from "./files-and-folders-selectors";
import type { FilesAndFoldersMap } from "./files-and-folders-types";

/**
 * Updates the files and folders alias
 * @param filesAndFoldersId
 * @param newAlias
 */
export const updateAliasThunk =
  (filesAndFoldersId: string, newAlias: string): ArchifiltreDocsThunkAction =>
  (dispatch) => {
    dispatch(setFilesAndFoldersAliases({ [filesAndFoldersId]: newAlias }));
    dispatch(commitAction());
  };

/**
 * Updates the filesAndFolderComment
 * @param filesAndFoldersId
 * @param comments
 */
export const updateCommentThunk =
  (filesAndFoldersId: string, comments: string): ArchifiltreDocsThunkAction =>
  (dispatch) => {
    dispatch(addCommentsOnFilesAndFolders({ [filesAndFoldersId]: comments }));
  };

export enum IsMoveValidError {
  cannotMoveToChild = "cannotMoveToChild",
  cannotMoveToFile = "cannotMoveToFile",
  impossibleMove = "impossibleMove",
  nameConflict = "nameConflict",
}

/**
 * Returns an error if the move is invalid, null otherwise
 * @param filesAndFolders - map of files and folders
 * @param newParentId - id of target element
 * @param elementId - id of moved element
 */
const isMoveValid = (
  filesAndFolders: FilesAndFoldersMap,
  newParentId: string,
  elementId: string
): IsMoveValidError | null => {
  const newParent = filesAndFolders[newParentId];
  const element = filesAndFolders[elementId];
  const newParentVirtualPath = newParent.virtualPath;
  const elementVirtualPath = element.virtualPath;
  const newSiblingsNames = newParent.children.map(
    (id) => filesAndFolders[id].name
  );
  const isNameConflict = newSiblingsNames.includes(element.name);
  if (isExactFileOrAncestor(newParentVirtualPath, elementVirtualPath)) {
    return IsMoveValidError.cannotMoveToChild;
  }
  if (isFile(newParent)) {
    return IsMoveValidError.cannotMoveToFile;
  }
  if (isNameConflict) {
    return IsMoveValidError.nameConflict;
  }

  return null;
};

/**
 * Removes elements from the store after they have actually been deleted on
 * disk (e.g. sent to the trash by the mass duplicate-deletion feature). Detaches
 * each element from its parent, drops the elements themselves from the map, then
 * recomputes metadata and commits so every derived view (duplicates count,
 * distribution, tree, ...) refreshes — showing 0 duplicates once every copy is
 * gone.
 *
 * Only the ancestor chain of the folders actually touched by the deletion is
 * recomputed (see updateFilesAndFoldersMetadataForAncestors) — not the whole
 * tree. A full rebuild here would freeze the UI for a duration proportional to
 * the total tree size, however small the deletion was.
 *
 * The structural dispatch and the metadata dispatch are wrapped in
 * react-redux's batch(): without it, React 17 re-renders synchronously right
 * after the first dispatch, at which point filesAndFolders already has the
 * shorter children arrays but filesAndFoldersMetadata still has the old,
 * longer sort-index arrays — getChildrenIdFromId then indexes out of bounds
 * (undefined children), which cascades into NaN widths in the icicle for one
 * frame. batch() defers the re-render until every dispatch below has landed.
 * @param elementIds - ids of the elements to remove from the store
 */
export const removeElementsFromStore =
  (elementIds: string[]): ArchifiltreDocsThunkAction =>
  (dispatch, getState) => {
    // The parent of each deleted element can only be resolved before the
    // deletion: once DELETE_FILES_AND_FOLDERS runs, the deleted ids disappear
    // from the map entirely.
    const filesAndFoldersBeforeDeletion = getFilesAndFoldersFromStore(
      getState()
    );
    const parentIndexBeforeDeletion = new Map<string, string>();
    Object.entries(filesAndFoldersBeforeDeletion).forEach(([id, element]) => {
      element.children.forEach((childId) => {
        parentIndexBeforeDeletion.set(childId, id);
      });
    });
    const changedFolderIds = new Set<string>();
    elementIds.forEach((elementId) => {
      const parentId = parentIndexBeforeDeletion.get(elementId);
      if (parentId !== undefined) {
        changedFolderIds.add(parentId);
      }
    });

    batch(() => {
      // A single batched action detaches the elements from their parents and
      // drops them from the map at once. This is critical on large deletions:
      // one dispatch per element meant thousands of store updates / full
      // re-renders (of the icicle over the whole tree, ...) and froze the app
      // near the end.
      dispatch(deleteFilesAndFolders(elementIds));

      const updatedFilesAndFolders = getFilesAndFoldersFromStore(getState());
      const existingMetadata = getFilesAndFoldersMetadataFromStore(getState());
      const lastModifiedOverrides = getLastModifiedDateOverrides(getState());
      const partialMetadata = updateFilesAndFoldersMetadataForAncestors(
        updatedFilesAndFolders,
        existingMetadata,
        Array.from(changedFolderIds),
        { lastModified: lastModifiedOverrides }
      );
      // The deleted elements' own metadata entries are otherwise never
      // overwritten by the partial recompute (only their ancestors are) and
      // would linger forever in the map — a full rebuild would have dropped
      // them naturally by only ever including reachable ids.
      const mergedMetadata = omit(
        { ...existingMetadata, ...partialMetadata },
        elementIds
      );
      dispatch(initFilesAndFoldersMetatada(mergedMetadata));
      dispatch(commitAction());
    });
  };

/**
 * Allows to virtually move a file system element to another location. Only
 * the ancestor chains of the old and new parent are recomputed (see
 * updateFilesAndFoldersMetadataForAncestors) — the moved element's own
 * subtree is untouched by a move, so its metadata doesn't need recomputing
 * either.
 * @param elementId
 * @param newParentId
 */
export const moveElement =
  (elementId: string, newParentId: string): ArchifiltreDocsThunkAction =>
  (dispatch, getState) => {
    const filesAndFolders = getFilesAndFoldersFromStore(getState());
    const parent = findElementParent(elementId, filesAndFolders)!;
    const error = isMoveValid(filesAndFolders, newParentId, elementId);
    if (error) {
      const errorMessage = translations.t(`workspace.${error}`);
      notifyInfo(errorMessage, translations.t("workspace.impossibleMove"));
      return;
    }

    let updatedFilesAndFolders: FilesAndFoldersMap = {};
    let newMetadata: FilesAndFoldersMetadataMap = {};
    // batch(): see removeElementsFromStore's doc comment above — same hazard
    // (structural + metadata dispatched separately) without it.
    batch(() => {
      dispatch(removeChild(parent.id, elementId));
      dispatch(addChild(newParentId, elementId));

      updatedFilesAndFolders = getFilesAndFoldersFromStore(getState());
      const existingMetadata = getFilesAndFoldersMetadataFromStore(getState());
      const partialMetadata = updateFilesAndFoldersMetadataForAncestors(
        updatedFilesAndFolders,
        existingMetadata,
        Array.from(new Set([parent.id, newParentId]))
      );
      newMetadata = { ...existingMetadata, ...partialMetadata };

      dispatch(initFilesAndFoldersMetatada(newMetadata));
      dispatch(commitAction());
    });

    const ff = updatedFilesAndFolders[elementId];
    const ffIsFolder = isFolder(ff);
    const sizeRaw = ffIsFolder
      ? newMetadata[elementId].childrenTotalSize
      : ff.file_size;
    getTrackerProvider().track("Feat(3.0) Element Moved", {
      size: bytesToMegabytes(sizeRaw),
      sizeRaw,
      type: ffIsFolder ? "folder" : "file",
    });
  };

export const overrideLastModifiedDateThunk =
  (elementId: string, lastModified: number): ArchifiltreDocsThunkAction =>
  (dispatch, getState) => {
    dispatch(overrideLastModified(elementId, lastModified));

    const store = getState();
    const filesAndFolders = getFilesAndFoldersFromStore(store);
    const lastModifiedOverrides = getLastModifiedDateOverrides(store);
    const metadata = createFilesAndFoldersMetadataDataStructure(
      filesAndFolders,
      {},
      { lastModified: lastModifiedOverrides }
    );
    dispatch(initFilesAndFoldersMetatada(metadata));
  };
