import iconv from "iconv-lite";

/**
 * Decode a text buffer using BOM detection first, then strict UTF-8,
 * falling back to GBK for legacy Chinese-Windows encodings.
 *
 * Caller is responsible for ensuring the buffer is text (not binary).
 */
export function decodeTextBuffer(buffer: Buffer): string {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  ) {
    return buffer.toString("utf8", 3);
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le", 2);
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16 BE: swap bytes then decode as utf16le.
    const len = buffer.length - 2;
    const swapped = Buffer.alloc(len);
    for (let i = 0; i < len; i += 2) {
      swapped[i] = buffer[i + 3] ?? 0;
      swapped[i + 1] = buffer[i + 2] ?? 0;
    }
    return swapped.toString("utf16le");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, "gbk");
  }
}
