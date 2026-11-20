import React from 'react';
import { SearchX, Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  isFiltered?: boolean;
  onResetFilter?: () => void;
  resetLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
  hint?: string;
  compact?: boolean;
}

/**
 * Komponen Empty State konsisten untuk seluruh tabel dan panel daftar data.
 */
export const EmptyStatePanel: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  isFiltered = false,
  onResetFilter,
  resetLabel = 'Reset Filter',
  actionLabel,
  onAction,
  hint,
  compact = false,
}) => {
  const renderedIcon = isFiltered ? (
    <SearchX size={compact ? 18 : 22} className="stroke-[1.8]" />
  ) : (
    icon ?? <Inbox size={compact ? 18 : 22} className="stroke-[1.8]" />
  );

  return (
    <div
      className={`flex flex-col items-center justify-center text-center whitespace-normal ${
        compact ? 'py-7 px-4' : 'py-12 sm:py-14 px-6'
      }`}
    >
      <div
        className={`${
          compact ? 'w-10 h-10 rounded-xl mb-2.5' : 'w-12 h-12 rounded-2xl mb-3.5'
        } flex items-center justify-center border transition-colors ${
          isFiltered
            ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-800/60 text-[#b07d53] dark:text-[#d4a379]'
            : 'bg-slate-100/90 dark:bg-zinc-800/80 border-slate-200/80 dark:border-zinc-700/70 text-slate-400 dark:text-zinc-500'
        }`}
      >
        {renderedIcon}
      </div>

      <p
        className={`font-semibold tracking-tight text-slate-800 dark:text-zinc-100 ${
          compact ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'
        }`}
      >
        {title}
      </p>

      {description && (
        <p
          className={`text-slate-500 dark:text-zinc-400 leading-relaxed max-w-sm ${
            compact ? 'text-[11px] mt-1' : 'text-xs mt-1.5'
          }`}
        >
          {description}
        </p>
      )}

      {isFiltered && onResetFilter ? (
        <button
          type="button"
          onClick={onResetFilter}
          className="mt-4 h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
        >
          <span>{resetLabel}</span>
        </button>
      ) : !isFiltered && actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
        >
          <span>{actionLabel}</span>
        </button>
      ) : null}

      {hint && (
        <p className="mt-3 text-[11px] text-slate-400 dark:text-zinc-500 max-w-sm">
          {hint}
        </p>
      )}
    </div>
  );
};

interface TableEmptyRowProps extends EmptyStateProps {
  colSpan: number;
}

/**
 * Baris <tr> standar ketika tabel belum memiliki data atau hasil filter kosong.
 */
export const TableEmptyRow: React.FC<TableEmptyRowProps> = ({
  colSpan,
  ...props
}) => {
  return (
    <tr className="bg-white dark:bg-zinc-900">
      <td colSpan={colSpan} className="p-0 whitespace-normal">
        <EmptyStatePanel {...props} />
      </td>
    </tr>
  );
};
