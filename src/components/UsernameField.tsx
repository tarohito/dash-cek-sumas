import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import {
  normalizeUsernameInput,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsernameFormat,
  type UsernameValidationResult,
} from '../utils/username';

export type UsernameAvailabilityStatus =
  | 'empty'
  | 'invalid'
  | 'checking'
  | 'available'
  | 'unchanged'
  | 'taken'
  | 'error';

export interface UsernameFieldStatus {
  status: UsernameAvailabilityStatus;
  normalized: string;
  format: UsernameValidationResult;
  message?: string;
  canSubmit: boolean;
}

export interface UsernameAvailabilityResponse {
  valid: boolean;
  available: boolean;
  normalized: string;
  reason?: string | null;
}

interface UsernameFieldProps {
  value: string;
  onChange: (normalizedValue: string) => void;
  currentSavedUsername?: string;
  excludeUserId?: string;
  onCheckAvailability?: (
    username: string,
    excludeUserId?: string
  ) => Promise<UsernameAvailabilityResponse>;
  localTakenUsernames?: string[];
  onStatusChange?: (status: UsernameFieldStatus) => void;
  placeholder?: string;
  required?: boolean;
  compactRules?: boolean;
  inputBgClassName?: string;
  labelClassName?: string;
}

export const UsernameField: React.FC<UsernameFieldProps> = ({
  value,
  onChange,
  currentSavedUsername,
  excludeUserId,
  onCheckAvailability,
  localTakenUsernames,
  onStatusChange,
  placeholder = 'Cth: rina.wijaya',
  required = true,
  compactRules = false,
  inputBgClassName = 'bg-white dark:bg-zinc-800',
  labelClassName = 'text-xs font-bold text-slate-700 dark:text-zinc-300',
}) => {
  const normalized = normalizeUsernameInput(value);
  const savedNormalized = normalizeUsernameInput(currentSavedUsername);
  const format = validateUsernameFormat(normalized);

  const [state, setState] = useState<UsernameFieldStatus>(() => ({
    status: normalized ? (format.valid ? 'unchanged' : 'invalid') : 'empty',
    normalized,
    format,
    canSubmit: normalized ? format.valid : false,
  }));

  const seqRef = useRef(0);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const onCheckRef = useRef(onCheckAvailability);
  onCheckRef.current = onCheckAvailability;

  useEffect(() => {
    const reqId = ++seqRef.current;

    const emit = (next: UsernameFieldStatus) => {
      setState(next);
      onStatusChangeRef.current?.(next);
    };

    if (!normalized) {
      emit({
        status: 'empty',
        normalized: '',
        format,
        message: 'Username wajib diisi.',
        canSubmit: false,
      });
      return;
    }

    if (!format.valid) {
      emit({
        status: 'invalid',
        normalized,
        format,
        message: format.error,
        canSubmit: false,
      });
      return;
    }

    // If editing an existing account and username has not changed, treat as valid & owned
    if (savedNormalized && normalized === savedNormalized) {
      emit({
        status: 'unchanged',
        normalized,
        format,
        message: `Username @${normalized} sedang digunakan akun ini.`,
        canSubmit: true,
      });
      return;
    }

    // Instant local duplicate check (if caller provided a list of existing usernames)
    const isLocallyTaken = Array.isArray(localTakenUsernames)
      ? localTakenUsernames.some((u) => normalizeUsernameInput(u) === normalized)
      : false;
    if (isLocallyTaken) {
      emit({
        status: 'taken',
        normalized,
        format,
        message: `Username @${normalized} sudah digunakan oleh akun lain.`,
        canSubmit: false,
      });
      return;
    }

    if (!onCheckRef.current) {
      emit({
        status: 'available',
        normalized,
        format,
        message: `Username @${normalized} tersedia.`,
        canSubmit: true,
      });
      return;
    }

    emit({
      status: 'checking',
      normalized,
      format,
      message: 'Memeriksa ketersediaan username...',
      canSubmit: false,
    });

    const timer = window.setTimeout(async () => {
      try {
        const res = await onCheckRef.current!(normalized, excludeUserId);
        if (reqId !== seqRef.current) return;

        if (!res.valid) {
          emit({
            status: 'invalid',
            normalized,
            format,
            message: res.reason || 'Format username tidak memenuhi standar.',
            canSubmit: false,
          });
          return;
        }

        if (!res.available) {
          emit({
            status: 'taken',
            normalized,
            format,
            message: res.reason || `Username @${normalized} sudah digunakan oleh akun lain.`,
            canSubmit: false,
          });
          return;
        }

        emit({
          status: 'available',
          normalized,
          format,
          message: `Username @${normalized} tersedia dan memenuhi standar.`,
          canSubmit: true,
        });
      } catch {
        if (reqId !== seqRef.current) return;
        emit({
          status: 'error',
          normalized,
          format,
          message: 'Tidak dapat memverifikasi ke server saat ini. Akan divalidasi ulang saat menyimpan.',
          canSubmit: true,
        });
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [normalized, savedNormalized, excludeUserId, format.valid, format.error, localTakenUsernames]);

  const isErrorState = state.status === 'invalid' || state.status === 'taken';
  const isOkState = state.status === 'available' || state.status === 'unchanged';

  const ruleChips = [
    { ok: format.checks.length, label: `${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} karakter` },
    { ok: format.checks.allowedChars, label: 'a-z, 0-9, ., _, -' },
    { ok: format.checks.edgeAlnum, label: 'Awal & akhir huruf/angka' },
    { ok: format.checks.noConsecutiveSep, label: 'Tanpa simbol ganda' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className={`${labelClassName} flex items-center gap-1`}>
          <span>Username</span>
          {required && <span className="text-rose-500">*</span>}
        </label>

        {state.status === 'checking' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
            <Loader2 size={11} className="animate-spin" />
            <span>Memeriksa...</span>
          </span>
        )}
        {state.status === 'available' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 size={12} />
            <span>Tersedia</span>
          </span>
        )}
        {state.status === 'unchanged' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 size={12} />
            <span>Aktif digunakan</span>
          </span>
        )}
        {state.status === 'taken' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 shrink-0">
            <XCircle size={12} />
            <span>Sudah dipakai</span>
          </span>
        )}
        {state.status === 'invalid' && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 shrink-0">
            <XCircle size={12} />
            <span>Format salah</span>
          </span>
        )}
        {state.status === 'empty' && (
          <span className="text-[10px] sm:text-[11px] font-normal text-slate-400 dark:text-zinc-500 shrink-0">
            ID unik untuk login (selain email)
          </span>
        )}
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-mono font-bold text-slate-400 dark:text-zinc-500">
          @
        </span>
        <input
          type="text"
          maxLength={USERNAME_MAX_LENGTH}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(normalizeUsernameInput(e.target.value))}
          className={`w-full ${inputBgClassName} border rounded-full pl-9 pr-10 py-2.5 text-xs sm:text-sm font-mono text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 outline-none transition-all ${
            isErrorState
              ? 'border-rose-400 dark:border-rose-500 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
              : isOkState
                ? 'border-emerald-400/80 dark:border-emerald-700 focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20'
                : 'border-slate-200 dark:border-zinc-700 focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20'
          }`}
        />
        <div className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
          {state.status === 'checking' && <Loader2 size={14} className="animate-spin text-amber-500" />}
          {isOkState && <CheckCircle2 size={14} className="text-emerald-500" />}
          {isErrorState && <XCircle size={14} className="text-rose-500" />}
        </div>
      </div>

      {/* Live validation & rule checklist */}
      {isErrorState && state.message && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 leading-relaxed">
          {state.message}
        </p>
      )}

      {!compactRules && (state.status === 'invalid' || state.status === 'empty') && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ruleChips.map((chip) => (
            <span
              key={chip.label}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                normalized.length === 0
                  ? 'bg-slate-50 dark:bg-zinc-800/70 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                  : chip.ok
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
              }`}
            >
              {normalized.length > 0 && chip.ok && <Check size={9} strokeWidth={3} />}
              <span>{chip.label}</span>
            </span>
          ))}
        </div>
      )}

      {compactRules && state.status === 'empty' && (
        <p className="mt-1.5 text-[10px] text-slate-400 dark:text-zinc-500">
          {USERNAME_MIN_LENGTH}–{USERNAME_MAX_LENGTH} karakter (a-z, 0-9, ., _, -), diawali &amp; diakhiri huruf/angka.
        </p>
      )}
    </div>
  );
};
