import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { 
  Scan, 
  X, 
  Copy, 
  Check, 
  MapPin, 
  ChevronDown, 
  AlertTriangle,
  ExternalLink,
  History
} from 'lucide-react';
import type { ScanSecurityStatus, ScanHistoryItem, ScanPoint } from '../types/telemetry';

export interface ScanDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  scan: ScanPoint | null;
  onTriggerAlert?: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
}

// 3 Status resmi sistem Sumas: Hijau (Asli), Kuning (Waspada), Merah (Palsu)
// Selaras 100% dengan badge status di tabel dashboard utama
export const StatusBadge: React.FC<{ status: ScanSecurityStatus | string; className?: string }> = ({ 
  status, 
  className = '' 
}) => {
  if (status === 'suspicious') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-ping"></span>
        <span>Palsu</span>
      </span>
    );
  }
  if (status === 'repeated') {
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 ${className}`}>
        <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
        <span>Waspada</span>
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40 ${className}`}>
      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
      <span>Asli</span>
    </span>
  );
};

export const getStatusMeta = (status: ScanSecurityStatus | string) => {
  switch (status) {
    case 'valid':
      return {
        code: 'valid',
        label: 'Asli',
        color: '#10b981',
        dotClass: 'bg-emerald-500',
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-200/60 dark:border-emerald-800/40'
      };
    case 'repeated':
      return {
        code: 'repeated',
        label: 'Waspada',
        color: '#f59e0b',
        dotClass: 'bg-amber-500',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200/60 dark:border-amber-800/40'
      };
    case 'suspicious':
    default:
      return {
        code: 'suspicious',
        label: 'Palsu',
        color: '#ef4444',
        dotClass: 'bg-rose-500',
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-200/60 dark:border-rose-800/40'
      };
  }
};

export const ScanDetailModal: React.FC<ScanDetailModalProps> = ({
  isOpen,
  onClose,
  scan,
  onTriggerAlert
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeSessionNumber, setActiveSessionNumber] = useState<number>(1);
  const [expandedSessions, setExpandedSessions] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  // Status visual attributes 100% sinkron dengan scan.status aktual dari data
  const statusMeta = useMemo(() => {
    if (!scan) return getStatusMeta('valid');
    return getStatusMeta(scan.status);
  }, [scan]);

  // Notifikasi status telemetri: singkat, padat, dan jelas
  const telemetryAlert = useMemo(() => {
    if (!scan) return null;

    if (scan.status === 'suspicious') {
      const defaultDesc = `Scan ${scan.totalScans}x melampaui batas aman dengan indikasi multi-IP. Potensi kuat kloning tag fisik.`;
      const message = scan.anomalyReason && !scan.anomalyReason.includes('item yang sama') && !scan.anomalyReason.includes('Pemindaian berulang 3x')
        ? scan.anomalyReason
        : defaultDesc;

      return {
        title: 'Status Palsu: Anomali Keamanan',
        message,
        containerClass: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-900/60 text-rose-800 dark:text-rose-300',
        titleClass: 'text-rose-900 dark:text-rose-200',
        iconClass: 'text-rose-500'
      };
    }

    if (scan.status === 'repeated') {
      const defaultDesc = `Terdeteksi ${scan.totalScans || 3}x pemindaian pada tag ini. Pantau riwayat sesi untuk mencegah duplikasi fisik.`;
      const message = scan.anomalyReason && !scan.anomalyReason.includes('item yang sama') && !scan.anomalyReason.includes('Pemindaian berulang 3x')
        ? scan.anomalyReason
        : defaultDesc;

      return {
        title: 'Status Waspada: Pemindaian Berulang',
        message,
        containerClass: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/80 dark:border-amber-900/60 text-amber-800 dark:text-amber-300',
        titleClass: 'text-amber-900 dark:text-amber-200',
        iconClass: 'text-amber-500'
      };
    }

    return null;
  }, [scan]);

  // Generate complete history list sorted from newest (#N) to oldest (#1)
  const historyList: ScanHistoryItem[] = useMemo(() => {
    if (!scan) return [];
    
    const totalCount = Math.max(1, Number(scan.totalScans) || 1);
    const count = totalCount >= 10 ? Math.min(totalCount, 15) : totalCount;

    // Jika scanHistory sudah ada dan lengkap dari database, gunakan langsung
    if (scan.scanHistory && Array.isArray(scan.scanHistory) && scan.scanHistory.length >= count) {
      return [...scan.scanHistory].sort((a, b) => b.scanNumber - a.scanNumber);
    }

    const list: ScanHistoryItem[] = [];
    const baseLat = scan.lat || -6.195;
    const baseLng = scan.lng || 106.823;
    const baseCity = scan.city || 'Jakarta Pusat';
    const baseProvince = scan.province || 'DKI Jakarta';

    for (let i = count; i >= 1; i--) {
      const isFirst = i === 1;

      // Status per sesi disinkronkan dengan status utama tag:
      // 1. Jika tag 'valid': semua sesi adalah valid (Asli)
      // 2. Jika tag 'repeated': sesi #1 valid (Asli), sesi selanjutnya repeated (Waspada)
      // 3. Jika tag 'suspicious': sesi #1 valid (Asli), sesi duplikat/anomali adalah suspicious (Palsu)
      let sessionStatus: ScanSecurityStatus = 'valid';
      let sessionNote = 'Scan Pertama Sah';

      if (scan.status === 'valid') {
        sessionStatus = 'valid';
        sessionNote = isFirst ? 'Scan Pertama Sah' : `Scan Verifikasi Ke-${i}`;
      } else if (scan.status === 'repeated') {
        sessionStatus = isFirst ? 'valid' : 'repeated';
        sessionNote = isFirst ? 'Scan Pertama Sah' : `Scan berulang ke-${i}`;
      } else if (scan.status === 'suspicious') {
        sessionStatus = isFirst ? 'valid' : 'suspicious';
        sessionNote = isFirst ? 'Scan Pertama Sah' : `Anomali duplikasi lokasi (Scan #${i})`;
      }

      // Format waktu mundur kronologis
      let timeText = '';
      if (i === count) {
        timeText = scan.latestTime || '10 Nov 2026, 13:42 WIB';
      } else if (i === 1) {
        timeText = scan.createdAt ? `${scan.createdAt}, 09:15 WIB` : '02 Nov 2026, 09:15 WIB';
      } else {
        const dayOffset = Math.max(1, count - i);
        timeText = `0${Math.max(1, 9 - dayOffset)} Nov 2026, ${10 + (i % 8)}:${20 + (i * 3 % 40)} WIB`;
      }

      // Geo coordinates: jika suspicious, simulasikan lompatan kota (misal Jakarta & Surabaya)
      let lat = baseLat;
      let lng = baseLng;
      let city = baseCity;
      let province = baseProvince;
      let venue = scan.venue || 'Lokasi Terdaftar';

      if (scan.status === 'suspicious' && i % 2 === 0) {
        if (baseCity.toLowerCase().includes('jakarta')) {
          lat = -7.2625 + (i * 0.002);
          lng = 112.7381 + (i * 0.002);
          city = 'Surabaya';
          province = 'Jawa Timur';
          venue = 'Pakuwon Mall / Tunjungan Plaza';
        } else {
          lat = -6.195 + (i * 0.002);
          lng = 106.823 + (i * 0.002);
          city = 'Jakarta Pusat';
          province = 'DKI Jakarta';
          venue = 'Grand Indonesia Mall';
        }
      } else {
        lat = baseLat + ((i - 1) * 0.0012);
        lng = baseLng + ((i - 1) * 0.0015);
      }

      list.push({
        scanNumber: i,
        scannedAt: timeText,
        city,
        province,
        venue,
        lat,
        lng,
        ipAddress: `114.124.${20 + (i * 3 % 50)}.${10 + (i * 7 % 80)}`,
        isp: i % 2 === 0 ? 'Telkomsel Seluler' : 'Indosat Ooredoo',
        device: i % 3 === 0 ? 'Samsung Galaxy S24 • Chrome' : 'iPhone 15 Pro • Safari',
        browser: i % 3 === 0 ? 'Chrome Mobile 124' : 'Safari iOS 17.5',
        status: sessionStatus,
        statusNote: sessionNote
      });
    }

    return list;
  }, [scan]);

  // Reset pagination & active session on open
  useEffect(() => {
    if (historyList.length > 0) {
      const newest = historyList[0].scanNumber;
      setActiveSessionNumber(newest);
      setExpandedSessions([newest]);
      setCurrentPage(1);
    }
  }, [historyList, isOpen]);

  const activeSession = useMemo(() => {
    return historyList.find(h => h.scanNumber === activeSessionNumber) || historyList[0] || null;
  }, [historyList, activeSessionNumber]);

  // Pagination calculation
  const totalPages = Math.ceil(historyList.length / pageSize) || 1;
  const paginatedHistory = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return historyList.slice(start, start + pageSize);
  }, [historyList, currentPage, pageSize]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(label);
    if (onTriggerAlert) {
      onTriggerAlert('Disalin', `${label} berhasil disalin`, 'success');
    }
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isGpsSource = useMemo(() => {
    if (!activeSession) return false;
    return Boolean(activeSession.venue && activeSession.venue !== 'Lokasi Terdaftar');
  }, [activeSession]);

  // Leaflet map initialization
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let isMounted = true;

    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    const defaultLat = activeSession?.lat || scan?.lat || -6.195;
    const defaultLng = activeSession?.lng || scan?.lng || 106.823;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 13,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    const timer = setTimeout(() => {
      if (isMounted && mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (markerRef.current) {
        try { markerRef.current.remove(); } catch (_) {}
        markerRef.current = null;
      }
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, [isOpen]);

  // Update map marker and camera position smoothly without jitter
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !activeSession) return;

    const sessionMeta = getStatusMeta(activeSession.status);
    const color = sessionMeta.color;

    const markerHtml = `
      <div class="relative flex items-center justify-center cursor-pointer select-none" style="width: 32px; height: 32px;">
        <div class="absolute inset-0 rounded-full animate-ping opacity-35 pointer-events-none" style="background-color: ${color};"></div>
        <div class="relative w-6 h-6 rounded-full flex items-center justify-center border-2 border-white shadow-sm" style="background-color: ${color};">
          <span class="text-[9px] font-bold font-mono text-white leading-none">#${activeSession.scanNumber}</span>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'custom-scan-marker',
      html: markerHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const targetLatLng = L.latLng(activeSession.lat, activeSession.lng);
    const googleMapsUrl = `https://www.google.com/maps?q=${activeSession.lat},${activeSession.lng}`;
    const popupContent = `
      <div style="font-family: inherit; font-size: 12px; line-height: 1.4; padding: 2px;">
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 2px;">Scan #${activeSession.scanNumber} (${activeSession.city})</div>
        <div style="font-family: monospace; font-size: 11px; color: #64748b; margin-bottom: 6px;">${activeSession.lat.toFixed(4)}, ${activeSession.lng.toFixed(4)}</div>
        <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-flex; align-items: center; gap: 4px; color: #c28e62; font-weight: 600; text-decoration: none;">
          Buka di Google Maps &rarr;
        </a>
      </div>
    `;

    if (!markerRef.current) {
      markerRef.current = L.marker(targetLatLng, { icon: customIcon, title: `Scan #${activeSession.scanNumber} - Klik untuk Google Maps` })
        .bindPopup(popupContent)
        .addTo(map);
    } else {
      markerRef.current.setLatLng(targetLatLng);
      markerRef.current.setIcon(customIcon);
      markerRef.current.setPopupContent(popupContent);
    }

    const currentCenter = map.getCenter();
    const distanceMeters = currentCenter.distanceTo(targetLatLng);

    if (distanceMeters > 5) {
      if (distanceMeters > 80000) {
        map.flyTo(targetLatLng, 12, { duration: 0.8 });
      } else {
        map.panTo(targetLatLng, { animate: true, duration: 0.35, easeLinearity: 0.25 });
      }
    }
  }, [activeSession]);

  const toggleAccordion = (num: number) => {
    setExpandedSessions(prev => 
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    );
    setActiveSessionNumber(num);
  };

  if (!isOpen || !scan) return null;

  return createPortal(
    <div 
      onClick={(e) => { 
        if (e.target === e.currentTarget) onClose(); 
      }} 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div 
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER: Judul 1 Baris dengan Icon Tanpa Subtitle */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <Scan size={18} />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-zinc-100 truncate">
              Detail Aktivitas Scan
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer shrink-0"
            aria-label="Tutup"
          >
            <X size={18} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          
          {/* PERINGATAN TELEMETRI SESUAI STATUS (PROFESIONAL & SELARAS) */}
          {telemetryAlert && (
            <div className={`p-3.5 rounded-2xl border flex items-start gap-2.5 text-xs ${telemetryAlert.containerClass}`}>
              <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${telemetryAlert.iconClass}`} />
              <div>
                <span className={`font-bold block ${telemetryAlert.titleClass}`}>
                  {telemetryAlert.title}
                </span>
                <span className="leading-relaxed mt-0.5 block">
                  {telemetryAlert.message}
                </span>
              </div>
            </div>
          )}

          {/* BAGIAN ATAS: 2 KOLOM (KIRI: PETA, KANAN: RINGKASAN INFO UTAMA) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* KOLOM KIRI: PETA TITIK LOKASI SCAN */}
            <div className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-slate-100 dark:bg-zinc-800 h-[210px] flex items-center justify-center">
              <div ref={mapContainerRef} className="w-full h-full z-0" />

              {/* Tombol Langsung ke Google Maps (Kanan Atas Peta) */}
              {activeSession && (
                <a
                  href={`https://www.google.com/maps?q=${activeSession.lat},${activeSession.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2.5 right-2.5 z-10 bg-white/95 dark:bg-zinc-900/95 hover:bg-white dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 shadow-sm hover:shadow flex items-center gap-1.5 transition-all group backdrop-blur-xs cursor-pointer"
                  title="Buka titik koordinat pemindaian ini di Google Maps"
                >
                  <span>Google Maps</span>
                  <ExternalLink size={12} className="text-[#c28e62] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </a>
              )}

              {/* Minimal Location Overlay Tag (Dapat diklik menuju Google Maps) */}
              {activeSession && (
                <div className="absolute bottom-2.5 left-2.5 z-10">
                  <a
                    href={`https://www.google.com/maps?q=${activeSession.lat},${activeSession.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white/90 dark:bg-zinc-900/90 hover:bg-white dark:hover:bg-zinc-800 backdrop-blur-sm border border-slate-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer group"
                    title="Buka titik ini di Google Maps"
                  >
                    <MapPin size={12} className="text-[#c28e62] group-hover:scale-110 transition-transform" />
                    <span className="font-semibold">{activeSession.city}</span>
                    <span className="text-slate-400">•</span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-zinc-400">
                      {isGpsSource ? 'GPS Presisi' : 'Estimasi IP'}
                    </span>
                  </a>
                </div>
              )}
            </div>

            {/* KOLOM KANAN: RINGKASAN INFORMASI UTAMA */}
            <div className="p-4 rounded-2xl bg-slate-50/80 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-800 flex flex-col justify-between gap-3 text-xs">
              <div>
                {/* Tag ID & PIN */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-zinc-100">
                      {scan.latestTagId || '-'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(scan.latestTagId, 'Tag ID')}
                      className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                      title="Salin Tag ID"
                    >
                      {copiedField === 'Tag ID' ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>
                  </div>

                  {scan.pin && (
                    <span className="inline-flex items-center gap-1 font-mono text-xs px-2 py-0.5 rounded-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 font-semibold text-slate-700 dark:text-zinc-300">
                      <span className="text-slate-400 font-normal">PIN:</span>
                      <span>{scan.pin}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(scan.pin || '', 'PIN')}
                        className="ml-0.5 text-slate-400 hover:text-slate-600"
                        title="Salin PIN"
                      >
                        {copiedField === 'PIN' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>
                    </span>
                  )}
                </div>

                {/* Produk & Brand */}
                <div className="mt-1.5 text-slate-700 dark:text-zinc-300 font-medium">
                  {scan.productType} • <span className="font-semibold text-slate-900 dark:text-zinc-100">{scan.brand}</span>
                </div>

                {/* Batch ID */}
                <div className="mt-2 flex items-center justify-between text-slate-500 dark:text-zinc-400">
                  <span>Batch ID:</span>
                  <span className="inline-flex items-center gap-1 font-mono font-semibold text-slate-800 dark:text-zinc-200">
                    {scan.batchId || '-'}
                    {scan.batchId && (
                      <button
                        type="button"
                        onClick={() => handleCopy(scan.batchId, 'Batch ID')}
                        className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
                        title="Salin Batch ID"
                      >
                        {copiedField === 'Batch ID' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                      </button>
                    )}
                  </span>
                </div>

                {/* Status Keaslian (Badge persis sama seperti di tabel) */}
                <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mt-2.5 pt-2 border-t border-slate-200/70 dark:border-zinc-700/60">
                  <span>Status Keaslian:</span>
                  <StatusBadge status={scan.status} />
                </div>
              </div>

              {/* Sesi Terpilih yang Sedang Ditampilkan di Peta */}
              {activeSession && (
                <div className="pt-2 border-t border-slate-200/70 dark:border-zinc-700/60 space-y-1">
                  <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                    <span>Sesi Terpilih:</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 font-mono">
                      Scan #{activeSession.scanNumber} {activeSession.scanNumber === historyList[0]?.scanNumber ? '(Terbaru)' : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                    <span>Lokasi & Waktu:</span>
                    <span className="text-slate-700 dark:text-zinc-300 font-medium text-right">
                      {activeSession.city} • {activeSession.scannedAt}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400">
                    <span>IP & Perangkat:</span>
                    <span className="font-mono text-slate-700 dark:text-zinc-300 text-right truncate max-w-[200px]" title={activeSession.device}>
                      {activeSession.ipAddress} ({activeSession.isp})
                    </span>
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* BAGIAN BAWAH: 1 KOLOM RIWAYAT SCAN BERBENTUK AKORDEON SMOOTH SIMPEL JELAS */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <History size={14} className="text-[#c28e62] shrink-0" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                  Riwayat Sesi Pemindaian ({historyList.length})
                </span>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                Urut terbaru di atas • Klik baris untuk detail & sorot peta
              </span>
            </div>

            {/* AKORDEON ITEMS */}
            <div className="space-y-2">
              {paginatedHistory.map((item) => {
                const isExpanded = expandedSessions.includes(item.scanNumber);
                const isActive = item.scanNumber === activeSessionNumber;
                const isLatest = item.scanNumber === historyList[0]?.scanNumber;
                const isFirst = item.scanNumber === 1;
                const sessionMeta = getStatusMeta(item.status);

                return (
                  <div 
                    key={item.scanNumber}
                    className={`rounded-2xl border transition-all duration-200 overflow-hidden text-xs ${
                      isActive 
                        ? 'bg-white dark:bg-zinc-800/90 border-[#c28e62] shadow-xs ring-1 ring-[#c28e62]/20' 
                        : 'bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {/* BARIS UTAMA AKORDEON */}
                    <div 
                      onClick={() => toggleAccordion(item.scanNumber)}
                      className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-wrap">
                        {/* Nomor Scan Badge */}
                        <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-xs ${
                          isActive 
                            ? 'bg-[#c28e62] text-white' 
                            : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                        }`}>
                          #{item.scanNumber}
                        </span>

                        {/* Status Badge Sesi (Samakan persis seperti badge status di tabel) */}
                        <StatusBadge status={item.status} />

                        {/* Waktu */}
                        <span className="text-slate-500 dark:text-zinc-400 font-mono">
                          {item.scannedAt}
                        </span>

                        {/* Label Terbaru / Pertama */}
                        {isLatest && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#c28e62]/10 text-[#c28e62]">
                            Terbaru
                          </span>
                        )}
                        {isFirst && !isLatest && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300">
                            Pertama
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-slate-700 dark:text-zinc-300 font-medium hidden sm:inline">
                          {item.city}
                        </span>
                        <ChevronDown 
                          size={16} 
                          className={`text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-[#c28e62]' : ''}`} 
                        />
                      </div>
                    </div>

                    {/* KONTEN EXPANDED AKORDEON (SMOOTH & JELAS) */}
                    {isExpanded && (
                      <div className="px-4 pb-3.5 pt-1 border-t border-slate-100 dark:border-zinc-700/60 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in duration-150">
                        <div>
                          <span className="text-slate-400 text-[11px] block">Lokasi & Koordinat</span>
                          <span className="font-semibold text-slate-800 dark:text-zinc-200 block mt-0.5">
                            {item.city}, {item.province}
                          </span>
                          {item.venue && <span className="text-slate-500 dark:text-zinc-400 block text-[11px] truncate">{item.venue}</span>}
                          <a
                            href={`https://www.google.com/maps?q=${item.lat},${item.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-[#c28e62] hover:underline text-[11px] mt-0.5 cursor-pointer"
                            title="Buka titik koordinat di Google Maps"
                          >
                            <span>{item.lat.toFixed(4)}, {item.lng.toFixed(4)}</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[11px] block">Jaringan & IP</span>
                          <span className="font-mono font-semibold text-slate-800 dark:text-zinc-200 block mt-0.5">
                            {item.ipAddress}
                          </span>
                          <span className="text-slate-500 dark:text-zinc-400 block text-[11px]">
                            {item.isp}
                          </span>
                          <span className="text-slate-400 text-[11px] block mt-0.5">
                            {item.venue ? 'GPS Presisi' : 'Estimasi GeoIP'}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 text-[11px] block">Perangkat & Catatan</span>
                          <span className="font-medium text-slate-800 dark:text-zinc-200 block mt-0.5 truncate" title={item.device}>
                            {item.device}
                          </span>
                          <span className={`block text-[11px] mt-0.5 font-medium ${sessionMeta.text}`}>
                            {item.statusNote}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* PAGINATION: PERSIS SEPERTI DI DETAIL BATCH */}
            {totalPages > 1 && (
              <div className="pt-3 pb-1 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-zinc-800 text-xs">
                <div className="text-slate-500 dark:text-zinc-400 text-[11px]">
                  Halaman <strong className="text-slate-800 dark:text-zinc-200">{currentPage}</strong> dari <strong className="text-slate-800 dark:text-zinc-200">{totalPages}</strong> ({historyList.length} Total Sesi)
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Sebelumnya
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let p = i + 1;
                      if (totalPages > 5) {
                        if (currentPage > 3) {
                          p = Math.min(currentPage - 2 + i, totalPages - (4 - i));
                        }
                      }
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                            currentPage === p
                              ? 'bg-[#c28e62] text-white'
                              : 'bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Berikutnya
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 bg-slate-50/70 dark:bg-zinc-900/70 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              const summaryText = `[TELEMETRI TAG]
Tag ID: ${scan.latestTagId}
PIN: ${scan.pin || '-'}
Produk: ${scan.productType} (${scan.brand})
Total Scan: ${scan.totalScans} kali
Status Keaslian: ${statusMeta.label}
Lokasi Sesi Terakhir: ${activeSession?.city || scan.city}, ${activeSession?.province || scan.province} (${activeSession?.lat || scan.lat}, ${activeSession?.lng || scan.lng})`;
              navigator.clipboard?.writeText(summaryText);
              if (onTriggerAlert) {
                onTriggerAlert('Disalin', 'Ringkasan berhasil disalin ke clipboard', 'success');
              }
            }}
            className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Copy size={13} />
            <span>Salin Ringkasan</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-[#c28e62] hover:bg-[#b07d53] text-white px-6 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
