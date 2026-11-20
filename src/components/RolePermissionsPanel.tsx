import React, { useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { CustomCheckbox } from './CustomCheckbox';
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  PERMISSION_GROUPS,
  PermissionKey,
  RbacMatrix,
  ROLE_META,
  RoleName,
} from '../utils/rbac';

interface RolePermissionsPanelProps {
  draft: RbacMatrix;
  changedKeys: Set<PermissionKey>;
  canManage: boolean;
  roleUserCounts?: Partial<Record<RoleName, number>>;
  onTogglePermission: (role: RoleName, perm: PermissionKey) => void;
  onToggleGroup: (role: RoleName, permKeys: PermissionKey[], enable: boolean) => void;
  onDiscardChanges: () => void;
}

export const RolePermissionsPanel: React.FC<RolePermissionsPanelProps> = ({
  draft,
  changedKeys,
  canManage,
  roleUserCounts,
  onTogglePermission,
  onToggleGroup,
  onDiscardChanges,
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const hasChanges = changedKeys.size > 0;
  const allCollapsed = PERMISSION_GROUPS.every((g) => collapsedGroups.has(g.id));

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const toggleAllGroups = () => {
    setCollapsedGroups(
      allCollapsed ? new Set() : new Set(PERMISSION_GROUPS.map((g) => g.id))
    );
  };

  return (
    <div>
      {/* Ringkasan 2 Peran (Baris Hairline Bersih, Tanpa Kartu Bersarang) */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-zinc-800 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-900/40">
        {ALL_ROLES.map((roleKey) => {
          const meta = ROLE_META[roleKey];
          const isAdmin = roleKey === 'Super Admin';
          const activeCount = isAdmin ? ALL_PERMISSIONS.length : (draft[roleKey] || []).length;
          const coveragePct = Math.round((activeCount / ALL_PERMISSIONS.length) * 100);
          const userCount = roleUserCounts?.[roleKey];

          return (
            <div key={roleKey} className="px-5 py-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-zinc-100 truncate">
                    {meta.label}
                  </span>
                  {isAdmin && (
                    <Lock
                      size={13}
                      className="text-slate-400 dark:text-zinc-500 shrink-0"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-500 dark:text-zinc-400 shrink-0">
                  <span className="font-semibold text-slate-700 dark:text-zinc-200">
                    {activeCount}/{ALL_PERMISSIONS.length}
                  </span>
                  <span className="font-sans">izin</span>
                  {typeof userCount === 'number' && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-zinc-600">
                        ·
                      </span>
                      <span className="font-sans">{userCount} pengguna</span>
                    </>
                  )}
                </div>
              </div>

              <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isAdmin ? 'bg-slate-500 dark:bg-zinc-500' : 'bg-[#c28e62]'
                  }`}
                  style={{ width: `${coveragePct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[#b07d53] dark:text-[#d4a379]">
                <span>{meta.scopeLabel}</span>
                {isAdmin && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500 dark:text-zinc-400">
                      Terkunci demi keamanan sistem
                    </span>
                  </>
                )}
              </div>

              <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                {meta.shortDesc}
              </p>
            </div>
          );
        })}
      </div>

      {/* Tabel Matriks Izin (Header & Tipografi Konsisten dengan Tabel Dashboard Lainnya) */}
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full text-left text-xs sm:text-sm min-w-[640px]">
          <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] select-none">
            <tr>
              <th className="px-5 py-3.5 w-[56%]">
                <div className="flex items-center justify-between gap-2">
                  <span>Modul &amp; Izin Aksi</span>
                  <button
                    type="button"
                    onClick={toggleAllGroups}
                    className="normal-case tracking-normal text-[11px] font-medium text-slate-400 dark:text-zinc-500 hover:text-[#c28e62] dark:hover:text-[#d4a379] transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c28e62]/40 rounded px-1 -mr-1"
                  >
                    {allCollapsed ? 'Buka semua' : 'Tutup semua'}
                  </button>
                </div>
              </th>
              {ALL_ROLES.map((roleKey) => {
                const isAdmin = roleKey === 'Super Admin';
                return (
                  <th key={roleKey} className="px-5 py-3.5 text-center w-[22%]">
                    <div
                      className="inline-flex items-center justify-center gap-1.5"
                      data-tooltip={
                        isAdmin ? 'Akses penuh terkunci demi keamanan sistem' : undefined
                      }
                      data-tooltip-pos="top"
                    >
                      <span>{ROLE_META[roleKey].label}</span>
                      {isAdmin && (
                        <Lock size={11} className="text-slate-400 dark:text-zinc-500" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
            {PERMISSION_GROUPS.map((group) => {
              const groupPermKeys = group.permissions.map((p) => p.key);
              const brandPermList = draft['Admin Brand'] || [];
              const brandActiveInGroup = groupPermKeys.filter((k) =>
                brandPermList.includes(k)
              ).length;
              const allBrandSelectedInGroup = brandActiveInGroup === groupPermKeys.length;
              const isCollapsed = collapsedGroups.has(group.id);
              const modifiedInGroupCount = groupPermKeys.filter((k) =>
                changedKeys.has(k)
              ).length;

              return (
                <React.Fragment key={group.id}>
                  {/* Header Grup Modul (Dapat Dibuka/Tutup) */}
                  <tr
                    onClick={() => toggleGroupCollapse(group.id)}
                    className="group bg-slate-50/75 dark:bg-zinc-800/40 hover:bg-slate-100/80 dark:hover:bg-zinc-800/75 transition-colors cursor-pointer select-none"
                  >
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        aria-expanded={!isCollapsed}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroupCollapse(group.id);
                        }}
                        className="flex items-center gap-2 text-left w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c28e62]/40 rounded-lg -ml-1 pl-1 pr-2 py-0.5"
                      >
                        <ChevronDown
                          size={15}
                          aria-hidden="true"
                          className={`text-slate-400 dark:text-zinc-500 group-hover:text-slate-600 dark:group-hover:text-zinc-300 transition-transform duration-200 shrink-0 ${
                            isCollapsed ? '-rotate-90' : 'rotate-0'
                          }`}
                        />
                        <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-zinc-100">
                          {group.title}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-slate-300 dark:text-zinc-600 text-xs"
                        >
                          ·
                        </span>
                        <span className="text-xs font-medium font-mono tabular-nums text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                          {group.permissions.length} izin
                        </span>
                        {modifiedInGroupCount > 0 && (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-slate-300 dark:text-zinc-600 text-xs"
                            >
                              ·
                            </span>
                            <span className="text-xs font-medium text-[#b07d53] dark:text-[#d4a379] tabular-nums whitespace-nowrap">
                              {modifiedInGroupCount} diubah
                            </span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <span className="text-xs font-mono tabular-nums text-slate-400 dark:text-zinc-500">
                        {group.permissions.length}/{group.permissions.length}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5 text-xs">
                        <span className="font-mono tabular-nums font-medium text-slate-500 dark:text-zinc-400">
                          {brandActiveInGroup}/{group.permissions.length}
                        </span>
                        {canManage && (
                          <>
                            <span
                              aria-hidden="true"
                              className="text-slate-300 dark:text-zinc-600"
                            >
                              ·
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleGroup(
                                  'Admin Brand',
                                  groupPermKeys,
                                  !allBrandSelectedInGroup
                                );
                              }}
                              className="font-semibold text-[#c28e62] hover:text-[#b07d53] hover:underline cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c28e62]/40 rounded px-0.5"
                            >
                              {allBrandSelectedInGroup ? 'Kosongkan' : 'Pilih semua'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Baris Izin Aksi */}
                  {!isCollapsed &&
                    group.permissions.map((perm) => {
                      const isModified = changedKeys.has(perm.key);
                      return (
                        <tr
                          key={perm.key}
                          className={`transition-colors ${
                            isModified
                              ? 'bg-[#c28e62]/[0.05] dark:bg-[#c28e62]/[0.09] hover:bg-[#c28e62]/[0.08] dark:hover:bg-[#c28e62]/[0.13]'
                              : 'hover:bg-slate-50/80 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <td className="pl-11 pr-5 py-3.5 align-middle">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm">
                                {perm.label}
                              </span>
                              {isModified && (
                                <>
                                  <span
                                    aria-hidden="true"
                                    className="text-slate-300 dark:text-zinc-600 text-xs"
                                  >
                                    ·
                                  </span>
                                  <span className="text-xs font-medium text-[#b07d53] dark:text-[#d4a379]">
                                    Diubah
                                  </span>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
                              {perm.description}
                            </p>
                          </td>

                          {ALL_ROLES.map((roleKey) => {
                            const isAdmin = roleKey === 'Super Admin';
                            const checked = isAdmin || (draft[roleKey] || []).includes(perm.key);
                            return (
                              <td key={roleKey} className="px-5 py-3.5 text-center align-middle">
                                <CustomCheckbox
                                  checked={checked}
                                  locked={isAdmin}
                                  disabled={!canManage}
                                  ariaLabel={`${perm.label} untuk ${roleKey}`}
                                  onChange={() => onTogglePermission(roleKey, perm.key)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Ringkasan (Konsisten dengan TablePagination pada Tabel Lainnya) */}
      <div className="px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-white dark:bg-zinc-900 rounded-b-2xl text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>
            Total{' '}
            <strong className="text-[#c28e62] tabular-nums">{ALL_PERMISSIONS.length}</strong> izin
            aksi pada{' '}
            <strong className="text-slate-800 dark:text-zinc-200 tabular-nums">
              {PERMISSION_GROUPS.length}
            </strong>{' '}
            modul
          </span>
          <span aria-hidden="true" className="text-slate-300 dark:text-zinc-600">
            ·
          </span>
          <span className="text-slate-400 dark:text-zinc-500">
            Berlaku langsung pada antarmuka dan API
          </span>
        </div>

        {hasChanges && canManage ? (
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="font-medium text-amber-600 dark:text-amber-400 tabular-nums">
              {changedKeys.size} perubahan belum disimpan
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-zinc-600">
              ·
            </span>
            <button
              type="button"
              onClick={onDiscardChanges}
              className="font-semibold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer whitespace-nowrap"
            >
              Batalkan
            </button>
          </div>
        ) : (
          <span className="text-slate-400 dark:text-zinc-500">
            Peran Super Admin selalu memiliki akses penuh
          </span>
        )}
      </div>
    </div>
  );
};
