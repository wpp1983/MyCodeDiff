export type ChangeKind = "pending" | "submitted";

export type FileChangeStatus =
  | "added"
  | "deleted"
  | "modified"
  | "unchanged"
  | "renamed"
  | "moved"
  | "binary"
  | "unknown";

export type ChangelistListItem = {
  id: string;
  kind: ChangeKind;
  author?: string;
  client?: string;
  date?: string;
  description?: string;
  fileCount?: number;
};

export type ChangeFile = {
  depotPath: string;
  localPath?: string;
  action?: string;
  oldRev?: string;
  newRev?: string;
  status: FileChangeStatus;
  isText?: boolean;
  sizeBytes?: number;
  fileType?: string;
};

export type ChangelistSummary = {
  id: string;
  kind: ChangeKind;
  author?: string;
  client?: string;
  status?: string;
  description?: string;
  files: ChangeFile[];
  largeChange?: boolean;
};

export type DiffContentKind = "text" | "csv" | "tsv" | "xlsx-sheets";

export type SheetPayload = {
  name: string;
  tsv: string;
};

export type SheetPair = {
  left: SheetPayload[];
  right: SheetPayload[];
};

export type FileContentPair = {
  file: ChangeFile;
  leftLabel: string;
  rightLabel: string;
  leftText: string | null;
  rightText: string | null;
  kind: DiffContentKind;
  sheets?: SheetPair;
};
