import { describe, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import {
  combineSheetsToText,
  parseXlsxBuffer,
} from "../src/main/services/normalize/xlsxNormalize";

function buildXlsxBuffer(
  sheets: { name: string; rows: unknown[][] }[]
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  return Buffer.from(out as ArrayBuffer);
}

describe("parseXlsxBuffer", () => {
  test("converts a single sheet to TSV", () => {
    const buf = buildXlsxBuffer([
      { name: "Sheet1", rows: [["a", "b", "c"], [1, 2, 3]] },
    ]);
    const sheets = parseXlsxBuffer(buf);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe("Sheet1");
    expect(sheets[0]?.tsv).toBe("a\tb\tc\n1\t2\t3");
  });

  test("preserves multiple sheets", () => {
    const buf = buildXlsxBuffer([
      { name: "First", rows: [["x"]] },
      { name: "Second", rows: [["y"]] },
    ]);
    const sheets = parseXlsxBuffer(buf);
    expect(sheets.map((s) => s.name)).toEqual(["First", "Second"]);
    expect(sheets[0]?.tsv).toBe("x");
    expect(sheets[1]?.tsv).toBe("y");
  });

  test("truncates sheets exceeding maxRowsPerSheet", () => {
    const rows: unknown[][] = [];
    for (let i = 1; i <= 50; i++) rows.push([i]);
    const buf = buildXlsxBuffer([{ name: "Big", rows }]);
    const sheets = parseXlsxBuffer(buf, { maxRowsPerSheet: 10 });
    const tsv = sheets[0]?.tsv ?? "";
    const lines = tsv.split("\n");
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("1");
    expect(lines[9]).toBe("10");
    expect(lines[10]).toBe("... (truncated, 40 more rows)");
  });
});

describe("combineSheetsToText", () => {
  test("joins sheets with header markers", () => {
    const text = combineSheetsToText([
      { name: "A", tsv: "1\t2" },
      { name: "B", tsv: "3\t4" },
    ]);
    expect(text).toBe("=== Sheet: A ===\n1\t2\n\n=== Sheet: B ===\n3\t4");
  });

  test("empty input returns empty string", () => {
    expect(combineSheetsToText([])).toBe("");
  });
});
