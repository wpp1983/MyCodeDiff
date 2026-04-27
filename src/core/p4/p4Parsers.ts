import type { ChangeKind, ChangelistListItem, FileChangeStatus } from "../models/changeModels";
import type { P4ClientView, P4InfoFields } from "./p4Types";

const INFO_KEY_MAP: Record<string, keyof P4InfoFields> = {
  "User name": "user",
  "Client name": "client",
  "Client root": "clientRoot",
  "Server address": "serverAddress",
  "Server version": "serverVersion",
};

export function parseP4Info(stdout: string): P4InfoFields {
  const result: P4InfoFields = {};
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    const field = INFO_KEY_MAP[key];
    if (field) result[field] = value;
  }
  return result;
}

export function detectP4InfoError(
  stderr: string,
  stdout: string
): "P4_AUTH_REQUIRED" | "P4_CLIENT_NOT_FOUND" | null {
  const combined = `${stderr}\n${stdout}`.toLowerCase();
  if (
    combined.includes("your session has expired") ||
    combined.includes("perforce password") ||
    combined.includes("please login") ||
    combined.includes("p4passwd") ||
    combined.includes("invalid or unset")
  ) {
    return "P4_AUTH_REQUIRED";
  }
  if (combined.includes("client unknown") || combined.includes("use 'client' command")) {
    return "P4_CLIENT_NOT_FOUND";
  }
  return null;
}

export function parseClientView(stdout: string, fallbackName = ""): P4ClientView {
  const lines = stdout.split(/\r?\n/);
  let clientName = fallbackName;
  const mappings: P4ClientView["mappings"] = [];
  let inView = false;

  for (const rawLine of lines) {
    if (!rawLine) continue;
    if (rawLine.startsWith("#")) continue;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("Client:")) {
      clientName = trimmed.slice("Client:".length).trim();
      continue;
    }
    if (trimmed === "View:") {
      inView = true;
      continue;
    }
    if (!inView) continue;
    if (!rawLine.startsWith("\t") && !rawLine.startsWith(" ")) {
      inView = false;
      continue;
    }

    const viewLine = trimmed;
    if (!viewLine) continue;
    const parsed = parseClientViewLine(viewLine);
    if (parsed) mappings.push(parsed);
  }

  const depotPaths: string[] = [];
  const seen = new Set<string>();
  for (const m of mappings) {
    if (m.exclude) continue;
    const root = depotPathRoot(m.depotPath);
    if (!root) continue;
    if (seen.has(root)) continue;
    seen.add(root);
    depotPaths.push(root);
  }

  return { clientName, depotPaths, mappings };
}

function parseClientViewLine(
  line: string
): { depotPath: string; clientPath: string; exclude: boolean } | null {
  const exclude = line.startsWith("-");
  const body = exclude ? line.slice(1).trimStart() : line;
  const pair = splitQuoted(body);
  if (pair.length !== 2) return null;
  const [depotPath, clientPath] = pair;
  if (!depotPath || !clientPath) return null;
  return { depotPath, clientPath, exclude };
}

function splitQuoted(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === " " && !quoted) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}

function depotPathRoot(depotPath: string): string | null {
  const idx = depotPath.indexOf("/...");
  if (idx >= 0) return depotPath.slice(0, idx);
  const starIdx = depotPath.indexOf("*");
  if (starIdx >= 0) {
    const lastSlash = depotPath.lastIndexOf("/", starIdx);
    return lastSlash > 0 ? depotPath.slice(0, lastSlash) : depotPath;
  }
  return depotPath;
}

export function parseChangesOutput(
  stdout: string,
  kind: ChangeKind
): ChangelistListItem[] {
  const items: ChangelistListItem[] = [];
  const lines = stdout.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i] ?? "";
    const line = rawLine.trim();
    if (!line) {
      i++;
      continue;
    }
    const headerMatch = line.match(
      /^Change (\d+) on (\d{4}\/\d{2}\/\d{2})(?:\s+\d{2}:\d{2}:\d{2})?\s+by\s+([^@\s]+)(?:@(\S+))?(.*)$/
    );
    if (!headerMatch) {
      i++;
      continue;
    }
    const [, id, date, author, client, restRaw] = headerMatch;
    let rest = (restRaw ?? "").trim();

    // Optional *status* marker (e.g. *pending*).
    const statusMatch = rest.match(/^\*([^*]+)\*\s*(.*)$/);
    if (statusMatch) {
      rest = (statusMatch[2] ?? "").trim();
    }

    // Single-line form: trailing 'description'.
    let description = rest.replace(/^'/, "").replace(/'$/, "").trim();

    // Multi-line form (`-l` / `-L`): description on subsequent indented lines,
    // separated from the header by a blank line. Collect until the next blank
    // line followed by another `Change ...` header (or EOF).
    if (!description) {
      const descLines: string[] = [];
      let j = i + 1;
      // Skip the single blank line that separates header and description.
      if (j < lines.length && (lines[j] ?? "").trim() === "") j++;
      while (j < lines.length) {
        const next = lines[j] ?? "";
        // Next CL header is always unindented, so check without trimming.
        if (/^Change \d+ on /.test(next)) break;
        // Description lines from p4 are indented with whitespace; strip it.
        if (/^[\t ]/.test(next)) {
          descLines.push(next.replace(/^[\t ]+/, ""));
        } else if (next.trim() === "") {
          descLines.push("");
        } else {
          break;
        }
        j++;
      }
      description = descLines.join("\n").replace(/\s+$/, "").trim();
      i = j;
    } else {
      i++;
    }

    const item: ChangelistListItem = { id: id!, kind, date: date! };
    if (author) item.author = author;
    if (client) item.client = client;
    if (description) item.description = description;
    items.push(item);
  }
  return items;
}

export type ParsedOpenedFile = {
  depotPath: string;
  revision?: string;
  action: string;
  changelist?: string;
  fileType?: string;
};

export function parseOpenedOutput(stdout: string): ParsedOpenedFile[] {
  const out: ParsedOpenedFile[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(
      /^(\/\/[^#]+)(?:#(\d+))?\s+-\s+([\w/]+)(?:\s+(?:default\s+change|change\s+(\d+)))?\s+\(([^)]+)\)/
    );
    if (!match) continue;
    const [, depotPath, revision, action, change, fileType] = match;
    if (!depotPath || !action) continue;
    const file: ParsedOpenedFile = {
      depotPath,
      action,
    };
    if (revision) file.revision = revision;
    if (change) file.changelist = change;
    if (fileType) file.fileType = fileType;
    out.push(file);
  }
  return out;
}

export type ParsedDescribeFile = {
  depotPath: string;
  revision: string;
  action: string;
};

export type ParsedDescribe = {
  id: string;
  author?: string;
  client?: string;
  description?: string;
  date?: string;
  status?: string;
  /** Files committed (submitted CL) or otherwise present under "Affected files ...". */
  files: ParsedDescribeFile[];
  /** Files under the "Shelved files ..." section (only present with `p4 describe -S`). */
  shelvedFiles: ParsedDescribeFile[];
};

type DescribeSection = "none" | "affected" | "shelved";

export function parseDescribeOutput(stdout: string): ParsedDescribe | null {
  const lines = stdout.split(/\r?\n/);
  let header: string | undefined;
  const descLines: string[] = [];
  const affectedLines: string[] = [];
  const shelvedLines: string[] = [];
  let section: DescribeSection = "none";
  for (const rawLine of lines) {
    if (rawLine.startsWith("Change ")) {
      header = rawLine;
      continue;
    }
    if (rawLine.startsWith("Affected files")) {
      section = "affected";
      continue;
    }
    if (rawLine.startsWith("Shelved files")) {
      section = "shelved";
      continue;
    }
    if (rawLine.startsWith("Differences ...") || rawLine.startsWith("Moved files ...")) {
      section = "none";
      continue;
    }
    if (section !== "none") {
      if (rawLine.startsWith("... ")) {
        if (section === "affected") affectedLines.push(rawLine);
        else shelvedLines.push(rawLine);
      }
      continue;
    }
    if (rawLine.startsWith("\t")) descLines.push(rawLine.slice(1));
  }
  if (!header) return null;
  const headerMatch = header.match(
    /^Change (\d+) by ([^@\s]+)@(\S+)\s+on\s+(\S+\s+\S+)(?:\s+\*([^*]+)\*)?/
  );
  if (!headerMatch) return null;
  const [, id, author, client, date, status] = headerMatch;

  const parseFiles = (rawLines: string[]): ParsedDescribeFile[] => {
    const out: ParsedDescribeFile[] = [];
    for (const fl of rawLines) {
      const m = fl.match(/^\.\.\. (\/\/[^#]+)#(\d+)\s+([\w/]+)/);
      if (!m) continue;
      const [, depotPath, revision, action] = m;
      if (!depotPath || !revision || !action) continue;
      out.push({ depotPath, revision, action });
    }
    return out;
  };

  if (!id) return null;
  const parsed: ParsedDescribe = {
    id,
    files: parseFiles(affectedLines),
    shelvedFiles: parseFiles(shelvedLines),
  };
  if (author) parsed.author = author;
  if (client) parsed.client = client;
  if (date) parsed.date = date;
  const desc = descLines.join("\n").trim();
  if (desc) parsed.description = desc;
  if (status) parsed.status = status;
  return parsed;
}

export function parseWhereOutput(stdout: string): string | null {
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tokens = splitQuoted(line);
    if (tokens.length < 3) continue;
    const localPath = tokens[tokens.length - 1];
    if (localPath) return localPath;
  }
  return null;
}

const P4_ACTION_STATUS: Record<string, FileChangeStatus> = {
  add: "added",
  edit: "modified",
  delete: "deleted",
  branch: "added",
  "move/add": "added",
  "move/delete": "deleted",
  integrate: "modified",
  archive: "modified",
  purge: "deleted",
};

export function actionToStatus(action: string | undefined): FileChangeStatus {
  if (!action) return "unknown";
  const key = action.toLowerCase();
  return P4_ACTION_STATUS[key] ?? "unknown";
}

export function isBinaryFileType(fileType: string | undefined): boolean {
  if (!fileType) return false;
  const t = fileType.toLowerCase();
  return t.includes("binary") || t.includes("ubinary") || t.includes("apple");
}
