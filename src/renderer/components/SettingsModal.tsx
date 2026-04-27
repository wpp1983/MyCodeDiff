import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppConfig } from "@core/models/configModel";
import type { P4Environment } from "@core/ipc/contract";
import { withCJKFallback } from "../App";
import type { FontDetectMessage } from "../workers/fontDetect.worker";

export type SettingsModalProps = {
  open: boolean;
  onClose: () => void;
  config: AppConfig;
  onConfigChange: (next: AppConfig) => void;
};

type PaneKey = "diff" | "appearance" | "keys" | "connection" | "advanced" | "about";

type FontOption = { label: string; value: string };

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

const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 32;
const DEFAULT_FONT_SIZE = 13;

function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(n)));
}

function quoteFamily(name: string): string {
  return `"${name.replace(/"/g, '\\"')}"`;
}

type LoadState = "idle" | "loading" | "ready" | "denied" | "unsupported";

const NAV: Array<{ key: PaneKey; section: string; label: string; icon: ReactNode }> = [
  {
    key: "diff",
    section: "Workspace",
    label: "Diff View",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="8" height="16" rx="1" />
        <rect x="13" y="4" width="8" height="16" rx="1" />
      </svg>
    ),
  },
  {
    key: "appearance",
    section: "Workspace",
    label: "Appearance",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" />
      </svg>
    ),
  },
  {
    key: "keys",
    section: "Workspace",
    label: "Keyboard",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 16h10" />
      </svg>
    ),
  },
  {
    key: "connection",
    section: "Perforce",
    label: "Connection",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 17H7A5 5 0 0 1 7 7h2" />
        <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
    ),
  },
  {
    key: "advanced",
    section: "Perforce",
    label: "Advanced",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20l9-9-9-9-9 9 9 9z" />
        <path d="M12 11v6" />
        <path d="M9 14h6" />
      </svg>
    ),
  },
  {
    key: "about",
    section: "App",
    label: "About",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01" />
        <path d="M11 12h1v4h1" />
      </svg>
    ),
  },
];

export function SettingsModal(props: SettingsModalProps) {
  const { open, onClose, config, onConfigChange } = props;

  const [activePane, setActivePane] = useState<PaneKey>("diff");
  const [snapshot, setSnapshot] = useState<AppConfig | null>(null);

  // Font detection state
  const [systemFonts, setSystemFonts] = useState<FontOption[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [monoOnly, setMonoOnly] = useState(true);
  const [monoFlags, setMonoFlags] = useState<Map<string, boolean>>(new Map());
  const [monoProgress, setMonoProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const workerRef = useRef<Worker | null>(null);
  const triggeredRef = useRef(false);

  // P4 env for connection pane
  const [env, setEnv] = useState<P4Environment | null>(null);

  // Take a snapshot when opened so Cancel can revert.
  useEffect(() => {
    if (open) {
      setSnapshot({ ...config });
      setActivePane("diff");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Esc to close, Cmd/Ctrl+, to toggle (consumed by parent only when closed).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, snapshot]);

  // Fetch P4 env when Connection pane is active.
  useEffect(() => {
    if (!open || activePane !== "connection") return;
    const api = window.mycodediff;
    if (!api) return;
    void api
      .getP4Environment()
      .then(setEnv)
      .catch(() => setEnv(null));
  }, [open, activePane]);

  // Cleanup worker on unmount or close.
  useEffect(() => {
    if (open) return;
    workerRef.current?.terminate();
    workerRef.current = null;
    triggeredRef.current = false;
    setLoadState("idle");
    setSystemFonts([]);
    setMonoFlags(new Map());
    setMonoProgress(null);
  }, [open]);
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const startMonoWorker = (families: string[]): void => {
    workerRef.current?.terminate();
    workerRef.current = null;
    if (families.length === 0) {
      setMonoFlags(new Map());
      setMonoProgress(null);
      return;
    }
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../workers/fontDetect.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch {
      setMonoProgress(null);
      return;
    }
    workerRef.current = worker;
    setMonoProgress({ done: 0, total: families.length });
    worker.onmessage = (e: MessageEvent<FontDetectMessage>): void => {
      const m = e.data;
      if (m.type === "progress") {
        setMonoFlags(new Map(m.flags));
        setMonoProgress({ done: m.done, total: families.length });
      } else if (m.type === "done") {
        setMonoFlags(new Map(m.flags));
        setMonoProgress(null);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      } else if (m.type === "error") {
        setMonoProgress(null);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    };
    worker.onerror = (): void => {
      setMonoProgress(null);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    worker.postMessage({ type: "detect", families });
  };

  const triggerLoad = (): void => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    const w = window as unknown as {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>;
    };
    if (typeof w.queryLocalFonts !== "function") {
      setLoadState("unsupported");
      return;
    }
    setLoadState("loading");
    w.queryLocalFonts()
      .then((fonts) => {
        const families = Array.from(new Set(fonts.map((f) => f.family))).sort((a, b) =>
          a.localeCompare(b)
        );
        const opts: FontOption[] = families.map((name) => ({
          label: name,
          value: `${quoteFamily(name)}, monospace`,
        }));
        setSystemFonts(opts);
        setLoadState("ready");
        startMonoWorker(families);
      })
      .catch(() => setLoadState("denied"));
  };

  const baseList: FontOption[] = useMemo(() => {
    if (loadState !== "ready") return FALLBACK_FONTS;
    if (!monoOnly) return systemFonts;
    return systemFonts.filter((f) => monoFlags.get(f.label));
  }, [loadState, monoOnly, systemFonts, monoFlags]);

  const fontOptions: FontOption[] = useMemo(() => {
    const list = [DEFAULT_OPTION, ...baseList];
    if (
      config.diffFontFamily.trim() &&
      !list.some((p) => p.value === config.diffFontFamily)
    ) {
      list.push({
        label: `Custom: ${config.diffFontFamily}`,
        value: config.diffFontFamily,
      });
    }
    return list;
  }, [baseList, config.diffFontFamily]);

  // Auto-save: every patch goes to disk; UI reflects new config immediately.
  const patch = async (p: Partial<AppConfig>): Promise<void> => {
    const api = window.mycodediff;
    if (!api) return;
    const next = await api.updateConfig(p);
    onConfigChange(next);
  };

  const cancel = (): void => {
    if (snapshot) {
      void patch(snapshot);
    }
    onClose();
  };

  const reset = (): void => {
    void patch({
      diffFontFamily: "",
      diffFontSize: DEFAULT_FONT_SIZE,
      defaultDiffView: "side-by-side",
      ignoreWhitespace: true,
      hideUnchanged: false,
      showLineNumbers: true,
      contextLines: 3,
      theme: "system",
    });
  };

  if (!open) return null;

  const grouped: Array<{ section: string; items: typeof NAV }> = [];
  for (const item of NAV) {
    const last = grouped[grouped.length - 1];
    if (last && last.section === item.section) last.items.push(item);
    else grouped.push({ section: item.section, items: [item] });
  }

  const fontStatus =
    loadState === "idle"
      ? "Click the dropdown to load installed fonts"
      : loadState === "loading"
        ? "Loading installed fonts…"
        : loadState === "ready"
          ? monoProgress
            ? `Detecting monospace… ${monoProgress.done}/${monoProgress.total}`
            : `${baseList.length} ${monoOnly ? "monospace" : "system"} fonts available`
          : loadState === "denied"
            ? "Local Font Access denied; showing fallback list"
            : "Local Font Access not supported; showing fallback list";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <div className="modal" role="dialog" aria-labelledby="settings-title">
        <div className="modal-header">
          <h2 id="settings-title">Settings</h2>
          <div className="spacer" />
          <button className="modal-close" onClick={cancel} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="modal-nav">
          {grouped.map((g) => (
            <div key={g.section}>
              <div className="nav-section">{g.section}</div>
              {g.items.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  className={`nav-item${activePane === it.key ? " active" : ""}`}
                  onClick={() => setActivePane(it.key)}
                >
                  {it.icon}
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="modal-body">
          {activePane === "diff" ? (
            <DiffViewPane
              config={config}
              fontOptions={fontOptions}
              fontStatus={fontStatus}
              loading={loadState === "loading"}
              monoOnly={monoOnly}
              onMonoOnlyChange={(next) => {
                setMonoOnly(next);
                if (next) triggerLoad();
              }}
              onSelectFocus={triggerLoad}
              patch={patch}
            />
          ) : null}
          {activePane === "appearance" ? (
            <AppearancePane config={config} patch={patch} />
          ) : null}
          {activePane === "keys" ? <KeyboardPane /> : null}
          {activePane === "connection" ? <ConnectionPane env={env} /> : null}
          {activePane === "advanced" ? (
            <AdvancedPane config={config} patch={patch} />
          ) : null}
          {activePane === "about" ? <AboutPane /> : null}
        </div>

        <div className="modal-footer">
          <div className="meta">
            <span className="meta-dot" />
            <span>Changes saved automatically</span>
          </div>
          <div className="spacer" />
          <button className="btn ghost" onClick={reset} type="button">
            Reset to defaults
          </button>
          <button className="btn" onClick={cancel} type="button">
            Cancel
          </button>
          <button className="btn primary" onClick={onClose} type="button">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sections ---------------- */

function DiffViewPane(props: {
  config: AppConfig;
  fontOptions: FontOption[];
  fontStatus: string;
  loading: boolean;
  monoOnly: boolean;
  onMonoOnlyChange: (next: boolean) => void;
  onSelectFocus: () => void;
  patch: (p: Partial<AppConfig>) => Promise<void>;
}) {
  const { config, fontOptions, fontStatus, loading, monoOnly, patch } = props;
  const [sizeDraft, setSizeDraft] = useState<string>(String(config.diffFontSize));

  useEffect(() => {
    setSizeDraft(String(config.diffFontSize));
  }, [config.diffFontSize]);

  const commitSize = (raw: number): void => {
    const next = clampFontSize(raw);
    setSizeDraft(String(next));
    if (next !== config.diffFontSize) void patch({ diffFontSize: next });
  };

  const previewFont = config.diffFontFamily
    ? withCJKFallback(config.diffFontFamily)
    : "var(--app-font-family, ui-monospace, monospace)";

  return (
    <section>
      <h3>Diff View</h3>
      <p className="section-desc">Customize how code differences are displayed.</p>

      <div className="field">
        <div className="field-label">
          Font family
          <span className="hint">Used in the diff viewer</span>
        </div>
        <div className="field-control">
          <div className="field-row">
            <select
              className="select input-w-md mono"
              value={config.diffFontFamily}
              onChange={(e) => void patch({ diffFontFamily: e.target.value })}
              onMouseDown={props.onSelectFocus}
              onFocus={props.onSelectFocus}
              onKeyDown={props.onSelectFocus}
            >
              {fontOptions.map((p) => (
                <option key={p.label} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="switch">
              <input
                type="checkbox"
                checked={monoOnly}
                disabled={loading}
                onChange={(e) => props.onMonoOnlyChange(e.target.checked)}
              />
              <span className="track" />
              <span>Monospace only</span>
            </label>
          </div>
          <div className="input-suffix" style={{ marginTop: 6 }}>
            {fontStatus}
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Font size
          <span className="hint">Body & gutter share this size</span>
        </div>
        <div className="field-control">
          <div className="field-row">
            <div className="stepper">
              <button
                type="button"
                onClick={() => commitSize(config.diffFontSize - 1)}
                disabled={config.diffFontSize <= MIN_FONT_SIZE}
                aria-label="Decrease font size"
              >
                −
              </button>
              <div className="div" />
              <input
                type="number"
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={sizeDraft}
                onChange={(e) => setSizeDraft(e.target.value)}
                onBlur={() => commitSize(Number(sizeDraft))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              <div className="div" />
              <button
                type="button"
                onClick={() => commitSize(config.diffFontSize + 1)}
                disabled={config.diffFontSize >= MAX_FONT_SIZE}
                aria-label="Increase font size"
              >
                +
              </button>
            </div>
            <span className="input-suffix">px</span>
            <span className="input-suffix" style={{ marginLeft: 12 }}>
              Line height auto · 1.55×
            </span>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Default view
          <span className="hint">When opening a file</span>
        </div>
        <div className="field-control">
          <div className="radio-seg">
            <label>
              <input
                type="radio"
                name="default-view"
                checked={config.defaultDiffView === "side-by-side"}
                onChange={() => void patch({ defaultDiffView: "side-by-side" })}
              />
              <span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="8" height="16" rx="1" />
                  <rect x="13" y="4" width="8" height="16" rx="1" />
                </svg>
                Side-by-side
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="default-view"
                checked={config.defaultDiffView === "unified"}
                onChange={() => void patch({ defaultDiffView: "unified" })}
              />
              <span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="16" rx="1" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                </svg>
                Unified
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Behavior
          <span className="hint">Defaults that apply per file</span>
        </div>
        <div className="field-control" style={{ display: "grid", gap: 12 }}>
          <label className="switch">
            <input
              type="checkbox"
              checked={config.ignoreWhitespace}
              onChange={(e) => void patch({ ignoreWhitespace: e.target.checked })}
            />
            <span className="track" />
            <span>Ignore whitespace</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={config.hideUnchanged}
              onChange={(e) => void patch({ hideUnchanged: e.target.checked })}
            />
            <span className="track" />
            <span>Hide unchanged</span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={config.showLineNumbers}
              onChange={(e) => void patch({ showLineNumbers: e.target.checked })}
            />
            <span className="track" />
            <span>Show line numbers</span>
          </label>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Preview
          <span className="hint">Live sample with current settings</span>
        </div>
        <div className="field-control">
          <div
            className="preview-card"
            style={
              {
                ["--prev-font" as never]: previewFont,
                ["--prev-size" as never]: `${config.diffFontSize}px`,
              } as React.CSSProperties
            }
          >
            <div className="ph">
              <span className="ph-dot" />
              router.ts · diff
            </div>
            <div className="pc">
              {`  function hello(name: string) {\n`}
              <span className="del">{`-   return "Hi " + name + "!";`}</span>
              {`\n`}
              <span className="add">{"+   return `Hello, ${name}!`;"}</span>
              {`\n    // 中文混排示例：你好，世界！代码评审\n  }`}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AppearancePane(props: {
  config: AppConfig;
  patch: (p: Partial<AppConfig>) => Promise<void>;
}) {
  const { config, patch } = props;
  return (
    <section>
      <h3>Appearance</h3>
      <p className="section-desc">Theme settings for the whole app.</p>

      <div className="field">
        <div className="field-label">Theme</div>
        <div className="field-control">
          <div className="radio-seg">
            <label>
              <input
                type="radio"
                name="theme"
                checked={config.theme === "light"}
                onChange={() => void patch({ theme: "light" })}
              />
              <span>☀ Light</span>
            </label>
            <label>
              <input
                type="radio"
                name="theme"
                checked={config.theme === "dark"}
                onChange={() => void patch({ theme: "dark" })}
              />
              <span>☾ Dark</span>
            </label>
            <label>
              <input
                type="radio"
                name="theme"
                checked={config.theme === "system"}
                onChange={() => void patch({ theme: "system" })}
              />
              <span>⚙ System</span>
            </label>
          </div>
          <div className="input-suffix" style={{ marginTop: 8 }}>
            Currently the app renders a single dark palette; light/system are stored but
            not yet switched at runtime.
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Accent
          <span className="hint">Visual preview only</span>
        </div>
        <div className="field-control">
          <div className="swatch-group">
            <div
              className="color-swatch active"
              style={{ background: "oklch(72% 0.13 185)", color: "oklch(72% 0.13 185)" }}
            />
            <div
              className="color-swatch"
              style={{ background: "oklch(70% 0.16 220)", color: "oklch(70% 0.16 220)" }}
            />
            <div
              className="color-swatch"
              style={{ background: "oklch(72% 0.16 295)", color: "oklch(72% 0.16 295)" }}
            />
            <div
              className="color-swatch"
              style={{ background: "oklch(72% 0.16 150)", color: "oklch(72% 0.16 150)" }}
            />
            <div
              className="color-swatch"
              style={{ background: "oklch(75% 0.14 60)", color: "oklch(75% 0.14 60)" }}
            />
            <div
              className="color-swatch"
              style={{ background: "oklch(70% 0.18 25)", color: "oklch(70% 0.18 25)" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

const KEYS: Array<{ label: string; keys: string }> = [
  { label: "Filter changelists", keys: "Ctrl+F" },
  { label: "Next file", keys: "J" },
  { label: "Previous file", keys: "K" },
  { label: "Open settings", keys: "Ctrl+," },
  { label: "Close dialog", keys: "Esc" },
];

function KeyboardPane() {
  return (
    <section>
      <h3>Keyboard shortcuts</h3>
      <p className="section-desc">Built-in shortcuts (rebinding not yet supported).</p>
      <div className="kbd-list">
        {KEYS.map((k) => (
          <div className="kbd-row" key={k.label}>
            <span className="lbl">{k.label}</span>
            <span className="kbd">{k.keys}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConnectionPane(props: { env: P4Environment | null }) {
  const { env } = props;
  const available = env?.available ?? false;
  return (
    <section>
      <h3>Perforce connection</h3>
      <p className="section-desc">
        Read-only. Server identity comes from the system <code>p4</code> environment
        (P4PORT / P4USER / P4CLIENT). Override the workspace from the toolbar.
      </p>
      <div className="field">
        <div className="field-label">Server</div>
        <div className="field-control">
          <input
            className="input input-w-md mono"
            readOnly
            value={env?.port ?? (available ? "(unset)" : "—")}
          />
        </div>
      </div>
      <div className="field">
        <div className="field-label">User</div>
        <div className="field-control">
          <input
            className="input input-w-md mono"
            readOnly
            value={env?.user ?? "—"}
          />
        </div>
      </div>
      <div className="field">
        <div className="field-label">Workspace</div>
        <div className="field-control">
          <input
            className="input input-w-md mono"
            readOnly
            value={env?.client ?? "—"}
          />
        </div>
      </div>
      <div className="field">
        <div className="field-label">Status</div>
        <div className="field-control">
          <span
            className="kbd"
            style={{
              borderColor: available ? "var(--accent-line)" : "var(--deleted-line)",
              color: available ? "var(--accent-strong)" : "var(--deleted)",
              background: available ? "var(--accent-soft)" : "var(--deleted-soft)",
            }}
          >
            {available ? "Connected" : env?.errorCode ?? "unknown"}
          </span>
          {!available && env?.errorMessage ? (
            <div className="input-suffix" style={{ marginTop: 8 }}>
              {env.errorMessage.split("\n")[0]}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdvancedPane(props: {
  config: AppConfig;
  patch: (p: Partial<AppConfig>) => Promise<void>;
}) {
  const { config, patch } = props;
  const [ctxDraft, setCtxDraft] = useState(String(config.contextLines));
  const [maxKbDraft, setMaxKbDraft] = useState(
    String(Math.max(1, Math.round(config.largeFileThresholdBytes / 1024)))
  );
  const [historyDraft, setHistoryDraft] = useState(String(config.historyLimit));

  useEffect(() => setCtxDraft(String(config.contextLines)), [config.contextLines]);
  useEffect(
    () => setMaxKbDraft(String(Math.max(1, Math.round(config.largeFileThresholdBytes / 1024)))),
    [config.largeFileThresholdBytes]
  );
  useEffect(() => setHistoryDraft(String(config.historyLimit)), [config.historyLimit]);

  const commitCtx = (raw: number): void => {
    const v = Math.max(0, Math.min(50, Math.round(Number.isFinite(raw) ? raw : 3)));
    setCtxDraft(String(v));
    if (v !== config.contextLines) void patch({ contextLines: v });
  };
  const commitMaxKb = (raw: number): void => {
    const v = Math.max(8, Math.min(1024 * 1024, Math.round(Number.isFinite(raw) ? raw : 2048)));
    setMaxKbDraft(String(v));
    const bytes = v * 1024;
    if (bytes !== config.largeFileThresholdBytes)
      void patch({ largeFileThresholdBytes: bytes });
  };
  const commitHistory = (raw: number): void => {
    const v = Math.max(1, Math.min(1000, Math.round(Number.isFinite(raw) ? raw : 50)));
    setHistoryDraft(String(v));
    if (v !== config.historyLimit) void patch({ historyLimit: v });
  };

  return (
    <section>
      <h3>Advanced</h3>
      <p className="section-desc">For power users. Changes apply immediately.</p>

      <div className="field">
        <div className="field-label">
          Diff context lines
          <span className="hint">Lines around each hunk</span>
        </div>
        <div className="field-control">
          <div className="stepper">
            <button
              type="button"
              onClick={() => commitCtx(config.contextLines - 1)}
              disabled={config.contextLines <= 0}
            >
              −
            </button>
            <div className="div" />
            <input
              type="number"
              value={ctxDraft}
              onChange={(e) => setCtxDraft(e.target.value)}
              onBlur={() => commitCtx(Number(ctxDraft))}
            />
            <div className="div" />
            <button
              type="button"
              onClick={() => commitCtx(config.contextLines + 1)}
              disabled={config.contextLines >= 50}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          Max file size
          <span className="hint">Files above this require confirmation</span>
        </div>
        <div className="field-control">
          <div className="field-row">
            <input
              className="input input-w-sm mono"
              value={maxKbDraft}
              onChange={(e) => setMaxKbDraft(e.target.value)}
              onBlur={() => commitMaxKb(Number(maxKbDraft))}
            />
            <span className="input-suffix">KB</span>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">
          History limit
          <span className="hint">Recent submitted CLs to fetch</span>
        </div>
        <div className="field-control">
          <div className="field-row">
            <input
              className="input input-w-sm mono"
              value={historyDraft}
              onChange={(e) => setHistoryDraft(e.target.value)}
              onBlur={() => commitHistory(Number(historyDraft))}
            />
            <span className="input-suffix">CLs</span>
          </div>
        </div>
      </div>

      <div className="field">
        <div className="field-label">p4 path</div>
        <div className="field-control">
          <input
            className="input input-w-md mono"
            value={config.p4Path}
            onChange={(e) => void patch({ p4Path: e.target.value })}
          />
        </div>
      </div>
    </section>
  );
}

function AboutPane() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const electron = ua.match(/Electron\/([\d.]+)/)?.[1];
  const chrome = ua.match(/Chrome\/([\d.]+)/)?.[1];
  return (
    <section>
      <h3>About MyCodeDiff</h3>
      <p className="section-desc">A modern Perforce diff client for Windows.</p>
      <div className="about-grid">
        <div>
          <span className="k">name</span> MyCodeDiff
        </div>
        {electron ? (
          <div>
            <span className="k">electron</span> {electron}
          </div>
        ) : null}
        {chrome ? (
          <div>
            <span className="k">chromium</span> {chrome}
          </div>
        ) : null}
        <div>
          <span className="k">diff engine</span> @pierre/diffs
        </div>
      </div>
    </section>
  );
}
