import * as XLSX from "xlsx";
import type { SheetPayload } from "@core/models/changeModels";
import { AppError } from "@core/models/errors";

export type ParseXlsxOptions = {
  maxRowsPerSheet?: number;
};

export const DEFAULT_MAX_ROWS_PER_SHEET = 10000;

export function parseXlsxBuffer(
  buffer: Buffer,
  options: ParseXlsxOptions = {}
): SheetPayload[] {
  const maxRows = options.maxRowsPerSheet ?? DEFAULT_MAX_ROWS_PER_SHEET;
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch (err) {
    throw new AppError(
      "XLSX_PARSE_FAILED",
      "Failed to parse xlsx workbook",
      (err as Error).message
    );
  }
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return { name, tsv: "" };
    const tsv = sheetToTsvWithCap(sheet, maxRows);
    return { name, tsv };
  });
}

function sheetToTsvWithCap(sheet: XLSX.WorkSheet, maxRows: number): string {
  const ref = sheet["!ref"];
  let truncatedExtra = 0;
  if (ref && maxRows > 0) {
    const range = XLSX.utils.decode_range(ref);
    const totalRows = range.e.r - range.s.r + 1;
    if (totalRows > maxRows) {
      truncatedExtra = totalRows - maxRows;
      range.e.r = range.s.r + maxRows - 1;
      sheet["!ref"] = XLSX.utils.encode_range(range);
    }
  }
  let tsv = XLSX.utils.sheet_to_csv(sheet, {
    FS: "\t",
    RS: "\n",
    blankrows: false,
  });
  tsv = stripTrailingNewline(tsv);
  if (truncatedExtra > 0) {
    tsv += `\n... (truncated, ${truncatedExtra} more rows)`;
  }
  return tsv;
}

export function combineSheetsToText(sheets: SheetPayload[]): string {
  if (sheets.length === 0) return "";
  return sheets.map((s) => `=== Sheet: ${s.name} ===\n${s.tsv}`).join("\n\n");
}

function stripTrailingNewline(s: string): string {
  if (s.endsWith("\n")) return s.slice(0, -1);
  return s;
}
