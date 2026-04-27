import type { AppConfig } from "@core/models/configModel";
import type { FileChangeStatus } from "@core/models/changeModels";

export type DiffToolbarProps = {
  config: AppConfig;
  onConfigChange: (next: Partial<AppConfig>) => void;
  statusFilter: Set<FileChangeStatus>;
  onStatusFilterChange: (next: Set<FileChangeStatus>) => void;
};

const STATUS_OPTIONS: FileChangeStatus[] = ["added", "deleted", "modified", "unchanged"];

export function DiffToolbar(props: DiffToolbarProps) {
  const { config, onConfigChange, statusFilter, onStatusFilterChange } = props;

  const toggleStatus = (s: FileChangeStatus): void => {
    const next = new Set(statusFilter);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    onStatusFilterChange(next);
  };

  return (
    <div className="diff-toolbar">
      <label>
        <input
          type="radio"
          name="diff-view"
          checked={config.defaultDiffView === "unified"}
          onChange={() => onConfigChange({ defaultDiffView: "unified" })}
        />
        Unified
      </label>
      <label>
        <input
          type="radio"
          name="diff-view"
          checked={config.defaultDiffView === "side-by-side"}
          onChange={() => onConfigChange({ defaultDiffView: "side-by-side" })}
        />
        Side by side
      </label>
      <span className="spacer" style={{ flex: 1 }} />
      <label>
        <input
          type="checkbox"
          checked={config.hideUnchanged}
          onChange={(e) => onConfigChange({ hideUnchanged: e.target.checked })}
        />
        Hide unchanged
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.ignoreWhitespace}
          onChange={(e) => onConfigChange({ ignoreWhitespace: e.target.checked })}
        />
        Ignore whitespace
      </label>
      <span>|</span>
      <span>Status:</span>
      {STATUS_OPTIONS.map((s) => (
        <label key={s}>
          <input
            type="checkbox"
            checked={statusFilter.size === 0 || statusFilter.has(s)}
            onChange={() => toggleStatus(s)}
          />
          {s}
        </label>
      ))}
    </div>
  );
}
