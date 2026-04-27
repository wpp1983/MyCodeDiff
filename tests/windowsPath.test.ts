import { describe, expect, test } from "bun:test";
import { parseWhereOutput } from "../src/core/p4/p4Parsers";

describe("windowsPath handling", () => {
  test("preserves backslashes in local path", () => {
    const out = parseWhereOutput(
      "//depot/a/file.ts //wp_dev_1/a/file.ts C:\\work\\wp_dev_1\\a\\file.ts\n"
    );
    expect(out).toBe("C:\\work\\wp_dev_1\\a\\file.ts");
  });

  test("handles quoted paths with spaces", () => {
    const out = parseWhereOutput(
      '"//depot/a b/file.ts" "//wp_dev_1/a b/file.ts" "C:\\work\\wp dev 1\\a b\\file.ts"\n'
    );
    expect(out).toBe("C:\\work\\wp dev 1\\a b\\file.ts");
  });

  test("returns last column with two columns only (null - not a valid where line)", () => {
    expect(parseWhereOutput("a b\n")).toBeNull();
  });
});
