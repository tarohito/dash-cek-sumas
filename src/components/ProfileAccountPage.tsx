import React, { useEffect, useRef, useState } from 'react';
import {
  User,
  KeyRound,
  Eye,
  EyeOff,
  Camera,
  Trash2,
  Sparkles,
  ShieldCheck,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import { compressAndConvertToWebP } from '../utils/imageOptimizer';

export interface ProfileAccountUser {
  id: string;
  name: string;
  username?: string;
  email: string;
  phone?: string;
  role: string;
  avatar?: string | null;
  status?: 'Aktif' | 'Nonaktif';
}

export interface ProfileUpdatePayload {
  name: string;
  email: string;
  phone: string;
  avatar: string;
  currentPassword?: string;
  newPassword?: string;
}

interface ProfileAccountPageProps {
  user: ProfileAccountUser | null;
  onSave: (payload: ProfileUpdatePayload) => Promise<{ ok: boolean; error?: string; passwordUpdated?: boolean }>;
}

type SectionKey = 'informasi' | 'keamanan';

const isValidEmailFormat = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

export const ProfileAccountPage: React.FC<ProfileAccountPageProps> = ({
  user,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [activeSection, setActiveSection] = useState<SectionKey>('informasi');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionInformasiRef = useRef<HTMLElement>(null);
  const sectionKeamananRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setPhone(user.phone || '');
      setAvatar(user.avatar || '');
    }
  }, [user]);

  if (!user) return null;

  const isPasswordFilled = Boolean(isChangingPassword && (currentPassword || newPassword || confirmPassword));
  const isProfileDirty = Boolean(
    name.trim() !== (user.name || '').trim() ||
    email.trim() !== (user.email || '').trim() ||
    phone.trim() !== (user.phone || '').trim() ||
    avatar.trim() !== (user.avatar || '').trim()
  );
  const hasChanges = isProfileDirty || isPasswordFilled;

  const openPasswordChange = () => {
    setIsChangingPassword(true);
    setErrorMsg(null);
    setTimeout(() => {
      setActiveSection('keamanan');
      sectionKeamananRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const closePasswordChange = () => {
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setErrorMsg(null);
    if (activeSection === 'keamanan') {
      setActiveSection('informasi');
    }
  };

  const scrollToSection = (section: SectionKey) => {
    setActiveSection(section);
    let targetRef: React.RefObject<HTMLElement | null> | null = null;
    if (section === 'informasi') targetRef = sectionInformasiRef;
    if (section === 'keamanan') targetRef = sectionKeamananRef;

    if (targetRef?.current) {
      targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const scrollPos = scrollContainerRef.current.scrollTop + 140;
    const secTop = sectionKeamananRef.current?.offsetTop || 0;

    if (secTop && scrollPos >= secTop) {
      setActiveSection('keamanan');
    } else {
      setActiveSection('informasi');
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Silakan pilih file gambar (JPG, PNG, WebP).');
      return;
    }
    try {
      setErrorMsg(null);
      const optimized = await compressAndConvertToWebP(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 });
      setAvatar(optimized);
    } catch {
      setErrorMsg('Gagal memproses foto profil.');
    }
    e.target.value = '';
  };

  const generateRandomPassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const nums = '23456789';
    const syms = '!@#$%&*';
    const all = upper + lower + nums + syms;
    let res = '';
    res += upper.charAt(Math.floor(Math.random() * upper.length));
    res += lower.charAt(Math.floor(Math.random() * lower.length));
    res += nums.charAt(Math.floor(Math.random() * nums.length));
    res += syms.charAt(Math.floor(Math.random() * syms.length));
    for (let i = 0; i < 6; i++) {
      res += all.charAt(Math.floor(Math.random() * all.length));
    }
    const shuffled = res.split('').sort(() => 0.5 - Math.random()).join('');
    setNewPassword(shuffled);
    setConfirmPassword(shuffled);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
  };

  const handleResetChanges = () => {
    setName(user.name || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setAvatar(user.avatar || '');
    setIsChangingPassword(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setErrorMsg(null);
    if (activeSection === 'keamanan') {
      setActiveSection('informasi');
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg('Nama lengkap wajib diisi.');
      scrollToSection('informasi');
      return;
    }
    if (!email.trim() || !isValidEmailFormat(email)) {
      setErrorMsg('Format alamat email tidak valid.');
      scrollToSection('informasi');
      return;
    }

    if (isPasswordFilled) {
      if (!currentPassword) {
        setErrorMsg('Kata sandi saat ini wajib diisi untuk mengubah kata sandi.');
        scrollToSection('keamanan');
        return;
      }
      if (newPassword.trim().length < 6) {
        setErrorMsg('Kata sandi baru minimal harus 6 karakter.');
        scrollToSection('keamanan');
        return;
      }
      if (newPassword !== confirmPassword) {
        setErrorMsg('Konfirmasi kata sandi baru tidak cocok.');
        scrollToSection('keamanan');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload: ProfileUpdatePayload = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        avatar: avatar.trim(),
      };
      if (isPasswordFilled) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword.trim();
      }

      const result = await onSave(payload);
      if (!result.ok) {
        setErrorMsg(result.error || 'Gagal menyimpan perubahan akun.');
      } else {
        if (isPasswordFilled) {
          setIsChangingPassword(false);
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setShowCurrentPassword(false);
          setShowNewPassword(false);
          setShowConfirmPassword(false);
          if (activeSection === 'keamanan') {
            setActiveSection('informasi');
          }
        }
        setErrorMsg(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionsBody = (
    <>
      {errorMsg && (
        <div className="p-3.5 rounded-2xl text-xs sm:text-sm font-medium flex items-center gap-2.5 border bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300">
          <AlertCircle size={16} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 1: INFORMASI AKUN (2 KOLOM: FOTO 1:1 KIRI | FORM DETAIL KANAN)    */}
      {/* ========================================================================= */}
      <section
        id="section-informasi-akun"
        ref={sectionInformasiRef}
        className="scroll-mt-20 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs"
      >
        <div className="border-b border-slate-100 dark:border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-snug flex items-center gap-2">
            <User size={16} className="text-[#c28e62]" />
            <span>Informasi Akun</span>
          </h2>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>{user.status || 'Aktif'}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#c28e62]/10 text-[#9c6a3e] dark:text-[#e1b792] border border-[#c28e62]/25">
              <ShieldCheck size={12} />
              <span>{user.role}</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          {/* KOLOM KIRI: FOTO PROFIL (RASIO 1:1 KOTAK IDENTIK DENGAN TAMBAH SKU) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full aspect-square max-w-[320px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/40 relative overflow-hidden group flex flex-col items-center justify-center text-center p-2 transition-all hover:border-[#c28e62]">
              {avatar ? (
                <>
                  <img
                    src={avatar}
                    alt={name || 'Foto Profil'}
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-full bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer shadow-xs"
                    >
                      Ganti Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatar('')}
                      className="p-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer shadow-xs"
                      title="Hapus Foto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center cursor-pointer p-4 w-full h-full"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Camera size={26} />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-1">
                    Unggah Foto Profil
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-[200px] leading-relaxed">
                    Format JPG, PNG, WEBP. Rasio kotak 1:1.
                  </span>
                </div>
              )}

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarFileChange}
                accept="image/*"
                className="hidden"
              />
            </div>
          </div>

          {/* KOLOM KANAN: NAMA LENGKAP, EMAIL, WHATSAPP & PERAN */}
          <div className="lg:col-span-7 space-y-4 sm:space-y-5">
            {/* Nama Lengkap */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                  {name.length}/120 Karakter
                </span>
              </div>
              <input
                type="text"
                maxLength={120}
                placeholder="Masukkan nama lengkap akun"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* Alamat Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Alamat Email <span className="text-rose-500">*</span>
              </label>
              <input
                type="email"
                placeholder="contoh@perusahaan.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors ${
                  email.trim().length > 0 && !isValidEmailFormat(email)
                    ? 'border-rose-500 focus:border-rose-500 bg-rose-50/20 dark:bg-rose-950/20'
                    : 'border-slate-200 dark:border-zinc-700 focus:border-[#c28e62]'
                }`}
              />
              {email.trim().length > 0 && !isValidEmailFormat(email) && (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  <AlertCircle size={13} className="shrink-0 text-rose-500" />
                  <span>Format alamat email tidak valid.</span>
                </p>
              )}
            </div>

            {/* Nomor WhatsApp */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Nomor WhatsApp
                </label>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">Opsional</span>
              </div>
              <input
                type="tel"
                placeholder="Contoh: +62 812-3456-7890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* Peran Akun (Read-only konsisten) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Peran &amp; Hak Akses
              </label>
              <div className="w-full px-5 py-2.5 bg-slate-100/70 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-700/70 rounded-full text-xs sm:text-sm text-slate-600 dark:text-zinc-300 flex items-center justify-between gap-2">
                <span className="font-semibold">{user.role}</span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">Ditetapkan oleh Super Admin</span>
              </div>
            </div>

            {/* Kata Sandi (Pemicu tampilnya area ganti sandi) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                Kata Sandi
              </label>
              <div className="w-full pl-5 pr-2 py-1.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-600 dark:text-zinc-300 flex items-center justify-between gap-3">
                <span className="font-mono tracking-widest text-slate-400 dark:text-zinc-500 select-none">
                  ••••••••••
                </span>
                {isChangingPassword ? (
                  <button
                    type="button"
                    onClick={closePasswordChange}
                    className="h-8 px-3.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <X size={13} />
                    <span>Batal Ganti Sandi</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openPasswordChange}
                    className="h-8 px-3.5 rounded-full bg-[#c28e62]/10 hover:bg-[#c28e62]/20 text-[#9c6a3e] dark:text-[#e1b792] border border-[#c28e62]/25 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <KeyRound size={13} />
                    <span>Ganti Kata Sandi</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: KEAMANAN & KATA SANDI (HANYA MUNCUL SAAT INGIN GANTI SANDI)    */}
      {/* ========================================================================= */}
      {isChangingPassword && (
      <section
        id="section-keamanan-sandi"
        ref={sectionKeamananRef}
        className="scroll-mt-20 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-5 shadow-xs animate-in fade-in slide-in-from-top-2 duration-200"
      >
        <div className="border-b border-slate-100 dark:border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-snug flex items-center gap-2">
              <KeyRound size={16} className="text-[#c28e62]" />
              <span>Keamanan &amp; Ubah Kata Sandi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
              Masukkan kata sandi saat ini dan kata sandi baru, lalu klik Simpan Perubahan.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <button
              type="button"
              onClick={generateRandomPassword}
              className="text-xs text-[#c28e62] hover:text-[#b07d53] font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Sparkles size={13} />
              <span>Acak Sandi Otomatis</span>
            </button>
            <button
              type="button"
              onClick={closePasswordChange}
              className="h-8 px-3 rounded-full border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <X size={13} />
              <span>Batal</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {/* Kata Sandi Saat Ini */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Kata Sandi Saat Ini
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Masukkan sandi saat ini"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-5 pr-11 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm font-mono text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
              >
                {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Kata Sandi Baru */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Kata Sandi Baru
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                placeholder="Minimal 6 karakter"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-5 pr-11 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm font-mono text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
              >
                {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Konfirmasi Kata Sandi Baru */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
              Konfirmasi Kata Sandi Baru
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Tulis ulang sandi baru"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`w-full px-5 pr-11 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border rounded-full text-xs sm:text-sm font-mono text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none transition-colors ${
                  newPassword && confirmPassword && newPassword !== confirmPassword
                    ? 'border-rose-500 focus:border-rose-500 bg-rose-50/20 dark:bg-rose-950/20'
                    : newPassword && confirmPassword && newPassword === confirmPassword
                    ? 'border-emerald-500/80 focus:border-emerald-500'
                    : 'border-slate-200 dark:border-zinc-700 focus:border-[#c28e62]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
              >
                {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {newPassword && confirmPassword && (
              newPassword === confirmPassword ? (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                  <Check size={13} className="shrink-0" />
                  <span>Konfirmasi kata sandi cocok.</span>
                </p>
              ) : (
                <p className="flex items-center gap-1.5 mt-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
                  <AlertCircle size={13} className="shrink-0 text-rose-500" />
                  <span>Konfirmasi kata sandi tidak cocok.</span>
                </p>
              )
            )}
          </div>
        </div>
      </section>
      )}
    </>
  );

  // Mode Full Page (Halaman Akun Admin Brand — identik dengan struktur halaman Tambah SKU Produk)
  return (
    <form
      onSubmit={handleSubmit}
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-zinc-950 flex flex-col animate-in fade-in duration-300"
      >
        {/* FULL-WIDTH STICKY SUB-HEADER: IDENTIK DENGAN TAMBAH SKU PRODUK */}
        <div className="sticky top-0 z-30 w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 shadow-xs">
          <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
            {/* SISI KIRI: MENU ANCHOR NAVIGASI UNDERLINE */}
            <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto scrollbar-none flex-1 min-w-0 h-full">
              <button
                type="button"
                onClick={() => scrollToSection('informasi')}
                className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                  activeSection === 'informasi'
                    ? 'border-[#c28e62] text-[#c28e62] font-bold'
                    : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                <User size={15} />
                <span>Informasi Akun</span>
              </button>

              {isChangingPassword && (
                <button
                  type="button"
                  onClick={() => scrollToSection('keamanan')}
                  className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                    activeSection === 'keamanan'
                      ? 'border-[#c28e62] text-[#c28e62] font-bold'
                      : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <KeyRound size={15} />
                  <span>Keamanan &amp; Sandi</span>
                </button>
              )}
            </div>

            {/* SISI KANAN: TOMBOL RESET & SIMPAN PERUBAHAN */}
            <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
              <button
                type="button"
                disabled={!hasChanges || isSubmitting}
                onClick={handleResetChanges}
                className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={!hasChanges || isSubmitting}
                className="h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap active:scale-95"
              >
                {isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>

        {/* KONTEN UTAMA FORMULIR AKUN (MAX-W-1720PX KONSISTEN DENGAN TAMBAH SKU) */}
        <div className="w-full max-w-[1720px] mx-auto p-3.5 sm:p-5 md:p-6 lg:p-8 space-y-6 sm:space-y-7 pb-20 sm:pb-24">
          {sectionsBody}
        </div>
      </div>
    </form>
  );
};
