import type {
  ChangeFile,
  ChangelistListItem,
  ChangelistSummary,
  FileContentPair,
} from "@core/models/changeModels";
import type {
  ListHistoryChangesInput,
  LoadChangelistInput,
  LoadFileContentPairInput,
  P4Environment,
} from "@core/ipc/contract";
import { AppError } from "@core/models/errors";
import type { P4Service } from "./p4Service";
import type { FileService } from "./fileService";
import { createFileService } from "./fileService";
import {
  actionToStatus,
  isBinaryFileType,
  type ParsedDescribeFile,
} from "@core/p4/p4Parsers";

export type ChangeServiceOptions = {
  p4: P4Service;
  fileService?: FileService;
  largeChangeFileCountThreshold?: number;
  largeFileThresholdBytes?: number;
};

export type ChangeService = {
  listPendingChanges(): Promise<ChangelistListItem[]>;
  listHistoryChanges(input: ListHistoryChangesInput): Promise<ChangelistListItem[]>;
  loadChangelist(input: LoadChangelistInput): Promise<ChangelistSummary>;
  loadFileContentPair(input: LoadFileContentPairInput): Promise<FileContentPair>;
  getEnvironment(): Promise<P4Environment>;
};

export function createChangeService(options: ChangeServiceOptions): ChangeService {
  const { p4 } = options;
  const fileService =
    options.fileService ??
    createFileService({
      largeFileThresholdBytes: options.largeFileThresholdBytes,
    });
  const largeChangeThreshold = options.largeChangeFileCountThreshold ?? 500;

  async function listPendingChanges(): Promise<ChangelistListItem[]> {
    const env = await p4.getEnvironment();
    if (!env.available) {
      throw new AppError(
        (env.errorCode as any) ?? "P4_COMMAND_FAILED",
        env.errorMessage ?? "P4 unavailable"
      );
    }
    if (!env.client) {
      throw new AppError("P4_CLIENT_NOT_FOUND", "No client in p4 info output.");
    }
    return p4.listPendingChanges(env.client);
  }

  async function listHistoryChanges(
    input: ListHistoryChangesInput
  ): Promise<ChangelistListItem[]> {
    const limit = input.limit > 0 ? input.limit : 50;
    let depotPath = input.depotPath;
    if (!depotPath) {
      const env = await p4.getEnvironment();
      if (!env.available) {
        throw new AppError(
          (env.errorCode as any) ?? "P4_COMMAND_FAILED",
          env.errorMessage ?? "P4 unavailable"
        );
      }
      depotPath = env.depotPaths[0];
      if (!depotPath) {
        throw new AppError(
          "P4_CLIENT_NOT_FOUND",
          "Unable to derive depot path from current client view."
        );
      }
    }
    return p4.listSubmittedChanges(depotPath, limit);
  }

  async function loadChangelist(input: LoadChangelistInput): Promise<ChangelistSummary> {
    if (input.kind === "pending") return loadPending(input.id);
    return loadSubmitted(input.id);
  }

  async function loadPending(id: string): Promise<ChangelistSummary> {
    const opened = await p4.opened(id);
    const files: ChangeFile[] = opened.map((o) => {
      const file: ChangeFile = {
        depotPath: o.depotPath,
        status: actionToStatus(o.action),
        isText: !isBinaryFileType(o.fileType),
      };
      if (o.action) file.action = o.action;
      if (o.revision) file.oldRev = o.revision;
      if (o.fileType) file.fileType = o.fileType;
      return file;
    });
    const largeChange = files.length > largeChangeThreshold;
    return {
      id,
      kind: "pending",
      files,
      largeChange,
    };
  }

  async function loadSubmitted(id: string): Promise<ChangelistSummary> {
    const described = await p4.describe(id);
    if (!described) throw new AppError("CHANGE_NOT_FOUND", `Changelist ${id} not found.`);
    const files: ChangeFile[] = described.files.map(fileFromDescribe);
    const largeChange = files.length > largeChangeThreshold;
    const summary: ChangelistSummary = {
      id: described.id,
      kind: "submitted",
      files,
      largeChange,
    };
    if (described.author) summary.author = described.author;
    if (described.client) summary.client = described.client;
    if (described.description) summary.description = described.description;
    if (described.status) summary.status = described.status;
    return summary;
  }

  async function loadFileContentPair(
    input: LoadFileContentPairInput
  ): Promise<FileContentPair> {
    if (input.kind === "pending") return loadPendingContent(input);
    return loadSubmittedContent(input);
  }

  async function loadPendingContent(
    input: LoadFileContentPairInput
  ): Promise<FileContentPair> {
    const opened = await p4.opened(input.changelistId);
    const match = opened.find((o) => o.depotPath === input.depotPath);
    if (!match) {
      throw new AppError(
        "CHANGE_NOT_FOUND",
        `File ${input.depotPath} not found in CL ${input.changelistId}`
      );
    }
    const file: ChangeFile = {
      depotPath: match.depotPath,
      status: actionToStatus(match.action),
      isText: !isBinaryFileType(match.fileType),
    };
    if (match.action) file.action = match.action;
    if (match.revision) file.oldRev = match.revision;

    if (!file.isText) {
      throw new AppError("BINARY_FILE", `${match.depotPath} is binary`);
    }

    const localPath = await p4.where(match.depotPath);
    if (localPath) file.localPath = localPath;

    const action = (match.action ?? "").toLowerCase();
    const leftLabel = action === "add" ? "(new)" : `${match.depotPath}#have`;
    const rightLabel = action === "delete" ? "(deleted)" : localPath ?? match.depotPath;

    let leftText: string | null = null;
    let rightText: string | null = null;

    if (action === "add" || action === "branch" || action === "move/add") {
      rightText = await readLocalOrThrow(localPath, input.confirmLargeFile);
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftText = await p4.print(match.depotPath, "have");
    } else {
      leftText = await p4.print(match.depotPath, "have");
      rightText = await readLocalOrThrow(localPath, input.confirmLargeFile);
    }

    return { file, leftLabel, rightLabel, leftText, rightText };
  }

  async function loadSubmittedContent(
    input: LoadFileContentPairInput
  ): Promise<FileContentPair> {
    const described = await p4.describe(input.changelistId);
    if (!described) {
      throw new AppError("CHANGE_NOT_FOUND", `Changelist ${input.changelistId} not found.`);
    }
    const match = described.files.find((f) => f.depotPath === input.depotPath);
    if (!match) {
      throw new AppError(
        "CHANGE_NOT_FOUND",
        `File ${input.depotPath} not found in CL ${input.changelistId}`
      );
    }
    const file = fileFromDescribe(match);
    if (!file.isText) {
      throw new AppError("BINARY_FILE", `${file.depotPath} is binary`);
    }

    const action = (file.action ?? "").toLowerCase();
    let leftText: string | null = null;
    let rightText: string | null = null;
    let leftLabel = "";
    let rightLabel = "";

    if (action === "add" || action === "branch" || action === "move/add") {
      rightText = await p4.print(file.depotPath, file.newRev);
      leftLabel = "(new)";
      rightLabel = `${file.depotPath}#${file.newRev}`;
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftText = file.oldRev ? await p4.print(file.depotPath, file.oldRev) : null;
      leftLabel = `${file.depotPath}#${file.oldRev ?? ""}`;
      rightLabel = "(deleted)";
    } else {
      if (file.oldRev) leftText = await p4.print(file.depotPath, file.oldRev);
      rightText = await p4.print(file.depotPath, file.newRev);
      leftLabel = `${file.depotPath}#${file.oldRev ?? ""}`;
      rightLabel = `${file.depotPath}#${file.newRev}`;
    }

    return { file, leftLabel, rightLabel, leftText, rightText };
  }

  async function readLocalOrThrow(
    localPath: string | null | undefined,
    confirmLarge: boolean | undefined
  ): Promise<string> {
    if (!localPath) throw new AppError("FILE_NOT_FOUND", "Local path unresolved");
    const res = await fileService.readLocalFile(localPath, confirmLarge);
    if (res.isBinary) throw new AppError("BINARY_FILE", `${localPath} is binary`);
    return res.text ?? "";
  }

  async function getEnvironment(): Promise<P4Environment> {
    return p4.getEnvironment();
  }

  return {
    listPendingChanges,
    listHistoryChanges,
    loadChangelist,
    loadFileContentPair,
    getEnvironment,
  };
}

function fileFromDescribe(f: ParsedDescribeFile): ChangeFile {
  const revNumber = parseInt(f.revision, 10);
  const action = (f.action ?? "").toLowerCase();
  const file: ChangeFile = {
    depotPath: f.depotPath,
    action: f.action,
    status: actionToStatus(f.action),
    newRev: f.revision,
    isText: true,
  };
  if (action === "edit" || action === "integrate" || action === "archive") {
    if (!Number.isNaN(revNumber) && revNumber > 1) {
      file.oldRev = String(revNumber - 1);
    }
  } else if (action === "delete" || action === "move/delete" || action === "purge") {
    if (!Number.isNaN(revNumber) && revNumber > 1) {
      file.oldRev = String(revNumber - 1);
    }
  }
  return file;
}
