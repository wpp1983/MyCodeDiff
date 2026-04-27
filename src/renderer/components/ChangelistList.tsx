import { useMemo, useState } from "react";
import type { ChangelistListItem } from "@core/models/changeModels";

export type ChangelistListProps = {
  items: ChangelistListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type SortKey = "id" | "description" | "author" | "date";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "id", label: "CL" },
  { key: "description", label: "Description" },
  { key: "author", label: "Author" },
  { key: "date", label: "Date" },
];

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

export function ChangelistList(props: ChangelistListProps) {
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const arr = [...props.items];
    arr.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return arr;
  }, [props.items, sortKey, sortDir]);

  const onHeaderClick = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "id" || key === "date" ? "desc" : "asc");
    }
  };

  return (
    <table className="cl-table">
      <thead>
        <tr>
          {COLUMNS.map((col) => {
            const active = col.key === sortKey;
            const arrow = active ? (sortDir === "asc" ? " ▲" : " ▼") : "";
            return (
              <th
                key={col.key}
                className={`cl-col-${col.key}${active ? " active" : ""}`}
                onClick={() => onHeaderClick(col.key)}
              >
                {col.label}
                <span className="cl-sort-arrow">{arrow}</span>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr>
            <td colSpan={COLUMNS.length} className="cl-empty">
              (empty)
            </td>
          </tr>
        ) : (
          sorted.map((item) => {
            const selected = props.selectedId === item.id;
            return (
              <tr
                key={`${item.kind}-${item.id}`}
                className={selected ? "selected" : ""}
                onClick={() => props.onSelect(item.id)}
                title={item.description ?? ""}
              >
                <td className="cl-col-id">{item.id}</td>
                <td className="cl-col-description">
                  {item.description ?? "(no description)"}
                </td>
                <td className="cl-col-author">{item.author ?? ""}</td>
                <td className="cl-col-date">{item.date ?? ""}</td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
