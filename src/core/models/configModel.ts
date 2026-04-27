export type AppConfig = {
  p4Path: string;
  defaultClient: string;
  defaultPage: "pending" | "history";
  defaultDiffView: "unified" | "side-by-side";
  historyLimit: number;
  contextLines: number;
  ignoreWhitespace: boolean;
  hideUnchanged: boolean;
  showLineNumbers: boolean;
  theme: "system" | "light" | "dark";
  largeFileThresholdBytes: number;
  largeChangeFileCountThreshold: number;
};

export const defaultConfig: AppConfig = {
  p4Path: "p4",
  defaultClient: "wp_dev_1",
  defaultPage: "pending",
  defaultDiffView: "side-by-side",
  historyLimit: 50,
  contextLines: 3,
  ignoreWhitespace: true,
  hideUnchanged: false,
  showLineNumbers: true,
  theme: "system",
  largeFileThresholdBytes: 2 * 1024 * 1024,
  largeChangeFileCountThreshold: 500,
};

export function mergeConfig(
  base: AppConfig,
  patch: Partial<AppConfig> | undefined | null
): AppConfig {
  if (!patch) return { ...base };
  const next: AppConfig = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    if (!(key in defaultConfig)) continue;
    const defaultValue = (defaultConfig as any)[key];
    if (typeof defaultValue !== typeof value) continue;
    (next as any)[key] = value;
  }
  return next;
}
