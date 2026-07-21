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

import { useDuplicatesDeletionState } from "../../../../../reducers/duplicates-deletion/duplicates-deletion-selectors";
import { runDuplicatesDeletion } from "../../../../../reducers/duplicates-deletion/duplicates-deletion-thunks";
import type { DeletionResult } from "../../../../../reducers/duplicates-deletion/duplicates-deletion-types";
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

  // Deletion state lives in the store so the run survives this panel unmounting
  // when the user leaves the Redondances tab, and stays visible globally.
  const deletion = useDuplicatesDeletionState();
  const isDeleting = deletion.isRunning;
  const results = deletion.results;
  const progress = { done: deletion.processed, total: deletion.total };

  const [query, setQuery] = useState("");
  const [verifyMd5, setVerifyMd5] = useState(true);
  const [generateReport, setGenerateReport] = useState(false);
  const [sortKey, setSortKey] = useState<DuplicateSortKey>("size");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
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

    // Fire-and-forget: the thunk runs the deletion at the store level, so it
    // keeps going (and stays visible via the global indicator) even if this
    // panel unmounts because the user switches tab.
    dispatch(
      runDuplicatesDeletion({
        groups,
        reportPath,
        rootPath: originalPath,
        selectedIds: selection.selectedIds,
        verifyMd5,
      })
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
    // Record access is not undefined-checked by TS, but not every id has a result.
    const result = results[id] as DeletionResult | undefined;
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
