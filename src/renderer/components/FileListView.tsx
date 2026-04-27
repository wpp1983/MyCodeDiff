import { useMemo } from "react";
import type { ChangeFile, FileChangeStatus } from "@core/models/changeModels";

export type FileListViewProps = {
  files: ChangeFile[];
  selectedDepotPath?: string | null;
  onSelect?: (file: ChangeFile) => void;
};

type Row = {
  file: ChangeFile;
  name: string;
  folder: string;
};

function splitDepotPath(depotPath: string): { name: string; folder: string } {
  const idx = depotPath.lastIndexOf("/");
  if (idx < 0) return { name: depotPath, folder: "" };
  return { name: depotPath.slice(idx + 1), folder: depotPath.slice(0, idx + 1) };
}

function iconKindFor(status: FileChangeStatus): {
  kind: "add" | "del" | "mod" | "move" | "confl" | "bin" | "unc";
  letter: string;
} {
  switch (status) {
    case "added":
      return { kind: "add", letter: "A" };
    case "deleted":
      return { kind: "del", letter: "D" };
    case "modified":
      return { kind: "mod", letter: "M" };
    case "renamed":
    case "moved":
      return { kind: "move", letter: "R" };
    case "binary":
      return { kind: "bin", letter: "B" };
    case "unchanged":
      return { kind: "unc", letter: "·" };
    default:
      return { kind: "mod", letter: "?" };
  }
}

export function FileListView(props: FileListViewProps) {
  const { files, selectedDepotPath, onSelect } = props;

  const rows = useMemo<Row[]>(() => {
    return files.map((file) => {
      const { name, folder } = splitDepotPath(file.depotPath);
      return { file, name, folder };
    });
  }, [files]);

  if (rows.length === 0) {
    return <div className="file-list-empty">(no files)</div>;
  }

  return (
    <div className="file-list" role="listbox">
      {rows.map(({ file, name, folder }) => {
        const selected = file.depotPath === selectedDepotPath;
        const ic = iconKindFor(file.status);
        const isConflict = (file.action ?? "").toLowerCase().includes("conflict");
        return (
          <div
            key={file.depotPath}
            role="option"
            aria-selected={selected}
            className={`file-row${selected ? " selected" : ""}`}
            onClick={() => onSelect?.(file)}
            title={file.depotPath}
          >
            <div className={`file-icon ${ic.kind}`}>{ic.letter}</div>
            <div className="file-path">
              <span className="dir">{folder}</span>
              <span className="basename">{name}</span>
            </div>
            {isConflict ? <span className="file-flag">conflict</span> : null}
            {file.action ? (
              <div className="diff-stat" aria-hidden>
                <span style={{ color: "var(--fg-3)" }}>{file.action}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
