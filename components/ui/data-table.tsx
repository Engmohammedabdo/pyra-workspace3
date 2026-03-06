'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils/cn';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';

// ---------- Types ----------

export interface ColumnDef<T> {
  /** Unique key for the column (used for sort key) */
  key: string;
  /** Header label displayed in <th> */
  header: string;
  /** Whether this column can be sorted */
  sortable?: boolean;
  /** Extra className on <td> cells */
  className?: string;
  /** Extra className on <th> header */
  headerClassName?: string;
  /** Render function for cell content */
  render: (row: T, index: number) => React.ReactNode;
}

export interface BulkAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'destructive' | 'outline';
  onClick: (selectedIds: string[]) => void;
}

export interface DataTableEmptyState {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Data rows */
  data: T[];
  /** Show loading skeleton */
  loading?: boolean;
  /** Empty state configuration */
  emptyState?: DataTableEmptyState;
  /** Enable row selection with checkboxes */
  selectable?: boolean;
  /** Extract unique ID from a row (required if selectable) */
  getRowId?: (row: T) => string;
  /** Callback when selection changes */
  onSelectionChange?: (ids: string[]) => void;
  /** Bulk actions shown when rows are selected */
  bulkActions?: BulkAction[];
  /** Make table header sticky */
  stickyHeader?: boolean;
  /** Row click handler */
  onRowClick?: (row: T) => void;
  /** Current sort configuration */
  sortConfig?: SortConfig | null;
  /** Sort change handler (toggles direction or sets new column) */
  onSortChange?: (key: string) => void;
  /** Number of skeleton rows to show while loading (default: 5) */
  skeletonRows?: number;
  /** Dynamic row className */
  rowClassName?: (row: T) => string;
  /** Table container className */
  className?: string;
}

// ---------- Component ----------

export function DataTable<T>({
  columns,
  data,
  loading = false,
  emptyState,
  selectable = false,
  getRowId,
  onSelectionChange,
  bulkActions = [],
  stickyHeader = true,
  onRowClick,
  sortConfig = null,
  onSortChange,
  skeletonRows = 5,
  rowClassName,
  className,
}: DataTableProps<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Memoize row IDs for selection
  const rowIds = useMemo(() => {
    if (!selectable || !getRowId) return [];
    return data.map((row) => getRowId(row));
  }, [data, selectable, getRowId]);

  const allSelected = rowIds.length > 0 && selectedIds.size === rowIds.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < rowIds.length;

  // ---------- Selection Handlers ----------

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
      onSelectionChange?.([]);
    } else {
      const all = new Set(rowIds);
      setSelectedIds(all);
      onSelectionChange?.(Array.from(all));
    }
  }, [allSelected, rowIds, onSelectionChange]);

  const toggleRow = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    onSelectionChange?.([]);
  }, [onSelectionChange]);

  // ---------- Sort Handler ----------

  const handleSort = useCallback(
    (key: string) => {
      onSortChange?.(key);
    },
    [onSortChange]
  );

  // ---------- Render Sort Icon ----------

  function renderSortIcon(colKey: string) {
    if (!sortConfig || sortConfig.key !== colKey) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-orange-500" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-orange-500" />
    );
  }

  // ---------- Loading Skeleton ----------

  if (loading) {
    return (
      <div className={cn('overflow-hidden rounded-xl border', className)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {selectable && (
                <th className="w-12 px-3 py-3">
                  <Skeleton className="h-4 w-4 rounded-sm" />
                </th>
              )}
              {columns.map((col) => (
                <th key={col.key} className={cn('px-4 py-3 text-start', col.headerClassName)}>
                  <Skeleton className="h-4 w-20 rounded" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: skeletonRows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="border-b last:border-b-0">
                {selectable && (
                  <td className="w-12 px-3 py-3.5">
                    <Skeleton className="h-4 w-4 rounded-sm" />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3.5', col.className)}>
                    <Skeleton className="h-4 w-full max-w-[120px] rounded" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ---------- Empty State ----------

  if (data.length === 0 && emptyState) {
    return (
      <div className={cn('rounded-xl border', className)}>
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
          actionLabel={emptyState.actionLabel}
          onAction={emptyState.onAction}
        />
      </div>
    );
  }

  // ---------- Render Table ----------

  return (
    <div className="relative">
      {/* Bulk Actions Bar */}
      {selectable && selectedIds.size > 0 && bulkActions.length > 0 && (
        <div className="sticky top-0 z-20 flex items-center gap-3 rounded-t-xl border border-b-0 bg-orange-500/10 px-4 py-2.5 dark:bg-orange-500/5">
          <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
            {selectedIds.size} محدد
          </span>
          <div className="flex items-center gap-2">
            {bulkActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <Button
                  key={action.label}
                  variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => action.onClick(Array.from(selectedIds))}
                >
                  {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
                  {action.label}
                </Button>
              );
            })}
          </div>
          <button
            onClick={clearSelection}
            className="ms-auto text-muted-foreground hover:text-foreground transition-colors"
            aria-label="إلغاء التحديد"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className={cn(
          'overflow-x-auto rounded-xl border',
          selectable && selectedIds.size > 0 && bulkActions.length > 0 && 'rounded-t-none border-t-0',
          className
        )}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              className={cn(
                'border-b bg-muted/30',
                stickyHeader && 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]'
              )}
            >
              {selectable && (
                <th className="w-12 px-3 py-3">
                  <Checkbox
                    checked={allSelected}
                    // Use indeterminate visual when some are selected
                    className={cn(someSelected && 'opacity-70')}
                    onCheckedChange={toggleAll}
                    aria-label="تحديد الكل"
                  />
                </th>
              )}
              {columns.map((col) => {
                const isSortable = col.sortable && onSortChange;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider',
                      isSortable && 'cursor-pointer select-none hover:text-foreground transition-colors',
                      col.headerClassName
                    )}
                    onClick={isSortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      {col.header}
                      {isSortable && renderSortIcon(col.key)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => {
              const rowId = selectable && getRowId ? getRowId(row) : '';
              const isSelected = selectable && selectedIds.has(rowId);

              return (
                <tr
                  key={rowId || index}
                  className={cn(
                    'border-b last:border-b-0 transition-colors',
                    onRowClick && 'cursor-pointer',
                    isSelected
                      ? 'bg-orange-500/5 hover:bg-orange-500/10'
                      : 'hover:bg-muted/30',
                    rowClassName?.(row)
                  )}
                  onClick={(e) => {
                    // Don't trigger row click if clicking on checkbox or interactive elements
                    const target = e.target as HTMLElement;
                    if (target.closest('button') || target.closest('[role="checkbox"]') || target.closest('a') || target.closest('[data-no-row-click]')) {
                      return;
                    }
                    onRowClick?.(row);
                  }}
                >
                  {selectable && (
                    <td className="w-12 px-3 py-3.5">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleRow(rowId)}
                        aria-label="تحديد الصف"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3.5', col.className)}>
                      {col.render(row, index)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
