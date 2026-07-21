import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Checkbox from "@material-ui/core/Checkbox";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import LinearProgress from "@material-ui/core/LinearProgress";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import path from "path";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";

import { removeElementsFromStore } from "../../../../../reducers/files-and-folders/files-and-folders-thunks";
import { getOriginalPathFromStore } from "../../../../../reducers/workspace-metadata/workspace-metadata-selectors";
import { bytes2HumanReadableFormat } from "../../../../../utils";
import type {
  DuplicateFile,
  DuplicateGroup,
  DuplicateSortKey,
  SortDirection,
} from "../../../../../utils/duplicates-deletion";
import {
  sortDuplicateGroups,
  useDuplicateGroups,
} from "../../../../../utils/duplicates-deletion";
import { promptUserForSave } from "../../../../../utils/file-system/file-system-util";
import { notifyError, notifySuccess } from "../../../../../utils/notifications";
import type { DeletionResult } from "./delete-selected-duplicates";
import { deleteSelectedDuplicates } from "./delete-selected-duplicates";
import { buildDeletionReport, writeDeletionReport } from "./deletion-report";
import { useDuplicatesSelection } from "./use-duplicates-selection";

const SORT_KEYS: DuplicateSortKey[] = [
  "size",
  "lastModified",
  "extension",
  "copies",
];

const StatTile: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <Box
    bgcolor="#F4F3F9"
    borderRadius={8}
    px={2}
    py={1}
    mr={2}
    minWidth={140}
    textAlign="center"
  >
    <Typography variant="h6">{value}</Typography>
    <Typography variant="caption" color="textSecondary">
      {label}
    </Typography>
  </Box>
);

const matchesQuery = (file: DuplicateFile, query: string): boolean =>
  file.name.toLowerCase().includes(query) ||
  file.virtualPath.toLowerCase().includes(query);

export const DuplicatesDeletion: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const originalPath = useSelector(getOriginalPathFromStore);
  const groups = useDuplicateGroups();
  const selection = useDuplicatesSelection(groups);

  const [query, setQuery] = useState("");
  const [verifyMd5, setVerifyMd5] = useState(true);
  const [generateReport, setGenerateReport] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [sortKey, setSortKey] = useState<DuplicateSortKey>("size");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [results, setResults] = useState<Map<string, DeletionResult>>(
    new Map()
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    const matching = !normalizedQuery
      ? groups
      : groups.filter((group) =>
          group.files.some((file) => matchesQuery(file, normalizedQuery))
        );
    return sortDuplicateGroups(matching, sortKey, sortDirection);
  }, [groups, normalizedQuery, sortKey, sortDirection]);

  const toggleCollapsed = (hash: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  };

  const handleDelete = async () => {
    if (selection.selectedCount === 0 || isDeleting) {
      return;
    }
    const confirmed = window.confirm(
      t("duplicates.deletion.confirm", { count: selection.selectedCount })
    );
    if (!confirmed) {
      return;
    }

    // Ask where to save the report up front, so a cancel here aborts nothing
    // destructive yet: the user still confirms deletion below by proceeding.
    let reportPath: string | undefined;
    if (generateReport) {
      const defaultName = `rapport-suppression-doublons-${new Date()
        .toISOString()
        .slice(0, 10)}.txt`;
      // Default next to the analysed folder; the dialog lets the user pick
      // any other destination.
      const defaultPath = originalPath
        ? path.join(originalPath, "..", defaultName)
        : defaultName;
      reportPath = await promptUserForSave(defaultPath, [
        {
          extensions: ["txt"],
          name: t("duplicates.deletion.reportFileType"),
        },
      ]);
      if (!reportPath) {
        // User canceled the save dialog: abort the whole operation.
        return;
      }
    }

    setIsDeleting(true);
    setResults(new Map());
    setProgress({ done: 0, total: selection.selectedCount });

    const deletionResults = await deleteSelectedDuplicates(
      groups,
      selection.selectedIds,
      { verifyMd5 },
      (result) => {
        setResults((previous) => new Map(previous).set(result.id, result));
        setProgress((previous) => ({
          done: previous.done + 1,
          total: previous.total,
        }));
      }
    );

    const deletedIds = deletionResults
      .filter((result) => result.status === "deleted")
      .map((result) => result.id);
    if (deletedIds.length > 0) {
      // Refresh the Archifiltre analysis (tree, metadata, other duplicate views).
      dispatch(removeElementsFromStore(deletedIds));
    }

    if (reportPath) {
      try {
        const { content } = buildDeletionReport(groups, deletionResults, {
          rootPath: originalPath,
        });
        await writeDeletionReport(reportPath, content);
      } catch (error: unknown) {
        notifyError(
          error instanceof Error ? error.message : String(error),
          t("duplicates.deletion.reportError")
        );
      }
    }

    const deleted = deletedIds.length;
    const skipped = deletionResults.filter(
      (result) => result.status === "skipped"
    ).length;
    const errors = deletionResults.filter(
      (result) => result.status === "error"
    ).length;

    setIsDeleting(false);
    notifySuccess(
      t("duplicates.deletion.reportBody", { deleted, errors, skipped }),
      t("duplicates.deletion.reportTitle")
    );
  };

  if (groups.length === 0) {
    return (
      <Box p={2}>
        <Typography color="textSecondary">
          {t("duplicates.deletion.empty")}
        </Typography>
      </Box>
    );
  }

  const renderStatusIcon = (id: string) => {
    const result = results.get(id);
    if (!result) {
      return null;
    }
    const icon =
      result.status === "deleted"
        ? "✓"
        : result.status === "skipped"
        ? "⚠"
        : "✗";
    const color =
      result.status === "deleted"
        ? "#3E9D4D"
        : result.status === "skipped"
        ? "#E58900"
        : "#D64541";
    return (
      <Box component="span" style={{ color }} ml={1}>
        {icon}
      </Box>
    );
  };

  const renderGroup = (group: DuplicateGroup) => {
    const copies = group.files.filter((file) => !file.isOriginal);
    const selectedCopies = copies.filter((file) =>
      selection.isSelected(file.id)
    ).length;
    const isCollapsed = collapsed.has(group.hash);

    return (
      <Box key={group.hash} mb={1} border="1px solid #DEDAEB" borderRadius={6}>
        <Box display="flex" alignItems="center" bgcolor="#F4F3F9" px={1}>
          <Checkbox
            size="small"
            checked={selectedCopies === copies.length && copies.length > 0}
            indeterminate={selectedCopies > 0 && selectedCopies < copies.length}
            onChange={() => {
              selection.toggleGroup(group);
            }}
          />
          <Box
            flexGrow={1}
            display="flex"
            alignItems="center"
            style={{ cursor: "pointer" }}
            onClick={() => {
              toggleCollapsed(group.hash);
            }}
          >
            <Box component="span" mr={1}>
              {isCollapsed ? "▸" : "▾"}
            </Box>
            <Typography variant="body2">
              {t("duplicates.deletion.groupSummary", {
                count: group.copiesCount,
                size: bytes2HumanReadableFormat(group.reclaimableSize),
              })}
            </Typography>
          </Box>
        </Box>

        {!isCollapsed &&
          group.files.map((file) => (
            <Box
              key={file.id}
              display="flex"
              alignItems="center"
              px={1}
              py={0.25}
            >
              <Checkbox
                size="small"
                disabled={file.isOriginal}
                checked={selection.isSelected(file.id)}
                onChange={() => {
                  selection.toggleFile(file);
                }}
              />
              <Box flexGrow={1} overflow="hidden">
                <Typography variant="body2" noWrap>
                  {file.name}
                  {file.isOriginal && (
                    <Box
                      component="span"
                      ml={1}
                      px={0.5}
                      bgcolor="#E7E4EF"
                      borderRadius={4}
                      fontSize="0.7rem"
                    >
                      {t("duplicates.deletion.original")}
                    </Box>
                  )}
                  {renderStatusIcon(file.id)}
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap>
                  {file.virtualPath}
                </Typography>
              </Box>
              <Typography variant="caption" color="textSecondary">
                {bytes2HumanReadableFormat(file.size)}
              </Typography>
            </Box>
          ))}
      </Box>
    );
  };

  return (
    <Box display="flex" flexDirection="column" height="100%">
      <Box display="flex" alignItems="center" flexWrap="wrap" mb={1}>
        <StatTile
          label={t("duplicates.deletion.statGroups")}
          value={String(groups.length)}
        />
        <StatTile
          label={t("duplicates.deletion.statCopies")}
          value={String(selection.selectedCount)}
        />
        <StatTile
          label={t("duplicates.deletion.statSpace")}
          value={bytes2HumanReadableFormat(selection.freedSize)}
        />
      </Box>

      <Box display="flex" alignItems="center" flexWrap="wrap" mb={1}>
        <TextField
          size="small"
          variant="outlined"
          placeholder={t("duplicates.deletion.filterPlaceholder")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          style={{ marginRight: 16, minWidth: 220 }}
        />
        <Button size="small" onClick={selection.toggleAll}>
          {t("duplicates.deletion.selectAll")}
        </Button>
        <Box display="flex" alignItems="center" ml={1} mr={1}>
          <Typography variant="caption" color="textSecondary" component="span">
            {t("duplicates.deletion.sortBy")}
          </Typography>
          <Select
            value={sortKey}
            onChange={(event) => {
              setSortKey(event.target.value as DuplicateSortKey);
            }}
            style={{ fontSize: "0.8rem", marginLeft: 8 }}
          >
            {SORT_KEYS.map((key) => (
              <MenuItem key={key} value={key}>
                {t(`duplicates.deletion.sort.${key}`)}
              </MenuItem>
            ))}
          </Select>
          <Button
            size="small"
            onClick={() => {
              setSortDirection((previous) =>
                previous === "asc" ? "desc" : "asc"
              );
            }}
            title={t("duplicates.deletion.toggleSortDirection")}
          >
            {sortDirection === "asc" ? "▲" : "▼"}
          </Button>
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={verifyMd5}
              onChange={(event) => {
                setVerifyMd5(event.target.checked);
              }}
            />
          }
          label={t("duplicates.deletion.verifyMd5")}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={generateReport}
              onChange={(event) => {
                setGenerateReport(event.target.checked);
              }}
            />
          }
          label={t("duplicates.deletion.generateReport")}
        />
        <Box flexGrow={1} />
        <Button
          variant="contained"
          color="secondary"
          disabled={selection.selectedCount === 0 || isDeleting}
          onClick={handleDelete}
        >
          {isDeleting
            ? t("duplicates.deletion.deleting")
            : t("duplicates.deletion.deleteButton", {
                count: selection.selectedCount,
              })}
        </Button>
      </Box>

      {isDeleting && (
        <Box mb={1}>
          <LinearProgress
            variant={progress.total > 0 ? "determinate" : "indeterminate"}
            value={
              progress.total > 0
                ? (progress.done / progress.total) * 100
                : undefined
            }
          />
          <Typography variant="caption" color="textSecondary">
            {t("duplicates.deletion.progress", {
              done: progress.done,
              total: progress.total,
            })}
          </Typography>
        </Box>
      )}

      <Box flexGrow={1} overflow="auto">
        {filteredGroups.map(renderGroup)}
      </Box>
    </Box>
  );
};
