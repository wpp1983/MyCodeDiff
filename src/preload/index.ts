import { contextBridge, ipcRenderer } from "electron";
import type { MyCodeDiffApi } from "@core/ipc/contract";

const api: MyCodeDiffApi = {
  getP4Environment: () => ipcRenderer.invoke("mycodediff:getP4Environment"),
  listPendingChanges: () => ipcRenderer.invoke("mycodediff:listPendingChanges"),
  listHistoryChanges: (input) =>
    ipcRenderer.invoke("mycodediff:listHistoryChanges", input),
  listShelvedChanges: () => ipcRenderer.invoke("mycodediff:listShelvedChanges"),
  loadChangelist: (input) => ipcRenderer.invoke("mycodediff:loadChangelist", input),
  loadFileContentPair: (input) =>
    ipcRenderer.invoke("mycodediff:loadFileContentPair", input),
  submitChange: (input) => ipcRenderer.invoke("mycodediff:submitChange", input),
  getConfig: () => ipcRenderer.invoke("mycodediff:getConfig"),
  updateConfig: (patch) => ipcRenderer.invoke("mycodediff:updateConfig", patch),
};

contextBridge.exposeInMainWorld("mycodediff", api);
