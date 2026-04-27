import { useEffect, useMemo, useState } from "react";
import type { AppConfig } from "@core/models/configModel";

export type SettingsPageProps = {
  config: AppConfig;
  onConfigChange: (next: AppConfig) => void;
};

type FontOption = { label: string; value: string };

// Fallback list used when the Local Font Access API is unavailable.
const FALLBACK_FONTS: FontOption[] = [
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Cascadia Code", value: '"Cascadia Code", Consolas, monospace' },
  { label: "Cascadia Mono", value: '"Cascadia Mono", Consolas, monospace' },
  { label: "JetBrains Mono", value: '"JetBrains Mono", Consolas, monospace' },
  { label: "Fira Code", value: '"Fira Code", Consolas, monospace' },
  { label: "Source Code Pro", value: '"Source Code Pro", Consolas, monospace' },
  { label: "Courier New", value: '"Courier New", monospace' },
  { label: "Lucida Console", value: '"Lucida Console", monospace' },
  { label: "Menlo", value: "Menlo, monospace" },
  { label: "Monaco", value: "Monaco, monospace" },
  { label: "SF Mono", value: '"SF Mono", monospace' },
];

const DEFAULT_OPTION: FontOption = { label: "Default (Pierre)", value: "" };

function quoteFamily(name: string): string {
  // Always quote font family names; this is always valid CSS and avoids
  // edge cases with hyphens, digits, generic-keyword collisions, etc.
  return `"${name.replace(/"/g, '\\"')}"`;
}

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const DEFAULT_FONT_SIZE = 13;

function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(n)));
}

function isMonospaceFamily(family: string): boolean {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const test = quoteFamily(family);
  ctx.font = `16px ${test}, monospace`;
  const wI = ctx.measureText("iiiiiiiiii").width;
  const wM = ctx.measureText("MMMMMMMMMM").width;
  return Math.abs(wI - wM) < 1;
}

type LoadState = "idle" | "loading" | "ready" | "denied" | "unsupported";

export function SettingsPage(props: SettingsPageProps) {
  const { config, onConfigChange } = props;
  const [fontFamily, setFontFamily] = useState(config.diffFontFamily);
  const [fontSize, setFontSize] = useState<number>(config.diffFontSize);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [systemFonts, setSystemFonts] = useState<FontOption[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [monoOnly, setMonoOnly] = useState(true);

  useEffect(() => {
    setFontFamily(config.diffFontFamily);
    setFontSize(config.diffFontSize);
  }, [config.diffFontFamily, config.diffFontSize]);

  // Load installed fonts via Local Font Access API.
  useEffect(() => {
    const w = window as unknown as {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>;
    };
    if (typeof w.queryLocalFonts !== "function") {
      setLoadState("unsupported");
      return;
    }
    let cancelled = false;
    setLoadState("loading");
    w.queryLocalFonts()
      .then((fonts) => {
        if (cancelled) return;
        const families = Array.from(new Set(fonts.map((f) => f.family))).sort(
          (a, b) => a.localeCompare(b)
        );
        const opts: FontOption[] = families.map((name) => ({
          label: name,
          value: `${quoteFamily(name)}, monospace`,
        }));
        setSystemFonts(opts);
        setLoadState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setLoadState("denied");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty =
    fontFamily !== config.diffFontFamily || fontSize !== config.diffFontSize;

  const monoFlags = useMemo(() => {
    if (loadState !== "ready") return new Map<string, boolean>();
    const map = new Map<string, boolean>();
    for (const f of systemFonts) {
      map.set(f.label, isMonospaceFamily(f.label));
    }
    return map;
  }, [systemFonts, loadState]);

  const baseList: FontOption[] = useMemo(() => {
    if (loadState !== "ready") return FALLBACK_FONTS;
    return monoOnly
      ? systemFonts.filter((f) => monoFlags.get(f.label))
      : systemFonts;
  }, [loadState, monoOnly, systemFonts, monoFlags]);

  const options: FontOption[] = useMemo(() => {
    const list = [DEFAULT_OPTION, ...baseList];
    if (fontFamily.trim() && !list.some((p) => p.value === fontFamily)) {
      list.push({ label: `Custom: ${fontFamily}`, value: fontFamily });
    }
    return list;
  }, [baseList, fontFamily]);

  const save = async (): Promise<void> => {
    const api = window.mycodediff;
    if (!api) return;
    const cleanedSize = clampFontSize(fontSize);
    if (cleanedSize !== fontSize) setFontSize(cleanedSize);
    setSaving(true);
    try {
      const next = await api.updateConfig({
        diffFontFamily: fontFamily,
        diffFontSize: cleanedSize,
      });
      onConfigChange(next);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  };

  const reset = (): void => {
    setFontFamily("");
    setFontSize(DEFAULT_FONT_SIZE);
  };

  const statusText =
    loadState === "loading"
      ? "Loading installed fonts…"
      : loadState === "ready"
        ? `${baseList.length} ${monoOnly ? "monospace" : "system"} font${baseList.length === 1 ? "" : "s"}`
        : loadState === "denied"
          ? "Local Font Access denied; showing fallback list."
          : loadState === "unsupported"
            ? "Local Font Access not supported; showing fallback list."
            : "";

  return (
    <div className="settings-page">
      <div className="settings-section">
        <h2>Diff View</h2>

        <div className="settings-row">
          <label className="settings-label">Font Family</label>
          <div className="settings-control">
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value)}
              style={{ minWidth: 280 }}
            >
              {options.map((p) => (
                <option key={p.label} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                opacity: loadState === "ready" ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={monoOnly}
                disabled={loadState !== "ready"}
                onChange={(e) => setMonoOnly(e.target.checked)}
              />
              Monospace only
            </label>
          </div>
          <div className="settings-hint">{statusText}</div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Font Size</label>
          <div className="settings-control">
            <input
              type="number"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step={1}
              value={fontSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setFontSize(n);
              }}
              onBlur={() => setFontSize(clampFontSize(fontSize))}
              style={{ width: 80 }}
            />
            <span className="settings-hint">px</span>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-label">Preview</label>
          <pre
            className="settings-preview"
            style={{
              fontFamily: fontFamily || undefined,
              fontSize: `${fontSize}px`,
            }}
          >
{`function hello(name: string) {
  // The quick brown fox jumps over the lazy dog
  return \`Hello, \${name}!\`; // 0123456789
}`}
          </pre>
        </div>
      </div>

      <div className="settings-actions">
        <button type="button" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={reset} disabled={saving}>
          Reset to defaults
        </button>
        {savedAt && !dirty ? (
          <span className="settings-saved">Saved.</span>
        ) : null}
      </div>
    </div>
  );
}
