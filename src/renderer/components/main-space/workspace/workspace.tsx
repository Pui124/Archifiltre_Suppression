import Box from "@material-ui/core/Box";
import React from "react";

import { HeaderContainer as Header } from "../../header";
import { useTabsState } from "../../header/tabs-context";
import { DuplicatesSearchContainer as DuplicatesSearch } from "../duplicates-search/duplicates-search-container";
import { HelpButton } from "../help-button";
import type { IcicleContainerProps } from "../icicle/icicle-container";
import { IcicleContainer as Icicle } from "../icicle/icicle-container";
import { IcicleMetadataSidebarContainer } from "../icicle/icicle-metadata/icicle-metadata-sidebar-container";
import { NavigationBarContainer as NavigationBar } from "../navigation-bar/navigation-bar-container";
import {
  DUPLICATES_TAB_INDEX,
  ENRICHMENT_TAB_INDEX,
} from "./tabs/tabs-constants";
import { TabsContent } from "./tabs/tabs-content";
import { WorkspaceProviders } from "./workspace-providers";

const areIciclesDisplayed = (tabIndex: number) =>
  tabIndex !== DUPLICATES_TAB_INDEX;

const minimapReplaceComponent = (
  tabIndex: number
): IcicleContainerProps["rightSidebar"] | undefined =>
  ({
    [ENRICHMENT_TAB_INDEX]: IcicleMetadataSidebarContainer,
  }[tabIndex]);

const Workspace: React.FC = () => {
  const { tabIndex } = useTabsState();

  return (
    <WorkspaceProviders>
      <Box display="flex" flexDirection="column" height="100%">
        <Header />
        <Box
          flexGrow={0}
          flexShrink={0}
          flexBasis="auto"
          style={{ minHeight: "0px", width: "100%" }}
        >
          <Box display="flex" flexDirection="row" flexWrap="wrap" height="100%">
            <TabsContent tabIndex={tabIndex} />
          </Box>
        </Box>
        <Box
          flexGrow={1}
          flexShrink={1}
          flexBasis="auto"
          overflow="hidden"
          position="relative"
        >
          {/* The icicle is kept mounted across tab changes: remounting it on a
              large tree is what froze the whole app when leaving Redondances.
              On the Redondances tab it is simply covered by the duplicates
              search overlay instead of being unmounted/recomputed. */}
          <Box display="flex" flexDirection="column" height="100%">
            <Box flexGrow={0}>
              <NavigationBar />
            </Box>
            <Box flexGrow={1} overflow="hidden">
              <Icicle rightSidebar={minimapReplaceComponent(tabIndex)} />
            </Box>
            <Box position="absolute" bottom={15} right={15}>
              <HelpButton />
            </Box>
          </Box>
          {!areIciclesDisplayed(tabIndex) && (
            <Box
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              zIndex={2}
              bgcolor="#FFFFFF"
              overflow="hidden"
            >
              <DuplicatesSearch />
            </Box>
          )}
        </Box>
      </Box>
    </WorkspaceProviders>
  );
};

export default Workspace;
