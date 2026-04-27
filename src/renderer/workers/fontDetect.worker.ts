/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope;

type Request = {
  type: "detect";
  families: string[];
};

type ProgressMessage = {
  type: "progress";
  done: number;
  total: number;
  flags: Array<[string, boolean]>;
};

type DoneMessage = {
  type: "done";
  flags: Array<[string, boolean]>;
};

type ErrorMessage = {
  type: "error";
  reason: string;
};

export type FontDetectMessage = ProgressMessage | DoneMessage | ErrorMessage;

const CHUNK = 80;

function quote(family: string): string {
  return `"${family.replace(/"/g, '\\"')}"`;
}

self.onmessage = (e: MessageEvent<Request>): void => {
  const msg = e.data;
  if (!msg || msg.type !== "detect") return;
  const { families } = msg;

  let canvas: OffscreenCanvas;
  let ctx: OffscreenCanvasRenderingContext2D | null;
  try {
    canvas = new OffscreenCanvas(64, 32);
    ctx = canvas.getContext("2d");
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", reason } satisfies ErrorMessage);
    return;
  }
  if (!ctx) {
    self.postMessage({
      type: "error",
      reason: "OffscreenCanvas 2d context unavailable",
    } satisfies ErrorMessage);
    return;
  }

  const accumulated: Array<[string, boolean]> = [];
  let idx = 0;

  const step = (): void => {
    const end = Math.min(idx + CHUNK, families.length);
    for (let i = idx; i < end; i++) {
      const family = families[i];
      if (!family) continue;
      ctx!.font = `16px ${quote(family)}, monospace`;
      const wI = ctx!.measureText("iiiiiiiiii").width;
      const wM = ctx!.measureText("MMMMMMMMMM").width;
      accumulated.push([family, Math.abs(wI - wM) < 1]);
    }
    idx = end;
    if (idx < families.length) {
      // Drain a progress message so the UI can show partial state and yield
      // back to the worker's event loop.
      self.postMessage({
        type: "progress",
        done: idx,
        total: families.length,
        flags: accumulated.slice(),
      } satisfies ProgressMessage);
      setTimeout(step, 0);
    } else {
      self.postMessage({
        type: "done",
        flags: accumulated,
      } satisfies DoneMessage);
    }
  };

  step();
};

export {};
