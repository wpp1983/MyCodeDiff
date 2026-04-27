import { useEffect, useState } from "react";

export type AppPageKey = "pending" | "history";

export type AppTabsProps = {
  active: AppPageKey;
  onChange: (next: AppPageKey) => void;
  defaultClient: string;
  onDefaultClientChange: (next: string) => void | Promise<void>;
  effectiveClient?: string;
  settingsOpen?: boolean;
  onOpenSettings: () => void;
};

export function AppTabs(props: AppTabsProps) {
  const [draft, setDraft] = useState(props.defaultClient);

  useEffect(() => {
    setDraft(props.defaultClient);
  }, [props.defaultClient]);

  const commit = (): void => {
    const next = draft.trim();
    if (next === props.defaultClient) return;
    void props.onDefaultClientChange(next);
  };

  return (
    <div className="app-tabs">
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={props.active === "pending"}
          className={`tab${props.active === "pending" ? " active" : ""}`}
          onClick={() => props.onChange("pending")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Pending
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.active === "history"}
          className={`tab${props.active === "history" ? " active" : ""}`}
          onClick={() => props.onChange("history")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          History
        </button>
      </div>

      <div
        className="ws-picker"
        title="Workspace override (leave empty to use system P4CLIENT)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fg-2)" }}>
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 17l9 4 9-4" />
        </svg>
        <span className="label">Workspace</span>
        <input
          type="text"
          placeholder={props.effectiveClient ?? "(system default)"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setDraft(props.defaultClient);
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
        />
      </div>

      <div className="flex-spacer" />

      <div className="toolbar-actions">
        <button
          type="button"
          className={`icon-btn${props.settingsOpen ? " active" : ""}`}
          onClick={props.onOpenSettings}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
