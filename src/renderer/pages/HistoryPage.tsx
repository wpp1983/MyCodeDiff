import { useEffect, useMemo, useState } from "react";
import { ChangelistList } from "../components/ChangelistList";
import { DiffToolbar } from "../components/DiffToolbar";
import { PierreDiffView } from "../components/PierreDiffView";
import { FileListView } from "../components/FileListView";
import { Splitter } from "../components/Splitter";
import { filterFiles, useChangeStore } from "../state/changeStore";
import { usePaneSizes } from "../state/paneSizes";
import type { AppConfig } from "@core/models/configModel";
import type { FileChangeStatus } from "@core/models/changeModels";

export type HistoryPageProps = {
  config: AppConfig;
  onConfigChange: (next: AppConfig) => void;
};

export function HistoryPage(props: HistoryPageProps) {
  const api = window.mycodediff;
  const store = useChangeStore(api);
  const [statusFilter, setStatusFilter] = useState<Set<FileChangeStatus>>(
    () => new Set()
  );
  const [clInput, setClInput] = useState("");
  const { leftWidth, topHeight, adjustLeft, adjustTop } = usePaneSizes();

  const refresh = (): void => {
    if (!api) return;
    void store.loadList(() =>
      api.listHistoryChanges({ limit: props.config.historyLimit })
    );
  };

  useEffect(() => {
    refresh();
  }, [api, props.config.historyLimit]);

  const filteredFiles = useMemo(() => {
    if (!store.state.selectedCl) return [];
    return filterFiles(
      store.state.selectedCl.files,
      props.config.hideUnchanged,
      statusFilter
    );
  }, [store.state.selectedCl, props.config.hideUnchanged, statusFilter]);

  const updateConfig = async (patch: Partial<AppConfig>): Promise<void> => {
    if (!api) return;
    const next = await api.updateConfig(patch);
    props.onConfigChange(next);
  };

  const openInput = (): void => {
    const trimmed = clInput.trim();
    if (!trimmed) return;
    void store.selectCl(trimmed, "submitted");
  };

  return (
    <>
      <div className="left-pane" style={{ width: leftWidth }}>
        <section className="left-top" style={{ height: topHeight }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ margin: 0, flex: 1 }}>History CLs</h3>
            <button
              onClick={refresh}
              disabled={store.state.loadingList}
              title="Refresh p4 data"
            >
              {store.state.loadingList ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <div style={{ marginBottom: 8, display: "flex", gap: 4 }}>
            <input
              type="text"
              placeholder="CL number"
              value={clInput}
              onChange={(e) => setClInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openInput();
              }}
            />
            <button onClick={openInput}>Open</button>
          </div>
          {store.state.listError ? (
            <div className="error-banner">{store.state.listError}</div>
          ) : null}
          <ChangelistList
            items={store.state.items}
            selectedId={store.state.selectedCl?.id ?? null}
            onSelect={(id) => void store.selectCl(id, "submitted")}
          />
        </section>
        <Splitter direction="horizontal" onResize={adjustTop} />
        <section className="left-bottom">
          <h3>Files</h3>
          {store.state.changeError ? (
            <div className="error-banner">{store.state.changeError}</div>
          ) : null}
          {store.state.selectedCl ? (
            <FileListView
              files={filteredFiles}
              selectedDepotPath={store.state.selectedFile?.depotPath}
              onSelect={(f) => void store.selectFile(f)}
            />
          ) : (
            <div>Select a CL to view files</div>
          )}
        </section>
      </div>
      <Splitter direction="vertical" onResize={adjustLeft} />
      <div className="right-pane">
        <DiffToolbar
          config={props.config}
          onConfigChange={(p) => void updateConfig(p)}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
        {store.state.fileError ? (
          <div className="error-banner">{store.state.fileError}</div>
        ) : null}
        {store.state.largeFilePending ? (
          <div className="error-banner">
            Large file requires confirmation:{" "}
            {store.state.largeFilePending.depotPath}{" "}
            <button
              onClick={() =>
                store.state.selectedFile
                  ? void store.selectFile(store.state.selectedFile, true)
                  : undefined
              }
            >
              Load anyway
            </button>
          </div>
        ) : null}
        {store.state.pair ? (
          <PierreDiffView
            pair={store.state.pair}
            layout={props.config.defaultDiffView}
            showLineNumbers={props.config.showLineNumbers}
            ignoreWhitespace={props.config.ignoreWhitespace}
            contextLines={props.config.contextLines}
          />
        ) : (
          <div className="diff-empty">
            {store.state.loadingFile
              ? "Loading file..."
              : "Select a file to view the diff"}
          </div>
        )}
      </div>
    </>
  );
}
