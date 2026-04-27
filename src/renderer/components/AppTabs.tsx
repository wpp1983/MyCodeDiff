import { useEffect, useState } from "react";

export type AppTabsProps = {
  active: "pending" | "history";
  onChange: (next: "pending" | "history") => void;
  defaultClient: string;
  onDefaultClientChange: (next: string) => void | Promise<void>;
  effectiveClient?: string;
};

export function AppTabs(props: AppTabsProps) {
  const [draft, setDraft] = useState(props.defaultClient);

  useEffect(() => {
    setDraft(props.defaultClient);
  }, [props.defaultClient]);

  const dirty = draft !== props.defaultClient;
  const save = (): void => {
    void props.onDefaultClientChange(draft.trim());
  };

  return (
    <div className="app-tabs">
      <button
        type="button"
        className={props.active === "pending" ? "active" : ""}
        onClick={() => props.onChange("pending")}
      >
        Pending
      </button>
      <button
        type="button"
        className={props.active === "history" ? "active" : ""}
        onClick={() => props.onChange("history")}
      >
        History
      </button>
      <div className="spacer" />
      <label title="Leave empty to use system P4CLIENT">
        Workspace:&nbsp;
        <input
          type="text"
          placeholder={props.effectiveClient ?? "(system default)"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          style={{ width: 180 }}
        />
      </label>
      <button type="button" onClick={save} disabled={!dirty}>
        Save
      </button>
      {props.defaultClient ? (
        <button
          type="button"
          onClick={() => void props.onDefaultClientChange("")}
          title="Clear override and use system default"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
