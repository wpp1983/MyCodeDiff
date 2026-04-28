import { describe, expect, test } from "bun:test";
import { createChangeService } from "../src/main/services/changeService";
import { createP4Service } from "../src/main/services/p4Service";
import { createFileService } from "../src/main/services/fileService";
import type { P4CommandRunner } from "../src/core/p4/p4Types";
import { AppError } from "../src/core/models/errors";

function runnerFromMap(
  map: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>
): P4CommandRunner {
  return async (args) => {
    const key = args.join(" ");
    const r = map[key] ?? map["*"];
    if (!r) throw new Error(`unexpected p4 args: ${key}`);
    return {
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      exitCode: r.exitCode ?? 0,
    };
  };
}

function buildService(opts: {
  runner: P4CommandRunner;
  readFile?: (p: string) => Promise<Buffer>;
  stat?: (p: string) => Promise<{ size: number }>;
  largeFileThresholdBytes?: number;
  largeChangeFileCountThreshold?: number;
}) {
  const p4 = createP4Service({ runner: opts.runner });
  const fileService = createFileService({
    readFile: opts.readFile,
    stat: opts.stat,
    largeFileThresholdBytes: opts.largeFileThresholdBytes,
  });
  return createChangeService({
    p4,
    fileService,
    largeChangeFileCountThreshold: opts.largeChangeFileCountThreshold,
  });
}

describe("loadChangelist pending", () => {
  test("uses p4 opened and maps actions to statuses", async () => {
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout:
          "//depot/a/a.ts#3 - edit default change (text)\n//depot/a/b.ts - add default change (text)\n",
      },
      "describe -S -s 900": { stdout: "" },
    });
    const svc = buildService({ runner });
    const summary = await svc.loadChangelist({ id: "900", kind: "pending" });
    expect(summary.files.map((f) => f.status)).toEqual(["modified", "added"]);
    expect(summary.files[0]!.oldRev).toBe("3");
    expect(summary.files.every((f) => !f.shelved)).toBe(true);
  });

  test("flags large change when exceeding threshold", async () => {
    const lines = Array.from({ length: 510 }, (_, i) =>
      `//depot/a/f${i}.ts - edit default change (text)`
    ).join("\n");
    const runner = runnerFromMap({
      "opened -c 900": { stdout: lines },
      "describe -S -s 900": { stdout: "" },
    });
    const svc = buildService({ runner, largeChangeFileCountThreshold: 500 });
    const summary = await svc.loadChangelist({ id: "900", kind: "pending" });
    expect(summary.largeChange).toBe(true);
    expect(summary.files.length).toBe(510);
  });

  test("merges shelved files alongside opened files (P4V-style)", async () => {
    const describeOutput = [
      "Change 900 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/shelf.ts#7 edit",
      "... //depot/a/new-shelf.ts#1 add",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/a.ts#3 - edit default change (text)\n",
      },
      "describe -S -s 900": { stdout: describeOutput },
    });
    const svc = buildService({ runner });
    const summary = await svc.loadChangelist({ id: "900", kind: "pending" });
    expect(summary.files).toHaveLength(3);
    const opened = summary.files.filter((f) => !f.shelved);
    const shelved = summary.files.filter((f) => f.shelved);
    expect(opened.map((f) => f.depotPath)).toEqual(["//depot/a/a.ts"]);
    expect(shelved.map((f) => f.depotPath)).toEqual([
      "//depot/a/shelf.ts",
      "//depot/a/new-shelf.ts",
    ]);
    expect(shelved[0]!.oldRev).toBe("7");
    expect(shelved[1]!.oldRev).toBeUndefined();
  });

  test("default CL skips shelved fetch", async () => {
    const runner = runnerFromMap({
      "opened -c default": {
        stdout: "//depot/a/a.ts#3 - edit default change (text)\n",
      },
    });
    const svc = buildService({ runner });
    const summary = await svc.loadChangelist({ id: "default", kind: "pending" });
    expect(summary.files).toHaveLength(1);
    expect(summary.files[0]!.shelved).toBeFalsy();
  });
});

describe("loadChangelist submitted", () => {
  test("derives oldRev = rev - 1 for edits", async () => {
    const describeOutput = [
      "Change 9001 by alice@wp on 2024/11/20 10:00:00",
      "",
      "\tmessage",
      "",
      "Affected files ...",
      "",
      "... //depot/a/a.ts#4 edit",
      "... //depot/a/b.ts#1 add",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -s 9001": { stdout: describeOutput },
    });
    const svc = buildService({ runner });
    const summary = await svc.loadChangelist({ id: "9001", kind: "submitted" });
    expect(summary.files).toHaveLength(2);
    expect(summary.files[0]!.oldRev).toBe("3");
    expect(summary.files[0]!.newRev).toBe("4");
    expect(summary.files[1]!.oldRev).toBeUndefined();
  });
});

describe("loadFileContentPair pending", () => {
  test("edit: left=print#have, right=local file", async () => {
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/a.ts#3 - edit default change (text)\n",
      },
      "where //depot/a/a.ts": {
        stdout: "//depot/a/a.ts //wp/a/a.ts C:\\work\\wp\\a\\a.ts\n",
      },
      "print -q //depot/a/a.ts#have": { stdout: "old\n" },
    });
    const svc = buildService({
      runner,
      stat: async () => ({ size: 10 }),
      readFile: async () => Buffer.from("new\n", "utf8"),
    });
    const pair = await svc.loadFileContentPair({
      changelistId: "900",
      kind: "pending",
      depotPath: "//depot/a/a.ts",
    });
    expect(pair.leftText).toBe("old\n");
    expect(pair.rightText).toBe("new\n");
    expect(pair.file.status).toBe("modified");
  });

  test("add: leftText null, right=local file", async () => {
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/new.ts - add default change (text)\n",
      },
      "where //depot/a/new.ts": {
        stdout: "//depot/a/new.ts //wp/a/new.ts C:\\work\\wp\\a\\new.ts\n",
      },
    });
    const svc = buildService({
      runner,
      stat: async () => ({ size: 4 }),
      readFile: async () => Buffer.from("hey\n", "utf8"),
    });
    const pair = await svc.loadFileContentPair({
      changelistId: "900",
      kind: "pending",
      depotPath: "//depot/a/new.ts",
    });
    expect(pair.leftText).toBeNull();
    expect(pair.rightText).toBe("hey\n");
  });

  test("delete: left=print#have, right=null", async () => {
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/gone.ts#5 - delete default change (text)\n",
      },
      "where //depot/a/gone.ts": {
        stdout: "//depot/a/gone.ts //wp/a/gone.ts C:\\work\\wp\\a\\gone.ts\n",
      },
      "print -q //depot/a/gone.ts#have": { stdout: "removed\n" },
    });
    const svc = buildService({ runner });
    const pair = await svc.loadFileContentPair({
      changelistId: "900",
      kind: "pending",
      depotPath: "//depot/a/gone.ts",
    });
    expect(pair.leftText).toBe("removed\n");
    expect(pair.rightText).toBeNull();
  });

  test("large file without confirmation throws LARGE_FILE_REQUIRES_CONFIRMATION", async () => {
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/a.ts#3 - edit default change (text)\n",
      },
      "where //depot/a/a.ts": {
        stdout: "//depot/a/a.ts //wp/a/a.ts C:\\work\\wp\\a\\a.ts\n",
      },
      "print -q //depot/a/a.ts#have": { stdout: "old\n" },
    });
    const svc = buildService({
      runner,
      stat: async () => ({ size: 5 * 1024 * 1024 }),
      readFile: async () => Buffer.alloc(5 * 1024 * 1024),
      largeFileThresholdBytes: 2 * 1024 * 1024,
    });
    await expect(
      svc.loadFileContentPair({
        changelistId: "900",
        kind: "pending",
        depotPath: "//depot/a/a.ts",
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  test("binary file rejected", async () => {
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/img.png#1 - edit default change (binary)\n",
      },
    });
    const svc = buildService({ runner });
    await expect(
      svc.loadFileContentPair({
        changelistId: "900",
        kind: "pending",
        depotPath: "//depot/a/img.png",
      })
    ).rejects.toMatchObject({ code: "BINARY_FILE" });
  });
});

describe("loadFileContentPair submitted", () => {
  test("edit: left=print#oldRev right=print#newRev", async () => {
    const describeOutput = [
      "Change 9001 by alice@wp on 2024/11/20 10:00:00",
      "",
      "\tmessage",
      "",
      "Affected files ...",
      "",
      "... //depot/a/a.ts#4 edit",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -s 9001": { stdout: describeOutput },
      "print -q //depot/a/a.ts#3": { stdout: "old\n" },
      "print -q //depot/a/a.ts#4": { stdout: "new\n" },
    });
    const svc = buildService({ runner });
    const pair = await svc.loadFileContentPair({
      changelistId: "9001",
      kind: "submitted",
      depotPath: "//depot/a/a.ts",
    });
    expect(pair.leftText).toBe("old\n");
    expect(pair.rightText).toBe("new\n");
  });

  test("add: leftText null, right=print#newRev", async () => {
    const describeOutput = [
      "Change 9001 by alice@wp on 2024/11/20 10:00:00",
      "",
      "\tmessage",
      "",
      "Affected files ...",
      "",
      "... //depot/a/new.ts#1 add",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -s 9001": { stdout: describeOutput },
      "print -q //depot/a/new.ts#1": { stdout: "added\n" },
    });
    const svc = buildService({ runner });
    const pair = await svc.loadFileContentPair({
      changelistId: "9001",
      kind: "submitted",
      depotPath: "//depot/a/new.ts",
    });
    expect(pair.leftText).toBeNull();
    expect(pair.rightText).toBe("added\n");
  });
});

describe("loadChangelist shelved", () => {
  test("uses describe -S and treats revision as oldRev for edits", async () => {
    const describeOutput = [
      "Change 7700 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tshelved work",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/a.ts#5 edit",
      "... //depot/a/new.ts#1 add",
      "... //depot/a/gone.ts#3 delete",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -S -s 7700": { stdout: describeOutput },
    });
    const svc = buildService({ runner });
    const summary = await svc.loadChangelist({ id: "7700", kind: "shelved" });
    expect(summary.kind).toBe("shelved");
    expect(summary.files).toHaveLength(3);
    expect(summary.files[0]!.oldRev).toBe("5");
    expect(summary.files[0]!.newRev).toBeUndefined();
    expect(summary.files[1]!.oldRev).toBeUndefined();
    expect(summary.files[2]!.oldRev).toBe("3");
  });
});

describe("loadFileContentPair shelved", () => {
  test("edit: left=print#oldRev, right=print@=CL", async () => {
    const describeOutput = [
      "Change 7700 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/a.ts#5 edit",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -S -s 7700": { stdout: describeOutput },
      "print -q //depot/a/a.ts#5": { stdout: "old\n" },
      "print -q //depot/a/a.ts@=7700": { stdout: "shelved\n" },
      "fstat -Ol -T fileSize //depot/a/a.ts@=7700": {
        stdout: "... fileSize 8\n",
      },
    });
    const svc = buildService({ runner });
    const pair = await svc.loadFileContentPair({
      changelistId: "7700",
      kind: "shelved",
      depotPath: "//depot/a/a.ts",
    });
    expect(pair.leftText).toBe("old\n");
    expect(pair.rightText).toBe("shelved\n");
    expect(pair.leftLabel).toBe("//depot/a/a.ts#5");
    expect(pair.rightLabel).toBe("//depot/a/a.ts@=7700");
  });

  test("add: left null, right=print@=CL", async () => {
    const describeOutput = [
      "Change 7700 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/new.ts#1 add",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -S -s 7700": { stdout: describeOutput },
      "print -q //depot/a/new.ts@=7700": { stdout: "added\n" },
      "fstat -Ol -T fileSize //depot/a/new.ts@=7700": {
        stdout: "... fileSize 6\n",
      },
    });
    const svc = buildService({ runner });
    const pair = await svc.loadFileContentPair({
      changelistId: "7700",
      kind: "shelved",
      depotPath: "//depot/a/new.ts",
    });
    expect(pair.leftText).toBeNull();
    expect(pair.rightText).toBe("added\n");
    expect(pair.leftLabel).toBe("(new)");
    expect(pair.rightLabel).toBe("//depot/a/new.ts@=7700");
  });

  test("large shelved text without confirmation throws LARGE_FILE_REQUIRES_CONFIRMATION", async () => {
    const describeOutput = [
      "Change 7700 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/big.ts#5 edit",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -S -s 7700": { stdout: describeOutput },
      "print -q //depot/a/big.ts#5": { stdout: "old\n" },
      "fstat -Ol -T fileSize //depot/a/big.ts@=7700": {
        stdout: "... fileSize 5242880\n",
      },
    });
    const svc = buildService({ runner, largeFileThresholdBytes: 2 * 1024 * 1024 });
    await expect(
      svc.loadFileContentPair({
        changelistId: "7700",
        kind: "shelved",
        depotPath: "//depot/a/big.ts",
      })
    ).rejects.toMatchObject({ code: "LARGE_FILE_REQUIRES_CONFIRMATION" });
  });

  test("loadPending merges only Shelved section even if describe -S also returns Affected", async () => {
    // p4 describe -S can return both Affected and Shelved sections; only the
    // shelved section should appear with shelved=true.
    const describeOutput = [
      "Change 900 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Affected files ...",
      "",
      "... //depot/a/opened.ts#3 edit",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/shelf.ts#7 edit",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "opened -c 900": {
        stdout: "//depot/a/opened.ts#3 - edit default change (text)\n",
      },
      "describe -S -s 900": { stdout: describeOutput },
    });
    const svc = buildService({ runner });
    const summary = await svc.loadChangelist({ id: "900", kind: "pending" });
    // 1 opened + 1 shelved (the affected entry from describe -S must NOT be re-added)
    expect(summary.files).toHaveLength(2);
    const opened = summary.files.filter((f) => !f.shelved);
    const shelved = summary.files.filter((f) => f.shelved);
    expect(opened.map((f) => f.depotPath)).toEqual(["//depot/a/opened.ts"]);
    expect(shelved.map((f) => f.depotPath)).toEqual(["//depot/a/shelf.ts"]);
  });

  test("delete: left=print#oldRev, right null", async () => {
    const describeOutput = [
      "Change 7700 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/gone.ts#3 delete",
      "",
    ].join("\n");
    const runner = runnerFromMap({
      "describe -S -s 7700": { stdout: describeOutput },
      "print -q //depot/a/gone.ts#3": { stdout: "removed\n" },
    });
    const svc = buildService({ runner });
    const pair = await svc.loadFileContentPair({
      changelistId: "7700",
      kind: "shelved",
      depotPath: "//depot/a/gone.ts",
    });
    expect(pair.leftText).toBe("removed\n");
    expect(pair.rightText).toBeNull();
    expect(pair.rightLabel).toBe("(deleted)");
  });
});

describe("submitChange", () => {
  test("rejects default CL without calling p4 submit", async () => {
    let called = 0;
    const runner: P4CommandRunner = async () => {
      called++;
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const svc = buildService({ runner });
    await expect(
      svc.submitChange({ changelistId: "default" })
    ).rejects.toMatchObject({ code: "SUBMIT_FAILED" });
    expect(called).toBe(0);
  });

  test("rejects CL with shelved files before calling p4 submit", async () => {
    const describeOutput = [
      "Change 1234 by alice@wp on 2024/11/20 10:00:00 *pending*",
      "",
      "\tmessage",
      "",
      "Shelved files ...",
      "",
      "... //depot/a/shelf.ts#7 edit",
      "",
    ].join("\n");
    const seen: string[][] = [];
    const runner: P4CommandRunner = async (args) => {
      seen.push(args);
      const key = args.join(" ");
      if (key === "describe -S -s 1234") {
        return { stdout: describeOutput, stderr: "", exitCode: 0 };
      }
      throw new Error(`unexpected p4 args: ${key}`);
    };
    const svc = buildService({ runner });
    await expect(
      svc.submitChange({ changelistId: "1234" })
    ).rejects.toMatchObject({ code: "SUBMIT_FAILED" });
    expect(seen.some((a) => a[0] === "submit")).toBe(false);
  });

  test("rejects empty CL with SUBMIT_EMPTY_CHANGE", async () => {
    const runner = runnerFromMap({
      "describe -S -s 1234": { stdout: "" },
      "opened -c 1234": { stdout: "" },
    });
    const svc = buildService({ runner });
    await expect(
      svc.submitChange({ changelistId: "1234" })
    ).rejects.toMatchObject({ code: "SUBMIT_EMPTY_CHANGE" });
  });

  test("happy path returns submittedChangeId from p4 stdout", async () => {
    const runner = runnerFromMap({
      "describe -S -s 1234": { stdout: "" },
      "opened -c 1234": {
        stdout: "//depot/a/a.ts#3 - edit default change (text)\n",
      },
      "submit -c 1234": {
        stdout: "Change 1234 renamed change 1240 and submitted.\n",
      },
    });
    const svc = buildService({ runner });
    const out = await svc.submitChange({ changelistId: "1234" });
    expect(out.submittedChangeId).toBe("1240");
  });
});

describe("listHistoryChanges", () => {
  test("uses depotPaths[0] when not supplied", async () => {
    const seen: string[][] = [];
    const runner: P4CommandRunner = async (args) => {
      seen.push(args);
      if (args[0] === "info") {
        return {
          stdout:
            "User name: alice\nClient name: wp\nClient root: C:\\work\nServer address: perforce:1666\n",
          stderr: "",
          exitCode: 0,
        };
      }
      if (args[0] === "client" && args[1] === "-o") {
        return {
          stdout: "Client: wp\n\nView:\n\t//depot/a/... //wp/a/...\n",
          stderr: "",
          exitCode: 0,
        };
      }
      return {
        stdout: "Change 1 on 2024/11/20 by a@w 'hi'\n",
        stderr: "",
        exitCode: 0,
      };
    };
    const svc = buildService({ runner });
    const out = await svc.listHistoryChanges({ limit: 50 });
    expect(out).toHaveLength(1);
    const changesCall = seen.find((a) => a[0] === "changes");
    expect(changesCall?.at(-1)).toBe("//depot/a/...");
    expect(changesCall?.includes("-m")).toBe(true);
  });
});
