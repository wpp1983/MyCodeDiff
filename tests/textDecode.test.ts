import { describe, expect, test } from "bun:test";
import iconv from "iconv-lite";
import { decodeTextBuffer } from "../src/main/services/normalize/textDecode";

describe("decodeTextBuffer", () => {
  test("strips UTF-8 BOM", () => {
    const buf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("hello", "utf8"),
    ]);
    expect(decodeTextBuffer(buf)).toBe("hello");
  });

  test("decodes plain UTF-8 with CJK characters", () => {
    const buf = Buffer.from("姓名,年龄\n张三,30", "utf8");
    expect(decodeTextBuffer(buf)).toBe("姓名,年龄\n张三,30");
  });

  test("falls back to GBK when bytes are invalid UTF-8", () => {
    const original = "姓名,年龄\n张三,30";
    const buf = iconv.encode(original, "gbk");
    expect(decodeTextBuffer(buf)).toBe(original);
  });

  test("decodes UTF-16 LE BOM", () => {
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("hi", "utf16le"),
    ]);
    expect(decodeTextBuffer(buf)).toBe("hi");
  });

  test("preserves ASCII without BOM", () => {
    expect(decodeTextBuffer(Buffer.from("a,b,c\n1,2,3", "utf8"))).toBe("a,b,c\n1,2,3");
  });
});
