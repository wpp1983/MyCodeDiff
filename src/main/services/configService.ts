import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AppConfig } from "@core/models/configModel";
import { defaultConfig, mergeConfig } from "@core/models/configModel";

function getUserDataPath(): string {
  try {
    // Lazy-require electron so this module stays loadable in tests.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require("electron") as typeof import("electron");
    if (electron?.app?.getPath) return electron.app.getPath("userData");
  } catch {
    // ignore - running outside electron
  }
  return process.cwd();
}

export type ConfigService = {
  get(): Promise<AppConfig>;
  update(patch: Partial<AppConfig>): Promise<AppConfig>;
};

export type ConfigServiceOptions = {
  filePath?: string;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, data: string) => Promise<void>;
};

export function createConfigService(options: ConfigServiceOptions = {}): ConfigService {
  let cache: AppConfig | null = null;

  const resolveFilePath = (): string => {
    if (options.filePath) return options.filePath;
    return join(getUserDataPath(), "mycodediff-config.json");
  };

  const readFile =
    options.readFile ?? (async (p) => fs.readFile(p, "utf8"));
  const writeFile =
    options.writeFile ??
    (async (p, d) => {
      await fs.mkdir(join(p, ".."), { recursive: true }).catch(() => undefined);
      await fs.writeFile(p, d, "utf8");
    });

  async function load(): Promise<AppConfig> {
    const path = resolveFilePath();
    try {
      const raw = await readFile(path);
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        return mergeConfig(defaultConfig, parsed as Partial<AppConfig>);
      }
    } catch {
      // fall through to default
    }
    return { ...defaultConfig };
  }

  async function get(): Promise<AppConfig> {
    if (cache) return { ...cache };
    cache = await load();
    return { ...cache };
  }

  async function update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await get();
    const next = mergeConfig(current, patch);
    cache = next;
    const path = resolveFilePath();
    await writeFile(path, JSON.stringify(next, null, 2));
    return { ...next };
  }

  return { get, update };
}
