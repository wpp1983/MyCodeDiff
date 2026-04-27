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
  return { name: depotPath.slice(idx + 1), folder: depotPath.slice(0, idx) };
}

function statusGlyph(status: FileChangeStatus): string {
  switch (status) {
    case "added":
      return "+";
    case "deleted":
      return "−";
    case "modified":
      return "✎";
    case "renamed":
    case "moved":
      return "→";
    case "binary":
      return "▣";
    case "unchanged":
      return "·";
    default:
      return "?";
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

  return (
    <div className="file-list">
      <table className="file-list-table">
        <thead>
          <tr>
            <th className="col-name">name</th>
            <th className="col-rev">Revision</th>
            <th className="col-action">Action</th>
            <th className="col-ftype">FileType</th>
            <th className="col-folder">In Folder</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="file-list-empty">
                (no files)
              </td>
            </tr>
          ) : (
            rows.map(({ file, name, folder }) => {
              const selected = file.depotPath === selectedDepotPath;
              const rev = file.newRev ?? file.oldRev ?? "";
              const action = file.action ?? "";
              const fileType = file.fileType ?? "";
              return (
                <tr
                  key={file.depotPath}
                  className={selected ? "selected" : ""}
                  onClick={() => onSelect?.(file)}
                  title={file.depotPath}
                >
                  <td className="col-name">
                    <span
                      className={`file-status-icon status-${file.status}`}
                      title={file.status}
                    >
                      {statusGlyph(file.status)}
                    </span>
                    <span className="file-name">{name}</span>
                  </td>
                  <td className="col-rev">{rev}</td>
                  <td className="col-action">{action}</td>
                  <td className="col-ftype">{fileType}</td>
                  <td className="col-folder">{folder}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
