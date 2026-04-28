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

export type P4BufferRunner = (
  args: string[]
) => Promise<{ buffer: Buffer; stderr: string; exitCode: number }>;

export type P4Service = {
  runRaw: P4CommandRunner;
  getEnvironment(): Promise<P4Environment>;
  listPendingChanges(client?: string): Promise<ChangelistListItem[]>;
  listSubmittedChanges(depotPath: string, limit: number): Promise<ChangelistListItem[]>;
  listShelvedChanges(user?: string): Promise<ChangelistListItem[]>;
  opened(changelistId: string): Promise<ParsedOpenedFile[]>;
  describe(changelistId: string): Promise<ParsedDescribe | null>;
  describeShelved(changelistId: string): Promise<ParsedDescribe | null>;
  where(depotPath: string): Promise<string | null>;
  print(depotPath: string, revision?: string): Promise<string>;
  printBuffer(depotPath: string, revision?: string): Promise<Buffer>;
  getFileSize(depotPath: string, revision?: string): Promise<number | null>;
  printShelved(depotPath: string, changelistId: string): Promise<string>;
  printShelvedBuffer(depotPath: string, changelistId: string): Promise<Buffer>;
  getShelvedFileSize(depotPath: string, changelistId: string): Promise<number | null>;
  getClientView(): Promise<P4ClientView>;
  submitChange(changelistId: string): Promise<{ submittedChangeId: string }>;
};

export type P4ServiceOptions = {
  runner?: P4CommandRunner;
  bufferRunner?: P4BufferRunner;
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
  const bufferRunner: P4BufferRunner =
    options.bufferRunner ??
    ((args) => {
      const override = options.getClientOverride?.();
      const env: NodeJS.ProcessEnv = { ...(options.env ?? {}) };
      if (override && override.trim()) env["P4CLIENT"] = override.trim();
      return spawnP4Buffer(p4Path, args, env);
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

  async function listShelvedChanges(user?: string): Promise<ChangelistListItem[]> {
    const args = ["changes", "-s", "shelved", "-l"];
    if (user) args.push("-u", user);
    const result = await runChecked(args);
    return parseChangesOutput(result.stdout, "shelved");
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

  async function describeShelved(changelistId: string): Promise<ParsedDescribe | null> {
    const result = await runChecked(["describe", "-S", "-s", changelistId]);
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

  async function printBuffer(depotPath: string, revision?: string): Promise<Buffer> {
    const target = revision ? `${depotPath}#${revision}` : depotPath;
    const args = ["print", "-q", target];
    const result = await bufferRunner(args);
    if (result.exitCode !== 0) {
      const authError = detectP4InfoError(result.stderr, "");
      if (authError === "P4_AUTH_REQUIRED") {
        throw new AppError(
          "P4_AUTH_REQUIRED",
          "P4 session expired or not logged in.",
          result.stderr
        );
      }
      throw new AppError(
        "P4_COMMAND_FAILED",
        `p4 ${args.join(" ")} failed with exit code ${result.exitCode}`,
        result.stderr
      );
    }
    return result.buffer;
  }

  async function getFileSize(
    depotPath: string,
    revision?: string
  ): Promise<number | null> {
    const target = revision ? `${depotPath}#${revision}` : depotPath;
    const result = await runChecked(["fstat", "-Ol", "-T", "fileSize", target]);
    const match = result.stdout.match(/fileSize\s+(\d+)/);
    if (!match || !match[1]) return null;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  async function printShelved(depotPath: string, changelistId: string): Promise<string> {
    const target = `${depotPath}@=${changelistId}`;
    const result = await runChecked(["print", "-q", target]);
    return result.stdout;
  }

  async function printShelvedBuffer(
    depotPath: string,
    changelistId: string
  ): Promise<Buffer> {
    const target = `${depotPath}@=${changelistId}`;
    const args = ["print", "-q", target];
    const result = await bufferRunner(args);
    if (result.exitCode !== 0) {
      const authError = detectP4InfoError(result.stderr, "");
      if (authError === "P4_AUTH_REQUIRED") {
        throw new AppError(
          "P4_AUTH_REQUIRED",
          "P4 session expired or not logged in.",
          result.stderr
        );
      }
      throw new AppError(
        "P4_COMMAND_FAILED",
        `p4 ${args.join(" ")} failed with exit code ${result.exitCode}`,
        result.stderr
      );
    }
    return result.buffer;
  }

  async function getShelvedFileSize(
    depotPath: string,
    changelistId: string
  ): Promise<number | null> {
    const target = `${depotPath}@=${changelistId}`;
    const result = await runChecked(["fstat", "-Ol", "-T", "fileSize", target]);
    const match = result.stdout.match(/fileSize\s+(\d+)/);
    if (!match || !match[1]) return null;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) ? n : null;
  }

  async function getClientView(): Promise<P4ClientView> {
    const result = await runChecked(["client", "-o"]);
    return parseClientView(result.stdout);
  }

  async function submitChange(
    changelistId: string
  ): Promise<{ submittedChangeId: string }> {
    const id = changelistId.trim();
    if (!id || id === "default") {
      throw new AppError(
        "SUBMIT_FAILED",
        "Default changelist cannot be submitted directly. Move files into a numbered changelist first."
      );
    }
    const args = ["submit", "-c", id];
    const result = await runner(args);
    if (result.exitCode !== 0) {
      const combined = `${result.stderr}\n${result.stdout}`;
      const auth = detectP4InfoError(result.stderr, result.stdout);
      if (auth === "P4_AUTH_REQUIRED") {
        throw new AppError(
          "P4_AUTH_REQUIRED",
          "P4 session expired or not logged in.",
          combined
        );
      }
      if (/no files to submit/i.test(combined)) {
        throw new AppError(
          "SUBMIT_EMPTY_CHANGE",
          `Changelist ${id} has no files to submit.`,
          combined
        );
      }
      if (/must (?:be )?resolved?|needs? resolve/i.test(combined)) {
        throw new AppError(
          "SUBMIT_NEEDS_RESOLVE",
          `Changelist ${id} has files that must be resolved before submitting.`,
          combined
        );
      }
      throw new AppError(
        "SUBMIT_FAILED",
        `p4 submit -c ${id} failed with exit code ${result.exitCode}`,
        combined
      );
    }
    return { submittedChangeId: parseSubmittedChangeId(result.stdout, id) };
  }

  return {
    runRaw: runner,
    getEnvironment,
    listPendingChanges,
    listSubmittedChanges,
    listShelvedChanges,
    opened,
    describe,
    describeShelved,
    where,
    print,
    printBuffer,
    getFileSize,
    printShelved,
    printShelvedBuffer,
    getShelvedFileSize,
    getClientView,
    submitChange,
  };
}

function parseSubmittedChangeId(stdout: string, fallback: string): string {
  // Typical patterns produced by `p4 submit`:
  //   "Change 1234 submitted."
  //   "Change 1234 renamed change 1240 and submitted."
  const renamed = /Change\s+\d+\s+renamed\s+change\s+(\d+)\s+and\s+submitted/i.exec(
    stdout
  );
  if (renamed && renamed[1]) return renamed[1];
  const plain = /Change\s+(\d+)\s+submitted/i.exec(stdout);
  if (plain && plain[1]) return plain[1];
  return fallback;
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

function spawnP4Buffer(
  p4Path: string,
  args: string[],
  extraEnv?: NodeJS.ProcessEnv
): Promise<{ buffer: Buffer; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...extraEnv,
      SystemRoot: process.env["SystemRoot"] ?? "C:\\Windows",
      WINDIR: process.env["WINDIR"] ?? "C:\\Windows",
    };
    const child = spawn(p4Path, args, { env, windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ buffer: Buffer.concat(chunks), stderr, exitCode: code ?? -1 });
    });
  });
}
