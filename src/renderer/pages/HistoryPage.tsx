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
  const [clFilter, setClFilter] = useState("");
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
          <div className="pane-head">
            <span className="pane-title">History CLs</span>
            <div className="spacer" />
            <span className="badge">{store.state.items.length}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={refresh}
              disabled={store.state.loadingList}
              title="Refresh p4 data"
              aria-label="Refresh"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={
                  store.state.loadingList
                    ? { animation: "spin 1s linear infinite" }
                    : undefined
                }
              >
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <polyline points="21 4 21 10 15 10" />
              </svg>
            </button>
          </div>
          <div className="history-open-form">
            <input
              type="text"
              placeholder="Open CL by number…"
              value={clInput}
              onChange={(e) => setClInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openInput();
              }}
            />
            <button type="button" onClick={openInput}>
              Open
            </button>
          </div>
          <div className="pane-search-wrap">
            <input
              className="pane-search"
              placeholder="Filter changelists…"
              value={clFilter}
              onChange={(e) => setClFilter(e.target.value)}
            />
          </div>
          {store.state.listError ? (
            <div className="error-banner">{store.state.listError}</div>
          ) : null}
          <ChangelistList
            items={store.state.items}
            selectedId={store.state.selectedCl?.id ?? null}
            onSelect={(id) => void store.selectCl(id, "submitted")}
            filter={clFilter}
          />
        </section>
        <Splitter direction="horizontal" onResize={adjustTop} />
        <section className="left-bottom">
          <div className="pane-head">
            <span className="pane-title">
              Files{" "}
              {store.state.selectedCl ? (
                <span className="pane-head-sub">
                  in CL {store.state.selectedCl.id}
                </span>
              ) : null}
            </span>
            <div className="spacer" />
            {store.state.selectedCl ? (
              <span className="badge">
                {store.state.selectedCl.files.length}
              </span>
            ) : null}
          </div>
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
            <div className="file-list-empty">Select a CL to view files</div>
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
