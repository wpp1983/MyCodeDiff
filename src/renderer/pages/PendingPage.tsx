import { useEffect, useMemo, useState } from "react";
import { ChangelistList } from "../components/ChangelistList";
import { DiffToolbar } from "../components/DiffToolbar";
import { PierreDiffView } from "../components/PierreDiffView";
import { FileListView } from "../components/FileListView";
import { Splitter } from "../components/Splitter";
import { SubmitConfirmModal } from "../components/SubmitConfirmModal";
import { filterFiles, useChangeStore } from "../state/changeStore";
import { usePaneSizes } from "../state/paneSizes";
import type { AppConfig } from "@core/models/configModel";
import type { FileChangeStatus } from "@core/models/changeModels";

export type PendingPageProps = {
  config: AppConfig;
  onConfigChange: (next: AppConfig) => void;
};

export function PendingPage(props: PendingPageProps) {
  const api = window.mycodediff;
  const store = useChangeStore(api);
  const [statusFilter, setStatusFilter] = useState<Set<FileChangeStatus>>(
    () => new Set()
  );
  const [clFilter, setClFilter] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const { leftWidth, topHeight, adjustLeft, adjustTop } = usePaneSizes();

  const refresh = (): void => {
    if (!api) return;
    void store.loadList(() => api.listPendingChanges());
  };

  const selectedCl = store.state.selectedCl;
  const shelvedCount = useMemo(
    () => selectedCl?.files.filter((f) => f.shelved).length ?? 0,
    [selectedCl]
  );
  const openedCount = useMemo(
    () => selectedCl?.files.filter((f) => !f.shelved).length ?? 0,
    [selectedCl]
  );
  const canSubmit =
    !!selectedCl &&
    selectedCl.kind === "pending" &&
    selectedCl.id !== "default" &&
    openedCount > 0 &&
    shelvedCount === 0;
  const submitDisabledReason = !selectedCl
    ? "Select a numbered pending CL to submit"
    : selectedCl.id === "default"
      ? "Default CL cannot be submitted — move files into a numbered CL first"
      : openedCount === 0
        ? "CL has no opened files to submit"
        : shelvedCount > 0
          ? "CL contains shelved files — unshelve them before submitting"
          : "";

  const onSubmitConfirmed = async (): Promise<void> => {
    if (!api || !selectedCl) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.submitChange({ changelistId: selectedCl.id });
      setSubmitOpen(false);
      setSubmitNotice(`Submitted as CL ${res.submittedChangeId}`);
      refresh();
    } catch (err) {
      setSubmitError(formatSubmitError(err));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [api]);

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

  return (
    <>
      <div className="left-pane" style={{ width: leftWidth }}>
        <section className="left-top" style={{ height: topHeight }}>
          <div className="pane-head">
            <span className="pane-title">Pending CLs</span>
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
            onSelect={(id) => void store.selectCl(id, "pending")}
            filter={clFilter}
          />
        </section>
        <Splitter direction="horizontal" onResize={adjustTop} />
        <section className="left-bottom">
          <div className="pane-head">
            <span className="pane-title">
              Files{" "}
              {selectedCl ? (
                <span className="pane-head-sub">in CL {selectedCl.id}</span>
              ) : null}
            </span>
            <div className="spacer" />
            {selectedCl ? (
              <button
                type="button"
                className="icon-btn primary"
                onClick={() => {
                  setSubmitError(null);
                  setSubmitOpen(true);
                }}
                disabled={!canSubmit}
                title={canSubmit ? `Submit CL ${selectedCl.id}` : submitDisabledReason}
                aria-label="Submit changelist"
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
                >
                  <path d="M5 12l5 5L20 7" />
                </svg>
                <span className="btn-label" style={{ marginLeft: 4 }}>
                  Submit
                </span>
              </button>
            ) : null}
            {selectedCl ? (
              <span className="badge">{selectedCl.files.length}</span>
            ) : null}
          </div>
          {submitNotice ? (
            <div className="error-banner" style={{ borderColor: "var(--accent-line)" }}>
              {submitNotice}{" "}
              <button
                type="button"
                className="btn ghost"
                style={{ marginLeft: 8 }}
                onClick={() => setSubmitNotice(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {store.state.changeError ? (
            <div className="error-banner">{store.state.changeError}</div>
          ) : null}
          {store.state.selectedCl ? (
            <FileListView
              files={filteredFiles}
              selectedFile={store.state.selectedFile}
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
      <SubmitConfirmModal
        open={submitOpen && !!selectedCl}
        cl={selectedCl}
        openedCount={openedCount}
        submitting={submitting}
        error={submitError}
        onConfirm={() => void onSubmitConfirmed()}
        onCancel={() => {
          if (submitting) return;
          setSubmitOpen(false);
          setSubmitError(null);
        }}
      />
    </>
  );
}

function formatSubmitError(err: unknown): string {
  if (!err) return "Submit failed";
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
