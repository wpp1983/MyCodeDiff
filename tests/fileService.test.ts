import { describe, expect, test } from "bun:test";
import { createFileService, decodeUtf8, isBinary } from "../src/main/services/fileService";
import { AppError } from "../src/core/models/errors";

describe("isBinary", () => {
  test("null byte triggers binary", () => {
    expect(isBinary(Buffer.from([0x48, 0x00, 0x49]))).toBe(true);
  });
  test("plain text not binary", () => {
    expect(isBinary(Buffer.from("hello world", "utf8"))).toBe(false);
  });
});

describe("decodeUtf8", () => {
  test("strips BOM", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("abc", "utf8")]);
    expect(decodeUtf8(buf)).toBe("abc");
  });
  test("preserves CRLF", () => {
    expect(decodeUtf8(Buffer.from("a\r\nb\r\n", "utf8"))).toBe("a\r\nb\r\n");
  });
});

describe("fileService", () => {
  test("throws LARGE_FILE_REQUIRES_CONFIRMATION above threshold", async () => {
    const svc = createFileService({
      largeFileThresholdBytes: 100,
      stat: async () => ({ size: 1024 }),
      readFile: async () => Buffer.alloc(1024),
    });
    await expect(svc.readLocalFile("/tmp/x")).rejects.toBeInstanceOf(AppError);
  });
  test("reads when confirmed", async () => {
    const svc = createFileService({
      largeFileThresholdBytes: 100,
      stat: async () => ({ size: 1024 }),
      readFile: async () => Buffer.from("data", "utf8"),
    });
    const r = await svc.readLocalFile("/tmp/x", true);
    expect(r.text).toBe("data");
  });
  test("missing file maps to FILE_NOT_FOUND", async () => {
    const svc = createFileService({
      stat: async () => {
        const err: NodeJS.ErrnoException = new Error("not found");
        err.code = "ENOENT";
        throw err;
      },
      readFile: async () => Buffer.alloc(0),
    });
    await expect(svc.readLocalFile("/tmp/missing")).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
    });
  });
});
