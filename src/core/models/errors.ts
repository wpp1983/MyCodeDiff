export type AppErrorCode =
  | "P4_NOT_FOUND"
  | "P4_AUTH_REQUIRED"
  | "P4_COMMAND_FAILED"
  | "P4_CLIENT_NOT_FOUND"
  | "CHANGE_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "BINARY_FILE"
  | "XLSX_PARSE_FAILED"
  | "LARGE_FILE_REQUIRES_CONFIRMATION"
  | "LARGE_CHANGE_REQUIRES_CONFIRMATION"
  | "UNSUPPORTED_ACTION"
  | "UNKNOWN";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: string;

  constructor(code: AppErrorCode, message: string, details?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  toJSON(): { code: AppErrorCode; message: string; details?: string } {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export function isAppErrorPayload(
  value: unknown
): value is { code: AppErrorCode; message: string; details?: string } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v["code"] === "string" && typeof v["message"] === "string";
}
