import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  MapPin,
  Bell,
  Database,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Check,
  ChevronUp,
  ChevronDown
} from 'lucide-react';

interface CustomCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  checked,
  onChange,
  disabled = false,
  id,
}) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 outline-none select-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-90 hover:scale-105'
      } ${
        checked
          ? 'bg-[#c28e62] text-white shadow-xs border border-[#b07d53]'
          : 'border-2 border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:border-[#c28e62]'
      }`}
    >
      {checked && (
        <Check
          size={14}
          strokeWidth={3}
          className="text-white animate-in zoom-in-75 duration-150"
        />
      )}
    </button>
  );
};

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
          className="text-slate-400 hover:text-[#c28e62] dark:hover:text-[#cd9a6f] disabled:opacity-20 disabled:hover:text-slate-400 p-0.5 cursor-pointer transition-colors"
          title="Tambah"
        >
          <ChevronUp size={12} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled || value <= min}
          onClick={handleDecrement}
          className="text-slate-400 hover:text-[#c28e62] dark:hover:text-[#cd9a6f] disabled:opacity-20 disabled:hover:text-slate-400 p-0.5 cursor-pointer transition-colors"
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
    emailRecipients: 'security@sumas.id, andriyanafatchulnisairga@gmail.com',
    telegramEnabled: true,
    telegramBotToken: '712398451:AAFlkmx-92j8KqP_9x1Vn58sLmQz4OpK8rU',
    telegramChatId: '@sumas_security_telemetry',
    whatsappEnabled: true,
    whatsappNumber: '+6281298765432',
    whatsappGatewayUrl: 'https://api.fonnte.com/send',
    triggerOnSuspicious: true,
    triggerOnImpossibleTravel: true,
    throttleMinutes: 5,
  },
  backupInfo: {
    lastBackupDate: '10 Nov 2026, 08:30 WIB',
    autoBackupDaily: true,
    retentionDays: 30,
  },
};

interface SettingsManagerProps {
  onAlert?: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
  isSuperAdmin?: boolean;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  onAlert,
}) => {
  const [activeTab, setActiveTab] = useState<'anomaly' | 'location' | 'notifications' | 'backup'>('anomaly');
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    fetch('/api/settings')
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
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
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
    setTestingChannel(channel);
    try {
      const res = await fetch('/api/settings/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, target }),
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

  const handleDownloadBackup = () => {
    window.location.href = '/api/settings/backup';
    if (onAlert) {
      onAlert('Mengunduh Cadangan', 'Berkas cadangan data sedang diunduh.', 'info');
    }
  };

  const handleRestoreFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setRestoreFile(e.target.files[0]);
      setIsRestoreModalOpen(true);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restoreFile) return;
    setIsRestoring(true);
    try {
      const text = await restoreFile.text();
      const parsed = JSON.parse(text);

      const res = await fetch('/api/settings/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsRestoreModalOpen(false);
        setRestoreFile(null);
        if (onAlert) {
          onAlert('Pemulihan Sukses', data.message, 'success');
        }
        setTimeout(() => {
          window.location.reload();
        }, 1000);
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
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-5 py-3.5 min-h-[62px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <Settings size={16} />
            </div>
            <span className="text-sm font-semibold text-slate-800 dark:text-zinc-100">
              Konfigurasi Sistem &amp; Keamanan
            </span>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {hasChanges && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Belum disimpan
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving || !hasChanges}
              className="w-full sm:w-auto h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shadow-xs active:scale-95"
            >
              <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        </div>

        {/* UNIFIED SETTINGS CARD: TAB HEADER SEAMLESSLY COMBINED WITH CONTENT BODY */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
          
          {/* TAB HEADER (SECTION ATAS YANG DIGABUNG KE DALAM CARD) */}
          <div className="p-2.5 sm:p-3.5 border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40">
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('anomaly')}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'anomaly'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Shield size={15} className={activeTab === 'anomaly' ? 'text-[#c28e62]' : 'text-slate-400 dark:text-zinc-500'} />
                <span>Ambang Batas Anomali</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('location')}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'location'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <MapPin size={15} className={activeTab === 'location' ? 'text-[#c28e62]' : 'text-slate-400 dark:text-zinc-500'} />
                <span>Telemetri GPS</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'notifications'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Bell size={15} className={activeTab === 'notifications' ? 'text-[#c28e62]' : 'text-slate-400 dark:text-zinc-500'} />
                <span>Peringatan Instan</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('backup')}
                className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'backup'
                    ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border border-slate-200 dark:border-zinc-700 shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-zinc-800/60 border border-transparent'
                }`}
              >
                <Database size={15} className={activeTab === 'backup' ? 'text-[#c28e62]' : 'text-slate-400 dark:text-zinc-500'} />
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
                    <span className="text-xs font-medium text-slate-500">Kali</span>
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
                    <span className="text-xs font-medium text-slate-500">Detik</span>
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
                        disabled={!settings.anomalyThreshold.enableImpossibleTravel}
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
                      <span className="text-xs font-medium text-slate-500">km/jam</span>
                    </div>
                    <CustomCheckbox
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
                <div className="py-4 first:pt-0 space-y-3">
                  <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                    Mode Izin Lokasi Perangkat
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => handleUpdate('locationPolicy', { mode: 'hybrid' })}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        settings.locationPolicy.mode === 'hybrid'
                          ? 'border-[#c28e62] bg-[#c28e62]/5 shadow-xs'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-800 dark:text-zinc-100">Hybrid (Standar)</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          settings.locationPolicy.mode === 'hybrid'
                            ? 'bg-[#c28e62] text-white'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                        }`}>
                          GPS + IP
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Minta GPS presisi, otomatis beralih ke GeoIP jika ditolak pengguna.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdate('locationPolicy', { mode: 'strict' })}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        settings.locationPolicy.mode === 'strict'
                          ? 'border-[#c28e62] bg-[#c28e62]/5 shadow-xs'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-800 dark:text-zinc-100">Wajib GPS (Strict)</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          settings.locationPolicy.mode === 'strict'
                            ? 'bg-[#c28e62] text-white'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                        }`}>
                          Wajib GPS
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Wajibkan izin GPS browser aktif sebelum hasil autentikasi ditampilkan.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdate('locationPolicy', { mode: 'flexible' })}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        settings.locationPolicy.mode === 'flexible'
                          ? 'border-[#c28e62] bg-[#c28e62]/5 shadow-xs'
                          : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs text-slate-800 dark:text-zinc-100">Fleksibel (GeoIP)</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          settings.locationPolicy.mode === 'flexible'
                            ? 'bg-[#c28e62] text-white'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                        }`}>
                          IP Saja
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">Tanpa prompt browser, langsung gunakan estimasi koordinat IP.</p>
                    </button>
                  </div>
                </div>

                {/* Filter Geografis */}
                <div className="py-4 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Batasi Wilayah Indonesia Saja
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Tandai anomali jika pemindaian berasal dari alamat IP luar negeri.
                    </span>
                  </div>
                  <CustomCheckbox
                    checked={settings.locationPolicy.enforceIndonesiaOnly}
                    onChange={(val) => handleUpdate('locationPolicy', { enforceIndonesiaOnly: val })}
                  />
                </div>

                {/* Deteksi Mock GPS */}
                <div className="py-4 last:pb-0 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Deteksi Manipulasi Fake GPS / Emulator
                    </span>
                    <span className="text-xs text-slate-500 dark:text-zinc-400">
                      Tolak atau beri label peringatan jika perangkat menggunakan aplikasi pemalsu koordinat.
                    </span>
                  </div>
                  <CustomCheckbox
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
                      checked={settings.notifications.emailEnabled}
                      onChange={(val) => handleUpdate('notifications', { emailEnabled: val })}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      disabled={!settings.notifications.emailEnabled}
                      value={settings.notifications.emailRecipients}
                      onChange={(e) => handleUpdate('notifications', { emailRecipients: e.target.value })}
                      placeholder="security@sumas.id, admin@brand.com"
                      className="flex-1 h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20 transition-all"
                    />
                    <button
                      type="button"
                      disabled={!settings.notifications.emailEnabled || testingChannel === 'email'}
                      onClick={() => handleTestAlert('email', settings.notifications.emailRecipients)}
                      className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:border-[#c28e62] hover:text-[#c28e62] text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 disabled:opacity-40 active:scale-95 shadow-xs"
                    >
                      {testingChannel === 'email' ? 'Mengirim...' : 'Uji Coba'}
                    </button>
                  </div>
                </div>

                {/* Telegram */}
                <div className="py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                        Telegram Bot Alert
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Kirim notifikasi ke bot / channel Telegram tim teknis.
                      </span>
                    </div>
                    <CustomCheckbox
                      checked={settings.notifications.telegramEnabled}
                      onChange={(val) => handleUpdate('notifications', { telegramEnabled: val })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      disabled={!settings.notifications.telegramEnabled}
                      value={settings.notifications.telegramBotToken}
                      onChange={(e) => handleUpdate('notifications', { telegramBotToken: e.target.value })}
                      placeholder="Bot Token (e.g. 712398:AAFlkmx...)"
                      className="h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20 transition-all"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={!settings.notifications.telegramEnabled}
                        value={settings.notifications.telegramChatId}
                        onChange={(e) => handleUpdate('notifications', { telegramChatId: e.target.value })}
                        placeholder="Chat / Channel ID (@sumas_alert)"
                        className="flex-1 h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20 transition-all"
                      />
                      <button
                        type="button"
                        disabled={!settings.notifications.telegramEnabled || testingChannel === 'telegram'}
                        onClick={() => handleTestAlert('telegram', settings.notifications.telegramChatId)}
                        className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:border-[#c28e62] hover:text-[#c28e62] text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 disabled:opacity-40 active:scale-95 shadow-xs"
                      >
                        {testingChannel === 'telegram' ? 'Mengirim...' : 'Uji Coba'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="py-4 last:pb-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                        WhatsApp Gateway
                      </span>
                      <span className="text-xs text-slate-500 dark:text-zinc-400">
                        Kirim pesan ke nomor WhatsApp manajemen melalui API Gateway.
                      </span>
                    </div>
                    <CustomCheckbox
                      checked={settings.notifications.whatsappEnabled}
                      onChange={(val) => handleUpdate('notifications', { whatsappEnabled: val })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      disabled={!settings.notifications.whatsappEnabled}
                      value={settings.notifications.whatsappNumber}
                      onChange={(e) => handleUpdate('notifications', { whatsappNumber: e.target.value })}
                      placeholder="Nomor WA (+628123456789)"
                      className="h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20 transition-all"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        disabled={!settings.notifications.whatsappEnabled}
                        value={settings.notifications.whatsappGatewayUrl}
                        onChange={(e) => handleUpdate('notifications', { whatsappGatewayUrl: e.target.value })}
                        placeholder="Gateway Endpoint URL"
                        className="flex-1 h-10 px-5 text-xs sm:text-sm bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full font-mono text-slate-800 dark:text-zinc-200 disabled:opacity-40 focus:outline-none focus:border-[#c28e62] focus:ring-2 focus:ring-[#c28e62]/20 transition-all"
                      />
                      <button
                        type="button"
                        disabled={!settings.notifications.whatsappEnabled || testingChannel === 'whatsapp'}
                        onClick={() => handleTestAlert('whatsapp', settings.notifications.whatsappNumber)}
                        className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:border-[#c28e62] hover:text-[#c28e62] text-xs sm:text-sm font-semibold transition-all cursor-pointer shrink-0 disabled:opacity-40 active:scale-95 shadow-xs"
                      >
                        {testingChannel === 'whatsapp' ? 'Mengirim...' : 'Uji Coba'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. PENCADANGAN DATA */}
            {activeTab === 'backup' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Unduh Backup */}
                <div className="bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Unduh Arsip Cadangan
                    </span>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                      Ekspor snapshot seluruh batch, serial tag, log telemetri, katalog produk, dan audit sistem ke format .json.
                    </p>
                    <div className="text-xs text-slate-400 pt-1">
                      Cadangan terakhir: <span className="font-mono text-slate-700 dark:text-zinc-300">{settings.backupInfo.lastBackupDate}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleDownloadBackup}
                    className="w-full h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] text-white text-xs sm:text-sm font-semibold flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shadow-xs active:scale-95"
                  >
                    <span>Unduh Cadangan Database (.json)</span>
                  </button>
                </div>

                {/* Restore Backup */}
                <div className="bg-slate-50/70 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <span className="font-semibold text-sm text-slate-800 dark:text-zinc-100 block">
                      Pulihkan dari Berkas
                    </span>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                      Unggah berkas .json resmi Sumas untuk memulihkan struktur database dan catatan riwayat.
                    </p>
                  </div>

                  <div>
                    <input
                      type="file"
                      id="cleanBackupInput"
                      accept=".json,application/json"
                      onChange={handleRestoreFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="cleanBackupInput"
                      className="w-full h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-[#c28e62] text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold flex items-center justify-center transition-all cursor-pointer whitespace-nowrap shadow-xs active:scale-95"
                    >
                      <span>Pilih Berkas Cadangan</span>
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
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl">
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Konfirmasi Pemulihan
                </h4>
                <p className="text-xs text-slate-500">
                  Data saat ini akan digantikan oleh data dari berkas <span className="font-mono font-semibold text-slate-700 dark:text-zinc-300">{restoreFile.name}</span>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRestoreModalOpen(false);
                    setRestoreFile(null);
                  }}
                  className="h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isRestoring}
                  onClick={handleExecuteRestore}
                  className="h-10 px-5 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold cursor-pointer disabled:opacity-50 transition-all shadow-xs active:scale-95"
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
