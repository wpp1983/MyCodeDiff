import { useEffect, useState } from "react";
import type { P4Environment } from "@core/ipc/contract";

export function StatusBar() {
  const [env, setEnv] = useState<P4Environment | null>(null);

  useEffect(() => {
    const api = window.mycodediff;
    if (!api) return;
    void api.getP4Environment().then(setEnv).catch(() => setEnv(null));
  }, []);

  const ok = !!(env && env.available);

  return (
    <div className="status-bar">
      <div className="item">
        <span className={`conn-dot${ok ? "" : " err"}`} />
        <span className={ok ? "sync-ok" : "sync-err"}>
          {ok ? "Connected" : "Disconnected"}
        </span>
      </div>
      {ok ? (
        <>
          <div className="item">
            <span className="lbl">user</span>
            <span className="val">{env!.user ?? "?"}</span>
          </div>
          <div className="item">
            <span className="lbl">client</span>
            <span className="val">{env!.client ?? "?"}</span>
          </div>
          <div className="item">
            <span className="lbl">depot</span>
            <span className="val">{env!.depotPaths[0] ?? "(none)"}</span>
          </div>
        </>
      ) : (
        <div className="item">
          <span className="lbl">P4</span>
          <span className="val">
            {env?.errorCode ?? "unknown"}
            {env?.errorMessage ? ` — ${env.errorMessage.split("\n")[0]}` : ""}
          </span>
        </div>
      )}
      <div className="spacer" />
    </div>
  );
}
