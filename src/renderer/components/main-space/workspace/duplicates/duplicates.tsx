import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";
import React from "react";
import { useTranslation } from "react-i18next";

import { InfoBoxPaper } from "../../../common/info-box-paper";
import { TabContentHeader } from "../tabs/tab-content-header";
import { makeTabComponent, TabsLayout } from "../tabs/tabs-layout";
import { TranslatedCategoryTitle } from "../tabs/translated-category-title";
import { DuplicatesDeletion } from "./duplicates-deletion/duplicates-deletion";
import { DuplicatesDistribution } from "./duplicates-distribution/duplicates-distribution";
import { DuplicatesTableContainer as DuplicatesTable } from "./duplicates-table/duplicates-table-container";

const DuplicatesDistributionTab = makeTabComponent({
  content: <DuplicatesDistribution />,
  title: <TranslatedCategoryTitle title="duplicates.duplicatesDistribution" />,
});

const DuplicatesTableTab = makeTabComponent({
  content: <DuplicatesTable />,
  isLast: true,
  title: <TranslatedCategoryTitle title="duplicates.duplicatesByType" />,
});

export const Duplicates: React.FC = () => {
  const { t } = useTranslation();

  return (
    <>
      <TabContentHeader title={t("workspace.duplicates")}>
        <TabsLayout>
          <DuplicatesDistributionTab />
          <DuplicatesTableTab />
        </TabsLayout>
      </TabContentHeader>
      <Box mt={2} height="34rem">
        <InfoBoxPaper>
          <Box display="flex" flexDirection="column" height="100%">
            <Typography variant="h3">
              {t("duplicates.deletion.title")}
            </Typography>
            <Box flexGrow={1} overflow="hidden" mt={1}>
              <DuplicatesDeletion />
            </Box>
          </Box>
        </InfoBoxPaper>
      </Box>
    </>
  );
};
