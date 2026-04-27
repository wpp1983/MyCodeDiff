import { describe, expect, test } from "bun:test";
import {
  actionToStatus,
  detectP4InfoError,
  isBinaryFileType,
  parseChangesOutput,
  parseClientView,
  parseDescribeOutput,
  parseOpenedOutput,
  parseP4Info,
  parseWhereOutput,
} from "../src/core/p4/p4Parsers";

describe("parseP4Info", () => {
  test("parses standard fields", () => {
    const out = parseP4Info(
      `User name: alice\nClient name: wp_dev_1\nClient root: C:\\work\\wp_dev_1\nServer address: perforce:1666\nServer version: P4D/NT\n`
    );
    expect(out.user).toBe("alice");
    expect(out.client).toBe("wp_dev_1");
    expect(out.clientRoot).toBe("C:\\work\\wp_dev_1");
    expect(out.serverAddress).toBe("perforce:1666");
  });
});

describe("detectP4InfoError", () => {
  test("auth expired", () => {
    expect(detectP4InfoError("Your session has expired, please login again.", "")).toBe(
      "P4_AUTH_REQUIRED"
    );
  });
  test("client unknown", () => {
    expect(detectP4InfoError("", "Client unknown.")).toBe("P4_CLIENT_NOT_FOUND");
  });
  test("no error", () => {
    expect(detectP4InfoError("", "")).toBeNull();
  });
});

describe("parseClientView", () => {
  test("single mapping produces single depot root", () => {
    const out = parseClientView(
      `Client: wp_dev_1\n\nView:\n\t//depot/wp/main/... //wp_dev_1/main/...\n`
    );
    expect(out.clientName).toBe("wp_dev_1");
    expect(out.depotPaths).toEqual(["//depot/wp/main"]);
  });

  test("multiple mappings and excludes", () => {
    const out = parseClientView(
      `Client: wp\n\nView:\n\t//depot/a/... //wp/a/...\n\t-//depot/a/excluded/... //wp/a/excluded/...\n\t"//depot/b with space/..." "//wp/b with space/..."\n`
    );
    expect(out.depotPaths).toEqual(["//depot/a", "//depot/b with space"]);
    expect(out.mappings.length).toBe(3);
    expect(out.mappings[1]?.exclude).toBe(true);
  });

  test("ignores comments and blanks", () => {
    const out = parseClientView(
      `# comment line\nClient: wp\n\nView:\n\t//depot/a/... //wp/a/...\n\n`
    );
    expect(out.depotPaths).toEqual(["//depot/a"]);
  });
});

describe("parseChangesOutput", () => {
  test("submitted with client and description", () => {
    const stdout =
      "Change 12345 on 2024/11/20 by alice@wp_dev_1 'Fix login cache'\n" +
      "Change 12344 on 2024/11/19 by bob@other 'WIP'\n";
    const items = parseChangesOutput(stdout, "submitted");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "12345",
      kind: "submitted",
      author: "alice",
      client: "wp_dev_1",
      date: "2024/11/20",
      description: "Fix login cache",
    });
  });
  test("pending shows *pending* marker", () => {
    const stdout =
      "Change 200 on 2024/11/20 by alice@wp_dev_1 *pending* 'Draft'\n";
    const items = parseChangesOutput(stdout, "pending");
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("200");
    expect(items[0]!.description).toBe("Draft");
  });
  test("submitted multi-line (-l) format with indented description", () => {
    const stdout = [
      "Change 180878 on 2026/04/24 by alice@wp_dev_1",
      "",
      "\tImplement foo bar",
      "\tRefactor baz",
      "",
      "Change 180852 on 2026/04/23 by bob@wp_dev_2",
      "",
      "\tQuick fix",
      "",
    ].join("\n");
    const items = parseChangesOutput(stdout, "submitted");
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      id: "180878",
      kind: "submitted",
      author: "alice",
      client: "wp_dev_1",
      date: "2026/04/24",
      description: "Implement foo bar\nRefactor baz",
    });
    expect(items[1]!.description).toBe("Quick fix");
  });
  test("multi-line description containing 'Change N on' as text is not split", () => {
    const stdout = [
      "Change 100 on 2026/04/24 by alice@wp_dev_1",
      "",
      "\tRevert Change 99 on 2026/04/23 (was bad)",
      "\tsecond line",
      "",
      "Change 99 on 2026/04/23 by bob@wp_dev_2",
      "",
      "\tBad fix",
    ].join("\n");
    const items = parseChangesOutput(stdout, "submitted");
    expect(items).toHaveLength(2);
    expect(items[0]!.id).toBe("100");
    expect(items[0]!.description).toBe(
      "Revert Change 99 on 2026/04/23 (was bad)\nsecond line"
    );
    expect(items[1]!.description).toBe("Bad fix");
  });
  });

describe("parseOpenedOutput", () => {
  test("parses edit/add/delete", () => {
    const stdout =
      "//depot/a/file1.ts#3 - edit default change (text)\n" +
      "//depot/a/new.ts - add default change (text)\n" +
      "//depot/a/gone.ts#5 - delete default change (text)\n" +
      "//depot/a/bin.png#1 - edit default change (binary)\n";
    const files = parseOpenedOutput(stdout);
    expect(files).toHaveLength(4);
    expect(files[0]).toEqual({
      depotPath: "//depot/a/file1.ts",
      action: "edit",
      revision: "3",
      fileType: "text",
    });
    expect(files[3]!.fileType).toBe("binary");
  });
});

describe("parseDescribeOutput", () => {
  test("parses header, description, affected files", () => {
    const stdout = [
      "Change 9001 by alice@wp on 2024/11/20 10:00:00",
      "",
      "\tFix bug",
      "\tmore detail",
      "",
      "Affected files ...",
      "",
      "... //depot/a/file1.ts#4 edit",
      "... //depot/a/new.ts#1 add",
      "",
      "Differences ...",
    ].join("\n");
    const parsed = parseDescribeOutput(stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe("9001");
    expect(parsed!.author).toBe("alice");
    expect(parsed!.description).toContain("Fix bug");
    expect(parsed!.files).toHaveLength(2);
    expect(parsed!.files[0]!.action).toBe("edit");
  });
});

describe("parseWhereOutput", () => {
  test("returns local path", () => {
    const out = parseWhereOutput(
      "//depot/a/file.ts //wp_dev_1/a/file.ts C:\\work\\wp_dev_1\\a\\file.ts\n"
    );
    expect(out).toBe("C:\\work\\wp_dev_1\\a\\file.ts");
  });
  test("empty output returns null", () => {
    expect(parseWhereOutput("")).toBeNull();
  });
});

describe("actionToStatus", () => {
  test("maps p4 actions", () => {
    expect(actionToStatus("add")).toBe("added");
    expect(actionToStatus("edit")).toBe("modified");
    expect(actionToStatus("delete")).toBe("deleted");
    expect(actionToStatus("move/add")).toBe("added");
    expect(actionToStatus("move/delete")).toBe("deleted");
    expect(actionToStatus("something")).toBe("unknown");
    expect(actionToStatus(undefined)).toBe("unknown");
  });
});

describe("isBinaryFileType", () => {
  test("detects binary", () => {
    expect(isBinaryFileType("binary")).toBe(true);
    expect(isBinaryFileType("binary+l")).toBe(true);
    expect(isBinaryFileType("text")).toBe(false);
    expect(isBinaryFileType(undefined)).toBe(false);
  });
});
