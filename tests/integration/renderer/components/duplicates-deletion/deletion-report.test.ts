import { buildDeletionReport } from "@renderer/components/main-space/workspace/duplicates/duplicates-deletion/deletion-report";
import type { DeletionResult } from "@renderer/components/main-space/workspace/duplicates/duplicates-deletion/delete-selected-duplicates";
import type { DuplicateGroup } from "@renderer/utils/duplicates-deletion";

const makeFile = (
  id: string,
  name: string,
  size: number,
  isOriginal: boolean
) => ({
  absolutePath: `C:\\data\\${name}`,
  hash: "hashA",
  id,
  isOriginal,
  lastModified: 0,
  name,
  size,
  virtualPath: `/Root/${name}`,
});

const groups: DuplicateGroup[] = [
  {
    copiesCount: 2,
    files: [
      makeFile("Root/a2", "a2.txt", 100, true),
      makeFile("Root/a3", "a3.txt", 100, false),
      makeFile("Root/a1", "a1.txt", 100, false),
    ],
    hash: "hashA",
    reclaimableSize: 200,
  },
];

const results: DeletionResult[] = [
  { id: "Root/a3", status: "deleted" },
  { id: "Root/a1", message: "md5Mismatch", status: "skipped" },
];

describe("buildDeletionReport", () => {
  const { content, summary } = buildDeletionReport(groups, results, {
    rootPath: "C:\\data\\Root",
  });

  it("aggregates a correct summary", () => {
    expect(summary).toEqual({
      deleted: 1,
      errors: 0,
      freedSize: 100,
      skipped: 1,
    });
  });

  it("produces a readable text header with the analysed folder", () => {
    expect(content).toContain("Rapport de suppression de doublons");
    expect(content).toContain("Dossier analysé : C:\\data\\Root");
    expect(content).toContain("Fichiers supprimés : 1");
    expect(content).toContain("Fichiers ignorés   : 1");
    expect(content).toContain("Erreurs            : 0");
  });

  it("lists one detailed entry per processed copy", () => {
    expect(content).toContain("[Supprimé] a3.txt");
    expect(content).toContain("[Ignoré] a1.txt (md5Mismatch)");
    expect(content).toContain("/Root/a3.txt");
    expect(content).toContain("C:\\data\\a3.txt");
  });

  it("omits the folder line when no root path is provided", () => {
    const { content: noRoot } = buildDeletionReport(groups, results);
    expect(noRoot).not.toContain("Dossier analysé");
  });
});
