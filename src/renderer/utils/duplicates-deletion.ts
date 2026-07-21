import type { HashesMap } from "@common/utils/hashes-types";
import path from "path";
import { useMemo } from "react";
import { useSelector } from "react-redux";

import { getFilesAndFoldersFromStore } from "../reducers/files-and-folders/files-and-folders-selectors";
import type {
  FilesAndFolders,
  FilesAndFoldersMap,
} from "../reducers/files-and-folders/files-and-folders-types";
import { getHashesFromStore } from "../reducers/hashes/hashes-selectors";
import { getOriginalPathFromStore } from "../reducers/workspace-metadata/workspace-metadata-selectors";
import { getFilesDuplicatesMap } from "./duplicates";

export interface DuplicateFile {
  /** absolute on-disk path, ready for deletion */
  absolutePath: string;
  hash: string;
  id: string;
  /** true for the oldest file of the group: the protected original */
  isOriginal: boolean;
  lastModified: number;
  name: string;
  /** in bytes */
  size: number;
  virtualPath: string;
}

export interface DuplicateGroup {
  /** number of deletable copies (files.length - 1) */
  copiesCount: number;
  /** sorted by lastModified asc; files[0] is the protected original */
  files: DuplicateFile[];
  hash: string;
  /** bytes reclaimable if every copy is deleted */
  reclaimableSize: number;
}

/**
 * Resolves the absolute on-disk path of an element from its virtual id.
 * Mirrors `useElementAbsolutePath`: element ids are virtual paths such as
 * `/RootName/sub/file`, rooted at `dirname(originalPath)`.
 */
export const toAbsolutePath = (originalPath: string, id: string): string =>
  originalPath ? path.join(originalPath, "..", id) : id;

/**
 * Builds the list of duplicate groups (files sharing the same hash) ready for
 * the mass-deletion UI. Within each group, files are sorted by modification
 * date ascending, so the oldest is flagged as the protected original (kept by
 * default) and the others are deletable copies — mirroring the standalone
 * Script_Suppression_Doublons behaviour. Groups are sorted by reclaimable size
 * descending so the biggest wins surface first.
 */
export const buildDuplicateGroups = (
  filesAndFolders: FilesAndFoldersMap,
  hashes: HashesMap,
  originalPath: string
): DuplicateGroup[] => {
  const duplicatesMap = getFilesDuplicatesMap(filesAndFolders, hashes);

  return Object.entries(duplicatesMap)
    .reduce<DuplicateGroup[]>((groups, [hash, ffList]) => {
      // getFilesDuplicatesMap groups every file by hash, singletons included;
      // a real duplicate group needs at least two files.
      if (!ffList || ffList.length < 2) {
        return groups;
      }

      const files: DuplicateFile[] = ffList
        .map((ff: FilesAndFolders) => ({
          absolutePath: toAbsolutePath(originalPath, ff.id),
          hash,
          id: ff.id,
          isOriginal: false,
          lastModified: ff.file_last_modified,
          name: ff.name,
          size: ff.file_size,
          virtualPath: ff.virtualPath,
        }))
        .sort((a, b) => a.lastModified - b.lastModified);

      files[0].isOriginal = true;
      const copiesCount = files.length - 1;

      groups.push({
        copiesCount,
        files,
        hash,
        reclaimableSize: files[0].size * copiesCount,
      });
      return groups;
    }, [])
    .sort((a, b) => b.reclaimableSize - a.reclaimableSize);
};

/** Sortable properties of a duplicate group in the mass-deletion UI. */
export type DuplicateSortKey = "copies" | "extension" | "lastModified" | "size";

export type SortDirection = "asc" | "desc";

/** Returns the (lowercased) extension of a group, based on its original file. */
export const getGroupExtension = (group: DuplicateGroup): string => {
  const original =
    group.files.find((file) => file.isOriginal) ?? group.files[0];
  return path.extname(original.name).toLowerCase();
};

/** Last-modified date of a group, taken from its protected original. */
const getGroupLastModified = (group: DuplicateGroup): number => {
  const original =
    group.files.find((file) => file.isOriginal) ?? group.files[0];
  return original.lastModified;
};

/**
 * Returns a new, sorted copy of the duplicate groups for the given criterion and
 * direction. Sorting is stable-ish: ties fall back to reclaimable size so the
 * order stays deterministic.
 */
export const sortDuplicateGroups = (
  groups: DuplicateGroup[],
  key: DuplicateSortKey,
  direction: SortDirection
): DuplicateGroup[] => {
  const factor = direction === "asc" ? 1 : -1;

  const compare = (a: DuplicateGroup, b: DuplicateGroup): number => {
    switch (key) {
      case "copies":
        return a.copiesCount - b.copiesCount;
      case "extension":
        return getGroupExtension(a).localeCompare(getGroupExtension(b));
      case "lastModified":
        return getGroupLastModified(a) - getGroupLastModified(b);
      case "size":
      default:
        return a.reclaimableSize - b.reclaimableSize;
    }
  };

  return [...groups].sort((a, b) => {
    const primary = compare(a, b);
    if (primary !== 0) {
      return primary * factor;
    }
    // Deterministic tie-break, independent of direction.
    return b.reclaimableSize - a.reclaimableSize;
  });
};

/**
 * Hook returning the duplicate groups for the currently loaded workspace.
 */
export const useDuplicateGroups = (): DuplicateGroup[] => {
  const filesAndFolders = useSelector(getFilesAndFoldersFromStore);
  const hashes = useSelector(getHashesFromStore);
  const originalPath = useSelector(getOriginalPathFromStore);

  return useMemo(
    () => buildDuplicateGroups(filesAndFolders, hashes, originalPath),
    [filesAndFolders, hashes, originalPath]
  );
};
