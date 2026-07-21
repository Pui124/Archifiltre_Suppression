import fs from "fs";

import type { DeletionResult } from "../../../../../reducers/duplicates-deletion/duplicates-deletion-types";
import { bytes2HumanReadableFormat } from "../../../../../utils";
import type {
  DuplicateFile,
  DuplicateGroup,
} from "../../../../../utils/duplicates-deletion";

const STATUS_LABELS: Record<DeletionResult["status"], string> = {
  deleted: "Supprimé",
  error: "Erreur",
  skipped: "Ignoré",
};

export interface DeletionReportSummary {
  deleted: number;
  errors: number;
  /** bytes actually reclaimed (deleted copies only) */
  freedSize: number;
  skipped: number;
}

export interface DeletionReportOptions {
  /** absolute path of the analysed folder, shown in the report header */
  rootPath?: string;
}

/** Formats a local timestamp as `YYYY-MM-DD HH:mm:ss`. */
const formatTimestamp = (date: Date): string => {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
      date.getDate()
    )} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds()
    )}`
  );
};

/**
 * Builds a human-readable `.txt` report of a mass duplicate-deletion run, in the
 * spirit of the standalone Script_Suppression_Doublons report: a summary block
 * followed by one detailed entry per processed copy (status, virtual path,
 * on-disk path, size, and any error/skip message).
 */
export const buildDeletionReport = (
  groups: DuplicateGroup[],
  results: DeletionResult[],
  options: DeletionReportOptions = {}
): { content: string; summary: DeletionReportSummary } => {
  const fileById = new Map<string, DuplicateFile>();
  groups.forEach((group) => {
    group.files.forEach((file) => {
      fileById.set(file.id, file);
    });
  });

  const summary: DeletionReportSummary = {
    deleted: 0,
    errors: 0,
    freedSize: 0,
    skipped: 0,
  };

  const detailLines: string[] = [];
  results.forEach((result) => {
    const file = fileById.get(result.id);
    const size = file?.size ?? 0;
    if (result.status === "deleted") {
      summary.deleted += 1;
      summary.freedSize += size;
    } else if (result.status === "skipped") {
      summary.skipped += 1;
    } else {
      summary.errors += 1;
    }

    const label = STATUS_LABELS[result.status];
    const suffix = result.message ? ` (${result.message})` : "";
    detailLines.push(`[${label}] ${file?.name ?? result.id}${suffix}`);
    detailLines.push(`    Chemin      : ${file?.virtualPath ?? ""}`);
    detailLines.push(`    Sur disque  : ${file?.absolutePath ?? ""}`);
    detailLines.push(
      `    Taille      : ${bytes2HumanReadableFormat(size)} (${size} octets)`
    );
    detailLines.push("");
  });

  const header = [
    "=== Rapport de suppression de doublons ===",
    `Date : ${formatTimestamp(new Date())}`,
    ...(options.rootPath ? [`Dossier analysé : ${options.rootPath}`] : []),
    "",
    "Résumé :",
    `  - Fichiers supprimés : ${summary.deleted}`,
    `  - Fichiers ignorés   : ${summary.skipped}`,
    `  - Erreurs            : ${summary.errors}`,
    `  - Espace récupéré    : ${bytes2HumanReadableFormat(
      summary.freedSize
    )} (${summary.freedSize} octets)`,
    "",
    "--- Détail ---",
    "",
  ];

  return {
    content: [...header, ...detailLines].join("\r\n"),
    summary,
  };
};

/** Writes the report to disk. Rejects on I/O errors (permission, disk full…). */
export const writeDeletionReport = async (
  filePath: string,
  content: string
): Promise<void> => {
  await fs.promises.writeFile(filePath, content, "utf-8");
};
