import { describe, expect, test } from "bun:test";
import { registerIpcHandlers } from "../src/main/ipc";

type Handler = (...args: any[]) => Promise<unknown>;

function fakeIpcMain() {
  const handlers = new Map<string, Handler>();
  return {
    handle: (channel: string, fn: Handler) => {
      handlers.set(channel, fn);
    },
    invoke: async (channel: string, ...args: any[]) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`no handler for ${channel}`);
      return fn({} as any, ...args);
    },
    handlers,
  };
}

describe("registerIpcHandlers", () => {
  test("registers expected channels", () => {
    const ipc = fakeIpcMain();
    registerIpcHandlers(ipc as any);
    const channels = Array.from(ipc.handlers.keys()).sort();
    expect(channels).toEqual([
      "mycodediff:getConfig",
      "mycodediff:getP4Environment",
      "mycodediff:listHistoryChanges",
      "mycodediff:listPendingChanges",
      "mycodediff:listShelvedChanges",
      "mycodediff:loadChangelist",
      "mycodediff:loadFileContentPair",
      "mycodediff:submitChange",
      "mycodediff:updateConfig",
    ]);
  });
});
