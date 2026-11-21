import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  Check,
  CheckCircle2,
  ShieldCheck,
  Mail,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import { getInitialsAvatar } from '../utils/avatar';

export interface ResetPasswordUser {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string | null;
  status?: 'Aktif' | 'Nonaktif' | string;
  createdAt?: string;
}

export interface PasswordResetRequestContext {
  requestId?: string;
  requestedAt?: string;
  reason?: string;
  status?: string;
  actionNote?: string;
  tempPassword?: string | null;
  emailSent?: boolean;
}

interface ResetPasswordPageProps {
  user: ResetPasswordUser;
  requestContext?: PasswordResetRequestContext | null;
  onBack: () => void;
  onPasswordSaved: (userId: string, newPassword: string) => Promise<void>;
  onAlert: (
    title: string,
    message: string,
    type?: 'success' | 'warning' | 'info' | 'error'
  ) => void;
}

const createSecureRandomPassword = (length = 12): string => {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnpqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%&*';
  const all = uppercase + lowercase + numbers + symbols;

  const getRandomIndex = (max: number) => {
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] % max;
    }
    return Math.floor(Math.random() * max);
  };

  const chars = [
    uppercase[getRandomIndex(uppercase.length)],
    lowercase[getRandomIndex(lowercase.length)],
    numbers[getRandomIndex(numbers.length)],
    symbols[getRandomIndex(symbols.length)],
  ];
  for (let i = chars.length; i < length; i++) {
    chars.push(all[getRandomIndex(all.length)]);
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({
  user,
  requestContext,
  onBack,
  onPasswordSaved,
  onAlert,
}) => {
  const [appliedPassword, setAppliedPassword] = useState<string | null>(
    requestContext?.tempPassword || null
  );
  const [showAppliedPassword, setShowAppliedPassword] = useState(true);
  const [copiedKey, setCopiedKey] = useState<'password' | 'message' | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(true);
  const [showConfirmPassword, setShowConfirmPassword] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasCustomSaved, setHasCustomSaved] = useState(false);

  useEffect(() => {
    setAppliedPassword(requestContext?.tempPassword || null);
    setShowAppliedPassword(true);
    setHasCustomSaved(false);
    setCopiedKey(null);
    if (!requestContext?.tempPassword) {
      const generated = createSecureRandomPassword(12);
      setNewPassword(generated);
      setConfirmPassword(generated);
    } else {
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [user.id, requestContext?.requestId, requestContext?.tempPassword]);

  const handleGenerateRandom = () => {
    const generated = createSecureRandomPassword(12);
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
  };

  const copyText = async (text: string, key: 'password' | 'message', label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      onAlert('Berhasil Disalin', `${label} telah disalin ke clipboard.`, 'success');
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 2500);
    } catch {
      onAlert('Gagal Menyalin', 'Silakan salin teks kata sandi secara manual.', 'warning');
    }
  };

  const handleCopyPassword = () => {
    if (!appliedPassword) return;
    copyText(appliedPassword, 'password', 'Kata sandi baru');
  };

  const handleCopyMessage = () => {
    if (!appliedPassword) return;
    const msg = [
      `Halo ${user.name},`,
      `Permintaan reset kata sandi akun Sumas Anda telah disetujui.`,
      `Email Login: ${user.email}`,
      `Kata Sandi Baru: ${appliedPassword}`,
      `Silakan masuk menggunakan kata sandi di atas.`,
    ].join('\n');
    copyText(msg, 'message', 'Pesan kredensial untuk pengguna');
  };

  const isPasswordLongEnough = newPassword.trim().length >= 8;
  const hasMixedChars = /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword);
  const isPasswordMatched =
    newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const canSubmitCustom = isPasswordLongEnough && isPasswordMatched && !isSaving;

  const handleSubmitCustomPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPassword.trim();
    if (trimmed.length < 8) {
      onAlert('Validasi Kata Sandi', 'Kata sandi baru minimal terdiri dari 8 karakter.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      onAlert('Validasi Kata Sandi', 'Konfirmasi kata sandi baru tidak cocok.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      await onPasswordSaved(user.id, trimmed);
      setAppliedPassword(trimmed);
      setShowAppliedPassword(true);
      setHasCustomSaved(true);
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setIsSaving(false);
    }
  };

  const isInactive = (user.status || 'Aktif') === 'Nonaktif';

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300">
      <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
        {/* TOP BAR HALAMAN (KONSISTEN DENGAN USERS & HALAMAN DASHBOARD LAINNYA) */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-5 py-3.5 min-h-[62px] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <KeyRound size={16} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-snug truncate">
                Reset Kata Sandi Pengguna
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                Pengguna / Reset Kata Sandi · {user.name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-auto">
            {requestContext?.requestId && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                <CheckCircle2 size={14} />
                <span>Pengajuan disetujui</span>
              </span>
            )}
            <button
              type="button"
              onClick={onBack}
              className="h-9 px-4 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold inline-flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap"
            >
              Kembali
            </button>
          </div>
        </div>

        {/* MAIN 2-COLUMN WORKSPACE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* KOLOM KIRI: KARTU TERPADU PROFIL PENGGUNA & DETAIL PENGAJUAN */}
          <div className="lg:col-span-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
            {/* PROFIL AKUN */}
            <div className="p-5 sm:p-6 space-y-5">
              <div className="flex items-center gap-3.5">
                <img
                  src={user.avatar || getInitialsAvatar(user.name, user.id || user.email || user.name)}
                  alt={user.name}
                  onError={(e) => {
                    const el = e.currentTarget;
                    el.onerror = null;
                    el.src = getInitialsAvatar(user.name, user.id || user.email || user.name);
                  }}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-zinc-700 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm sm:text-[15px] font-bold text-slate-800 dark:text-zinc-100 truncate">
                    {user.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                    {user.email}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] font-medium">
                    <span className="text-[#b07d53] dark:text-[#d4a379]">{user.role}</span>
                    <span className="text-slate-300 dark:text-zinc-700">·</span>
                    <span
                      className={
                        isInactive
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {user.status || 'Aktif'}
                    </span>
                  </div>
                </div>
              </div>

              <dl className="pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400 dark:text-zinc-500 shrink-0">Username</dt>
                  <dd className="font-mono font-medium text-slate-700 dark:text-zinc-200 truncate">
                    @{user.username || user.email.split('@')[0]}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-400 dark:text-zinc-500 shrink-0">Email Login</dt>
                  <dd className="font-medium text-slate-700 dark:text-zinc-200 truncate">
                    {user.email}
                  </dd>
                </div>
                {user.phone && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-400 dark:text-zinc-500 shrink-0">Telepon</dt>
                    <dd className="font-mono text-slate-700 dark:text-zinc-200 tabular-nums truncate">
                      {user.phone}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* PERINGATAN AKUN NONAKTIF (FLAT STRIP) */}
            {isInactive && (
              <div className="px-5 sm:px-6 py-4 bg-amber-50/70 dark:bg-amber-950/25 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertCircle size={15} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <p className="leading-relaxed">
                  Akun pengguna sedang <span className="font-semibold">Nonaktif</span>. Aktifkan akun di daftar pengguna agar pengguna dapat masuk kembali.
                </p>
              </div>
            )}

            {/* DETAIL PENGAJUAN RESET SANDI (TERINTEGRASI TANPA NESTED CARDS) */}
            {requestContext && (
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold tracking-tight text-slate-800 dark:text-zinc-100">
                    Detail Pengajuan
                  </h4>
                  {requestContext.requestedAt && (
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 tabular-nums">
                      {requestContext.requestedAt}
                    </span>
                  )}
                </div>

                {requestContext.reason && (
                  <div className="border-l-2 border-[#c28e62]/50 pl-3 py-0.5 space-y-1">
                    <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">
                      Catatan pemohon
                    </p>
                    <p className="text-xs text-slate-700 dark:text-zinc-200 leading-relaxed">
                      {requestContext.reason}
                    </p>
                  </div>
                )}

                <div className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-zinc-400 leading-relaxed pt-1">
                  <Mail
                    size={14}
                    className={`shrink-0 mt-0.5 ${
                      requestContext.emailSent
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  />
                  <span>
                    {requestContext.emailSent
                      ? `Email berisi kata sandi sementara telah dikirim ke ${user.email}.`
                      : 'Pengiriman email otomatis belum aktif. Salin kata sandi di samping dan berikan langsung kepada pengguna.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* KOLOM KANAN: SANDI AKTIF + FORM TETAPKAN KATA SANDI */}
          <div className="lg:col-span-8 space-y-5 sm:space-y-6">
            {/* KARTU KATA SANDI AKTIF (FLAT & BERSIH) */}
            {appliedPassword && (
              <section className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl overflow-hidden">
                <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <ShieldCheck size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-zinc-100 leading-snug">
                      {hasCustomSaved
                        ? 'Kata Sandi Kustom Berhasil Diterapkan'
                        : 'Kata Sandi Sementara Aktif'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Tersimpan di database · seluruh sesi login lama pengguna telah dicabut.
                    </p>
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="bg-slate-50 dark:bg-zinc-950/60 border border-slate-200/90 dark:border-zinc-800 rounded-xl px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">
                        Kata sandi aktif untuk {user.email}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-base sm:text-lg font-mono font-bold tracking-wider text-slate-900 dark:text-zinc-100 select-all break-all">
                          {showAppliedPassword ? appliedPassword : '••••••••••••'}
                        </code>
                        <button
                          type="button"
                          onClick={() => setShowAppliedPassword((prev) => !prev)}
                          className="w-7 h-7 rounded-lg text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          aria-label={showAppliedPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                        >
                          {showAppliedPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleCopyPassword}
                        className="h-9 px-4 rounded-full bg-[#c28e62] hover:bg-[#b07d53] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                      >
                        {copiedKey === 'password' ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedKey === 'password' ? 'Tersalin' : 'Salin Sandi'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyMessage}
                        className="h-9 px-4 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                      >
                        {copiedKey === 'message' ? <Check size={14} /> : <MessageSquare size={14} />}
                        <span>{copiedKey === 'message' ? 'Pesan Tersalin' : 'Salin Pesan'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* FORM TETAPKAN / UBAH KATA SANDI BARU */}
            <form
              onSubmit={handleSubmitCustomPassword}
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl overflow-hidden"
            >
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-snug">
                      {appliedPassword ? 'Ubah ke Kata Sandi Kustom' : 'Tetapkan Kata Sandi Baru'}
                    </h3>
                    {appliedPassword && (
                      <span className="text-xs font-normal text-slate-400 dark:text-zinc-500">
                        Opsional
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {appliedPassword
                      ? 'Gunakan sandi sementara di atas atau tetapkan kata sandi kustom pilihan Anda.'
                      : 'Masukkan kata sandi baru minimal 8 karakter untuk akun pengguna ini.'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateRandom}
                  className="h-9 px-4 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-[#c28e62] dark:hover:border-[#c28e62] text-slate-700 dark:text-zinc-200 hover:text-[#b07d53] dark:hover:text-[#d4a379] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 self-start sm:self-auto whitespace-nowrap active:scale-95"
                >
                  <Sparkles size={13} />
                  <span>Acak Sandi</span>
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {/* Kata Sandi Baru */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="reset-page-new-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                      >
                        Kata Sandi Baru <span className="text-rose-500">*</span>
                      </label>
                      {newPassword.length > 0 && (
                        <span
                          className={`text-[11px] font-medium tabular-nums ${
                            isPasswordLongEnough
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {newPassword.length} karakter
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock
                        size={15}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 pointer-events-none"
                      />
                      <input
                        id="reset-page-new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 8 karakter..."
                        autoComplete="new-password"
                        className="w-full py-2.5 bg-slate-50 dark:bg-zinc-800/80 focus:bg-white dark:focus:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-full pl-10 pr-10 text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] font-mono transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-1"
                        aria-label={showNewPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                      >
                        {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Konfirmasi Kata Sandi Baru */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="reset-page-confirm-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                      >
                        Konfirmasi Kata Sandi <span className="text-rose-500">*</span>
                      </label>
                      {newPassword && confirmPassword && (
                        <span
                          className={`text-[11px] font-medium ${
                            isPasswordMatched
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isPasswordMatched ? 'Cocok' : 'Tidak cocok'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Lock
                        size={15}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 pointer-events-none"
                      />
                      <input
                        id="reset-page-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi kata sandi baru..."
                        autoComplete="new-password"
                        className={`w-full py-2.5 bg-slate-50 dark:bg-zinc-800/80 focus:bg-white dark:focus:bg-zinc-900 border rounded-full pl-10 pr-10 text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none font-mono transition-colors ${
                          newPassword && confirmPassword && !isPasswordMatched
                            ? 'border-rose-400 dark:border-rose-500 focus:border-rose-500'
                            : 'border-slate-200 dark:border-zinc-700 focus:border-[#c28e62]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-1"
                        aria-label={
                          showConfirmPassword ? 'Sembunyikan konfirmasi sandi' : 'Tampilkan konfirmasi sandi'
                        }
                      >
                        {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* INDIKATOR VALIDASI RINGKAS (UNBOXED) */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      isPasswordLongEnough
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400 dark:text-zinc-500'
                    }`}
                  >
                    <Check size={12} />
                    <span>Minimal 8 karakter</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      hasMixedChars
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400 dark:text-zinc-500'
                    }`}
                  >
                    <Check size={12} />
                    <span>Kombinasi huruf kapital &amp; angka</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 ${
                      isPasswordMatched
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400 dark:text-zinc-500'
                    }`}
                  >
                    <Check size={12} />
                    <span>Konfirmasi sandi cocok</span>
                  </span>
                </div>
              </div>

              {/* FOOTER AKSI FORM */}
              <div className="px-5 sm:px-6 py-4 bg-slate-50/70 dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Sesi login lama pengguna otomatis dicabut setelah kata sandi disimpan.
                </p>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={onBack}
                    className="flex-1 sm:flex-initial h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!canSubmitCustom}
                    className="flex-1 sm:flex-initial h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    <span>{isSaving ? 'Menyimpan...' : 'Simpan Kata Sandi'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
