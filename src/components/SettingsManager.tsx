import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  MapPin,
  Bell,
  Database,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

import { CustomCheckbox } from './CustomCheckbox';
import { apiFetch } from '../utils/authSession';

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  disabled = false,
  className = '',
}) => {
  const handleIncrement = () => {
    if (disabled) return;
    const next = Math.min(max, (value ?? min) + step);
    onChange(next);
  };

  const handleDecrement = () => {
    if (disabled) return;
    const next = Math.max(min, (value ?? min) - step);
    onChange(next);
  };

  return (
    <div
      className={`relative flex items-center bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full h-10 w-28 transition-all shadow-xs ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : 'focus-within:border-[#c28e62] focus-within:ring-2 focus-within:ring-[#c28e62]/20'
      } ${className}`}
    >
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const val = parseInt(e.target.value);
          if (!isNaN(val)) {
            onChange(val);
          } else if (e.target.value === '') {
            onChange(min);
          }
        }}
        className="w-full h-full pl-4 pr-9 text-center font-mono font-bold text-xs sm:text-sm bg-transparent outline-none text-slate-800 dark:text-zinc-100 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <div className="absolute right-3.5 flex flex-col items-center justify-center -space-y-1 select-none pointer-events-auto">
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || value >= max}
          onClick={handleIncrement}
          className="text-slate-400 dark:text-zinc-500 hover:text-[#c28e62] dark:hover:text-[#d4a379] disabled:opacity-20 disabled:hover:text-slate-400 p-0.5 cursor-pointer transition-colors"
          title="Tambah"
        >
          <ChevronUp size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          className="text-slate-400 dark:text-zinc-500 hover:text-[#c28e62] dark:hover:text-[#d4a379] disabled:opacity-20 disabled:hover:text-slate-400 p-0.5 cursor-pointer transition-colors"
          title="Kurangi"
        >
          <ChevronDown size={12} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

interface AnomalyThresholdSettings {
  validMaxScans: number;
  warningMaxScans: number;
  suspiciousMinScans: number;
  cooldownSeconds: number;
  enableImpossibleTravel: boolean;
  maxVelocityKmh: number;
  consecutiveFailureAlert: number;
}

interface LocationPolicySettings {
  mode: 'hybrid' | 'strict' | 'flexible';
  requireGpsByDefault: boolean;
  enforceIndonesiaOnly: boolean;
  maxAccuracyMeters: number;
  detectMockLocation: boolean;
}

interface NotificationSettings {
  emailEnabled: boolean;
  emailRecipients: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  whatsappGatewayUrl: string;
  triggerOnSuspicious: boolean;
  triggerOnImpossibleTravel: boolean;
  throttleMinutes: number;
}

interface BackupInfoSettings {
  lastBackupDate: string;
  autoBackupDaily: boolean;
  retentionDays: number;
}

interface SystemSettings {
  anomalyThreshold: AnomalyThresholdSettings;
  locationPolicy: LocationPolicySettings;
  notifications: NotificationSettings;
  backupInfo: BackupInfoSettings;
  updatedAt?: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
  anomalyThreshold: {
    validMaxScans: 1,
    warningMaxScans: 3,
    suspiciousMinScans: 4,
    cooldownSeconds: 60,
    enableImpossibleTravel: true,
    maxVelocityKmh: 300,
    consecutiveFailureAlert: 3,
  },
  locationPolicy: {
    mode: 'hybrid',
    requireGpsByDefault: true,
    enforceIndonesiaOnly: true,
    maxAccuracyMeters: 150,
    detectMockLocation: true,
  },
  notifications: {
    emailEnabled: true,
    emailRecipients: '',
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    whatsappEnabled: false,
    whatsappNumber: '',
    whatsappGatewayUrl: 'https://api.fonnte.com/send',
    triggerOnSuspicious: true,
    triggerOnImpossibleTravel: true,
    throttleMinutes: 5,
  },
  backupInfo: {
    lastBackupDate: 'Belum ada cadangan',
    autoBackupDaily: true,
    retentionDays: 30,
  },
};

interface SettingsManagerProps {
  onAlert?: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
  isSuperAdmin?: boolean;
  currentUser?: { id: string; name: string; role?: string } | null;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  onAlert,
  isSuperAdmin = true,
  currentUser,
}) => {
  const canManage = Boolean(isSuperAdmin);
  const [activeTab, setActiveTab] = useState<'anomaly' | 'location' | 'notifications' | 'backup'>('anomaly');
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [backupFormat, setBackupFormat] = useState<'mysql' | 'sqlite' | 'json'>('mysql');
  const [isDownloadingBackup, setIsDownloadingBackup] = useState<boolean>(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<{
    generatedAt?: string;
    batches?: number;
    tags?: number;
    brands?: number;
    products?: number;
    categories?: number;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && typeof data === 'object') {
          setSettings({
            anomalyThreshold: { ...DEFAULT_SETTINGS.anomalyThreshold, ...(data.anomalyThreshold || {}) },
            locationPolicy: { ...DEFAULT_SETTINGS.locationPolicy, ...(data.locationPolicy || {}) },
            notifications: { ...DEFAULT_SETTINGS.notifications, ...(data.notifications || {}) },
            backupInfo: { ...DEFAULT_SETTINGS.backupInfo, ...(data.backupInfo || {}) },
            updatedAt: data.updatedAt,
          });
        }
      })
      .catch((err) => {
        console.error('Gagal memuat pengaturan:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  type SettingsSection = 'anomalyThreshold' | 'locationPolicy' | 'notifications' | 'backupInfo';

  const handleUpdate = <K extends SettingsSection>(
    section: K,
    patch: Partial<SystemSettings[K]>
  ) => {
    if (!canManage) return;
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...patch,
      },
    }));
    setHasChanges(true);
  };

  const handleSaveSettings = async () => {
    if (!canManage) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHasChanges(false);
        if (data.settings?.updatedAt) {
          setSettings((prev) => ({ ...prev, updatedAt: data.settings.updatedAt }));
        }
        if (onAlert) {
          onAlert('Pengaturan Disimpan', 'Konfigurasi sistem berhasil diperbarui.', 'success');
        }
      } else {
        throw new Error(data.error || 'Gagal menyimpan pengaturan');
      }
    } catch (err: any) {
      if (onAlert) {
        onAlert('Gagal Menyimpan', err.message || 'Terjadi kesalahan sistem.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAlert = async (channel: 'email' | 'telegram' | 'whatsapp', target: string) => {
    if (!canManage) return;
    setTestingChannel(channel);
    try {
      const res = await apiFetch('/api/settings/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          target,
          config: settings.notifications,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (onAlert) {
          onAlert('Uji Coba Terkirim', data.message, 'success');
        }
      } else {
        throw new Error(data.error || 'Gagal mengirim pesan uji coba');
      }
    } catch (err: any) {
      if (onAlert) {
        onAlert('Uji Coba Gagal', err.message || 'Koneksi gagal.', 'error');
      }
    } finally {
      setTestingChannel(null);
    }
  };

  const handleDownloadBackup = async () => {
    if (!canManage) return;
    setIsDownloadingBackup(true);
    try {
      const res = await apiFetch(`/api/settings/backup?format=${backupFormat}`);
      if (!res.ok) {
        let errMsg = 'Gagal mengunduh cadangan database.';
        try {
          const errData = await res.json();
          if (errData?.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const extMap = { mysql: 'sql', sqlite: 'sqlite', json: 'json' } as const;
      const fallbackName = `sumas-backup-${backupFormat}-${new Date().toISOString().slice(0, 10)}.${extMap[backupFormat]}`;
      const filename = filenameMatch?.[1] || fallbackName;

      const backupDateHeader = res.headers.get('X-Backup-Date');
      if (backupDateHeader) {
        const decodedDate = decodeURIComponent(backupDateHeader);
        setSettings((prev) => ({
          ...prev,
          backupInfo: { ...prev.backupInfo, lastBackupDate: decodedDate },
        }));
      }

      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      if (onAlert) {
        const labelMap = {
          mysql: 'SQL Dump MySQL / phpMyAdmin (.sql)',
          sqlite: 'Database SQLite Asli (.sqlite)',
          json: 'Arsip Lengkap Dashboard (.json)',
        };
        onAlert('Cadangan Diunduh', `Berkas ${labelMap[backupFormat]} berhasil diunduh.`, 'success');
      }
    } catch (err: any) {
      if (onAlert) {
        onAlert('Gagal Mengunduh', err.message || 'Terjadi kesalahan saat membuat cadangan.', 'error');
      }
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleRestoreFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) {
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !parsed.data || !parsed.system) {
        throw new Error('Struktur berkas tidak dikenali sebagai berkas cadangan yang valid (.json).');
      }
      setRestoreFile(file);
      setRestorePreview({
        generatedAt: parsed.backupGeneratedAt,
        batches: parsed.summary?.totalBatches ?? parsed.data.batches?.length ?? 0,
        tags: parsed.summary?.totalTags ?? parsed.data.tags?.length ?? 0,
        brands: parsed.summary?.totalBrands ?? parsed.data.brands?.length ?? 0,
        products: parsed.summary?.totalProducts ?? parsed.data.products?.length ?? 0,
        categories: parsed.summary?.totalCategories ?? parsed.data.categories?.length ?? 0,
      });
      setIsRestoreModalOpen(true);
    } catch (err: any) {
      if (onAlert) {
        onAlert('Berkas Tidak Valid', err.message || 'Pastikan Anda memilih berkas .json hasil cadangan yang valid.', 'error');
      }
    }
  };

  const handleExecuteRestore = async () => {
    if (!canManage || !restoreFile) return;
    setIsRestoring(true);
    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);

      const res = await apiFetch('/api/settings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsRestoreModalOpen(false);
        setRestoreFile(null);
        setRestorePreview(null);
        if (onAlert) {
          onAlert('Pemulihan Sukses', data.message, 'success');
        }
        setTimeout(() => {
          window.location.reload();
        }, 1200);
      } else {
        throw new Error(data.error || 'Gagal memulihkan database');
      }
    } catch (err: any) {
      if (onAlert) {
        onAlert('Pemulihan Gagal', err.message || 'Format berkas tidak valid.', 'error');
      }
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300">
      <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
        
        {/* TOP STATUS BAR: STANDAR TINGGI & BUTTON TANPA ICON */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-5 py-3.5 min-h-[62px] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <Settings size={16} />
            </div>
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-snug">
              Konfigurasi Sistem &amp; Keamanan
            </h2>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {canManage ? (
              <>
                {hasChanges && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Belum disimpan
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={isSaving || !hasChanges}
                  className="w-full sm:w-auto h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap active:scale-95"
                >
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
                </button>
              </>
            ) : (
              <span className="text-xs font-medium text-slate-500 dark:text-zinc-400 px-3 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                Mode Baca Saja
              </span>
            )}
          </div>
        </div>

        {/* UNIFIED SETTINGS CARD: TAB HEADER SEAMLESSLY COMBINED WITH CONTENT BODY */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          
          {/* TAB HEADER: UNDERLINE STYLE KONSISTEN DENGAN SKU & PENGGUNA */}
          <div className="px-2 sm:px-4 h-14 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto scrollbar-none h-full">
              <button
                type="button"
                onClick={() => setActiveTab('anomaly')}
                className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                  activeTab === 'anomaly'
                    ? 'border-[#c28e62] text-[#c28e62] font-bold'
                    : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                <Shield size={15} />
                <span>Ambang Batas Anomali</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('location')}
                className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                  activeTab === 'location'
                    ? 'border-[#c28e62] text-[#c28e62] font-bold'
                    : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                <MapPin size={15} />
                <span>Telemetri GPS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                  activeTab === 'notifications'
                    ? 'border-[#c28e62] text-[#c28e62] font-bold'
                    : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                <Bell size={15} />
                <span>Peringatan Instan</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('backup')}
                className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                  activeTab === 'backup'
                    ? 'border-[#c28e62] text-[#c28e62] font-bold'
                    : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                <Database size={15} />
                <span>Cadangan Data</span>
              </button>
            </div>
          </div>

          {/* KONTEN BAWAH (DINAMIS SESUAI MENU TAB YANG DIKLIK DENGAN INPUT & BUTTON FULL ROUNDED) */}
          <div className="p-5 sm:p-6">
            
            {/* 1. AMBANG BATAS ANOMALI */}
            {activeTab === 'anomaly' && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {/* Row 1: Batas Scan */}
                <div className="py-4 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Batas Pemindaian Waspada
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Scan ke-1 = Asli. Scan ke-2 s/d {settings.anomalyThreshold.warningMaxScans} = Waspada. Di atas {settings.anomalyThreshold.warningMaxScans}x otomatis Palsu.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <NumberInput
                      disabled={!canManage}
                      min={2}
                      max={10}
                      step={1}
                      value={settings.anomalyThreshold.warningMaxScans}
                      onChange={(val) =>
                        handleUpdate('anomalyThreshold', {
                          warningMaxScans: val,
                          suspiciousMinScans: val + 1,
                        })
                      }
                    />
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Kali</span>
                  </div>
                </div>

                {/* Row 2: Cooldown */}
                <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Jeda Sesi Scan (Cooldown)
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Scan berulang dari perangkat yang sama dalam rentang ini dihitung sebagai satu sesi.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <NumberInput
                      disabled={!canManage}
                      min={10}
                      max={600}
                      step={10}
                      value={settings.anomalyThreshold.cooldownSeconds}
                      onChange={(val) =>
                        handleUpdate('anomalyThreshold', {
                          cooldownSeconds: val,
                        })
                      }
                    />
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Detik</span>
                  </div>
                </div>

                {/* Row 3: Impossible Travel */}
                <div className="py-4 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Impossible Travel Velocity Check
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Tandai anomali jika tag dipindai di 2 lokasi berbeda dengan kecepatan tempuh tak wajar.
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <NumberInput
                        disabled={!canManage || !settings.anomalyThreshold.enableImpossibleTravel}
                        min={100}
                        max={1000}
                        step={50}
                        value={settings.anomalyThreshold.maxVelocityKmh}
                        onChange={(val) =>
                          handleUpdate('anomalyThreshold', {
                            maxVelocityKmh: val,
                          })
                        }
                      />
                      <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">km/jam</span>
                    </div>
                    <CustomCheckbox
                      disabled={!canManage}
                      checked={settings.anomalyThreshold.enableImpossibleTravel}
                      onChange={(val) =>
                        handleUpdate('anomalyThreshold', {
                          enableImpossibleTravel: val,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. KEBIJAKAN TELEMETRI GPS */}
            {activeTab === 'location' && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {/* Mode Pemindaian */}
                <div className="pb-5 space-y-3.5">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Mode Izin Lokasi Perangkat
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Tentukan cara sistem mengambil koordinat saat konsumen memindai QR Code.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                    {[
                      {
                        value: 'hybrid' as const,
                        title: 'Hybrid (Standar)',
                        meta: 'GPS + GeoIP',
                        desc: 'Minta izin GPS presisi terlebih dahulu, lalu otomatis beralih ke GeoIP jika ditolak pengguna.',
                      },
                      {
                        value: 'strict' as const,
                        title: 'Wajib GPS (Strict)',
                        meta: 'GPS Saja',
                        desc: 'Wajibkan izin GPS browser aktif sebelum hasil verifikasi keaslian produk ditampilkan.',
                      },
                      {
                        value: 'flexible' as const,
                        title: 'Fleksibel (GeoIP)',
                        meta: 'Tanpa Prompt',
                        desc: 'Langsung gunakan estimasi lokasi berdasarkan alamat IP tanpa menampilkan popup izin GPS.',
                      },
                    ].map((opt) => {
                      const isActive = settings.locationPolicy.mode === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={!canManage}
                          onClick={() => handleUpdate('locationPolicy', { mode: opt.value })}
                          className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-2.5 h-full ${
                            canManage ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'
                          } ${
                            isActive
                              ? 'border-[#c28e62] bg-[#c28e62]/[0.04] dark:bg-[#c28e62]/10'
                              : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-zinc-100 block">
                                {opt.title}
                              </span>
                              <span className={`text-[11px] font-medium block mt-0.5 ${
                                isActive
                                  ? 'text-[#c28e62] dark:text-[#d4a379]'
                                  : 'text-slate-400 dark:text-zinc-500'
                              }`}>
                                {opt.meta}
                              </span>
                            </div>
                            <span
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                isActive
                                  ? 'border-[#c28e62] bg-[#c28e62]'
                                  : 'border-slate-300 dark:border-zinc-600 bg-transparent'
                              }`}
                            >
                              {isActive && <span className="w-2 h-2 rounded-full bg-white" />}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Toleransi Akurasi GPS */}
                <div className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Batas Akurasi GPS Maksimal
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Koordinat GPS dengan radius ketidakpastian di atas batas ini ditandai sebagai akurasi rendah.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <NumberInput
                      disabled={!canManage || settings.locationPolicy.mode === 'flexible'}
                      min={20}
                      max={500}
                      step={10}
                      value={settings.locationPolicy.maxAccuracyMeters}
                      onChange={(val) =>
                        handleUpdate('locationPolicy', { maxAccuracyMeters: val })
                      }
                    />
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Meter</span>
                  </div>
                </div>

                {/* Filter Geografis */}
                <div className="py-5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Batasi Wilayah Indonesia Saja
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Tandai anomali jika pemindaian berasal dari alamat IP di luar wilayah Indonesia.
                    </span>
                  </div>
                  <CustomCheckbox
                    disabled={!canManage}
                    checked={settings.locationPolicy.enforceIndonesiaOnly}
                    onChange={(val) => handleUpdate('locationPolicy', { enforceIndonesiaOnly: val })}
                  />
                </div>

                {/* Deteksi Mock GPS */}
                <div className="pt-5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Deteksi Manipulasi Fake GPS / Emulator
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Tolak atau beri label peringatan jika perangkat menggunakan aplikasi pemalsu koordinat.
                    </span>
                  </div>
                  <CustomCheckbox
                    disabled={!canManage}
                    checked={settings.locationPolicy.detectMockLocation}
                    onChange={(val) => handleUpdate('locationPolicy', { detectMockLocation: val })}
                  />
                </div>
              </div>
            )}

            {/* 3. PERINGATAN INSTAN (EMAIL / TELEGRAM / WHATSAPP) */}
            {activeTab === 'notifications' && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {/* Email */}
                <div className="py-4 first:pt-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                        Peringatan Email
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Kirim laporan insiden ke alamat email pengawas keamanan.
                      </span>
                    </div>
                    <CustomCheckbox
                      disabled={!canManage}
                      checked={settings.notifications.emailEnabled}
                      onChange={(val) => handleUpdate('notifications', { emailEnabled: val })}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      disabled={!canManage || !settings.notifications.emailEnabled}
                      value={settings.notifications.emailRecipients}
                      onChange={(e) => handleUpdate('notifications', { emailRecipients: e.target.value })}
                      placeholder="security@sumas.id, admin@brand.com"
                      className="flex-1 h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 disabled:opacity-40 focus:outline-none focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20 transition-all"
                    />
                    <button
                      type="button"
                      disabled={!canManage || !settings.notifications.emailEnabled || testingChannel === 'email'}
                      onClick={() => handleTestAlert('email', settings.notifications.emailRecipients)}
                      className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                    >
                      {testingChannel === 'email' ? 'Mengirim...' : 'Uji Coba'}
                    </button>
                  </div>
                </div>

                {/* Telegram (Dilewati Sementara) */}
                <div className="py-4 space-y-3 opacity-60">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                        Telegram Bot Alert
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Integrasi API Telegram dilewati sementara dan tidak mengirim permintaan keluar.
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
                      Dilewati sementara
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      disabled
                      value={settings.notifications.telegramBotToken}
                      onChange={(e) => handleUpdate('notifications', { telegramBotToken: e.target.value })}
                      placeholder="Bot Token (belum diaktifkan)"
                      className="h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled
                        value={settings.notifications.telegramChatId}
                        onChange={(e) => handleUpdate('notifications', { telegramChatId: e.target.value })}
                        placeholder="Chat / Channel ID"
                        className="flex-1 h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        disabled
                        className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Uji Coba
                      </button>
                    </div>
                  </div>
                </div>

                {/* WhatsApp (Dilewati Sementara) */}
                <div className="py-4 space-y-3 opacity-60">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                        WhatsApp Gateway
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Integrasi API WhatsApp Gateway dilewati sementara dan tidak mengirim permintaan keluar.
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
                      Dilewati sementara
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      disabled
                      value={settings.notifications.whatsappNumber}
                      onChange={(e) => handleUpdate('notifications', { whatsappNumber: e.target.value })}
                      placeholder="Nomor WA (+628123456789)"
                      className="h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled
                        value={settings.notifications.whatsappGatewayUrl}
                        onChange={(e) => handleUpdate('notifications', { whatsappGatewayUrl: e.target.value })}
                        placeholder="Gateway Endpoint URL"
                        className="flex-1 h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        disabled
                        className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center whitespace-nowrap shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Uji Coba
                      </button>
                    </div>
                  </div>
                </div>

                {/* Pemicu Otomatis: Anomali Palsu */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Kirim Otomatis Saat Terdeteksi Palsu / Anomali
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Picu pengiriman alert ke semua kanal aktif ketika tag melewati ambang palsu, di luar wilayah, atau Fake GPS.
                    </span>
                  </div>
                  <CustomCheckbox
                    disabled={!canManage}
                    checked={settings.notifications.triggerOnSuspicious}
                    onChange={(val) => handleUpdate('notifications', { triggerOnSuspicious: val })}
                  />
                </div>

                {/* Pemicu Otomatis: Impossible Travel */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Kirim Otomatis Saat Terdeteksi Impossible Travel
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Kirim notifikasi instan ketika satu tag dipindai dari dua kota berbeda dengan kecepatan tak wajar.
                    </span>
                  </div>
                  <CustomCheckbox
                    disabled={!canManage}
                    checked={settings.notifications.triggerOnImpossibleTravel}
                    onChange={(val) => handleUpdate('notifications', { triggerOnImpossibleTravel: val })}
                  />
                </div>

                {/* Jeda Anti-Spam Notifikasi */}
                <div className="py-4 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Jeda Anti-Spam Notifikasi (Throttle)
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Cegah pengiriman notifikasi berulang untuk tag yang sama dalam rentang waktu ini.
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <NumberInput
                      disabled={!canManage}
                      min={1}
                      max={120}
                      step={1}
                      value={settings.notifications.throttleMinutes}
                      onChange={(val) => handleUpdate('notifications', { throttleMinutes: val })}
                    />
                    <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Menit</span>
                  </div>
                </div>
              </div>
            )}

            {/* 4. PENCADANGAN DATA */}
            {activeTab === 'backup' && (
              <div className="divide-y divide-slate-100 dark:divide-zinc-800">
                {/* Bagian 1: Unduh Cadangan Database */}
                <div className="pb-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                    <div>
                      <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                        Unduh Cadangan Database
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Ekspor seluruh 12 tabel (batch, tag, brand, SKU, kategori, telemetri, pengguna, log, dan pengaturan).
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-zinc-500 whitespace-nowrap shrink-0">
                      <span>Cadangan terakhir</span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-slate-700 dark:text-zinc-300">
                        {settings.backupInfo.lastBackupDate}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
                    {[
                      {
                        value: 'mysql' as const,
                        title: 'MySQL (.sql)',
                        meta: 'hPanel · phpMyAdmin',
                        desc: 'SQL dump siap impor langsung ke database MySQL atau MariaDB di hPanel Niagahoster.',
                      },
                      {
                        value: 'sqlite' as const,
                        title: 'SQLite (.sqlite)',
                        meta: 'VPS · DB Browser',
                        desc: 'Snapshot biner database utuh yang aman untuk mode WAL pada server VPS maupun lokal.',
                      },
                      {
                        value: 'json' as const,
                        title: 'Arsip (.json)',
                        meta: 'Pemulihan Dashboard',
                        desc: 'Arsip terstruktur untuk pemulihan seluruh data secara otomatis langsung dari halaman ini.',
                      },
                    ].map((opt) => {
                      const isActive = backupFormat === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setBackupFormat(opt.value)}
                          className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 h-full ${
                            isActive
                              ? 'border-[#c28e62] bg-[#c28e62]/[0.04] dark:bg-[#c28e62]/10'
                              : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="font-semibold text-xs sm:text-sm text-slate-800 dark:text-zinc-100 block">
                                {opt.title}
                              </span>
                              <span className={`text-[11px] font-medium block mt-0.5 ${
                                isActive
                                  ? 'text-[#c28e62] dark:text-[#d4a379]'
                                  : 'text-slate-400 dark:text-zinc-500'
                              }`}>
                                {opt.meta}
                              </span>
                            </div>
                            <span
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                isActive
                                  ? 'border-[#c28e62] bg-[#c28e62]'
                                  : 'border-slate-300 dark:border-zinc-600 bg-transparent'
                              }`}
                            >
                              {isActive && <span className="w-2 h-2 rounded-full bg-white" />}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                            {opt.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                      {backupFormat === 'mysql' && (
                        <>Untuk pemakaian di Niagahoster, unggah file <span className="font-mono text-slate-700 dark:text-zinc-300">.sql</span> melalui menu Import di phpMyAdmin.</>
                      )}
                      {backupFormat === 'sqlite' && (
                        <>File <span className="font-mono text-slate-700 dark:text-zinc-300">.sqlite</span> dapat langsung dibuka di DB Browser for SQLite atau diganti di server VPS.</>
                      )}
                      {backupFormat === 'json' && (
                        <>File <span className="font-mono text-slate-700 dark:text-zinc-300">.json</span> dapat langsung diunggah pada bagian Pulihkan Data di bawah.</>
                      )}
                    </p>

                    <button
                      type="button"
                      disabled={!canManage || isDownloadingBackup}
                      onClick={handleDownloadBackup}
                      className="w-full sm:w-auto h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                    >
                      <span>
                        {isDownloadingBackup
                          ? 'Menyiapkan Cadangan...'
                          : backupFormat === 'mysql'
                            ? 'Unduh Database (.sql)'
                            : backupFormat === 'sqlite'
                              ? 'Unduh Database (.sqlite)'
                              : 'Unduh Arsip (.json)'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Bagian 2: Cadangan Otomatis Harian & Masa Retensi */}
                <div className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Cadangan Otomatis Harian di Server
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Simpan snapshot database otomatis setiap hari dan hapus cadangan lama melewati batas retensi.
                    </span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <NumberInput
                        disabled={!canManage || !settings.backupInfo.autoBackupDaily}
                        min={1}
                        max={365}
                        step={1}
                        value={settings.backupInfo.retentionDays}
                        onChange={(val) =>
                          handleUpdate('backupInfo', { retentionDays: val })
                        }
                      />
                      <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">Hari</span>
                    </div>
                    <CustomCheckbox
                      disabled={!canManage}
                      checked={settings.backupInfo.autoBackupDaily}
                      onChange={(val) =>
                        handleUpdate('backupInfo', { autoBackupDaily: val })
                      }
                    />
                  </div>
                </div>

                {/* Bagian 3: Pulihkan Data dari Berkas */}
                <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="max-w-2xl space-y-1">
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Pulihkan Data dari Berkas
                    </span>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                      Unggah berkas <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">.json</span> hasil cadangan untuk memulihkan seluruh data batch, serial tag, brand, SKU, kategori, log telemetri, dan pengaturan sistem secara otomatis.
                    </p>
                  </div>

                  <div className="shrink-0">
                    <input
                      type="file"
                      id="cleanBackupInput"
                      accept=".json,application/json"
                      disabled={!canManage}
                      onChange={handleRestoreFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor={canManage ? 'cleanBackupInput' : undefined}
                      className={`w-full sm:w-auto h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center transition-all whitespace-nowrap ${
                        canManage
                          ? 'hover:bg-slate-50 dark:hover:bg-zinc-700 cursor-pointer active:scale-95'
                          : 'opacity-50 cursor-not-allowed pointer-events-none'
                      }`}
                    >
                      <span>Pilih Berkas (.json)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* MODAL KONFIRMASI RESTORE */}
        {isRestoreModalOpen && restoreFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs">
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-5 space-y-4">
              <div className="space-y-1.5">
                <h4 className="text-base font-bold tracking-tight text-slate-800 dark:text-zinc-100 leading-snug">
                  Konfirmasi Pemulihan Database
                </h4>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  Seluruh data saat ini akan digantikan oleh data dari berkas <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">{restoreFile.name}</span>.
                </p>
              </div>

              {restorePreview && (
                <div className="rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700/80 p-3.5 space-y-2">
                  {restorePreview.generatedAt && (
                    <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Tanggal cadangan: <span className="font-mono font-semibold text-slate-700 dark:text-zinc-200">{restorePreview.generatedAt}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
                    <div className="bg-white dark:bg-zinc-900 rounded-lg py-1.5 px-2 border border-slate-200/60 dark:border-zinc-700/60">
                      <div className="font-mono font-bold text-xs text-slate-800 dark:text-zinc-100">{restorePreview.batches ?? 0}</div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">Batch</div>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-lg py-1.5 px-2 border border-slate-200/60 dark:border-zinc-700/60">
                      <div className="font-mono font-bold text-xs text-slate-800 dark:text-zinc-100">{restorePreview.tags ?? 0}</div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">Tag QR</div>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 rounded-lg py-1.5 px-2 border border-slate-200/60 dark:border-zinc-700/60">
                      <div className="font-mono font-bold text-xs text-slate-800 dark:text-zinc-100">{restorePreview.brands ?? 0}</div>
                      <div className="text-[10px] text-slate-500 dark:text-zinc-400">Brand</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setRestoreFile(null);
                    setRestorePreview(null);
                  }}
                  className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold inline-flex items-center justify-center cursor-pointer transition-all whitespace-nowrap active:scale-95"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={handleExecuteRestore}
                  className="h-10 px-5 rounded-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center cursor-pointer transition-all whitespace-nowrap active:scale-95"
                >
                  <span>{isRestoring ? 'Memulihkan...' : 'Lanjutkan'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
