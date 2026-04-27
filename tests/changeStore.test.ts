import { describe, expect, test } from "bun:test";
import { filterFiles } from "../src/renderer/state/changeStore";
import type { ChangeFile, FileChangeStatus } from "../src/core/models/changeModels";

const files: ChangeFile[] = [
  { depotPath: "//a/a.ts", status: "modified" },
  { depotPath: "//a/b.ts", status: "added" },
  { depotPath: "//a/c.ts", status: "deleted" },
  { depotPath: "//a/d.ts", status: "unchanged" },
];

describe("filterFiles", () => {
  test("hides unchanged when flag set", () => {
    const filtered = filterFiles(files, true, new Set<FileChangeStatus>());
    expect(filtered.map((f) => f.status)).not.toContain("unchanged");
    expect(filtered).toHaveLength(3);
  });

  test("status filter applied", () => {
    const filtered = filterFiles(files, false, new Set<FileChangeStatus>(["added", "deleted"]));
    expect(filtered.map((f) => f.status).sort()).toEqual(["added", "deleted"]);
  });

  test("empty filter returns all", () => {
    const filtered = filterFiles(files, false, new Set<FileChangeStatus>());
    expect(filtered).toHaveLength(4);
  });
});
