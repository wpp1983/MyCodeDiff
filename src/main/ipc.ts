import type { IpcMain } from "electron";
import { createChangeService } from "./services/changeService";
import { createP4Service } from "./services/p4Service";
import { createConfigService } from "./services/configService";
import type {
  ListHistoryChangesInput,
  LoadChangelistInput,
  LoadFileContentPairInput,
  MyCodeDiffIpcChannel,
} from "@core/ipc/contract";
import type { AppConfig } from "@core/models/configModel";

export function registerIpcHandlers(ipcMain: IpcMain): void {
  const config = createConfigService();
  let cachedClientOverride: string | undefined;
  void config.get().then((c) => {
    cachedClientOverride = c.defaultClient || undefined;
  });
  const p4 = createP4Service({
    getClientOverride: () => cachedClientOverride,
  });
  const change = createChangeService({ p4 });

  const origUpdate = config.update.bind(config);
  config.update = async (patch) => {
    const next = await origUpdate(patch);
    cachedClientOverride = next.defaultClient || undefined;
    return next;
  };

  const channels: Record<MyCodeDiffIpcChannel, (...args: any[]) => Promise<unknown>> = {
    "mycodediff:getP4Environment": () => p4.getEnvironment(),
    "mycodediff:listPendingChanges": () => change.listPendingChanges(),
    "mycodediff:listHistoryChanges": (_e, input: ListHistoryChangesInput) =>
      change.listHistoryChanges(input),
    "mycodediff:listShelvedChanges": () => change.listShelvedChanges(),
    "mycodediff:loadChangelist": (_e, input: LoadChangelistInput) =>
      change.loadChangelist(input),
    "mycodediff:loadFileContentPair": (_e, input: LoadFileContentPairInput) =>
      change.loadFileContentPair(input),
    "mycodediff:getConfig": () => config.get(),
    "mycodediff:updateConfig": (_e, patch: Partial<AppConfig>) => config.update(patch),
  };

  for (const [channel, handler] of Object.entries(channels)) {
    ipcMain.handle(channel, handler as (...args: any[]) => Promise<unknown>);
  }
}
