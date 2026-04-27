import { useEffect, useState } from "react";
import { AppTabs } from "./components/AppTabs";
import { PendingPage } from "./pages/PendingPage";
import { HistoryPage } from "./pages/HistoryPage";
import { SettingsModal } from "./components/SettingsModal";
import { StatusBar } from "./components/StatusBar";
import type { AppConfig } from "@core/models/configModel";
import { defaultConfig } from "@core/models/configModel";

type PageKey = "pending" | "history";

// 英文等宽字体大多不含中文字形，浏览器会按字符级 fallback 到列表中下一个字体。
// 注意：CJK 字体必须插入到用户字体之后、generic family（monospace 等）之前，
// 否则部分浏览器在命中 generic 时会直接交给系统的 CJK 映射（Windows 上常落到 SimSun）。
const CJK_FALLBACK =
  '"Microsoft YaHei", "Microsoft JhengHei", "PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", "Noto Sans CJK SC"';

const GENERIC_FAMILY_RE = /,\s*(monospace|sans-serif|serif|cursive|fantasy|system-ui|ui-monospace|ui-sans-serif|ui-serif)\s*$/i;

export function withCJKFallback(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const m = trimmed.match(GENERIC_FAMILY_RE);
  if (m) {
    const head = trimmed.slice(0, m.index);
    const generic = m[1];
    return `${head}, ${CJK_FALLBACK}, ${generic}`;
  }
  return `${trimmed}, ${CJK_FALLBACK}`;
}

export function App() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [page, setPage] = useState<PageKey>(defaultConfig.defaultPage);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [effectiveClient, setEffectiveClient] = useState<string | undefined>();
  const [envReloadTick, setEnvReloadTick] = useState(0);

  useEffect(() => {
    const api = window.mycodediff;
    if (!api) return;
    void api.getConfig().then((c) => {
      setConfig(c);
      setPage(c.defaultPage);
    });
  }, []);

  useEffect(() => {
    const api = window.mycodediff;
    if (!api) return;
    void api
      .getP4Environment()
      .then((env) => setEffectiveClient(env.client))
      .catch(() => setEffectiveClient(undefined));
  }, [config.defaultClient, envReloadTick]);

  // Cmd/Ctrl+, opens Settings (matches the design's keyboard hint).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Apply diff font config as CSS variables consumed by @pierre/diffs.
  useEffect(() => {
    const root = document.documentElement;
    if (config.diffFontFamily) {
      const chain = withCJKFallback(config.diffFontFamily);
      root.style.setProperty("--diffs-font-family", chain);
      root.style.setProperty("--app-font-family", chain);
    } else {
      root.style.removeProperty("--diffs-font-family");
      root.style.removeProperty("--app-font-family");
    }
    if (config.diffFontSize && config.diffFontSize > 0) {
      root.style.setProperty("--diffs-font-size", `${config.diffFontSize}px`);
    } else {
      root.style.removeProperty("--diffs-font-size");
    }
  }, [config.diffFontFamily, config.diffFontSize]);

  const handleDefaultClientChange = async (next: string): Promise<void> => {
    const api = window.mycodediff;
    if (!api) return;
    const updated = await api.updateConfig({ defaultClient: next });
    setConfig(updated);
    setEnvReloadTick((n) => n + 1);
  };

  return (
    <div className="app-root">
      <AppTabs
        active={page}
        onChange={setPage}
        defaultClient={config.defaultClient}
        onDefaultClientChange={handleDefaultClientChange}
        effectiveClient={effectiveClient}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="app-body">
        {page === "pending" ? (
          <PendingPage
            key={`p-${config.defaultClient}`}
            config={config}
            onConfigChange={setConfig}
          />
        ) : (
          <HistoryPage
            key={`h-${config.defaultClient}`}
            config={config}
            onConfigChange={setConfig}
          />
        )}
      </div>
      <StatusBar key={`sb-${config.defaultClient}-${envReloadTick}`} />
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        config={config}
        onConfigChange={setConfig}
      />
    </div>
  );
}
