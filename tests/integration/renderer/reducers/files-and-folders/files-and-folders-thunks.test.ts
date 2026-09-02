import { createFilesAndFoldersMetadataDataStructure } from "@renderer/files-and-folders-loader/file-system-loading-process-utils";
import type { DispatchExts } from "@renderer/reducers/archifiltre-types";
import { commitAction } from "@renderer/reducers/enhancers/undoable/undoable-actions";
import {
  addChild,
  addCommentsOnFilesAndFolders,
  deleteFilesAndFolders,
  overrideLastModified,
  removeChild,
  setFilesAndFoldersAliases,
} from "@renderer/reducers/files-and-folders/files-and-folders-actions";
import {
  initialState as filesAndFoldersInitialState,
  initialState,
} from "@renderer/reducers/files-and-folders/files-and-folders-reducer";
import { ROOT_FF_ID } from "@renderer/reducers/files-and-folders/files-and-folders-selectors";
import {
  moveElement,
  overrideLastModifiedDateThunk,
  removeElementsFromStore,
  updateAliasThunk,
  updateCommentThunk,
} from "@renderer/reducers/files-and-folders/files-and-folders-thunks";
import { ADD_CHILD } from "@renderer/reducers/files-and-folders/files-and-folders-types";
import { initFilesAndFoldersMetatada } from "@renderer/reducers/files-and-folders-metadata/files-and-folders-metadata-actions";
import { createFilesAndFoldersMetadata } from "@renderer/reducers/files-and-folders-metadata/files-and-folders-metadata-selectors";
import { setFilesAndFoldersHashes } from "@renderer/reducers/hashes/hashes-actions";
import { updateFilesAndFoldersHashes } from "@renderer/reducers/hashes/hashes-thunks";
import type { StoreState } from "@renderer/reducers/store";
import { translations } from "@renderer/translations/translations";
import { notifyInfo } from "@renderer/utils/notifications";
import configureMockStore from "redux-mock-store";
import thunk from "redux-thunk";

import { createEmptyStore, wrapStoreWithUndoable } from "../store-test-utils";
import { createFilesAndFolders } from "./files-and-folders-test-utils";

jest.mock("@renderer/utils/notifications", () => ({
  notifyInfo: jest.fn(),
}));

jest.mock(
  "@renderer/files-and-folders-loader/file-system-loading-process-utils",
  () => ({
    createFilesAndFoldersMetadataDataStructure: jest.fn(),
  })
);

const notifyInfoMock = notifyInfo as jest.Mock;
const mockStore = configureMockStore<StoreState, DispatchExts>([thunk]);

const emptyStoreState = createEmptyStore();
const updateId1 = "update-1";
const updateId2 = "update-2";
const unupdatedId = "no-update";
const newHash1 = "new-hash-1";
const newHash2 = "new-hash-2";

const filesAndFoldersSample = {
  [unupdatedId]: createFilesAndFolders({
    id: unupdatedId,
  }),
  [updateId1]: createFilesAndFolders({
    id: updateId1,
  }),
  [updateId2]: createFilesAndFolders({
    id: updateId2,
  }),
};

const testState = {
  ...emptyStoreState,
  filesAndFolders: wrapStoreWithUndoable({
    ...filesAndFoldersInitialState,
    filesAndFolders: filesAndFoldersSample,
  }),
};

describe("file-and-folders-thunks.test.ts", () => {
  describe("moveElement", () => {
    const rootFolderId = "/root-folder";
    const file1Id = "/root-folder/file-1-id";
    const folderId = "/root-folder/folder";
    const file2Id = "/root-folder/folder/file-2-id";
    const filesAndFolders = {
      [ROOT_FF_ID]: createFilesAndFolders({
        children: [rootFolderId],
        id: "",
      }),
      [file1Id]: createFilesAndFolders({ id: file1Id, name: "test" }),
      [file2Id]: createFilesAndFolders({ id: file2Id }),
      [folderId]: createFilesAndFolders({
        children: [file2Id],
        id: folderId,
      }),
      [rootFolderId]: createFilesAndFolders({
        children: [file1Id, folderId],
        id: rootFolderId,
      }),
    };

    const filesAndFolders2 = {
      ...filesAndFolders,
      [file1Id]: createFilesAndFolders({
        id: file1Id,
        virtualPath: `${folderId}/file-1-id`,
      }),
      [folderId]: createFilesAndFolders({
        children: [file2Id, file1Id],
        id: folderId,
      }),
      [rootFolderId]: createFilesAndFolders({
        children: [folderId],
        id: rootFolderId,
      }),
    };

    // Distinguishable placeholder values (not hand-verified arithmetic — that
    // is covered by files-and-folders-metadata-incremental-update.test.ts):
    // this fixture only needs to exist for every id moveElement touches, so
    // the dispatch order and the reference-identity of the untouched branch
    // (file2Id) can be asserted.
    const metadataBefore = {
      [ROOT_FF_ID]: createFilesAndFoldersMetadata({ childrenTotalSize: 100 }),
      [file1Id]: createFilesAndFoldersMetadata({ childrenTotalSize: 10 }),
      [file2Id]: createFilesAndFoldersMetadata({ childrenTotalSize: 20 }),
      [folderId]: createFilesAndFoldersMetadata({ childrenTotalSize: 20 }),
      [rootFolderId]: createFilesAndFoldersMetadata({ childrenTotalSize: 30 }),
    };

    const state1 = {
      ...createEmptyStore(),
      filesAndFolders: wrapStoreWithUndoable({
        ...initialState,
        filesAndFolders,
      }),
      filesAndFoldersMetadata: wrapStoreWithUndoable({
        filesAndFoldersMetadata: metadataBefore,
      }),
    };
    const state2 = {
      ...createEmptyStore(),
      filesAndFolders: wrapStoreWithUndoable({
        ...initialState,
        filesAndFolders: filesAndFolders2,
      }),
      filesAndFoldersMetadata: wrapStoreWithUndoable({
        filesAndFoldersMetadata: metadataBefore,
      }),
    };

    const createFilesAndFoldersMetadataDataStructureMock =
      createFilesAndFoldersMetadataDataStructure as jest.Mock;

    beforeEach(() => {
      notifyInfoMock.mockReset();
      createFilesAndFoldersMetadataDataStructureMock.mockReset();
    });

    it("should do the right steps to move the element", () => {
      let addChildCalled = false;
      const store = mockStore(() => (addChildCalled ? state2 : state1));
      store.subscribe(() => {
        const actions = store.getActions();
        if (actions[actions.length - 1].type === ADD_CHILD) {
          addChildCalled = true;
        }
      });

      void store.dispatch(moveElement(file1Id, folderId));

      const actions = store.getActions();
      expect(actions).toHaveLength(4);
      expect(actions[0]).toEqual(removeChild(rootFolderId, file1Id));
      expect(actions[1]).toEqual(addChild(folderId, file1Id));
      expect(actions[3]).toEqual(commitAction());

      const dispatchedMetadata = actions[2].metadata as Record<
        string,
        unknown
      >;
      // Only the old parent (rootFolderId) and new parent (folderId), plus
      // their shared ancestor chain up to root, are recomputed. file2Id sits
      // untouched under folderId and must keep the exact same reference.
      expect(dispatchedMetadata[file2Id]).toBe(metadataBefore[file2Id]);
      expect(dispatchedMetadata[folderId]).not.toBe(metadataBefore[folderId]);
      expect(dispatchedMetadata[rootFolderId]).not.toBe(
        metadataBefore[rootFolderId]
      );
      expect(dispatchedMetadata[ROOT_FF_ID]).not.toBe(
        metadataBefore[ROOT_FF_ID]
      );
    });
    it("should block an element move from a parent to its child", () => {
      const store = mockStore(() => state1);

      void store.dispatch(moveElement(rootFolderId, folderId));

      expect(
        createFilesAndFoldersMetadataDataStructureMock
      ).not.toHaveBeenCalled();

      expect(notifyInfoMock).toHaveBeenCalledWith(
        translations.t("workspace.cannotMoveToChild"),
        translations.t("workspace.impossibleMove")
      );
    });
    it("should block an element move to a file element", () => {
      const store = mockStore(() => state2);

      void store.dispatch(moveElement(file1Id, file2Id));

      expect(
        createFilesAndFoldersMetadataDataStructureMock
      ).not.toHaveBeenCalled();

      expect(notifyInfoMock).toHaveBeenCalledWith(
        translations.t("workspace.cannotMoveToFile"),
        translations.t("workspace.impossibleMove")
      );
    });
    it("should block an element move if name conflict in target folder", () => {
      const store = mockStore(() => state1);

      void store.dispatch(moveElement(file2Id, rootFolderId));

      expect(
        createFilesAndFoldersMetadataDataStructureMock
      ).not.toHaveBeenCalled();

      expect(notifyInfoMock).toHaveBeenCalledWith(
        translations.t("workspace.nameConflict"),
        translations.t("workspace.impossibleMove")
      );
    });
  });
  describe("removeElementsFromStore", () => {
    const rootFolderId = "";
    const folder1Id = "/folder1";
    const folder2Id = "/folder2";
    const toDeleteId = "/folder1/to-delete";
    const untouchedId = "/folder2/untouched";

    const filesAndFolders = {
      [rootFolderId]: createFilesAndFolders({
        children: [folder1Id, folder2Id],
        id: rootFolderId,
      }),
      [folder1Id]: createFilesAndFolders({
        children: [toDeleteId],
        id: folder1Id,
      }),
      [folder2Id]: createFilesAndFolders({
        children: [untouchedId],
        id: folder2Id,
      }),
      [toDeleteId]: createFilesAndFolders({ id: toDeleteId }),
      [untouchedId]: createFilesAndFolders({ id: untouchedId }),
    };

    const metadataBefore = {
      [rootFolderId]: createFilesAndFoldersMetadata({ childrenTotalSize: 100 }),
      [folder1Id]: createFilesAndFoldersMetadata({ childrenTotalSize: 10 }),
      [folder2Id]: createFilesAndFoldersMetadata({ childrenTotalSize: 20 }),
      [toDeleteId]: createFilesAndFoldersMetadata({ childrenTotalSize: 1 }),
      [untouchedId]: createFilesAndFoldersMetadata({ childrenTotalSize: 2 }),
    };

    const buildStore = () =>
      mockStore({
        ...createEmptyStore(),
        filesAndFolders: wrapStoreWithUndoable({
          ...filesAndFoldersInitialState,
          filesAndFolders,
        }),
        filesAndFoldersMetadata: wrapStoreWithUndoable({
          filesAndFoldersMetadata: metadataBefore,
        }),
      });

    it("dispatches delete, then a merged metadata update, then commit", () => {
      const store = buildStore();

      void store.dispatch(removeElementsFromStore([toDeleteId]));

      const actions = store.getActions();
      expect(actions[0]).toEqual(deleteFilesAndFolders([toDeleteId]));
      expect(actions[2]).toEqual(commitAction());
      expect(actions).toHaveLength(3);
    });

    it("only recomputes the ancestor chain of the deleted element's parent, and leaves an unaffected sibling branch untouched", () => {
      const store = buildStore();

      void store.dispatch(removeElementsFromStore([toDeleteId]));

      const dispatchedMetadata = store.getActions()[1].metadata as Record<
        string,
        unknown
      >;

      // Unaffected sibling branch: same object reference as before, proving
      // it was not recomputed.
      expect(dispatchedMetadata[folder2Id]).toBe(metadataBefore[folder2Id]);
      expect(dispatchedMetadata[untouchedId]).toBe(
        metadataBefore[untouchedId]
      );

      // Ancestor chain of the deleted element's parent: recomputed, so a new
      // object.
      expect(dispatchedMetadata[folder1Id]).not.toBe(metadataBefore[folder1Id]);
      expect(dispatchedMetadata[rootFolderId]).not.toBe(
        metadataBefore[rootFolderId]
      );

      // The deleted element's own (now orphaned) metadata entry must not
      // linger in the map.
      expect(dispatchedMetadata[toDeleteId]).toBeUndefined();
    });
  });

  describe("updateFilesAndFolderHashes", () => {
    it("should dispatch an update action for each ff", () => {
      const hashes = {
        [updateId1]: newHash1,
        [updateId2]: newHash2,
      };

      const store = mockStore(testState);

      void store.dispatch(updateFilesAndFoldersHashes(hashes));

      const actions = store.getActions();

      expect(actions).toEqual([setFilesAndFoldersHashes(hashes)]);
    });
  });

  describe("updateAliasThunk", () => {
    it("should dispatch the right action", () => {
      const store = mockStore(testState);
      const ffId = "ff-id";
      const alias = "new-alias";
      void store.dispatch(updateAliasThunk(ffId, alias));

      expect(store.getActions()).toEqual([
        setFilesAndFoldersAliases({ [ffId]: alias }),
        commitAction(),
      ]);
    });
  });

  describe("updateCommentThunk", () => {
    it("should dispatch the right action", () => {
      const store = mockStore(testState);
      const ffId = "ff-id";
      const comment = "new-comment";
      void store.dispatch(updateCommentThunk(ffId, comment));

      expect(store.getActions()).toEqual([
        addCommentsOnFilesAndFolders({ [ffId]: comment }),
      ]);
    });
  });

  describe("overrideLastModifiedDateThunk", () => {
    it("should dispatch the right actions", () => {
      const store = mockStore(testState);
      const overrideDate = 20;
      void store.dispatch(
        overrideLastModifiedDateThunk(updateId1, overrideDate)
      );

      const newMetadata = createFilesAndFoldersMetadataDataStructure(
        filesAndFoldersSample,
        {},
        {}
      );

      expect(store.getActions()).toEqual([
        overrideLastModified(updateId1, overrideDate),
        initFilesAndFoldersMetatada(newMetadata),
      ]);
    });
  });
});
