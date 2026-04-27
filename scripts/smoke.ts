import { createP4Service } from "../src/main/services/p4Service";
import { createChangeService } from "../src/main/services/changeService";

async function main(): Promise<void> {
  const p4 = createP4Service();
  const env = await p4.getEnvironment();
  console.log("[smoke] P4 environment:", JSON.stringify(env, null, 2));

  if (!env.available) {
    console.log("[smoke] P4 unavailable, exiting with success (smoke not blocked)");
    return;
  }

  const change = createChangeService({ p4 });
  try {
    const pending = await change.listPendingChanges();
    console.log(`[smoke] pending CLs: ${pending.length}`);
  } catch (err) {
    console.log("[smoke] pending failed:", (err as Error).message);
  }

  if (env.depotPaths[0]) {
    try {
      const history = await change.listHistoryChanges({ limit: 5 });
      console.log(`[smoke] history CLs: ${history.length}`);
    } catch (err) {
      console.log("[smoke] history failed:", (err as Error).message);
    }
  }
}

main().catch((err) => {
  console.error("[smoke] fatal:", err);
  process.exit(1);
});
