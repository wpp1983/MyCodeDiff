import { useMemo } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type { ChangeFile, FileChangeStatus } from "@core/models/changeModels";

export type PierreTreeViewProps = {
  files: ChangeFile[];
  selectedDepotPath?: string | null;
  onSelect?: (file: ChangeFile) => void;
};

function toTreePath(depotPath: string): string {
  if (depotPath.startsWith("//")) return depotPath.slice(2);
  return depotPath.replace(/^\/+/, "");
}

function statusLabel(status: FileChangeStatus): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "modified":
      return "M";
    case "unchanged":
      return "";
    default:
      return "?";
  }
}

export function PierreTreeView(props: PierreTreeViewProps) {
  const { files, selectedDepotPath, onSelect } = props;

  const { paths, fileByPath } = useMemo(() => {
    const paths: string[] = [];
    const fileByPath = new Map<string, ChangeFile>();
    for (const file of files) {
      const p = toTreePath(file.depotPath);
      if (!fileByPath.has(p)) paths.push(p);
      fileByPath.set(p, file);
    }
    return { paths, fileByPath };
  }, [files]);

  const initialSelectedPaths = useMemo<string[] | undefined>(() => {
    if (!selectedDepotPath) return undefined;
    return [toTreePath(selectedDepotPath)];
  }, [selectedDepotPath]);

  const result = useFileTree({
    paths,
    initialSelectedPaths,
    onSelectionChange: (event: any) => {
      const selected: string | undefined = event?.selectedPaths?.[0];
      if (!selected || !onSelect) return;
      const f = fileByPath.get(selected);
      if (f) onSelect(f);
    },
    renderRowDecoration: ({ row }: { row: any }) => {
      if (row.kind !== "file") return null;
      const f = fileByPath.get(row.path);
      if (!f) return null;
      const label = statusLabel(f.status);
      if (!label) return null;
      return { text: label, title: f.status };
    },
  } as any);

  return <FileTree model={result.model} />;
}
