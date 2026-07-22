import type { CSSProperties } from "react";
import React from "react";

import { forkName, forkVersion, version } from "../../version";

export const Version: React.FC = () => {
  const style: CSSProperties = {
    fontSize: "10px",
    margin: "0 0 10px",
    textAlign: "center",
  };
  return (
    <div className="version" style={style}>
      {`${forkName} v${forkVersion} (Docs v${version})`}
    </div>
  );
};
