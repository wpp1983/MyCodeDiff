import { describe, expect, test } from "bun:test";
import { createP4Service } from "../src/main/services/p4Service";
import type { P4CommandRunner } from "../src/core/p4/p4Types";
import { AppError } from "../src/core/models/errors";

function makeRunner(
  responses: Record<string, { stdout?: string; stderr?: string; exitCode?: number }>
): P4CommandRunner {
  return async (args) => {
    const key = args.join(" ");
    const r = responses[key] ?? responses["*"];
    if (!r) throw new Error(`unexpected p4 args: ${key}`);
    return {
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      exitCode: r.exitCode ?? 0,
    };
  };
}

describe("p4Service.getEnvironment", () => {
  test("returns parsed info and depot paths", async () => {
    const runner = makeRunner({
      info: {
        stdout:
          "User name: alice\nClient name: wp\nClient root: C:\\work\\wp\nServer address: perforce:1666\n",
      },
      "client -o": { stdout: "Client: wp\n\nView:\n\t//depot/a/... //wp/a/...\n" },
    });
    const svc = createP4Service({ runner });
    const env = await svc.getEnvironment();
    expect(env.available).toBe(true);
    expect(env.user).toBe("alice");
    expect(env.client).toBe("wp");
    expect(env.depotPaths).toEqual(["//depot/a"]);
  });

  test("ENOENT maps to P4_NOT_FOUND", async () => {
    const runner: P4CommandRunner = async () => {
      const err: NodeJS.ErrnoException = new Error("not found");
      err.code = "ENOENT";
      throw err;
    };
    const svc = createP4Service({ runner });
    const env = await svc.getEnvironment();
    expect(env.available).toBe(false);
    expect(env.errorCode).toBe("P4_NOT_FOUND");
  });

  test("auth expired maps to P4_AUTH_REQUIRED", async () => {
    const runner = makeRunner({
      info: {
        stderr: "Your session has expired, please login again.",
        exitCode: 1,
      },
    });
    const svc = createP4Service({ runner });
    const env = await svc.getEnvironment();
    expect(env.available).toBe(false);
    expect(env.errorCode).toBe("P4_AUTH_REQUIRED");
  });
});

describe("p4Service.listPendingChanges", () => {
  test("invokes p4 changes with -s pending -c client", async () => {
    const seen: string[][] = [];
    const runner: P4CommandRunner = async (args) => {
      seen.push(args);
      return {
        stdout: "Change 10 on 2024/11/20 by a@w *pending* 'msg'\n",
        stderr: "",
        exitCode: 0,
      };
    };
    const svc = createP4Service({ runner });
    const out = await svc.listPendingChanges("wp");
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("10");
    expect(seen[0]).toEqual(["changes", "-s", "pending", "-l", "-c", "wp"]);
  });
});

describe("p4Service.listSubmittedChanges", () => {
  test("invokes with -m limit and depot/...", async () => {
    const seen: string[][] = [];
    const runner: P4CommandRunner = async (args) => {
      seen.push(args);
      return {
        stdout: "Change 10 on 2024/11/20 by a@w 'msg'\n",
        stderr: "",
        exitCode: 0,
      };
    };
    const svc = createP4Service({ runner });
    const out = await svc.listSubmittedChanges("//depot/a", 50);
    expect(out).toHaveLength(1);
    expect(seen[0]).toEqual([
      "changes",
      "-s",
      "submitted",
      "-l",
      "-m",
      "50",
      "//depot/a/...",
    ]);
  });
});

describe("p4Service command failure", () => {
  test("non-zero exit throws AppError with command context", async () => {
    const runner = makeRunner({ "*": { stderr: "boom", exitCode: 1 } });
    const svc = createP4Service({ runner });
    await expect(svc.listPendingChanges("wp")).rejects.toBeInstanceOf(AppError);
  });
});
