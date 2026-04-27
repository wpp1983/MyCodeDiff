import type {
  ChangeKind,
  ChangelistListItem,
  ChangelistSummary,
  FileContentPair,
} from "../models/changeModels";
import type { AppConfig } from "../models/configModel";

export type P4Environment = {
  user?: string;
  client?: string;
  root?: string;
  port?: string;
  depotPaths: string[];
  available: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export type ListHistoryChangesInput = {
  depotPath?: string;
  limit: number;
};

export type LoadChangelistInput = {
  id: string;
  kind: ChangeKind;
};

export type LoadFileContentPairInput = {
  changelistId: string;
  kind: ChangeKind;
  depotPath: string;
  confirmLargeFile?: boolean;
};

export type MyCodeDiffApi = {
  getP4Environment(): Promise<P4Environment>;
  listPendingChanges(): Promise<ChangelistListItem[]>;
  listHistoryChanges(input: ListHistoryChangesInput): Promise<ChangelistListItem[]>;
  listShelvedChanges(): Promise<ChangelistListItem[]>;
  loadChangelist(input: LoadChangelistInput): Promise<ChangelistSummary>;
  loadFileContentPair(input: LoadFileContentPairInput): Promise<FileContentPair>;
  getConfig(): Promise<AppConfig>;
  updateConfig(patch: Partial<AppConfig>): Promise<AppConfig>;
};

export type MyCodeDiffIpcChannel =
  | "mycodediff:getP4Environment"
  | "mycodediff:listPendingChanges"
  | "mycodediff:listHistoryChanges"
  | "mycodediff:listShelvedChanges"
  | "mycodediff:loadChangelist"
  | "mycodediff:loadFileContentPair"
  | "mycodediff:getConfig"
  | "mycodediff:updateConfig";
