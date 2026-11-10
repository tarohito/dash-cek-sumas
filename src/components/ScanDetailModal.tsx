import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { 
  Scan, 
  X, 
  MapPin, 
  Globe, 
  Smartphone, 
  Copy, 
  Check, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  Navigation,
  Layers,
  Clock,
  Sparkles
} from 'lucide-react';
import type { ScanSecurityStatus, ScanHistoryItem, ScanPoint } from '../types/telemetry';

export interface ScanDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  scan: ScanPoint | null;
  onTriggerAlert?: (title: string, message: string, type?: 'success' | 'error' | 'info') => void;
}

export const ScanDetailModal: React.FC<ScanDetailModalProps> = ({
  isOpen,
  onClose,
  scan,
  onTriggerAlert
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [key: string]: L.Marker }>({});

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [activeSessionNumber, setActiveSessionNumber] = useState<number>(1);
  const [mapViewMode, setMapViewMode] = useState<'focused' | 'all'>('focused');

  // Normalize scan history list
  const historyList: ScanHistoryItem[] = useMemo(() => {
    if (!scan) return [];
    if (scan.scanHistory && Array.isArray(scan.scanHistory) && scan.scanHistory.length > 0) {
      return [...scan.scanHistory].sort((a, b) => b.scanNumber - a.scanNumber);
    }
    const count = Number(scan.totalScans) || 1;
    const list: ScanHistoryItem[] = [];
    for (let i = 1; i <= count; i++) {
      const isFirst = i === 1;
      const isExcess = i > 3;
      const status: ScanSecurityStatus = isFirst ? 'valid' : isExcess ? 'suspicious' : 'repeated';
      
      // If suspicious with multi-city anomaly, differentiate coordinates for scan #2+
      let lat = scan.lat || -6.195;
      let lng = scan.lng || 106.823;
      let city = scan.city || 'Jakarta Pusat';
      let province = scan.province || 'DKI Jakarta';
      let venue = scan.venue || 'Lokasi Terdaftar';

      if (scan.status === 'suspicious' && i > 1) {
        // e.g. Surabaya or different city simulation
        if (scan.city.toLowerCase().includes('jakarta')) {
          lat = -7.2625;
          lng = 112.7381;
          city = 'Surabaya';
          province = 'Jawa Timur';
          venue = 'Tunjungan Plaza / Sesi Duplikasi';
        } else {
          lat = -6.195;
          lng = 106.823;
          city = 'Jakarta Pusat';
          province = 'DKI Jakarta';
          venue = 'Grand Indonesia / Sesi Terpisah';
        }
      }

      list.push({
        scanNumber: i,
        scannedAt: isFirst 
          ? '06 Nov 2026, 10:20:14 WIB' 
          : `${scan.latestTime || 'Baru saja'}`,
        city,
        province,
        venue,
        lat,
        lng,
        ipAddress: isFirst ? '180.252.12.84' : `114.124.${32 + i}.${18 + i * 3}`,
        isp: isFirst ? 'Telkomsel Seluler' : 'Indosat Ooredoo',
        device: scan.deviceInfo || 'iPhone 15 Pro • Safari Mobile',
        browser: 'Safari Mobile 17.5',
        status,
        statusNote: isFirst 
          ? 'Scan Pertama Sah' 
          : isExcess 
            ? `Palsu: Melebihi batas aman pemindaian` 
            : `Waspada: Scan berulang ke-${i}`
      });
    }
    return list.sort((a, b) => b.scanNumber - a.scanNumber);
  }, [scan]);

  // Set default active session to latest
  useEffect(() => {
    if (historyList.length > 0) {
      setActiveSessionNumber(historyList[0].scanNumber);
    }
  }, [historyList]);

  const activeSession = useMemo(() => {
    return historyList.find(h => h.scanNumber === activeSessionNumber) || historyList[0] || null;
  }, [historyList, activeSessionNumber]);

  // Copy helper
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(label);
    if (onTriggerAlert) {
      onTriggerAlert('Disalin', `${label} berhasil disalin ke clipboard`, 'success');
    }
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  // Status visual attributes
  const statusConfig = useMemo(() => {
    if (!scan) return { label: 'Asli', color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200/80 dark:border-emerald-800/50', icon: ShieldCheck };
    
    if (scan.totalScans > 3 || scan.status === 'suspicious') {
      return {
        label: 'Palsu / Curiga',
        color: '#ef4444',
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-200/80 dark:border-rose-800/50',
        icon: ShieldAlert
      };
    }
    if (scan.totalScans >= 2 || scan.status === 'repeated') {
      return {
        label: 'Waspada (Berulang)',
        color: '#f59e0b',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-400',
        border: 'border-amber-200/80 dark:border-amber-800/50',
        icon: AlertTriangle
      };
    }
    return {
      label: 'Asli & Valid',
      color: '#10b981',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-400',
      border: 'border-emerald-200/80 dark:border-emerald-800/50',
      icon: ShieldCheck
    };
  }, [scan]);

  // Determine if location is GPS or IP estimated
  const getLocationSource = (item?: ScanHistoryItem | null) => {
    if (!item) return { isGps: false, label: 'Estimasi IP', detail: 'GeoIP Jaringan Seluler' };
    // If coordinates are exact decimals & venue specified, consider GPS
    const hasPreciseCoords = (Math.abs(item.lat % 1) > 0.0001) && Boolean(item.venue && item.venue !== 'Lokasi Terdaftar');
    if (hasPreciseCoords) {
      return { isGps: true, label: 'GPS Presisi', detail: 'Sensor Lokasi Perangkat' };
    }
    return { isGps: false, label: 'Estimasi IP', detail: `${item.isp || 'Provider Seluler'} (Kota)` };
  };

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    let isMounted = true;

    // Reset container if previous instance left id
    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    const defaultLat = activeSession?.lat || scan?.lat || -6.195;
    const defaultLng = activeSession?.lng || scan?.lng || 106.823;

    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: 12,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: false,
      scrollWheelZoom: false,
      attributionControl: false
    });

    // Add minimal zoom control
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    // Invalidate size after layout settles
    const timer1 = setTimeout(() => {
      if (isMounted && mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 150);

    const timer2 = setTimeout(() => {
      if (isMounted && mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, [isOpen]);

  // Update Markers when historyList or activeSession changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !historyList.length) return;

    // Clear old markers
    Object.values(markersRef.current).forEach(m => {
      try { m.remove(); } catch (_) {}
    });
    markersRef.current = {};

    const bounds = L.latLngBounds([]);

    historyList.forEach((item) => {
      const isSelected = item.scanNumber === activeSessionNumber;
      const markerColor = item.status === 'suspicious' ? '#ef4444' : item.status === 'repeated' ? '#f59e0b' : '#10b981';
      
      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer select-none" style="width: 38px; height: 38px;">
          ${isSelected ? `<div class="absolute inset-0 rounded-full animate-ping opacity-40 pointer-events-none" style="background-color: ${markerColor};"></div>` : ''}
          <div class="relative w-8 h-8 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900 shadow-md transition-transform duration-200 ${isSelected ? 'scale-115 ring-2 ring-[#c28e62]' : 'opacity-90'}" style="background-color: ${markerColor};">
            <span class="text-[10px] font-bold font-mono text-white leading-none">#${item.scanNumber}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-scan-detail-marker',
        html: iconHtml,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
        popupAnchor: [0, -19]
      });

      const marker = L.marker([item.lat, item.lng], { icon: customIcon }).addTo(map);
      
      marker.bindPopup(`
        <div class="p-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-xl text-slate-800 dark:text-zinc-100 text-xs min-w-[150px]">
          <div class="font-bold flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" style="background-color: ${markerColor};"></span>
            Scan #${item.scanNumber} (${item.city})
          </div>
          <div class="text-[10px] text-slate-500 dark:text-zinc-400 mt-1">${item.scannedAt}</div>
          <div class="text-[10px] font-mono text-slate-400 dark:text-zinc-500 mt-0.5">${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</div>
        </div>
      `, { closeButton: false });

      marker.on('click', () => {
        setActiveSessionNumber(item.scanNumber);
        marker.openPopup();
      });

      markersRef.current[`scan-${item.scanNumber}`] = marker;
      bounds.extend([item.lat, item.lng]);
    });

    // Fly to active session or fit bounds
    if (mapViewMode === 'all' && historyList.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } else if (activeSession) {
      map.flyTo([activeSession.lat, activeSession.lng], 13, { duration: 0.6 });
      const targetMarker = markersRef.current[`scan-${activeSession.scanNumber}`];
      if (targetMarker) {
        targetMarker.openPopup();
      }
    }
  }, [historyList, activeSessionNumber, mapViewMode]);

  if (!isOpen || !scan) return null;

  const activeLocSource = getLocationSource(activeSession);

  return createPortal(
    <div 
      onClick={(e) => { 
        if (e.target === e.currentTarget) onClose(); 
      }} 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div 
        className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER: Clean & Informative */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-4 shrink-0 bg-slate-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <Scan size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-sm sm:text-base text-slate-900 dark:text-zinc-100 tracking-tight">
                  {scan.latestTagId || '-'}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(scan.latestTagId, 'Tag ID')}
                  title="Salin Tag ID"
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {copiedField === 'Tag ID' ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
                {scan.pin && (
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                    <span className="text-[10px] uppercase font-sans font-semibold text-slate-400">PIN</span>
                    <strong className="text-slate-800 dark:text-zinc-100">{scan.pin}</strong>
                    <button
                      type="button"
                      onClick={() => handleCopy(scan.pin || '', 'PIN')}
                      title="Salin PIN"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                    >
                      {copiedField === 'PIN' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                {scan.productType} • <span className="font-semibold text-slate-700 dark:text-zinc-300">{scan.brand}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Status Keaslian Badge */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusConfig.color }}></span>
              <span>{statusConfig.label}</span>
            </span>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* ANOMALI ALERT (HANYA MUNCUL JIKA ADA ANOMALI / PERINGATAN) */}
          {(scan.status === 'suspicious' || scan.anomalyReason) && (
            <div className="p-3.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/50 flex items-start gap-3 text-xs">
              <div className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-rose-900 dark:text-rose-300">
                  Peringatan Deteksi Telemetri
                </div>
                <div className="text-rose-700 dark:text-rose-400 mt-0.5 leading-relaxed">
                  {scan.anomalyReason || 'Terdeteksi pemindaian berulang atau duplikasi lokasi geografis di luar ambang batas wajar.'}
                </div>
              </div>
            </div>
          )}

          {/* MAIN 2-COLUMN LAYOUT: PETA LOKASI DI KIRI/ATAS & TIMELINE DI KANAN/BAWAH */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* KOLOM KIRI (7 COLS): PETA TITIK LOKASI SCAN + INFO GEOLOKASI */}
            <div className="lg:col-span-7 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-[#c28e62]" />
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                    Peta Titik Lokasi Pemindaian
                  </span>
                </div>

                {/* Switcher & Controls */}
                <div className="flex items-center gap-1.5 text-xs">
                  {historyList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMapViewMode(prev => prev === 'focused' ? 'all' : 'focused')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 transition-colors cursor-pointer"
                    >
                      {mapViewMode === 'focused' ? 'Lihat Semua Titik' : 'Fokus Sesi Ini'}
                    </button>
                  )}
                </div>
              </div>

              {/* MAP CONTAINER */}
              <div className="relative rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-slate-100 dark:bg-zinc-800/50 shadow-inner h-[260px] sm:h-[300px] flex items-center justify-center">
                <div ref={mapContainerRef} className="w-full h-full z-0" />

                {/* OVERLAY BADGE: LOKASI AKTIF & SUMBER DATA (GPS / IP) */}
                {activeSession && (
                  <div className="absolute top-3 left-3 right-3 sm:right-auto z-10 pointer-events-none">
                    <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/90 dark:border-zinc-700/80 rounded-xl px-3 py-2 shadow-sm pointer-events-auto max-w-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-xs text-slate-800 dark:text-zinc-100 truncate">
                          {activeSession.city}, {activeSession.province}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                          activeLocSource.isGps 
                            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                            : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                        }`}>
                          {activeLocSource.isGps ? <Navigation size={9} /> : <Globe size={9} />}
                          <span>{activeLocSource.label}</span>
                        </span>
                      </div>

                      {activeSession.venue && activeSession.venue !== 'Lokasi Terdaftar' && (
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate mt-0.5">
                          {activeSession.venue}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-400 dark:text-zinc-500">
                        <span>Lat: {activeSession.lat.toFixed(4)}</span>
                        <span>•</span>
                        <span>Lng: {activeSession.lng.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD INFO SPESIFIKASI SINGKAT */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/70 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
                    Total Pemindaian
                  </span>
                  <div className="font-bold text-sm text-slate-800 dark:text-zinc-100 font-mono mt-0.5">
                    {scan.totalScans}x Scan
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/70 dark:border-zinc-800">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
                    Batch Produksi
                  </span>
                  <div className="font-bold text-xs text-slate-800 dark:text-zinc-200 font-mono truncate mt-0.5" title={scan.batchId}>
                    {scan.batchId || '-'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200/70 dark:border-zinc-800 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
                    Aktivitas Terakhir
                  </span>
                  <div className="font-medium text-xs text-slate-700 dark:text-zinc-300 truncate mt-0.5">
                    {scan.latestTime || 'Hari ini'}
                  </div>
                </div>
              </div>
            </div>

            {/* KOLOM KANAN (5 COLS): TIMELINE RIWAYAT SESI SCAN */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-[#c28e62]" />
                  <span className="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-zinc-300">
                    Riwayat Sesi ({historyList.length})
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Klik untuk sorot peta
                </span>
              </div>

              {/* TIMELINE LIST */}
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {historyList.map((item) => {
                  const isSelected = item.scanNumber === activeSessionNumber;
                  const isFirst = item.scanNumber === 1;
                  const isLatest = item.scanNumber === historyList[0].scanNumber;
                  const isSuspicious = item.status === 'suspicious';
                  const isRepeated = item.status === 'repeated';
                  const locSource = getLocationSource(item);

                  return (
                    <div
                      key={item.scanNumber}
                      onClick={() => setActiveSessionNumber(item.scanNumber)}
                      className={`p-3 rounded-2xl border transition-all duration-150 cursor-pointer text-xs select-none ${
                        isSelected 
                          ? 'bg-[#c28e62]/5 dark:bg-[#c28e62]/10 border-[#c28e62] shadow-xs ring-1 ring-[#c28e62]/30' 
                          : 'bg-slate-50/70 dark:bg-zinc-800/40 border-slate-200/80 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {/* BARIS 1: NOMOR SCAN, STATUS, WAKTU */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] ${
                            isSelected 
                              ? 'bg-[#c28e62] text-white' 
                              : 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                          }`}>
                            #{item.scanNumber}
                          </span>
                          <span className="font-semibold text-slate-800 dark:text-zinc-200">
                            {isLatest && historyList.length > 1 ? 'Scan Terkini' : isFirst ? 'Scan Pertama' : `Scan #${item.scanNumber}`}
                          </span>
                        </div>

                        {/* Status dot + text */}
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          isSuspicious 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : isRepeated 
                              ? 'text-amber-600 dark:text-amber-400' 
                              : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isSuspicious ? 'bg-rose-500' : isRepeated ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          {isSuspicious ? 'Palsu' : isRepeated ? 'Waspada' : 'Asli'}
                        </span>
                      </div>

                      {/* BARIS 2: WAKTU & LOKASI */}
                      <div className="mt-2 text-slate-600 dark:text-zinc-300 space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-zinc-500 font-mono">
                          <Clock size={12} className="shrink-0" />
                          <span>{item.scannedAt}</span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-zinc-200 truncate">
                            <MapPin size={12} className="shrink-0 text-slate-400" />
                            <span className="truncate">{item.city}, {item.province}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {locSource.label}
                          </span>
                        </div>
                      </div>

                      {/* DETAIL TAMBAHAN JIKA SESI DIPILIH */}
                      {isSelected && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-zinc-700/60 grid grid-cols-2 gap-2 text-[11px] animate-in fade-in duration-150">
                          <div>
                            <span className="text-[10px] text-slate-400 block">IP & Jaringan</span>
                            <span className="font-mono text-slate-700 dark:text-zinc-300 font-medium block truncate">
                              {item.ipAddress}
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-zinc-400 block truncate">
                              {item.isp || 'Seluler'}
                            </span>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-400 block">Perangkat</span>
                            <span className="text-slate-700 dark:text-zinc-300 font-medium block truncate" title={item.device}>
                              {item.device}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 block">
                              {item.lat.toFixed(3)}, {item.lng.toFixed(3)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER: Bersih & Ringkas */}
        <div className="px-6 py-3.5 bg-slate-50/70 dark:bg-zinc-900/70 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              const summaryText = `[TELEMETRI TAG SUMAS]
Tag ID: ${scan.latestTagId}
PIN: ${scan.pin || '-'}
Produk: ${scan.productType}
Brand: ${scan.brand}
Batch: ${scan.batchId || '-'}
Total Scan: ${scan.totalScans}x
Status: ${scan.status}
Lokasi Terakhir: ${scan.city}, ${scan.province} (${scan.lat}, ${scan.lng})
Waktu: ${scan.latestTime || '-'}`;
              navigator.clipboard?.writeText(summaryText);
              if (onTriggerAlert) {
                onTriggerAlert('Disalin', 'Ringkasan data telemetri berhasil disalin', 'success');
              }
            }}
            className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-700 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Copy size={13} />
            <span>Salin Ringkasan</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-[#c28e62] hover:bg-[#b07d53] text-white px-6 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
