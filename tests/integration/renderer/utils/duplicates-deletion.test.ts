import {
  buildDuplicateGroups,
  getGroupExtension,
  sortDuplicateGroups,
} from "@renderer/utils/duplicates-deletion";
import path from "path";

import { createFilesAndFolders } from "../reducers/files-and-folders/files-and-folders-test-utils";

const originalPath = path.join("C:", "data", "Root");

// Group A: 3 identical files (same hash), size 100, a2 is the oldest.
const a1 = createFilesAndFolders({
  file_last_modified: 30,
  file_size: 100,
  id: "Root/a1",
  name: "a1.txt",
});
const a2 = createFilesAndFolders({
  file_last_modified: 10,
  file_size: 100,
  id: "Root/a2",
  name: "a2.txt",
});
const a3 = createFilesAndFolders({
  file_last_modified: 20,
  file_size: 100,
  id: "Root/a3",
  name: "a3.txt",
});

// Group B: 2 identical files, size 500, b2 is the oldest.
const b1 = createFilesAndFolders({
  file_last_modified: 15,
  file_size: 500,
  id: "Root/b1",
  name: "b1.txt",
});
const b2 = createFilesAndFolders({
  file_last_modified: 5,
  file_size: 500,
  id: "Root/b2",
  name: "b2.txt",
});

// Lone file with a unique hash: must be excluded (not a duplicate).
const c1 = createFilesAndFolders({
  file_size: 999,
  id: "Root/c1",
  name: "c1.txt",
});

const filesAndFolders = {
  [a1.id]: a1,
  [a2.id]: a2,
  [a3.id]: a3,
  [b1.id]: b1,
  [b2.id]: b2,
  [c1.id]: c1,
};

const hashes = {
  [a1.id]: "hashA",
  [a2.id]: "hashA",
  [a3.id]: "hashA",
  [b1.id]: "hashB",
  [b2.id]: "hashB",
  [c1.id]: "hashC",
};

describe("buildDuplicateGroups", () => {
  const groups = buildDuplicateGroups(filesAndFolders, hashes, originalPath);

  it("keeps only groups with at least two files", () => {
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.hash)).not.toContain("hashC");
  });

  it("sorts groups by reclaimable size descending", () => {
    expect(groups[0].hash).toBe("hashB"); // 500 * 1
    expect(groups[0].reclaimableSize).toBe(500);
    expect(groups[1].hash).toBe("hashA"); // 100 * 2
    expect(groups[1].reclaimableSize).toBe(200);
  });

  it("flags the oldest file of each group as the protected original", () => {
    const groupA = groups.find((group) => group.hash === "hashA")!;
    // sorted by lastModified ascending
    expect(groupA.files.map((file) => file.id)).toEqual([
      "Root/a2",
      "Root/a3",
      "Root/a1",
    ]);
    expect(groupA.files[0].isOriginal).toBe(true);
    expect(groupA.files.slice(1).every((file) => !file.isOriginal)).toBe(true);
    expect(groupA.copiesCount).toBe(2);

    const groupB = groups.find((group) => group.hash === "hashB")!;
    expect(groupB.files[0].id).toBe("Root/b2");
    expect(groupB.files[0].isOriginal).toBe(true);
    expect(groupB.copiesCount).toBe(1);
  });

  it("resolves absolute on-disk paths from the workspace root", () => {
    const groupA = groups.find((group) => group.hash === "hashA")!;
    expect(groupA.files[0].absolutePath).toBe(
      path.join(originalPath, "..", "Root/a2")
    );
  });
});

describe("sortDuplicateGroups", () => {
  const groups = buildDuplicateGroups(filesAndFolders, hashes, originalPath);

  it("does not mutate the input array", () => {
    const before = groups.map((group) => group.hash);
    sortDuplicateGroups(groups, "copies", "asc");
    expect(groups.map((group) => group.hash)).toEqual(before);
  });

  it("sorts by number of copies", () => {
    // hashA has 2 copies, hashB has 1 copy.
    const asc = sortDuplicateGroups(groups, "copies", "asc");
    expect(asc.map((group) => group.hash)).toEqual(["hashB", "hashA"]);
    const desc = sortDuplicateGroups(groups, "copies", "desc");
    expect(desc.map((group) => group.hash)).toEqual(["hashA", "hashB"]);
  });

  it("sorts by size (reclaimable)", () => {
    // hashB reclaims 500, hashA reclaims 200.
    const asc = sortDuplicateGroups(groups, "size", "asc");
    expect(asc.map((group) => group.hash)).toEqual(["hashA", "hashB"]);
    const desc = sortDuplicateGroups(groups, "size", "desc");
    expect(desc.map((group) => group.hash)).toEqual(["hashB", "hashA"]);
  });

  it("sorts by last-modified date of the original", () => {
    // hashB original (b2) modified at 5, hashA original (a2) modified at 10.
    const asc = sortDuplicateGroups(groups, "lastModified", "asc");
    expect(asc.map((group) => group.hash)).toEqual(["hashB", "hashA"]);
  });

  it("reads a group extension from its original file", () => {
    const groupA = groups.find((group) => group.hash === "hashA")!;
    expect(getGroupExtension(groupA)).toBe(".txt");
  });
});
