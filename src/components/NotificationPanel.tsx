import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Check,
  CheckCheck,
  X,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Scan,
  FileEdit,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export type NotificationCategoryFilter = 'all' | 'important' | 'reset' | 'scan' | 'edit';

export interface NotificationCounts {
  all: number;
  important: number;
  reset: number;
  scan: number;
  edit: number;
}

export interface NotificationRoleScope {
  role: string;
  isGlobal: boolean;
  canManageUsers: boolean;
  managedBrands: string[];
}

interface NotificationPanelProps {
  isOpen: boolean;
  notifPos: { top: number; right: number };
  notifications: any[];
  unreadCount: number;
  counts: NotificationCounts;
  activeCategory: NotificationCategoryFilter;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  canManageUsers: boolean;
  canManageNotifications?: boolean;
  roleScope?: NotificationRoleScope | null;
  notifToast?: string | null;
  processingResetId: string | null;
  onClose: () => void;
  onSelectCategory: (category: NotificationCategoryFilter) => void;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onRespondPasswordReset: (requestId: string, action: 'approve' | 'reject', item: any) => void;
  onClickItem: (item: any) => void;
  onOpenScanPage: () => void;
  onOpenSecondaryPage: () => void;
  secondaryPageLabel: string;
}

export const NotificationPanel: React.FC<NotificationPanelProps> = ({
  isOpen,
  notifPos,
  notifications,
  unreadCount,
  counts,
  activeCategory,
  hasMore,
  isLoading,
  isLoadingMore,
  canManageUsers,
  canManageNotifications = true,
  roleScope,
  notifToast,
  processingResetId,
  onClose,
  onSelectCategory,
  onLoadMore,
  onMarkAllRead,
  onMarkRead,
  onRespondPasswordReset,
  onClickItem,
  onOpenScanPage,
  onOpenSecondaryPage,
  secondaryPageLabel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isGlobalScope = roleScope ? roleScope.isGlobal : canManageUsers;
  const managedBrands = roleScope?.managedBrands || [];

  const tabs: Array<{ id: NotificationCategoryFilter; label: string; count: number; urgent?: boolean }> = [
    { id: 'all', label: 'Semua', count: counts.all },
    { id: 'important', label: 'Penting', count: counts.important, urgent: counts.important > 0 },
    ...(canManageUsers
      ? [{ id: 'reset' as const, label: 'Reset Sandi', count: counts.reset, urgent: counts.reset > 0 }]
      : []),
    { id: 'scan', label: 'Scan', count: counts.scan },
    { id: 'edit', label: 'Aktivitas', count: counts.edit },
  ];

  const scopeSummary = isGlobalScope
    ? 'Super Admin · Semua brand'
    : managedBrands.length > 0
      ? `Admin Brand · ${managedBrands.slice(0, 2).join(', ')}${managedBrands.length > 2 ? ` +${managedBrands.length - 2}` : ''}`
      : 'Admin Brand · Brand Anda';

  const cleanSecondaryLabel = secondaryPageLabel.replace(/\s*→\s*$/, '').trim();

  const safeTop = Math.max(12, Math.min(notifPos.top, window.innerHeight - 260));
  const safeRight = Math.max(12, notifPos.right);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99998]" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Panel Notifikasi"
        className="fixed z-[99999] w-[356px] min-[440px]:w-[396px] sm:w-[420px] max-w-[calc(100vw-24px)] bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        style={{
          top: safeTop,
          right: safeRight,
          maxHeight: `min(560px, calc(100vh - ${safeTop + 16}px))`,
        }}
      >
        {/* HEADER */}
        <div className="px-4 pt-3.5 pb-2.5 flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <h3 className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-zinc-100 leading-none">
                Notifikasi
              </h3>
              {unreadCount > 0 && (
                <span className="text-[11px] font-medium text-[#b07d53] dark:text-[#d4a379] tabular-nums whitespace-nowrap">
                  · {unreadCount} belum dibaca
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1 truncate">
              {scopeSummary}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0 -mr-1 -mt-0.5">
            {canManageNotifications && unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="h-7 px-2 rounded-lg text-[11px] font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                title="Tandai semua sudah dibaca"
              >
                <CheckCheck size={13} />
                <span>Tandai semua</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 inline-flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Tutup panel notifikasi"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* UNDERLINE CATEGORY TABS */}
        <div className="px-4 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-4 overflow-x-auto no-scrollbar flex-shrink-0">
          {tabs.map((tab) => {
            const isActive = activeCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectCategory(tab.id)}
                className={`relative py-2.5 text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'font-semibold text-slate-900 dark:text-zinc-100'
                    : 'font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span
                    className={`text-[11px] tabular-nums ${
                      isActive
                        ? 'text-[#b07d53] dark:text-[#d4a379] font-semibold'
                        : tab.urgent
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-slate-400 dark:text-zinc-500 font-normal'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute left-0 right-0 bottom-0 h-[2px] bg-[#c28e62] rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* INLINE FEEDBACK BANNER */}
        {notifToast && (
          <div className="px-4 py-2 bg-slate-50 dark:bg-zinc-800/70 border-b border-slate-100 dark:border-zinc-800 text-xs text-slate-700 dark:text-zinc-200 flex items-center gap-2 flex-shrink-0 animate-in fade-in duration-150">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">{notifToast}</span>
          </div>
        )}

        {/* NOTIFICATION LIST */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-zinc-800/80">
          {isLoading && notifications.length === 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {[0, 1, 2].map((idx) => (
                <div key={idx} className="px-4 py-3.5 flex items-start gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-zinc-800 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-2 pt-0.5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="h-3 w-36 rounded bg-slate-100 dark:bg-zinc-800" />
                      <div className="h-2.5 w-10 rounded bg-slate-100 dark:bg-zinc-800" />
                    </div>
                    <div className="h-2.5 w-48 rounded bg-slate-100 dark:bg-zinc-800" />
                    <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-zinc-800/80 border border-slate-100 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto mb-3">
                <Bell size={18} strokeWidth={1.75} />
              </div>
              <p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-200">
                Belum ada notifikasi
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 max-w-[260px] mx-auto leading-relaxed">
                {activeCategory === 'important'
                  ? 'Tidak ada peringatan kritis atau pengajuan yang menunggu tindakan.'
                  : activeCategory === 'reset'
                    ? 'Belum ada permohonan reset kata sandi.'
                    : 'Semua pembaruan terbaru pada kategori ini akan muncul di sini.'}
              </p>
            </div>
          ) : (
            <>
              {notifications.map((item) => {
                const isReset = item.category === 'password_reset';
                const isScan = item.category === 'scan' || item.category === 'scan_anomaly';
                const isEdit = item.category === 'edit';
                const isSystem = item.category === 'system';
                const isSuspicious =
                  (isScan && item.status === 'suspicious') || item.severity === 'critical';
                const isPendingReset = isReset && item.status === 'Menunggu';
                const isWarning = !isSuspicious && !isPendingReset && item.severity === 'warning';
                const isUnread = !item.isRead;

                const iconConfig = isSuspicious
                  ? {
                      bg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400',
                      icon: <AlertTriangle size={15} />,
                    }
                  : isPendingReset
                    ? {
                        bg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
                        icon: <KeyRound size={15} />,
                      }
                    : isWarning
                      ? {
                          bg: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
                          icon: <AlertTriangle size={15} />,
                        }
                      : isScan
                        ? {
                            bg: 'bg-slate-100/90 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400',
                            icon: <Scan size={15} />,
                          }
                        : isEdit
                          ? {
                              bg: 'bg-slate-100/90 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400',
                              icon: <FileEdit size={15} />,
                            }
                          : isSystem
                            ? {
                                bg: 'bg-[#c28e62]/10 text-[#b07d53] dark:text-[#d4a379]',
                                icon: <ShieldCheck size={15} />,
                              }
                            : {
                                bg: 'bg-slate-100/90 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400',
                                icon: <KeyRound size={15} />,
                              };

                return (
                  <div
                    key={item.id}
                    onClick={() => !isReset && onClickItem(item)}
                    className={`px-4 py-3.5 transition-colors group ${
                      isUnread
                        ? 'bg-[#c28e62]/[0.035] dark:bg-[#c28e62]/[0.06] hover:bg-[#c28e62]/[0.065] dark:hover:bg-[#c28e62]/[0.1]'
                        : 'bg-white dark:bg-zinc-900 hover:bg-slate-50/80 dark:hover:bg-zinc-800/40'
                    } ${!isReset ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* ICON */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${iconConfig.bg}`}
                      >
                        {iconConfig.icon}
                      </div>

                      {/* CONTENT */}
                      <div className="flex-1 min-w-0">
                        {/* TOP LINE: TITLE + TIMESTAMP + UNREAD INDICATOR */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isUnread && (
                              <span
                                className="w-1.5 h-1.5 rounded-full bg-[#c28e62] shrink-0"
                                aria-label="Belum dibaca"
                              />
                            )}
                            <p
                              className={`text-[13px] leading-snug truncate ${
                                isUnread
                                  ? 'font-semibold text-slate-900 dark:text-zinc-100'
                                  : 'font-medium text-slate-600 dark:text-zinc-300'
                              }`}
                            >
                              {item.title}
                            </p>
                          </div>

                          <div className="flex items-center gap-1 shrink-0 pt-0.5">
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums whitespace-nowrap">
                              {item.timeAgo}
                            </span>
                            {canManageNotifications && isUnread && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onMarkRead(item.id);
                                }}
                                title="Tandai sudah dibaca"
                                aria-label="Tandai sudah dibaca"
                                className="w-5 h-5 rounded text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-100 hover:bg-slate-200/70 dark:hover:bg-zinc-700 inline-flex items-center justify-center transition-all sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                              >
                                <Check size={12} />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* SUBTITLE */}
                        {item.subtitle && (
                          <p
                            className={`text-xs mt-0.5 truncate ${
                              isUnread
                                ? 'text-slate-600 dark:text-zinc-300'
                                : 'text-slate-400 dark:text-zinc-500'
                            }`}
                          >
                            {item.subtitle}
                          </p>
                        )}

                        {/* DESCRIPTION */}
                        {item.description && (
                          <p
                            className={`text-xs mt-1 leading-relaxed line-clamp-2 ${
                              isUnread
                                ? 'text-slate-600 dark:text-zinc-300'
                                : 'text-slate-400 dark:text-zinc-500'
                            }`}
                          >
                            {item.description}
                          </p>
                        )}

                        {/* PASSWORD RESET ACTIONS */}
                        {isReset && (
                          <div className="mt-2.5 space-y-2">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span
                                className={`font-medium ${
                                  item.status === 'Menunggu'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : item.status === 'Disetujui'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-slate-400 dark:text-zinc-500'
                                }`}
                              >
                                {item.status === 'Menunggu'
                                  ? 'Menunggu persetujuan'
                                  : item.status === 'Disetujui'
                                    ? 'Disetujui'
                                    : 'Ditolak'}
                              </span>

                              {item.status !== 'Menunggu' ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onClickItem(item);
                                  }}
                                  className="font-medium text-[#b07d53] dark:text-[#d4a379] hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                                >
                                  <span>
                                    {item.status === 'Disetujui' && canManageUsers
                                      ? 'Buka halaman reset sandi'
                                      : 'Lihat akun pengguna'}
                                  </span>
                                  <ChevronRight size={12} />
                                </button>
                              ) : (
                                !canManageUsers && (
                                  <span className="text-slate-400 dark:text-zinc-500">
                                    Perlu otorisasi Super Admin
                                  </span>
                                )
                              )}
                            </div>

                            {item.status === 'Menunggu' && canManageUsers && (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={processingResetId === item.sourceId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRespondPasswordReset(item.sourceId, 'approve', item);
                                  }}
                                  className="h-7 px-3 rounded-lg text-[11px] font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  {processingResetId === item.sourceId
                                    ? 'Memproses...'
                                    : 'Setujui & Reset Sandi'}
                                </button>
                                <button
                                  type="button"
                                  disabled={processingResetId === item.sourceId}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRespondPasswordReset(item.sourceId, 'reject', item);
                                  }}
                                  className="h-7 px-2.5 rounded-lg text-[11px] font-medium border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-900/60 hover:bg-rose-50/50 dark:hover:bg-rose-950/30 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  Tolak
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* SCAN METADATA FOOTER */}
                        {isScan && (
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400 dark:text-zinc-500 font-mono text-[10px] truncate">
                              {item.brand ? `${item.brand} · ` : ''}
                              {item.deviceInfo || 'Mobile Scanner'}
                            </span>
                            <span className="font-medium text-slate-400 dark:text-zinc-500 group-hover:text-[#b07d53] dark:group-hover:text-[#d4a379] inline-flex items-center gap-0.5 shrink-0 transition-colors">
                              <span>Lihat di peta</span>
                              <ChevronRight size={12} />
                            </span>
                          </div>
                        )}

                        {/* EDIT METADATA FOOTER */}
                        {isEdit && (
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400 dark:text-zinc-500 truncate">
                              {item.batchId ? (
                                <>
                                  Batch{' '}
                                  <span className="font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                                    {item.batchId}
                                  </span>
                                </>
                              ) : (
                                item.brand || 'Aktivitas sistem'
                              )}
                            </span>
                            <span className="font-medium text-slate-400 dark:text-zinc-500 group-hover:text-[#b07d53] dark:group-hover:text-[#d4a379] inline-flex items-center gap-0.5 shrink-0 transition-colors">
                              <span>Lihat riwayat</span>
                              <ChevronRight size={12} />
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* LOAD MORE */}
              {hasMore && (
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={onLoadMore}
                  className="w-full py-2.5 text-xs font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-50 dark:hover:bg-zinc-800/50 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Memuat...</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} />
                      <span>Muat lebih banyak</span>
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* FOOTER NAVIGATION */}
        <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 text-xs flex-shrink-0">
          <button
            type="button"
            onClick={onOpenScanPage}
            className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 font-medium inline-flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>Aktivitas Scan</span>
            <ChevronRight size={13} />
          </button>
          <button
            type="button"
            onClick={onOpenSecondaryPage}
            className="text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 font-medium inline-flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <span>{cleanSecondaryLabel}</span>
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};
