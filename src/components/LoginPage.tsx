import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sun,
  Moon,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { SumasLogo } from './BrandLogo';
import { CustomCheckbox } from './CustomCheckbox';
import { RbacMatrix } from '../utils/rbac';
import { setStoredSessionToken, apiFetch } from '../utils/authSession';

interface LoginPageProps {
  isDarkMode: boolean;
  onToggleTheme: (e?: React.MouseEvent) => void;
  onLoginSuccess: (payload: {
    user: any;
    permissions?: string[];
    matrix?: RbacMatrix;
    sessionToken?: string;
    rememberMe?: boolean;
  }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isDarkMode,
  onToggleTheme,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // State formulir Lupa Kata Sandi
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  const currentYear = new Date().getFullYear();

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMessage('Masukkan email/username dan kata sandi.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          password,
          rememberMe,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setErrorMessage(data?.error || 'Kredensial tidak valid.');
        return;
      }
      if (data?.sessionToken) {
        setStoredSessionToken(data.sessionToken, rememberMe);
      }
      onLoginSuccess({
        user: data.user,
        permissions: data.permissions,
        matrix: data.matrix,
        sessionToken: data.sessionToken,
        rememberMe,
      });
    } catch {
      setErrorMessage('Gagal terhubung ke server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      setResetErrorMessage('Masukkan email atau username akun.');
      return;
    }

    setResetErrorMessage('');
    setResetSuccessMessage('');
    setIsSubmittingReset(true);
    try {
      const res = await apiFetch('/api/password-resets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: resetIdentifier.trim(),
          userEmail: resetIdentifier.trim(),
          reason: resetReason.trim() || 'Permintaan reset kata sandi dari halaman login',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetErrorMessage(data?.error || 'Gagal mengirim permohonan.');
        return;
      }
      setResetSuccessMessage(
        data?.message || 'Permohonan reset kata sandi telah dikirim ke Super Admin.'
      );
      setResetIdentifier('');
      setResetReason('');
    } catch {
      setResetErrorMessage('Gagal terhubung ke server.');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  return (
    <div className="h-dvh w-full overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-white dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 antialiased">
      {/* KOLOM KIRI: TETAP FULL VIEWPORT (TIDAK IKUT SCROLL) */}
      <aside className="hidden lg:flex lg:col-span-5 xl:col-span-6 h-full min-h-0 relative flex-col justify-between bg-gradient-to-br from-[rgb(80,80,153)] to-[rgb(36,32,86)] text-white p-8 lg:p-10 xl:p-14 overflow-hidden">
        {/* Logo mode gelap langsung tanpa pembungkus putih */}
        <div className="relative z-10 shrink-0">
          <SumasLogo className="h-8 w-auto object-contain" forceLightText />
        </div>

        {/* Judul singkat minimal */}
        <div className="relative z-10 max-w-md my-auto">
          <h2 className="text-2xl xl:text-3xl font-bold tracking-tight text-white leading-snug [text-wrap:balance]">
            Sistem Autentikasi Produk &amp; Manajemen Tag QR.
          </h2>
        </div>

        {/* Copyright & Credit */}
        <div className="relative z-10 shrink-0 pt-6 border-t border-white/15 flex flex-col gap-1">
          <p className="text-xs font-medium text-white/80">
            &copy; {currentYear} SUMAS. Seluruh hak cipta dilindungi.
          </p>
          <p className="text-[11px] text-white/60">
            Dikembangkan oleh <span className="font-semibold text-white/90">FruityLogic</span>
          </p>
        </div>
      </aside>

      {/* KOLOM KANAN: SATU-SATUNYA AREA YANG DAPAT DI-SCROLL */}
      <section className="lg:col-span-7 xl:col-span-6 h-full min-h-0 overflow-y-auto overscroll-contain bg-[#F8F9FB] dark:bg-zinc-950">
        <div className="min-h-full flex flex-col justify-between px-5 py-5 sm:px-8 sm:py-7 lg:px-10 lg:py-8 xl:px-14 xl:py-10">
          {/* Baris atas: Logo mobile & tombol tema */}
          <header className="flex items-center justify-between shrink-0">
            <div className="lg:hidden flex items-center">
              <SumasLogo className="h-7 w-auto object-contain" />
            </div>
            <div className="hidden lg:block" />
            <button
              type="button"
              onClick={(e) => onToggleTheme(e)}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-slate-200/90 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 hover:bg-slate-100 dark:hover:bg-zinc-700/60 flex items-center justify-center overflow-hidden transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-[#c28e62]/30 cursor-pointer"
              data-tooltip={isDarkMode ? 'Mode Terang' : 'Mode Gelap'}
              data-tooltip-pos="bottom"
              aria-label="Toggle tema siang dan malam"
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                {/* Ikon Matahari (Siang) */}
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${
                    isDarkMode
                      ? 'rotate-90 scale-0 opacity-0 text-amber-400'
                      : 'rotate-0 scale-100 opacity-100 text-amber-500 drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]'
                  }`}
                >
                  <Sun size={19} className="stroke-[2.2]" />
                </div>

                {/* Ikon Bulan (Malam) */}
                <div
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${
                    isDarkMode
                      ? 'rotate-0 scale-100 opacity-100 text-indigo-300 drop-shadow-[0_0_8px_rgba(165,180,252,0.4)]'
                      : '-rotate-90 scale-0 opacity-0 text-slate-400'
                  }`}
                >
                  <Moon size={18} className="stroke-[2.2]" />
                </div>
              </div>
            </button>
          </header>

          {/* Formulir terpusat (otomatis center di layar tinggi, scroll mulus di layar pendek) */}
          <main className="w-full max-w-[392px] mx-auto my-auto py-5 sm:py-6">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/90 dark:border-zinc-800 rounded-2xl p-6 sm:p-7">
              {mode === 'login' ? (
                <div className="space-y-5">
                <div className="space-y-1">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-tight">
                    Masuk
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Gunakan akun terdaftar untuk melanjutkan.
                  </p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-identifier"
                      className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                    >
                      Email atau Username
                    </label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500"
                      />
                      <input
                        id="login-identifier"
                        type="text"
                        autoComplete="username"
                        autoFocus
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="nama@perusahaan.com"
                        className="w-full h-11 pl-10 pr-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-950/60 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#c28e62]/20 focus:border-[#c28e62] transition-all"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="login-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                      >
                        Kata Sandi
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('forgot');
                          setResetIdentifier(identifier);
                          setResetErrorMessage('');
                          setResetSuccessMessage('');
                        }}
                        className="text-xs font-medium text-[#b07d53] dark:text-[#d4a379] hover:underline cursor-pointer"
                      >
                        Lupa sandi?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock
                        size={16}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500"
                      />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="••••••••"
                        className="w-full h-11 pl-10 pr-11 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-950/60 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#c28e62]/20 focus:border-[#c28e62] transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer"
                        aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-0.5">
                    <CustomCheckbox
                      id="login-remember"
                      checked={rememberMe}
                      onChange={setRememberMe}
                      size="sm"
                      label="Ingat saya"
                    />
                  </div>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-700 dark:text-rose-300"
                    >
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-11 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-all flex items-center justify-center cursor-pointer"
                  >
                    <span>{isSubmitting ? 'Memproses...' : 'Masuk'}</span>
                  </button>
                </form>

                {/* Informasi Akun Login Sementara (klik untuk isi otomatis) */}
                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-zinc-500">
                    <span className="font-semibold text-slate-500 dark:text-zinc-400">Akun Sementara</span>
                    <span className="font-mono">Sandi: SumasPass2026!</span>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 overflow-hidden">
                    {[
                      {
                        role: 'Super Admin',
                        email: 'kalinggajeandy3@gmail.com',
                      },
                      {
                        role: 'Admin Brand · 1 Brand (Sumas)',
                        email: 'budi.s@sumas.id',
                      },
                      {
                        role: 'Admin Brand · 3 Brand (Skintific, Somethinc, Whitelab)',
                        email: 'rina.w@sumas.id',
                      },
                    ].map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => {
                          setIdentifier(acc.email);
                          setPassword('SumasPass2026!');
                          setErrorMessage('');
                        }}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-white dark:hover:bg-zinc-900 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-700 dark:text-zinc-200">
                            {acc.role}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 dark:text-zinc-400 truncate">
                            {acc.email}
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-[#b07d53] dark:text-[#d4a379] opacity-80 group-hover:opacity-100 whitespace-nowrap shrink-0">
                          Gunakan
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setResetErrorMessage('');
                    setResetSuccessMessage('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer transition-colors"
                >
                  <ArrowLeft size={14} />
                  <span>Kembali</span>
                </button>

                <div className="space-y-1">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-tight">
                    Reset Kata Sandi
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Permohonan akan diteruskan ke Super Admin.
                  </p>
                </div>

                <form onSubmit={handleForgotSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="reset-identifier"
                      className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                    >
                      Email atau Username
                    </label>
                    <input
                      id="reset-identifier"
                      type="text"
                      value={resetIdentifier}
                      onChange={(e) => {
                        setResetIdentifier(e.target.value);
                        if (resetErrorMessage) setResetErrorMessage('');
                      }}
                      placeholder="nama@perusahaan.com"
                      className="w-full h-11 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-950/60 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#c28e62]/20 focus:border-[#c28e62] transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="reset-reason"
                      className="block text-xs font-semibold text-slate-700 dark:text-zinc-300"
                    >
                      Catatan (Opsional)
                    </label>
                    <textarea
                      id="reset-reason"
                      rows={2}
                      value={resetReason}
                      onChange={(e) => setResetReason(e.target.value)}
                      placeholder="Alasan singkat..."
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-950/60 text-xs sm:text-sm text-slate-900 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:bg-white dark:focus:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#c28e62]/20 focus:border-[#c28e62] resize-none transition-all"
                    />
                  </div>

                  {resetErrorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-xs text-rose-700 dark:text-rose-300"
                    >
                      <AlertCircle size={15} className="shrink-0 mt-0.5" />
                      <span>{resetErrorMessage}</span>
                    </div>
                  )}

                  {resetSuccessMessage && (
                    <div
                      role="status"
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-xs text-emerald-700 dark:text-emerald-300"
                    >
                      <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                      <span>{resetSuccessMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmittingReset}
                    className="w-full h-11 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold transition-all flex items-center justify-center cursor-pointer"
                  >
                    <span>{isSubmittingReset ? 'Mengirim...' : 'Kirim Permohonan'}</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </main>

          {/* Copyright ringkas khusus layar mobile */}
          <footer className="lg:hidden shrink-0 text-center text-[11px] text-slate-400 dark:text-zinc-500 pt-2">
            &copy; {currentYear} SUMAS · Dikembangkan oleh FruityLogic
          </footer>
        </div>
      </section>
    </div>
  );
};
