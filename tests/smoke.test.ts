import { expect, test } from "bun:test";
import { defaultConfig, mergeConfig } from "../src/core/models/configModel";

test("smoke: defaults are sane", () => {
  expect(defaultConfig.defaultPage).toBe("pending");
  expect(defaultConfig.historyLimit).toBe(50);
  expect(defaultConfig.largeFileThresholdBytes).toBe(2 * 1024 * 1024);
  expect(defaultConfig.defaultClient).toBe("wp_dev_1");
});

test("mergeConfig ignores invalid patches", () => {
  const next = mergeConfig(defaultConfig, { defaultPage: "history" });
  expect(next.defaultPage).toBe("history");

  const invalid = mergeConfig(defaultConfig, {
    // @ts-expect-error intentionally bad value
    historyLimit: "abc",
  });
  expect(invalid.historyLimit).toBe(defaultConfig.historyLimit);
});
