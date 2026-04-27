import type {
  ChangeFile,
  ChangelistListItem,
  ChangelistSummary,
  DiffContentKind,
  FileContentPair,
  SheetPair,
  SheetPayload,
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
  type ParsedOpenedFile,
} from "@core/p4/p4Parsers";
import { getDiffKind } from "@core/normalize/diffKind";
import {
  combineSheetsToText,
  parseXlsxBuffer,
} from "./normalize/xlsxNormalize";
import { decodeTextBuffer } from "./normalize/textDecode";

export type ChangeServiceOptions = {
  p4: P4Service;
  fileService?: FileService;
  largeChangeFileCountThreshold?: number;
  largeFileThresholdBytes?: number;
};

export type ChangeService = {
  listPendingChanges(): Promise<ChangelistListItem[]>;
  listHistoryChanges(input: ListHistoryChangesInput): Promise<ChangelistListItem[]>;
  listShelvedChanges(): Promise<ChangelistListItem[]>;
  loadChangelist(input: LoadChangelistInput): Promise<ChangelistSummary>;
  loadFileContentPair(input: LoadFileContentPairInput): Promise<FileContentPair>;
  getEnvironment(): Promise<P4Environment>;
};

export function createChangeService(options: ChangeServiceOptions): ChangeService {
  const { p4 } = options;
  const largeFileThreshold = options.largeFileThresholdBytes ?? 2 * 1024 * 1024;
  const fileService =
    options.fileService ??
    createFileService({
      largeFileThresholdBytes: largeFileThreshold,
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
    const numbered = await p4.listPendingChanges(env.client);
    let defaultOpened: ParsedOpenedFile[] = [];
    try {
      defaultOpened = await p4.opened("default");
    } catch (err) {
      console.warn("[changeService] p4 opened default failed:", err);
      defaultOpened = [];
    }
    if (defaultOpened.length === 0) return numbered;
    const defaultItem: ChangelistListItem = {
      id: "default",
      kind: "pending",
      client: env.client,
      description: "default",
      fileCount: defaultOpened.length,
    };
    return [defaultItem, ...numbered];
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

  async function listShelvedChanges(): Promise<ChangelistListItem[]> {
    const env = await p4.getEnvironment();
    if (!env.available) {
      throw new AppError(
        (env.errorCode as any) ?? "P4_COMMAND_FAILED",
        env.errorMessage ?? "P4 unavailable"
      );
    }
    return p4.listShelvedChanges(env.user);
  }

  async function loadChangelist(input: LoadChangelistInput): Promise<ChangelistSummary> {
    if (input.kind === "pending") return loadPending(input.id);
    if (input.kind === "shelved") return loadShelved(input.id);
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

    // The default CL cannot hold shelved files; numbered pending CLs may.
    if (id !== "default") {
      try {
        const shelvedDescribe = await p4.describeShelved(id);
        if (shelvedDescribe) {
          // Only the shelvedFiles section — `describe -S` may also include the
          // CL's affected files which we must NOT mistake for shelved entries.
          for (const sf of shelvedDescribe.shelvedFiles) {
            const file = fileFromShelvedDescribe(sf);
            file.shelved = true;
            files.push(file);
          }
        }
      } catch (err) {
        // describe -S throws if there are no shelved files in some servers; degrade gracefully
        console.warn("[changeService] p4 describe -S failed:", err);
      }
    }

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

  async function loadShelved(id: string): Promise<ChangelistSummary> {
    const described = await p4.describeShelved(id);
    if (!described) throw new AppError("CHANGE_NOT_FOUND", `Changelist ${id} not found.`);
    const files: ChangeFile[] = described.shelvedFiles.map((f) => {
      const file = fileFromShelvedDescribe(f);
      file.shelved = true;
      return file;
    });
    const largeChange = files.length > largeChangeThreshold;
    const summary: ChangelistSummary = {
      id: described.id,
      kind: "shelved",
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
    if (input.kind === "shelved") return loadShelvedContent(input);
    return loadSubmittedContent(input);
  }

  async function loadPendingContent(
    input: LoadFileContentPairInput
  ): Promise<FileContentPair> {
    const opened = await p4.opened(input.changelistId);
    const match = opened.find((o) => o.depotPath === input.depotPath);
    if (!match) {
      // Not opened in workspace — try shelved files of the same CL.
      if (input.changelistId !== "default") {
        return loadShelvedContent({ ...input, kind: "shelved" });
      }
      throw new AppError(
        "CHANGE_NOT_FOUND",
        `File ${input.depotPath} not found in CL ${input.changelistId}`
      );
    }
    const kind = getDiffKind(match.depotPath);
    const file: ChangeFile = {
      depotPath: match.depotPath,
      status: actionToStatus(match.action),
      isText: !isBinaryFileType(match.fileType),
    };
    if (match.action) file.action = match.action;
    if (match.revision) file.oldRev = match.revision;

    if (!file.isText && kind !== "xlsx-sheets") {
      throw new AppError("BINARY_FILE", `${match.depotPath} is binary`);
    }

    const localPath = await p4.where(match.depotPath);
    if (localPath) file.localPath = localPath;

    const action = (match.action ?? "").toLowerCase();
    const leftLabel = action === "add" ? "(new)" : `${match.depotPath}#have`;
    const rightLabel = action === "delete" ? "(deleted)" : localPath ?? match.depotPath;

    if (kind === "xlsx-sheets") {
      const leftSheets =
        action === "add" || action === "branch" || action === "move/add"
          ? []
          : parseXlsxBuffer(
              await printBufferGuarded(match.depotPath, "have", input.confirmLargeFile)
            );
      const rightSheets =
        action === "delete" || action === "move/delete" || action === "purge"
          ? []
          : parseXlsxBuffer(await readLocalBufferOrThrow(localPath, input.confirmLargeFile));
      return buildXlsxPair(file, leftLabel, rightLabel, leftSheets, rightSheets);
    }

    let leftText: string | null = null;
    let rightText: string | null = null;

    if (action === "add" || action === "branch" || action === "move/add") {
      rightText = await readLocalOrThrow(localPath, input.confirmLargeFile);
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftText = await readDepotText(match.depotPath, "have", kind, input.confirmLargeFile);
    } else {
      leftText = await readDepotText(match.depotPath, "have", kind, input.confirmLargeFile);
      rightText = await readLocalOrThrow(localPath, input.confirmLargeFile);
    }

    return { file, leftLabel, rightLabel, leftText, rightText, kind };
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
    const kind = getDiffKind(file.depotPath);
    if (!file.isText && kind !== "xlsx-sheets") {
      throw new AppError("BINARY_FILE", `${file.depotPath} is binary`);
    }

    const action = (file.action ?? "").toLowerCase();
    let leftLabel = "";
    let rightLabel = "";

    if (action === "add" || action === "branch" || action === "move/add") {
      leftLabel = "(new)";
      rightLabel = `${file.depotPath}#${file.newRev}`;
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftLabel = `${file.depotPath}#${file.oldRev ?? ""}`;
      rightLabel = "(deleted)";
    } else {
      leftLabel = `${file.depotPath}#${file.oldRev ?? ""}`;
      rightLabel = `${file.depotPath}#${file.newRev}`;
    }

    if (kind === "xlsx-sheets") {
      const leftSheets =
        action === "add" || action === "branch" || action === "move/add" || !file.oldRev
          ? []
          : parseXlsxBuffer(
              await printBufferGuarded(file.depotPath, file.oldRev, input.confirmLargeFile)
            );
      const rightSheets =
        action === "delete" || action === "move/delete" || action === "purge"
          ? []
          : parseXlsxBuffer(
              await printBufferGuarded(file.depotPath, file.newRev, input.confirmLargeFile)
            );
      return buildXlsxPair(file, leftLabel, rightLabel, leftSheets, rightSheets);
    }

    let leftText: string | null = null;
    let rightText: string | null = null;

    if (action === "add" || action === "branch" || action === "move/add") {
      rightText = await readDepotText(file.depotPath, file.newRev, kind, input.confirmLargeFile);
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftText = file.oldRev
        ? await readDepotText(file.depotPath, file.oldRev, kind, input.confirmLargeFile)
        : null;
    } else {
      if (file.oldRev) {
        leftText = await readDepotText(file.depotPath, file.oldRev, kind, input.confirmLargeFile);
      }
      rightText = await readDepotText(file.depotPath, file.newRev, kind, input.confirmLargeFile);
    }

    return { file, leftLabel, rightLabel, leftText, rightText, kind };
  }

  async function loadShelvedContent(
    input: LoadFileContentPairInput
  ): Promise<FileContentPair> {
    const described = await p4.describeShelved(input.changelistId);
    if (!described) {
      throw new AppError("CHANGE_NOT_FOUND", `Changelist ${input.changelistId} not found.`);
    }
    const match = described.shelvedFiles.find((f) => f.depotPath === input.depotPath);
    if (!match) {
      throw new AppError(
        "CHANGE_NOT_FOUND",
        `File ${input.depotPath} not found in shelved CL ${input.changelistId}`
      );
    }
    const file = fileFromShelvedDescribe(match);
    const kind = getDiffKind(file.depotPath);
    if (!file.isText && kind !== "xlsx-sheets") {
      throw new AppError("BINARY_FILE", `${file.depotPath} is binary`);
    }

    const action = (file.action ?? "").toLowerCase();
    let leftLabel = "";
    let rightLabel = "";

    if (action === "add" || action === "branch" || action === "move/add") {
      leftLabel = "(new)";
      rightLabel = `${file.depotPath}@=${input.changelistId}`;
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftLabel = `${file.depotPath}#${file.oldRev ?? ""}`;
      rightLabel = "(deleted)";
    } else {
      leftLabel = `${file.depotPath}#${file.oldRev ?? ""}`;
      rightLabel = `${file.depotPath}@=${input.changelistId}`;
    }

    if (kind === "xlsx-sheets") {
      const leftSheets =
        action === "add" || action === "branch" || action === "move/add" || !file.oldRev
          ? []
          : parseXlsxBuffer(
              await printBufferGuarded(file.depotPath, file.oldRev, input.confirmLargeFile)
            );
      const rightSheets =
        action === "delete" || action === "move/delete" || action === "purge"
          ? []
          : parseXlsxBuffer(
              await printShelvedBufferGuarded(
                file.depotPath,
                input.changelistId,
                input.confirmLargeFile
              )
            );
      return buildXlsxPair(file, leftLabel, rightLabel, leftSheets, rightSheets);
    }

    let leftText: string | null = null;
    let rightText: string | null = null;

    if (action === "add" || action === "branch" || action === "move/add") {
      rightText = await readShelvedText(
        file.depotPath,
        input.changelistId,
        kind,
        input.confirmLargeFile
      );
    } else if (action === "delete" || action === "move/delete" || action === "purge") {
      leftText = file.oldRev
        ? await readDepotText(file.depotPath, file.oldRev, kind, input.confirmLargeFile)
        : null;
    } else {
      if (file.oldRev) {
        leftText = await readDepotText(file.depotPath, file.oldRev, kind, input.confirmLargeFile);
      }
      rightText = await readShelvedText(
        file.depotPath,
        input.changelistId,
        kind,
        input.confirmLargeFile
      );
    }

    return { file, leftLabel, rightLabel, leftText, rightText, kind };
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

  async function readLocalBufferOrThrow(
    localPath: string | null | undefined,
    confirmLarge: boolean | undefined
  ): Promise<Buffer> {
    if (!localPath) throw new AppError("FILE_NOT_FOUND", "Local path unresolved");
    const res = await fileService.readLocalBuffer(localPath, confirmLarge);
    return res.buffer;
  }

  async function readDepotText(
    depotPath: string,
    revision: string | undefined,
    kind: DiffContentKind,
    confirmLarge: boolean | undefined
  ): Promise<string> {
    if (kind === "csv" || kind === "tsv") {
      const buf = await printBufferGuarded(depotPath, revision, confirmLarge);
      return decodeTextBuffer(buf);
    }
    return p4.print(depotPath, revision);
  }

  async function printBufferGuarded(
    depotPath: string,
    revision: string | undefined,
    confirmLarge: boolean | undefined
  ): Promise<Buffer> {
    const size = await p4.getFileSize(depotPath, revision);
    if (size !== null && size > largeFileThreshold && !confirmLarge) {
      throw new AppError(
        "LARGE_FILE_REQUIRES_CONFIRMATION",
        `${depotPath} exceeds ${largeFileThreshold} bytes. Confirmation required.`,
        String(size)
      );
    }
    return p4.printBuffer(depotPath, revision);
  }

  async function readShelvedText(
    depotPath: string,
    changelistId: string,
    kind: DiffContentKind,
    confirmLarge: boolean | undefined
  ): Promise<string> {
    if (kind === "csv" || kind === "tsv") {
      const buf = await printShelvedBufferGuarded(depotPath, changelistId, confirmLarge);
      return decodeTextBuffer(buf);
    }
    // Plain text — still guard size before printing.
    const size = await p4.getShelvedFileSize(depotPath, changelistId);
    if (size !== null && size > largeFileThreshold && !confirmLarge) {
      throw new AppError(
        "LARGE_FILE_REQUIRES_CONFIRMATION",
        `${depotPath} exceeds ${largeFileThreshold} bytes. Confirmation required.`,
        String(size)
      );
    }
    return p4.printShelved(depotPath, changelistId);
  }

  async function printShelvedBufferGuarded(
    depotPath: string,
    changelistId: string,
    confirmLarge: boolean | undefined
  ): Promise<Buffer> {
    const size = await p4.getShelvedFileSize(depotPath, changelistId);
    if (size !== null && size > largeFileThreshold && !confirmLarge) {
      throw new AppError(
        "LARGE_FILE_REQUIRES_CONFIRMATION",
        `${depotPath} exceeds ${largeFileThreshold} bytes. Confirmation required.`,
        String(size)
      );
    }
    return p4.printShelvedBuffer(depotPath, changelistId);
  }

  function buildXlsxPair(
    file: ChangeFile,
    leftLabel: string,
    rightLabel: string,
    leftSheets: SheetPayload[],
    rightSheets: SheetPayload[]
  ): FileContentPair {
    const sheets: SheetPair = { left: leftSheets, right: rightSheets };
    const leftText = leftSheets.length > 0 ? combineSheetsToText(leftSheets) : null;
    const rightText = rightSheets.length > 0 ? combineSheetsToText(rightSheets) : null;
    const kind: DiffContentKind = "xlsx-sheets";
    return { file, leftLabel, rightLabel, leftText, rightText, kind, sheets };
  }

  async function getEnvironment(): Promise<P4Environment> {
    return p4.getEnvironment();
  }

  return {
    listPendingChanges,
    listHistoryChanges,
    listShelvedChanges,
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

// In `p4 describe -S` output the revision printed next to a shelved file is the
// base revision the shelve was made against (the "have" rev at shelve time),
// not the new revision. So oldRev = revision (for non-add actions) and newRev
// is intentionally left undefined — the right side is read via `@=<CL>`.
function fileFromShelvedDescribe(f: ParsedDescribeFile): ChangeFile {
  const action = (f.action ?? "").toLowerCase();
  const file: ChangeFile = {
    depotPath: f.depotPath,
    action: f.action,
    status: actionToStatus(f.action),
    isText: true,
  };
  if (action !== "add" && action !== "branch" && action !== "move/add") {
    file.oldRev = f.revision;
  }
  return file;
}
