import { describe, expect, test } from "bun:test";
import { createP4Service } from "../src/main/services/p4Service";
import { defaultConfig, mergeConfig } from "../src/core/models/configModel";
import type { P4CommandRunner } from "../src/core/p4/p4Types";

describe("AppConfig.defaultClient", () => {
  test("merges patch", () => {
    const next = mergeConfig(defaultConfig, { defaultClient: "wp_dev_1" });
    expect(next.defaultClient).toBe("wp_dev_1");
  });

  test("ignores non-string", () => {
    const bad = mergeConfig(defaultConfig, {
      // @ts-expect-error intentionally bad
      defaultClient: 42,
    });
    expect(bad.defaultClient).toBe(defaultConfig.defaultClient);
  });
});

describe("p4Service.getClientOverride", () => {
  test("runner still called with raw args; override is applied at spawn-time only", async () => {
    const calls: string[][] = [];
    const runner: P4CommandRunner = async (args) => {
      calls.push(args);
      return { stdout: "", stderr: "", exitCode: 0 };
    };
    const svc = createP4Service({
      runner,
      getClientOverride: () => "wp_override",
    });
    await svc.listPendingChanges("wp_override");
    expect(calls[0]).toEqual([
      "changes",
      "-s",
      "pending",
      "-l",
      "-c",
      "wp_override",
    ]);
  });
});
