import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DuplicateFile,
  DuplicateGroup,
} from "../../../../../utils/duplicates-deletion";

export interface DuplicatesSelection {
  /** total bytes that would be freed by deleting the current selection */
  freedSize: number;
  isSelected: (id: string) => boolean;
  /** clears the whole selection */
  reset: () => void;
  selectedCount: number;
  selectedIds: Set<string>;
  /** selects every deletable copy across all groups, or clears if already full */
  toggleAll: () => void;
  /** selects/deselects a single copy (originals are protected and ignored) */
  toggleFile: (file: DuplicateFile) => void;
  /** selects/deselects every deletable copy of a single group */
  toggleGroup: (group: DuplicateGroup) => void;
}

/**
 * Signature that changes whenever the underlying set of files changes (initial
 * load, or after a deletion), used to (re)initialise the default selection.
 */
const filesSignature = (groups: DuplicateGroup[]): string =>
  groups.map((group) => group.files.map((file) => file.id).join(",")).join("|");

/**
 * Manages which duplicate copies are marked for deletion. Mirrors the standalone
 * app: every copy (all files except the protected original) is pre-selected by
 * default; the user can then refine per file, per group, or all at once.
 * Originals are never selectable.
 */
export const useDuplicatesSelection = (
  groups: DuplicateGroup[]
): DuplicatesSelection => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { copyIds, sizeById } = useMemo(() => {
    const copies = new Set<string>();
    const sizes = new Map<string, number>();
    groups.forEach((group) => {
      group.files.forEach((file) => {
        sizes.set(file.id, file.size);
        if (!file.isOriginal) {
          copies.add(file.id);
        }
      });
    });
    return { copyIds: copies, sizeById: sizes };
  }, [groups]);

  const signature = filesSignature(groups);
  useEffect(() => {
    // Default: every copy pre-selected for deletion. Re-runs only when the set
    // of files changes (signature), which is exactly when copyIds changes too.
    setSelectedIds(new Set(copyIds));
  }, [signature]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const toggleFile = useCallback((file: DuplicateFile) => {
    if (file.isOriginal) {
      return;
    }
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(file.id)) {
        next.delete(file.id);
      } else {
        next.add(file.id);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback((group: DuplicateGroup) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const copies = group.files.filter((file) => !file.isOriginal);
      const allSelected = copies.every((file) => next.has(file.id));
      copies.forEach((file) => {
        if (allSelected) {
          next.delete(file.id);
        } else {
          next.add(file.id);
        }
      });
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((previous) => {
      const allSelected = copyIds.size > 0 && previous.size >= copyIds.size;
      return allSelected ? new Set<string>() : new Set(copyIds);
    });
  }, [copyIds]);

  const reset = useCallback(() => {
    setSelectedIds(new Set<string>());
  }, []);

  const freedSize = useMemo(() => {
    let total = 0;
    selectedIds.forEach((id) => {
      total += sizeById.get(id) ?? 0;
    });
    return total;
  }, [selectedIds, sizeById]);

  return {
    freedSize,
    isSelected,
    reset,
    selectedCount: selectedIds.size,
    selectedIds,
    toggleAll,
    toggleFile,
    toggleGroup,
  };
};
