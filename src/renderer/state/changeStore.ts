import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeFile,
  ChangeKind,
  ChangelistListItem,
  ChangelistSummary,
  FileChangeStatus,
  FileContentPair,
} from "@core/models/changeModels";
import type { MyCodeDiffApi } from "@core/ipc/contract";
import { isAppErrorPayload } from "@core/models/errors";

export type ChangeStoreState = {
  items: ChangelistListItem[];
  selectedCl: ChangelistSummary | null;
  selectedFile: ChangeFile | null;
  pair: FileContentPair | null;
  listError: string | null;
  changeError: string | null;
  fileError: string | null;
  loadingList: boolean;
  loadingCl: boolean;
  loadingFile: boolean;
  largeFilePending: { depotPath: string; sizeBytes?: number } | null;
};

export type ChangeStoreApi = {
  state: ChangeStoreState;
  loadList(loader: () => Promise<ChangelistListItem[]>): Promise<void>;
  selectCl(id: string, kind: ChangeKind): Promise<void>;
  selectFile(file: ChangeFile, confirmLargeFile?: boolean): Promise<void>;
  clearLargeFile(): void;
};

const initialState: ChangeStoreState = {
  items: [],
  selectedCl: null,
  selectedFile: null,
  pair: null,
  listError: null,
  changeError: null,
  fileError: null,
  loadingList: false,
  loadingCl: false,
  loadingFile: false,
  largeFilePending: null,
};

export function useChangeStore(api: MyCodeDiffApi | undefined): ChangeStoreApi {
  const [state, setState] = useState<ChangeStoreState>(initialState);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const loadList = useCallback(
    async (loader: () => Promise<ChangelistListItem[]>) => {
      setState((s) => ({ ...s, loadingList: true, listError: null }));
      try {
        const items = await loader();
        setState((s) => ({ ...s, items, loadingList: false }));
      } catch (err) {
        setState((s) => ({
          ...s,
          loadingList: false,
          listError: formatError(err),
        }));
      }
    },
    []
  );

  const selectCl = useCallback(
    async (id: string, kind: ChangeKind) => {
      if (!api) return;
      setState((s) => ({
        ...s,
        loadingCl: true,
        changeError: null,
        selectedCl: null,
        selectedFile: null,
        pair: null,
      }));
      try {
        const summary = await api.loadChangelist({ id, kind });
        setState((s) => ({ ...s, loadingCl: false, selectedCl: summary }));
      } catch (err) {
        setState((s) => ({
          ...s,
          loadingCl: false,
          changeError: formatError(err),
        }));
      }
    },
    [api]
  );

  const selectFile = useCallback(
    async (file: ChangeFile, confirmLargeFile = false) => {
      if (!api) return;
      const current = latest.current.selectedCl;
      if (!current) return;
      setState((s) => ({
        ...s,
        selectedFile: file,
        loadingFile: true,
        fileError: null,
        pair: null,
        largeFilePending: null,
      }));
      try {
        // A pending CL may include shelved files alongside workspace-opened
        // files (P4V-style). Route shelved entries through the shelved kind so
        // the main process can use the `@=<CL>` print syntax.
        const effectiveKind: ChangeKind = file.shelved ? "shelved" : current.kind;
        const pair = await api.loadFileContentPair({
          changelistId: current.id,
          kind: effectiveKind,
          depotPath: file.depotPath,
          confirmLargeFile,
        });
        setState((s) => ({ ...s, loadingFile: false, pair }));
      } catch (err) {
        const payload = isAppErrorPayload((err as any)?.payload)
          ? (err as any).payload
          : null;
        if (
          payload?.code === "LARGE_FILE_REQUIRES_CONFIRMATION" ||
          /LARGE_FILE_REQUIRES_CONFIRMATION/.test(String(err))
        ) {
          setState((s) => ({
            ...s,
            loadingFile: false,
            largeFilePending: { depotPath: file.depotPath },
          }));
          return;
        }
        setState((s) => ({
          ...s,
          loadingFile: false,
          fileError: formatError(err),
        }));
      }
    },
    [api]
  );

  const clearLargeFile = useCallback(() => {
    setState((s) => ({ ...s, largeFilePending: null }));
  }, []);

  return { state, loadList, selectCl, selectFile, clearLargeFile };
}

export function filterFiles(
  files: ChangeFile[],
  hideUnchanged: boolean,
  statusFilter: Set<FileChangeStatus>
): ChangeFile[] {
  return files.filter((f) => {
    if (hideUnchanged && f.status === "unchanged") return false;
    if (statusFilter.size > 0 && !statusFilter.has(f.status)) return false;
    return true;
  });
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
