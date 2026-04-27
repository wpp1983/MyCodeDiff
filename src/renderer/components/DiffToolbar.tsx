import type { AppConfig } from "@core/models/configModel";
import type { FileChangeStatus } from "@core/models/changeModels";

export type DiffToolbarProps = {
  config: AppConfig;
  onConfigChange: (next: Partial<AppConfig>) => void;
  statusFilter: Set<FileChangeStatus>;
  onStatusFilterChange: (next: Set<FileChangeStatus>) => void;
};

const STATUS_OPTIONS: {
  key: FileChangeStatus;
  label: string;
  cls: "added" | "deleted" | "modified" | "unchanged";
}[] = [
  { key: "added", label: "Added", cls: "added" },
  { key: "deleted", label: "Deleted", cls: "deleted" },
  { key: "modified", label: "Modified", cls: "modified" },
  { key: "unchanged", label: "Unchanged", cls: "unchanged" },
];

function CheckMark() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6.5l2.5 2.5 4.5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DiffToolbar(props: DiffToolbarProps) {
  const { config, onConfigChange, statusFilter, onStatusFilterChange } = props;

  const isStatusOn = (s: FileChangeStatus): boolean => {
    return statusFilter.size === 0 || statusFilter.has(s);
  };

  const toggleStatus = (s: FileChangeStatus): void => {
    const next = new Set(statusFilter);
    // When the filter set is empty, all are "on" implicitly. Toggling means
    // turning a single one off — start from the full set first.
    if (next.size === 0) {
      for (const opt of STATUS_OPTIONS) next.add(opt.key);
    }
    if (next.has(s)) next.delete(s);
    else next.add(s);
    // If the user just turned everything back on, normalize to empty set.
    if (next.size === STATUS_OPTIONS.length) next.clear();
    onStatusFilterChange(next);
  };

  return (
    <div className="diff-toolbar">
      <div className="ctrl-group">
        <span className="ctrl-label">View</span>
        <div className="seg" role="group" aria-label="Diff layout">
          <button
            type="button"
            className={config.defaultDiffView === "side-by-side" ? "on" : ""}
            onClick={() => onConfigChange({ defaultDiffView: "side-by-side" })}
            aria-pressed={config.defaultDiffView === "side-by-side"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="8" height="16" rx="1" />
              <rect x="13" y="4" width="8" height="16" rx="1" />
            </svg>
            Side-by-side
          </button>
          <button
            type="button"
            className={config.defaultDiffView === "unified" ? "on" : ""}
            onClick={() => onConfigChange({ defaultDiffView: "unified" })}
            aria-pressed={config.defaultDiffView === "unified"}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="16" rx="1" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
            Unified
          </button>
        </div>
      </div>

      <div className="ctrl-group">
        <span className="ctrl-label">Show</span>
        {STATUS_OPTIONS.map((opt) => {
          const on = isStatusOn(opt.key);
          return (
            <label
              key={opt.key}
              className={`check-chip ${opt.cls}${on ? " on" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                toggleStatus(opt.key);
              }}
            >
              <input type="checkbox" checked={on} readOnly />
              <span className="dot" />
              {opt.label}
            </label>
          );
        })}
      </div>

      <div className="ctrl-group">
        <label
          className={`check-chip${config.ignoreWhitespace ? " on" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            onConfigChange({ ignoreWhitespace: !config.ignoreWhitespace });
          }}
        >
          <input type="checkbox" checked={config.ignoreWhitespace} readOnly />
          <span className="box">
            <CheckMark />
          </span>
          Ignore whitespace
        </label>
        <label
          className={`check-chip${config.hideUnchanged ? " on" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            onConfigChange({ hideUnchanged: !config.hideUnchanged });
          }}
        >
          <input type="checkbox" checked={config.hideUnchanged} readOnly />
          <span className="box">
            <CheckMark />
          </span>
          Hide unchanged
        </label>
      </div>
    </div>
  );
}
