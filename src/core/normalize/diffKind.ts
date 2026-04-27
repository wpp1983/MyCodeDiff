import type { DiffContentKind } from "../models/changeModels";

export function getDiffKind(path: string): DiffContentKind {
  const lower = path.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx-sheets";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".tsv")) return "tsv";
  return "text";
}
