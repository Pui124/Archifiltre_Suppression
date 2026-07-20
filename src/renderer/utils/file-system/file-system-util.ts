import { ipcRenderer } from "@common/ipc";

import { translations } from "../../translations/translations";
import { notifyError } from "../notifications";

export interface SaveFileFilter {
  extensions: string[];
  name: string;
}

/**
 * Prompts the user to save a file. Returns the file path if the user confirmed
 * or undefined if he canceled.
 * @param filename - Either the default name of the file or the full path to the default file
 * @param filters - Optional file-type filters shown in the save dialog
 */
export const promptUserForSave = async (
  filename: string,
  filters?: SaveFileFilter[]
): Promise<string | undefined> => {
  const { filePath } = await ipcRenderer.invoke("dialog.showSaveDialog", {
    defaultPath: filename,
    ...(filters ? { filters } : {}),
  });
  return filePath;
};

/**
 * Open a fileSystem element with the default app (folder are opened with the file browsing app)
 * @param elementPath
 */
export const openExternalElement = async (
  elementPath: string
): Promise<void> => {
  const error = await ipcRenderer.invoke("shell.openPath", elementPath);

  if (error) {
    notifyError(
      translations.t("report.openElementErrorMessage"),
      translations.t("report.openElementErrorTitle")
    );
  }
};

export const showInFolder = async (elementPath: string): Promise<void> =>
  ipcRenderer.invoke("shell.showItemInFolder", elementPath);

/**
 * Moves a filesystem element to the OS trash/recycle bin (reversible deletion).
 * Rejects if the element cannot be trashed (missing, locked, permission denied).
 * @param elementPath - Absolute path to the element on disk
 */
export const moveElementToTrash = async (elementPath: string): Promise<void> =>
  ipcRenderer.invoke("shell.trashItem", elementPath);
