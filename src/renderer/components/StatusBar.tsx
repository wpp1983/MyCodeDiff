import { useEffect, useState } from "react";
import type { P4Environment } from "@core/ipc/contract";

export function StatusBar() {
  const [env, setEnv] = useState<P4Environment | null>(null);

  useEffect(() => {
    const api = window.mycodediff;
    if (!api) return;
    void api.getP4Environment().then(setEnv).catch(() => setEnv(null));
  }, []);

  return (
    <div className="status-bar">
      {env && env.available ? (
        <>
          <span>user: {env.user ?? "?"}</span>
          <span>client: {env.client ?? "?"}</span>
          <span>depot: {env.depotPaths[0] ?? "(none)"}</span>
        </>
      ) : (
        <span>
          P4 status: {env?.errorCode ?? "unknown"}
          {env?.errorMessage ? ` (${env.errorMessage.split("\n")[0]})` : ""}
        </span>
      )}
    </div>
  );
}
