import { useMemo, useState } from "react";
import type { ChangelistListItem } from "@core/models/changeModels";

export type ChangelistListProps = {
  items: ChangelistListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filter?: string;
};

type SortKey = "id" | "date" | "author";
type SortDir = "asc" | "desc";

const AVATAR_PALETTE = [
  "oklch(70% 0.13 185)",
  "oklch(72% 0.14 60)",
  "oklch(72% 0.14 295)",
  "oklch(72% 0.14 25)",
  "oklch(72% 0.14 150)",
  "oklch(72% 0.14 240)",
];

function avatarFor(name: string): { color: string; initials: string } {
  const fallback = AVATAR_PALETTE[0] ?? "oklch(70% 0.13 185)";
  if (!name) return { color: fallback, initials: "?" };
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % AVATAR_PALETTE.length;
  }
  return {
    color: AVATAR_PALETTE[h] ?? fallback,
    initials: name.slice(0, 2).toUpperCase(),
  };
}

function compare(a: ChangelistListItem, b: ChangelistListItem, key: SortKey): number {
  if (key === "id") {
    const ai = parseInt(a.id, 10);
    const bi = parseInt(b.id, 10);
    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
    return a.id.localeCompare(b.id);
  }
  const av = (a[key] ?? "").toString();
  const bv = (b[key] ?? "").toString();
  return av.localeCompare(bv);
}

function shortDate(s?: string): string {
  if (!s) return "";
  // Accept ISO-ish or "YYYY/MM/DD HH:MM" — strip time portion if present.
  const m = s.match(/(\d{4}[-/]\d{2}[-/]\d{2})/);
  return m && m[1] ? m[1] : s;
}

function statusKind(item: ChangelistListItem): "pending" | "submitted" {
  return item.kind === "pending" ? "pending" : "submitted";
}

export function ChangelistList(props: ChangelistListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const q = (props.filter ?? "").trim().toLowerCase();
    if (!q) return props.items;
    return props.items.filter((it) => {
      return (
        it.id.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q) ||
        (it.author ?? "").toLowerCase().includes(q)
      );
    });
  }, [props.items, props.filter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const cycle = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "id" || key === "date" ? "desc" : "asc");
    }
  };

  const arrow = (key: SortKey): string => {
    if (key !== sortKey) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  return (
    <>
      <div className="cl-list-tools">
        <div className="cl-sort" role="group" aria-label="Sort">
          <button
            type="button"
            className={sortKey === "id" ? "active" : ""}
            onClick={() => cycle("id")}
          >
            CL{arrow("id")}
          </button>
          <button
            type="button"
            className={sortKey === "date" ? "active" : ""}
            onClick={() => cycle("date")}
          >
            Date{arrow("date")}
          </button>
          <button
            type="button"
            className={sortKey === "author" ? "active" : ""}
            onClick={() => cycle("author")}
          >
            Author{arrow("author")}
          </button>
        </div>
      </div>

      <ul className="cl-list" role="listbox">
        {sorted.length === 0 ? (
          <li className="cl-empty">(empty)</li>
        ) : (
          sorted.map((item) => {
            const selected = props.selectedId === item.id;
            const av = avatarFor(item.author ?? "");
            const kind = statusKind(item);
            return (
              <li
                key={`${item.kind}-${item.id}`}
                role="option"
                aria-selected={selected}
                className={`cl-row${selected ? " selected" : ""}`}
                onClick={() => props.onSelect(item.id)}
                title={item.description ?? ""}
              >
                <div className="cl-id">{item.id}</div>
                <div className="cl-desc">
                  {item.description ?? "(no description)"}
                </div>
                <div className="cl-status">
                  <span className={`pill ${kind}`}>{kind}</span>
                </div>
                <div className="cl-meta">
                  {item.author ? (
                    <span className="author">
                      <span
                        className="avatar"
                        style={{ ["--avatar-bg" as never]: av.color }}
                      >
                        {av.initials}
                      </span>
                      <span className="author-name">{item.author}</span>
                    </span>
                  ) : null}
                  {item.author && item.date ? <span className="dot" /> : null}
                  {item.date ? <span>{shortDate(item.date)}</span> : null}
                  {typeof item.fileCount === "number" ? (
                    <>
                      <span className="dot" />
                      <span className="files-count">{item.fileCount} files</span>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </>
  );
}
