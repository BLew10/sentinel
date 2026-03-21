'use client';

import { useState } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: string;
  defaultSort?: string;
  defaultDir?: 'asc' | 'desc';
  onSort?: (field: string, dir: 'asc' | 'desc') => void;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  keyField,
  defaultSort,
  defaultDir = 'desc',
  onSort,
}: DataTableProps<T>) {
  const [sortField, setSortField] = useState(defaultSort ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);

  function handleSort(key: string) {
    const newDir = sortField === key && sortDir === 'desc' ? 'asc' : 'desc';
    setSortField(key);
    setSortDir(newDir);
    onSort?.(key, newDir);
  }

  const alignClass = (align?: string) => {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-bg-secondary">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-medium text-text-secondary whitespace-nowrap ${alignClass(col.align)} ${
                  col.sortable ? 'cursor-pointer select-none hover:text-text-primary transition-colors' : ''
                }`}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortField === col.key && (
                    <span className="text-green text-[10px]">
                      {sortDir === 'desc' ? '▼' : '▲'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-text-tertiary"
              >
                No results
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={String(row[keyField])}
                className="border-b border-border/50 hover:bg-bg-tertiary/30 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 whitespace-nowrap ${alignClass(col.align)}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
