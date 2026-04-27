import { useEffect, useState } from "react";
import { AppTabs } from "./components/AppTabs";
import { PendingPage } from "./pages/PendingPage";
import { HistoryPage } from "./pages/HistoryPage";
import { StatusBar } from "./components/StatusBar";
import type { AppConfig } from "@core/models/configModel";
import { defaultConfig } from "@core/models/configModel";

type PageKey = "pending" | "history";

export function App() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [page, setPage] = useState<PageKey>(defaultConfig.defaultPage);
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
    </div>
  );
}
