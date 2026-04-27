import { describe, expect, test } from "bun:test";
import { createConfigService } from "../src/main/services/configService";
import { defaultConfig } from "../src/core/models/configModel";

function memFs() {
  const store = new Map<string, string>();
  return {
    readFile: async (p: string) => {
      const v = store.get(p);
      if (v === undefined) {
        const err: NodeJS.ErrnoException = new Error("ENOENT");
        err.code = "ENOENT";
        throw err;
      }
      return v;
    },
    writeFile: async (p: string, data: string) => {
      store.set(p, data);
    },
    store,
  };
}

describe("configService", () => {
  test("returns defaults when no config file", async () => {
    const fs = memFs();
    const svc = createConfigService({
      filePath: "/tmp/fake.json",
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });
    const cfg = await svc.get();
    expect(cfg).toEqual(defaultConfig);
  });

  test("persists updates and merges patches", async () => {
    const fs = memFs();
    const svc = createConfigService({
      filePath: "/tmp/fake.json",
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });
    const next = await svc.update({ defaultDiffView: "unified", hideUnchanged: true });
    expect(next.defaultDiffView).toBe("unified");
    expect(next.hideUnchanged).toBe(true);
    expect(fs.store.get("/tmp/fake.json")).toBeDefined();
  });

  test("falls back to defaults on invalid json", async () => {
    const fs = memFs();
    fs.store.set("/tmp/fake.json", "{not json");
    const svc = createConfigService({
      filePath: "/tmp/fake.json",
      readFile: fs.readFile,
      writeFile: fs.writeFile,
    });
    const cfg = await svc.get();
    expect(cfg).toEqual(defaultConfig);
  });
});
