import { promises as fs } from "node:fs";
import { AppError } from "@core/models/errors";

export type FileReadResult = {
  text: string | null;
  isBinary: boolean;
  sizeBytes: number;
};

export type FileServiceOptions = {
  readFile?: (path: string) => Promise<Buffer>;
  stat?: (path: string) => Promise<{ size: number }>;
  largeFileThresholdBytes?: number;
};

export type FileService = {
  readLocalFile(path: string, confirmLarge?: boolean): Promise<FileReadResult>;
};

export function createFileService(options: FileServiceOptions = {}): FileService {
  const readFile = options.readFile ?? ((p) => fs.readFile(p));
  const stat = options.stat ?? (async (p) => fs.stat(p));
  const threshold = options.largeFileThresholdBytes ?? 2 * 1024 * 1024;

  async function readLocalFile(
    path: string,
    confirmLarge = false
  ): Promise<FileReadResult> {
    let size = 0;
    try {
      const s = await stat(path);
      size = s.size;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        throw new AppError("FILE_NOT_FOUND", `Local file not found: ${path}`);
      }
      throw new AppError("UNKNOWN", `Unable to stat file: ${path}`, e.message);
    }

    if (size > threshold && !confirmLarge) {
      throw new AppError(
        "LARGE_FILE_REQUIRES_CONFIRMATION",
        `File exceeds ${threshold} bytes. Confirmation required.`,
        String(size)
      );
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(path);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        throw new AppError("FILE_NOT_FOUND", `Local file not found: ${path}`);
      }
      throw new AppError("UNKNOWN", `Unable to read file: ${path}`, e.message);
    }

    const binary = isBinary(buffer);
    if (binary) return { text: null, isBinary: true, sizeBytes: size };
    return {
      text: decodeUtf8(buffer),
      isBinary: false,
      sizeBytes: size,
    };
  }

  return { readLocalFile };
}

export function isBinary(buffer: Buffer): boolean {
  const len = Math.min(buffer.length, 8192);
  for (let i = 0; i < len; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export function decodeUtf8(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString("utf8", 3);
  }
  return buffer.toString("utf8");
}
