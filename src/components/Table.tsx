"use client";

import type { ReactNode } from "react";
import { useRowKeys } from "@/components/ListRow";
import { Icons } from "@/components/icons";

export type Column<T> = {
  key: string;
  label: string;
  /** Content width in px; the column adds its 12px sides. Leave one column without a width to take the rest. */
  width?: number;
  /** "end" for numbers: right-aligned in tabular figures. */
  align?: "start" | "end";
  sortable?: boolean;
  cell: (row: T) => ReactNode;
};

export type Sort = { key: string; dir: "asc" | "desc" };

// A dense table for comparing many things across the same columns: a 32px header that stays put while the body
// scrolls, 36px rows, numbers on the right in tabular figures, the sorted column marked. Rows open on click or Enter;
// J/K and the arrows move between them. The selected row matches a selected list row. Scrolls inside `className`'s
// height when given one.
export function Table<T>({
  label,
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  selectedKey,
  onOpen,
  className = "",
}: {
  label: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: Sort;
  onSort?: (sort: Sort) => void;
  selectedKey?: string;
  onOpen?: (row: T) => void;
  className?: string;
}) {
  const { ref, onFocus, onKeyDown } = useRowKeys<HTMLTableSectionElement>();
  return (
    <div className={`overflow-auto ${className}`}>
      <table aria-label={label} className="w-full table-fixed border-separate border-spacing-0">
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width + 24 } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => {
              const sorted = sort?.key === c.key ? sort.dir : undefined;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                  className={`sticky top-0 z-10 h-8 bg-surface px-3 text-label leading-label font-medium whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-border)] ${
                    c.align === "end" ? "text-right" : "text-left"
                  } ${sorted ? "text-text" : "text-muted"}`}
                >
                  {c.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSort(
                          sorted
                            ? { key: c.key, dir: sorted === "asc" ? "desc" : "asc" }
                            : // A column of numbers starts with the largest; words start at A.
                              { key: c.key, dir: c.align === "end" ? "desc" : "asc" },
                        )
                      }
                      className="-mx-1 inline-flex h-8 items-center gap-1 rounded-sm px-1 transition-colors duration-100 hover:text-text"
                    >
                      {c.label}
                      {sorted && <Icons.expand size={12} aria-hidden className={sorted === "asc" ? "rotate-180" : ""} />}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody ref={ref} onFocus={onFocus} onKeyDown={onKeyDown}>
          {rows.map((row) => {
            const key = rowKey(row);
            const selected = key === selectedKey;
            return (
              <tr
                key={key}
                data-row=""
                data-row-scope=""
                data-selected={selected || undefined}
                aria-current={selected || undefined}
                tabIndex={-1}
                onClick={onOpen ? () => onOpen(row) : undefined}
                onKeyDown={
                  onOpen
                    ? (e) => {
                        if (e.key === "Enter" && e.target === e.currentTarget) {
                          e.preventDefault();
                          onOpen(row);
                        }
                      }
                    : undefined
                }
                className={`group/row transition-colors duration-100 focus-visible:-outline-offset-2 ${onOpen ? "cursor-pointer" : ""} ${
                  selected ? "bg-steel-subtle" : "hover:bg-subtle"
                }`}
              >
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`h-9 truncate border-b border-border px-3 text-body-sm leading-body-sm text-text ${
                      c.align === "end" ? "text-right tabular-nums" : "text-left"
                    } ${i === 0 && selected ? "shadow-[inset_2px_0_0_var(--color-steel)]" : ""}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
