import { createFilesAndFoldersMetadataDataStructure } from "@renderer/files-and-folders-loader/file-system-loading-process-utils";
import { updateFilesAndFoldersMetadataForAncestors } from "@renderer/files-and-folders-loader/files-and-folders-metadata-incremental-update";
import { deleteFilesAndFolders } from "@renderer/reducers/files-and-folders/files-and-folders-actions";
import {
  filesAndFoldersReducer,
  initialState,
} from "@renderer/reducers/files-and-folders/files-and-folders-reducer";
import type { FilesAndFoldersMap } from "@renderer/reducers/files-and-folders/files-and-folders-types";

import { createFilesAndFolders } from "../reducers/files-and-folders/files-and-folders-test-utils";

/**
 * Tree used across these tests:
 *
 * "" -> /root -> /root/A -> /root/A/x1, /root/A/x2, /root/A/sub
 *                              /root/A/sub -> /root/A/sub/y1
 *             -> /root/B -> /root/B/b1   (untouched sibling branch)
 *
 * The deletion below removes x1, x2 (two files sharing the same direct
 * parent, /root/A) and y1 (the last file of /root/A/sub, emptying it
 * entirely) — exercising: files at different depths, two files sharing a
 * parent, a folder that loses all its children, and an unaffected sibling
 * branch that must not be touched.
 */
const buildFilesAndFolders = (): FilesAndFoldersMap => ({
  "": createFilesAndFolders({ children: ["/root"], id: "" }),
  "/root": createFilesAndFolders({
    children: ["/root/A", "/root/B"],
    id: "/root",
  }),
  "/root/A": createFilesAndFolders({
    children: ["/root/A/x1", "/root/A/x2", "/root/A/sub"],
    id: "/root/A",
  }),
  "/root/A/sub": createFilesAndFolders({
    children: ["/root/A/sub/y1"],
    id: "/root/A/sub",
  }),
  "/root/A/sub/y1": createFilesAndFolders({
    file_last_modified: 3000,
    file_size: 30,
    id: "/root/A/sub/y1",
  }),
  "/root/A/x1": createFilesAndFolders({
    file_last_modified: 1000,
    file_size: 10,
    id: "/root/A/x1",
  }),
  "/root/A/x2": createFilesAndFolders({
    file_last_modified: 2000,
    file_size: 20,
    id: "/root/A/x2",
  }),
  "/root/B": createFilesAndFolders({ children: ["/root/B/b1"], id: "/root/B" }),
  "/root/B/b1": createFilesAndFolders({
    file_last_modified: 4000,
    file_size: 40,
    id: "/root/B/b1",
  }),
});

const deletedIds = ["/root/A/x1", "/root/A/x2", "/root/A/sub/y1"];
const changedFolderIds = ["/root/A", "/root/A/sub"];
const recomputeSet = ["", "/root", "/root/A", "/root/A/sub"];

describe("updateFilesAndFoldersMetadataForAncestors", () => {
  it("matches a full rebuild on the recomputed ancestor chain and leaves unaffected branches out of the partial result", () => {
    const filesAndFoldersBeforeDeletion = buildFilesAndFolders();
    const existingMetadata = createFilesAndFoldersMetadataDataStructure(
      filesAndFoldersBeforeDeletion
    );

    const filesAndFoldersAfterDeletion = filesAndFoldersReducer(
      { ...initialState, filesAndFolders: filesAndFoldersBeforeDeletion },
      deleteFilesAndFolders(deletedIds)
    ).filesAndFolders;

    const expectedFullRebuild = createFilesAndFoldersMetadataDataStructure(
      filesAndFoldersAfterDeletion
    );

    const partialMetadata = updateFilesAndFoldersMetadataForAncestors(
      filesAndFoldersAfterDeletion,
      existingMetadata,
      changedFolderIds
    );

    expect(Object.keys(partialMetadata).sort()).toEqual(recomputeSet.sort());
    recomputeSet.forEach((id) => {
      expect(partialMetadata[id]).toEqual(expectedFullRebuild[id]);
    });
  });

  it("does not touch an unaffected sibling branch", () => {
    const filesAndFoldersBeforeDeletion = buildFilesAndFolders();
    const existingMetadata = createFilesAndFoldersMetadataDataStructure(
      filesAndFoldersBeforeDeletion
    );

    const filesAndFoldersAfterDeletion = filesAndFoldersReducer(
      { ...initialState, filesAndFolders: filesAndFoldersBeforeDeletion },
      deleteFilesAndFolders(deletedIds)
    ).filesAndFolders;

    const partialMetadata = updateFilesAndFoldersMetadataForAncestors(
      filesAndFoldersAfterDeletion,
      existingMetadata,
      changedFolderIds
    );

    expect(partialMetadata["/root/B"]).toBeUndefined();
    expect(partialMetadata["/root/B/b1"]).toBeUndefined();
  });

  it("applies lastModifiedOverrides the same way a full rebuild does", () => {
    const filesAndFoldersBeforeDeletion = buildFilesAndFolders();
    const overrides = { "/root/A/x2": 99999 };
    const existingMetadata = createFilesAndFoldersMetadataDataStructure(
      filesAndFoldersBeforeDeletion,
      {},
      { lastModified: overrides }
    );

    const filesAndFoldersAfterDeletion = filesAndFoldersReducer(
      { ...initialState, filesAndFolders: filesAndFoldersBeforeDeletion },
      deleteFilesAndFolders(["/root/A/x1", "/root/A/sub/y1"])
    ).filesAndFolders;

    const expectedFullRebuild = createFilesAndFoldersMetadataDataStructure(
      filesAndFoldersAfterDeletion,
      {},
      { lastModified: overrides }
    );

    const partialMetadata = updateFilesAndFoldersMetadataForAncestors(
      filesAndFoldersAfterDeletion,
      existingMetadata,
      ["/root/A", "/root/A/sub"],
      { lastModified: overrides }
    );

    ["", "/root", "/root/A", "/root/A/sub"].forEach((id) => {
      expect(partialMetadata[id]).toEqual(expectedFullRebuild[id]);
    });
    // The override applies to a surviving file (x2), which must show up in
    // the recomputed ancestors' averageLastModified/maxLastModified.
    expect(partialMetadata["/root/A"].maxLastModified).toBe(99999);
  });
});
