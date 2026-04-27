import { spawn } from "node:child_process";
import type {
  P4CommandResult,
  P4CommandRunner,
  P4InfoFields,
  P4ClientView,
} from "@core/p4/p4Types";
import {
  detectP4InfoError,
  parseChangesOutput,
  parseClientView,
  parseDescribeOutput,
  parseOpenedOutput,
  parseP4Info,
  parseWhereOutput,
  type ParsedDescribe,
  type ParsedOpenedFile,
} from "@core/p4/p4Parsers";
import type { ChangelistListItem } from "@core/models/changeModels";
import type { P4Environment } from "@core/ipc/contract";
import { AppError } from "@core/models/errors";

export type P4Service = {
  runRaw: P4CommandRunner;
  getEnvironment(): Promise<P4Environment>;
  listPendingChanges(client?: string): Promise<ChangelistListItem[]>;
  listSubmittedChanges(depotPath: string, limit: number): Promise<ChangelistListItem[]>;
  opened(changelistId: string): Promise<ParsedOpenedFile[]>;
  describe(changelistId: string): Promise<ParsedDescribe | null>;
  where(depotPath: string): Promise<string | null>;
  print(depotPath: string, revision?: string): Promise<string>;
  getClientView(): Promise<P4ClientView>;
};

export type P4ServiceOptions = {
  runner?: P4CommandRunner;
  p4Path?: string;
  env?: NodeJS.ProcessEnv;
  getClientOverride?: () => string | undefined;
};

export function createP4Service(options: P4ServiceOptions = {}): P4Service {
  const p4Path = options.p4Path ?? "p4";
  const runner: P4CommandRunner =
    options.runner ??
    ((args) => {
      const override = options.getClientOverride?.();
      const env: NodeJS.ProcessEnv = { ...(options.env ?? {}) };
      if (override && override.trim()) env["P4CLIENT"] = override.trim();
      return spawnP4(p4Path, args, env);
    });

  async function runChecked(args: string[]): Promise<P4CommandResult> {
    const result = await runner(args);
    if (result.exitCode !== 0) {
      const authError = detectP4InfoError(result.stderr, result.stdout);
      if (authError === "P4_AUTH_REQUIRED") {
        throw new AppError(
          "P4_AUTH_REQUIRED",
          "P4 session expired or not logged in.",
          result.stderr || result.stdout
        );
      }
      throw new AppError(
        "P4_COMMAND_FAILED",
        `p4 ${args.join(" ")} failed with exit code ${result.exitCode}`,
        result.stderr || result.stdout
      );
    }
    return result;
  }

  async function getEnvironment(): Promise<P4Environment> {
    let info: P4InfoFields;
    let result: P4CommandResult;
    try {
      result = await runner(["info"]);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        return {
          available: false,
          depotPaths: [],
          errorCode: "P4_NOT_FOUND",
          errorMessage: "p4 command not found on PATH.",
        };
      }
      return {
        available: false,
        depotPaths: [],
        errorCode: "P4_COMMAND_FAILED",
        errorMessage: e.message,
      };
    }
    if (result.exitCode !== 0) {
      const mapped = detectP4InfoError(result.stderr, result.stdout);
      return {
        available: false,
        depotPaths: [],
        errorCode: mapped ?? "P4_COMMAND_FAILED",
        errorMessage: result.stderr || result.stdout,
      };
    }
    info = parseP4Info(result.stdout);

    let depotPaths: string[] = [];
    if (info.client) {
      try {
        const viewResult = await runner(["client", "-o"]);
        if (viewResult.exitCode === 0) {
          const view = parseClientView(viewResult.stdout, info.client);
          depotPaths = view.depotPaths;
        }
      } catch {
        depotPaths = [];
      }
    }

    const env: P4Environment = {
      available: true,
      depotPaths,
    };
    if (info.user) env.user = info.user;
    if (info.client) env.client = info.client;
    if (info.clientRoot) env.root = info.clientRoot;
    if (info.serverAddress) env.port = info.serverAddress;
    return env;
  }

  async function listPendingChanges(client?: string): Promise<ChangelistListItem[]> {
    const args = ["changes", "-s", "pending", "-l"];
    if (client) args.push("-c", client);
    const result = await runChecked(args);
    return parseChangesOutput(result.stdout, "pending");
  }

  async function listSubmittedChanges(
    depotPath: string,
    limit: number
  ): Promise<ChangelistListItem[]> {
    const args = [
      "changes",
      "-s",
      "submitted",
      "-l",
      "-m",
      String(limit),
      `${normalizeDepotPath(depotPath)}/...`,
    ];
    const result = await runChecked(args);
    return parseChangesOutput(result.stdout, "submitted");
  }

  async function opened(changelistId: string): Promise<ParsedOpenedFile[]> {
    const args = ["opened"];
    if (changelistId !== "default") args.push("-c", changelistId);
    else args.push("-c", "default");
    const result = await runChecked(args);
    return parseOpenedOutput(result.stdout);
  }

  async function describe(changelistId: string): Promise<ParsedDescribe | null> {
    const result = await runChecked(["describe", "-s", changelistId]);
    return parseDescribeOutput(result.stdout);
  }

  async function where(depotPath: string): Promise<string | null> {
    const result = await runner(["where", depotPath]);
    if (result.exitCode !== 0) return null;
    return parseWhereOutput(result.stdout);
  }

  async function print(depotPath: string, revision?: string): Promise<string> {
    const target = revision ? `${depotPath}#${revision}` : depotPath;
    const result = await runChecked(["print", "-q", target]);
    return result.stdout;
  }

  async function getClientView(): Promise<P4ClientView> {
    const result = await runChecked(["client", "-o"]);
    return parseClientView(result.stdout);
  }

  return {
    runRaw: runner,
    getEnvironment,
    listPendingChanges,
    listSubmittedChanges,
    opened,
    describe,
    where,
    print,
    getClientView,
  };
}

function normalizeDepotPath(depotPath: string): string {
  let p = depotPath.trim();
  if (p.endsWith("/...")) p = p.slice(0, -4);
  if (p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

function spawnP4(
  p4Path: string,
  args: string[],
  extraEnv?: NodeJS.ProcessEnv
): Promise<P4CommandResult> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...extraEnv,
      SystemRoot: process.env["SystemRoot"] ?? "C:\\Windows",
      WINDIR: process.env["WINDIR"] ?? "C:\\Windows",
    };
    const child = spawn(p4Path, args, { env, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}
