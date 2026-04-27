import type { MyCodeDiffApi } from "@core/ipc/contract";

declare global {
  interface Window {
    mycodediff?: MyCodeDiffApi;
  }
}

export {};
