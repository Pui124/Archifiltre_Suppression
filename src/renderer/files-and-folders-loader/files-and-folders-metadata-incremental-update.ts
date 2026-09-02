import { medianOnSortedArray } from "@common/utils/array";
import { indexSort, indexSortReverse } from "@common/utils/list";
import _ from "lodash";

import { ROOT_FF_ID } from "../reducers/files-and-folders/files-and-folders-selectors";
import type {
  FilesAndFoldersMap,
  LastModifiedMap,
} from "../reducers/files-and-folders/files-and-folders-types";
import { createFilesAndFoldersMetadata } from "../reducers/files-and-folders-metadata/files-and-folders-metadata-selectors";
import type {
  FilesAndFoldersMetadata,
  FilesAndFoldersMetadataMap,
} from "../reducers/files-and-folders-metadata/files-and-folders-metadata-types";
import { isFile, isFolder } from "../utils";

export interface IncrementalMetadataUpdateOverrides {
  lastModified?: LastModifiedMap;
}

interface LeafLastModified {
  applied: number;
  raw: number;
}

/**
 * Index enfant -> parent construit en un seul passage O(n), pour remonter
 * d'un dossier modifié jusqu'à la racine sans rescanner toute la map à
 * chaque niveau (contrairement à findElementParent).
 */
const buildParentIndex = (
  filesAndFoldersMap: FilesAndFoldersMap
): Map<string, string> => {
  const parentIndex = new Map<string, string>();
  Object.entries(filesAndFoldersMap).forEach(([id, element]) => {
    element.children.forEach((childId) => {
      parentIndex.set(childId, id);
    });
  });
  return parentIndex;
};

/**
 * Dates de dernière modification de chaque feuille (fichier) sous `id`, avec
 * et sans surcharge manuelle appliquée. Mêmes règles que la branche fichier
 * de computeMetadataRec (file-system-loading-process-utils.ts), pour rester
 * bit-à-bit identique au calcul complet sur les branches non affectées qu'il
 * faut reparcourir.
 */
const collectLeafLastModified = (
  filesAndFoldersMap: FilesAndFoldersMap,
  id: string,
  lastModified: LastModifiedMap
): LeafLastModified[] => {
  const element = filesAndFoldersMap[id];
  if (isFile(element)) {
    const applied =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      lastModified[id] !== undefined
        ? lastModified[id]
        : element.file_last_modified;
    return [{ applied, raw: element.file_last_modified }];
  }
  return element.children.flatMap((childId) =>
    collectLeafLastModified(filesAndFoldersMap, childId, lastModified)
  );
};

/**
 * Recalcule les métadonnées de la chaîne d'ancêtres de `changedFolderIds`
 * jusqu'à la racine, en réutilisant telles quelles les métadonnées des
 * branches non affectées — au lieu de recalculer tout l'arbre comme le fait
 * createFilesAndFoldersMetadataDataStructure. Utilisé après une suppression
 * de fichiers (jamais de dossiers) qui ne change le tableau `children` que
 * des parents directs des éléments supprimés.
 *
 * Retourne une map PARTIELLE (uniquement les nœuds recalculés) : à merger par
 * l'appelant sur la map de métadonnées existante avant de dispatcher.
 */
export const updateFilesAndFoldersMetadataForAncestors = (
  filesAndFoldersMap: FilesAndFoldersMap,
  existingMetadata: FilesAndFoldersMetadataMap,
  changedFolderIds: string[],
  { lastModified = {} }: IncrementalMetadataUpdateOverrides = {}
): FilesAndFoldersMetadataMap => {
  const parentIndex = buildParentIndex(filesAndFoldersMap);

  const recomputeSet = new Set<string>();
  changedFolderIds.forEach((startId) => {
    let currentId: string | undefined = startId;
    while (currentId !== undefined) {
      recomputeSet.add(currentId);
      if (currentId === ROOT_FF_ID) {
        break;
      }
      currentId = parentIndex.get(currentId);
    }
  });

  const depthCache = new Map<string, number>();
  const depthOf = (id: string): number => {
    if (id === ROOT_FF_ID) {
      return 0;
    }
    const cached = depthCache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const parentId = parentIndex.get(id);
    const depth = parentId === undefined ? 0 : depthOf(parentId) + 1;
    depthCache.set(id, depth);
    return depth;
  };

  // Traitement du plus profond au moins profond : quand on recalcule un
  // nœud, tous ses enfants du recomputeSet sont déjà dans partialMetadata.
  const orderedIds = Array.from(recomputeSet).sort(
    (a, b) => depthOf(b) - depthOf(a)
  );

  const partialMetadata: FilesAndFoldersMetadataMap = {};
  const leavesByNode = new Map<string, LeafLastModified[]>();

  const resolveChildMetadata = (childId: string): FilesAndFoldersMetadata =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    partialMetadata[childId] ?? existingMetadata[childId];

  orderedIds.forEach((id) => {
    const element = filesAndFoldersMap[id];

    // A folder that lost its last child is reclassified as a file by
    // isFile/isFolder (both keyed off children.length): computeMetadataRec
    // takes its file branch for such a node, using its own placeholder
    // file_last_modified/file_size instead of aggregating from (now absent)
    // children. Must be replicated exactly, however surprising, to stay
    // bit-for-bit identical to a full rebuild.
    if (isFile(element)) {
      const applied =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        lastModified[id] !== undefined
          ? lastModified[id]
          : element.file_last_modified;
      leavesByNode.set(id, [{ applied, raw: element.file_last_modified }]);
      partialMetadata[id] = createFilesAndFoldersMetadata({
        averageLastModified: applied,
        childrenTotalSize: element.file_size,
        initialMaxLastModified: element.file_last_modified,
        initialMedianLastModified: element.file_last_modified,
        initialMinLastModified: element.file_last_modified,
        maxLastModified: applied,
        medianLastModified: applied,
        minLastModified: applied,
        nbChildrenFiles: 1,
        nbChildrenFolders: 0,
        sortAlphaNumericallyIndex: [],
        sortByDateIndex: [],
        sortBySizeIndex: [],
      });
      return;
    }

    const childrenTotalSize = _.sum(
      element.children.map(
        (childId) => resolveChildMetadata(childId).childrenTotalSize
      )
    );
    const nbChildrenFiles = _.sum(
      element.children.map(
        (childId) => resolveChildMetadata(childId).nbChildrenFiles
      )
    );
    const nbChildrenFolders = _.sum(
      element.children.map((childId) =>
        isFolder(filesAndFoldersMap[childId])
          ? 1 + resolveChildMetadata(childId).nbChildrenFolders
          : 0
      )
    );

    // Champ non décomposable depuis les métadonnées des enfants (la médiane
    // d'une union de listes ne se déduit pas des médianes des parties) : on
    // reconstitue les feuilles, en réutilisant celles déjà collectées pour
    // les enfants du recomputeSet et en reparcourant à la volée les branches
    // non affectées rattachées directement à ce nœud.
    const leaves = element.children.flatMap((childId) =>
      recomputeSet.has(childId)
        ? leavesByNode.get(childId) ?? []
        : collectLeafLastModified(filesAndFoldersMap, childId, lastModified)
    );
    leavesByNode.set(id, leaves);

    const sortedApplied = _.sortBy(leaves.map((leaf) => leaf.applied));
    const sortedRaw = _.sortBy(leaves.map((leaf) => leaf.raw));

    const averageLastModified = _.mean(sortedApplied);
    const medianLastModified = medianOnSortedArray(sortedApplied);
    const maxLastModified = sortedApplied[sortedApplied.length - 1];
    const minLastModified = sortedApplied[0];

    const initialMedianLastModified = medianOnSortedArray(sortedRaw);
    const initialMaxLastModified = sortedRaw[sortedRaw.length - 1];
    const initialMinLastModified = sortedRaw[0];

    const sortByDateIndex = indexSort(
      (childId: string) => resolveChildMetadata(childId).averageLastModified,
      element.children
    );
    const sortBySizeIndex = indexSortReverse(
      (childId: string) => resolveChildMetadata(childId).childrenTotalSize,
      element.children
    );
    const sortAlphaNumericallyIndex = indexSort(
      (childId: string) => filesAndFoldersMap[childId].name,
      element.children
    );

    partialMetadata[id] = createFilesAndFoldersMetadata({
      averageLastModified,
      childrenTotalSize,
      initialMaxLastModified,
      initialMedianLastModified,
      initialMinLastModified,
      maxLastModified,
      medianLastModified,
      minLastModified,
      nbChildrenFiles,
      nbChildrenFolders,
      sortAlphaNumericallyIndex,
      sortByDateIndex,
      sortBySizeIndex,
    });
  });

  return partialMetadata;
};
