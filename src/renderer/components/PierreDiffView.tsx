import { useMemo } from "react";
import { FileDiff } from "@pierre/diffs/react";
import { parseDiffFromFile } from "@pierre/diffs";
import type { FileContentPair } from "@core/models/changeModels";

export type PierreDiffViewProps = {
  pair: FileContentPair;
  layout: "unified" | "side-by-side";
  showLineNumbers: boolean;
  ignoreWhitespace: boolean;
  contextLines: number;
};

function basename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (lastSlash < 0) return path;
  return path.slice(lastSlash + 1);
}

export function PierreDiffView(props: PierreDiffViewProps) {
  const { pair, layout, showLineNumbers, ignoreWhitespace, contextLines } = props;

  const fileDiff = useMemo(() => {
    const baseName = basename(pair.file.depotPath);
    // For xlsx, hint Pierre to use TSV highlighting on the normalized output.
    const name = pair.kind === "xlsx-sheets" ? `${baseName}.tsv` : baseName;
    const leftText = pair.leftText ?? "";
    const rightText = pair.rightText ?? "";
    try {
      return parseDiffFromFile(
        { name, contents: leftText },
        { name, contents: rightText },
        { context: contextLines, ignoreWhitespace }
      );
    } catch {
      return null;
    }
  }, [pair, contextLines, ignoreWhitespace]);

  if (!fileDiff) {
    return <div className="diff-empty">Unable to build diff.</div>;
  }

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={{
        diffStyle: layout === "unified" ? "unified" : "split",
        disableLineNumbers: !showLineNumbers,
      }}
    />
  );
}
