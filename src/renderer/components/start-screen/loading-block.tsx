import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Grid from "@material-ui/core/Grid";
import LinearProgress from "@material-ui/core/LinearProgress";
import Typography from "@material-ui/core/Typography";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";

import { FileSystemLoadingStep } from "../../reducers/loading-state/loading-state-types";
import { isJsonFile } from "../../utils/file-system/file-sys-util";
import LoadingDots from "../loading/loading-dots/dot-progress";
import { LoadingSpinner } from "./loading-spinner";

const StyledGrid = styled(Grid)`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

const ProgressBarWrapper = styled(Box)`
  width: 280px;
`;

// En dessous de ce délai sans progression, un chargement local a très
// probablement déjà terminé cette étape : pas la peine d'inquiéter
// l'utilisateur avec un conseil sur les lecteurs cloud.
const CLOUD_DRIVE_TIP_DELAY_MS = 8_000;

export interface LoadingBlockProps {
  cancelLoading: () => void;
  constructedDataModelElementsCount: number;
  currentStepTotalCount?: number;
  derivedElementsCount: number;
  fileSystemLoadingStep: FileSystemLoadingStep;
  folderName: string;
  indexedFilesCount: number;
  loadedPath: string;
}

const useElapsedSeconds = (): number => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return elapsedSeconds;
};

const formatElapsedTime = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}min ${seconds.toString().padStart(2, "0")}s`
    : `${seconds}s`;
};

export const LoadingBlock: React.FC<LoadingBlockProps> = ({
  fileSystemLoadingStep,
  indexedFilesCount,
  constructedDataModelElementsCount,
  derivedElementsCount,
  currentStepTotalCount,
  loadedPath,
  folderName,
  cancelLoading,
}) => {
  const { t } = useTranslation();
  const elapsedSeconds = useElapsedSeconds();
  const isJson = isJsonFile(loadedPath);

  const currentStepCount = {
    [FileSystemLoadingStep.INDEXING]: indexedFilesCount,
    [FileSystemLoadingStep.FILES_AND_FOLDERS]:
      constructedDataModelElementsCount,
    [FileSystemLoadingStep.METADATA]: derivedElementsCount,
  }[fileSystemLoadingStep];

  const percentage =
    currentStepTotalCount !== undefined && currentStepTotalCount > 0
      ? Math.min(
          100,
          Math.round((currentStepCount / currentStepTotalCount) * 100)
        )
      : undefined;

  const countLabelKey =
    fileSystemLoadingStep === FileSystemLoadingStep.INDEXING
      ? "folderDropzone.elementsExplored"
      : "folderDropzone.indexedFiles";

  const loaderText = isJson
    ? t("folderDropzone.jsonLoading")
    : `${currentStepCount} ${t(countLabelKey)}${
        percentage !== undefined ? ` (${percentage}%)` : ""
      }`;

  const showCloudDriveTip =
    !isJson &&
    fileSystemLoadingStep === FileSystemLoadingStep.INDEXING &&
    elapsedSeconds * 1000 >= CLOUD_DRIVE_TIP_DELAY_MS;

  return (
    <Grid container direction="row" justifyContent="center" alignItems="center">
      <StyledGrid item>
        <Box textAlign="center">
          <Typography variant="h6">
            {t("folderDropzone.loadingFolder")}:
          </Typography>
          <Typography variant="h4" color="textPrimary">
            {folderName}
          </Typography>
        </Box>
        <Box mt={3}>
          <LoadingSpinner loaderText={loaderText} isLoading={true} />
          <Box display="flex" justifyContent="center">
            <Box pr={1}>
              {t(`fileSystemLoadingStep.${fileSystemLoadingStep}`)}
            </Box>
            <LoadingDots />
          </Box>
          {!isJson && (
            <>
              <ProgressBarWrapper mt={1} mx="auto">
                <LinearProgress
                  variant={
                    percentage !== undefined ? "determinate" : "indeterminate"
                  }
                  value={percentage}
                />
              </ProgressBarWrapper>
              <Box display="flex" justifyContent="center" mt={1}>
                <Typography variant="caption" color="textSecondary">
                  {t("folderDropzone.elapsedTimePrefix")}
                  {formatElapsedTime(elapsedSeconds)}
                </Typography>
              </Box>
            </>
          )}
          {showCloudDriveTip && (
            <Box mt={2} maxWidth={360}>
              <Typography variant="caption" color="textSecondary">
                {t("folderDropzone.cloudDriveTip")}
              </Typography>
            </Box>
          )}
        </Box>
        <Box p={2}>
          <Button
            color="primary"
            variant="contained"
            size="small"
            onClick={cancelLoading}
          >
            {t("folderDropzone.cancelLoading")}
          </Button>
        </Box>
      </StyledGrid>
    </Grid>
  );
};
