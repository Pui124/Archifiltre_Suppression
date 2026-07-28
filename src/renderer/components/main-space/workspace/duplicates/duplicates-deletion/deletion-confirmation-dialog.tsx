import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import Typography from "@material-ui/core/Typography";
import React from "react";
import { useTranslation } from "react-i18next";

import { bytes2HumanReadableFormat } from "../../../../../utils";
import { ModalHeader } from "../../../../modals/modal-header";

export interface DeletionConfirmationDialogProps {
  copiesCount: number;
  /** bytes freed if the whole selection is deleted */
  freedSize: number;
  generateReport: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  verifyMd5: boolean;
}

/**
 * Recap dialog shown before a mass duplicate-deletion: how many files, how
 * much space, which safeguards are active — so the user confirms with a full
 * picture instead of the bare count of the previous native `window.confirm`.
 */
export const DeletionConfirmationDialog: React.FC<
  DeletionConfirmationDialogProps
> = ({
  copiesCount,
  freedSize,
  generateReport,
  onCancel,
  onConfirm,
  open,
  verifyMd5,
}) => {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <ModalHeader
        title={t("duplicates.deletion.confirmDialog.title")}
        onClose={onCancel}
      />
      <DialogContent dividers>
        <Typography variant="body1" gutterBottom>
          {t("duplicates.deletion.confirmDialog.summary", {
            count: copiesCount,
            size: bytes2HumanReadableFormat(freedSize),
          })}
        </Typography>
        <Box mt={1}>
          <Typography variant="body2" color="textSecondary">
            {verifyMd5
              ? t("duplicates.deletion.confirmDialog.md5On")
              : t("duplicates.deletion.confirmDialog.md5Off")}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {generateReport
              ? t("duplicates.deletion.confirmDialog.reportOn")
              : t("duplicates.deletion.confirmDialog.reportOff")}
          </Typography>
        </Box>
        <Box mt={1}>
          <Typography variant="body2">
            {t("duplicates.deletion.confirmDialog.trashNote")}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>
          {t("duplicates.deletion.confirmDialog.cancel")}
        </Button>
        <Button variant="contained" color="secondary" onClick={onConfirm}>
          {t("duplicates.deletion.confirmDialog.confirm", {
            count: copiesCount,
          })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
