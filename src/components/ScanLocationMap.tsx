import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import { 
  MapPin, 
  RotateCcw, 
  Radio, 
  ChevronDown,
  ChevronUp
} from 'lucide-react';

export type ScanSecurityStatus = 'valid' | 'repeated' | 'suspicious';

export interface ScanPoint {
  id: string;
  city: string;
  province: string;
  venue: string;
  lat: number;
  lng: number;
  totalScans: number;
  todayScans: number;
  brand: string;
  productType: string;
  batchId: string;
  latestTagId: string;
  latestTime: string;
  isB2B: boolean;
  status: ScanSecurityStatus;
  anomalyReason?: string;
  deviceInfo: string;
}

export const ScanLocationMap: React.FC = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [id: string]: L.Marker }>({});
  
  const [points, setPoints] = useState<ScanPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | ScanSecurityStatus>('all');
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [isLegendOpen, setIsLegendOpen] = useState(true);

  // Fetch real scan points from SQLite database
  const fetchPoints = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/scans/locations');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setPoints(data);
        }
      }
    } catch (err) {
      console.error('Gagal mengambil titik scan dari database:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPoints();
  }, []);

  // Status metrics counts
  const stats = useMemo(() => {
    const total = points.length;
    const valid = points.filter(p => p.status === 'valid').length;
    const repeated = points.filter(p => p.status === 'repeated').length;
    const suspicious = points.filter(p => p.status === 'suspicious').length;
    const totalScans = points.reduce((acc, curr) => acc + curr.totalScans, 0);
    return { total, valid, repeated, suspicious, totalScans };
  }, [points]);

  // Filtered points based on security status
  const filteredPoints = useMemo(() => {
    if (statusFilter === 'all') return points;
    return points.filter(p => p.status === statusFilter);
  }, [points, statusFilter]);

  // Helper untuk warna status (3 warna: Hijau Asli, Kuning Berulang, Merah Curiga)
  const getStatusColor = (status: ScanSecurityStatus) => {
    switch (status) {
      case 'valid': return '#10b981'; // Emerald Green
      case 'repeated': return '#f59e0b'; // Amber Yellow
      case 'suspicious': return '#ef4444'; // Crimson Red
    }
  };

  // Helper teks status
  const getStatusLabel = (status: ScanSecurityStatus) => {
    switch (status) {
      case 'valid': return '✓ Asli (Valid)';
      case 'repeated': return '↺ Berulang Normal';
      case 'suspicious': return '⚠️ Curiga Anomali';
    }
  };

  // Initialize Leaflet Map
  useEffect(() => {
    let isMounted = true;
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    let map: L.Map | null = null;
    try {
      // Center of Indonesia Archipelago
      map = L.map(mapContainerRef.current, {
        center: [-2.2, 118.0],
        zoom: 5,
        minZoom: 4,
        maxZoom: 18,
        zoomControl: false,
        scrollWheelZoom: true
      });

      // Add Zoom Control at bottom right
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // OpenStreetMap standard tile layer
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> kontributor'
      });
      osmLayer.addTo(map);

      mapInstanceRef.current = map;
    } catch (e) {
      console.warn('Map initialization warning:', e);
      return;
    }

    const safeInvalidateSize = () => {
      if (!isMounted) return;
      const currentMap = mapInstanceRef.current;
      if (currentMap && (currentMap as any)._mapPane && (currentMap as any)._container) {
        try {
          currentMap.invalidateSize();
        } catch (_) {}
      }
    };

    // Handle container resize & transitions
    const resizeObserver = new ResizeObserver(() => {
      safeInvalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    const timer = setTimeout(() => {
      safeInvalidateSize();
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      resizeObserver.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (_) {}
        mapInstanceRef.current = null;
      }
      if (mapContainerRef.current && (mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }
    };
  }, []);

  // Update Markers when filter changes or map ready
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous markers
    Object.values(markersRef.current).forEach(m => {
      try {
        m.remove();
      } catch (_) {}
    });
    markersRef.current = {};

    filteredPoints.forEach(pt => {
      const isSelected = activePointId === pt.id;
      const formattedScans = pt.totalScans >= 1000 ? `${(pt.totalScans / 1000).toFixed(1)}k` : `${pt.totalScans}`;
      const color = getStatusColor(pt.status);
      const isAlert = pt.status === 'suspicious';
      
      // Marker HTML dengan 3 warna status: Hijau Asli, Kuning Berulang, Merah Curiga
      // Model poin solid dengan outline putih tipis, denyut transparan tanpa outline
      const circularHtml = `
        <div class="relative flex items-center justify-center cursor-pointer select-none" style="width: 36px; height: 36px;">
          <!-- Denyut transparan tanpa outline -->
          <div class="absolute inset-0 rounded-full animate-ping opacity-35 pointer-events-none" style="background-color: ${color}; border: none !important; outline: none !important;"></div>
          
          <!-- Poin solid dengan outline putih tipis -->
          <div class="relative w-7 h-7 rounded-full flex items-center justify-center border-[1.5px] border-white transition-transform duration-200 ${isSelected ? 'scale-110' : ''}" style="background-color: ${color};">
            <span class="text-[9px] font-bold font-mono text-white tracking-tight leading-none">${formattedScans}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'custom-scan-marker',
        html: circularHtml,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -18]
      });

      // Informasi sederhana: nama kota/kabupaten/daerah dan jumlah aktivitas scan
      const popupHtml = `
        <div class="px-3.5 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl text-slate-800 dark:text-zinc-100 font-sans pointer-events-auto min-w-[170px] select-none">
          <div class="font-bold text-xs sm:text-sm text-slate-800 dark:text-zinc-100 truncate">
            ${pt.city}
          </div>
          <div class="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${color};"></span>
            <span class="font-mono font-bold text-slate-700 dark:text-zinc-200">${pt.totalScans.toLocaleString('id-ID')}</span>
            <span>Aktivitas Scan</span>
          </div>
        </div>
      `;

      const marker = L.marker([pt.lat, pt.lng], { icon: customIcon }).addTo(map);
      marker.bindPopup(popupHtml, { maxWidth: 260, closeButton: false });

      // Buka detail kota saat poin diklik
      marker.on('click', () => {
        setActivePointId(pt.id);
        marker.openPopup();
      });

      markersRef.current[pt.id] = marker;
    });
  }, [filteredPoints, activePointId]);

  // Center or focus on a specific location
  const handleFocusPoint = (point: ScanPoint) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setActivePointId(point.id);
    map.flyTo([point.lat, point.lng], 11, {
      duration: 1.2,
      easeLinearity: 0.25
    });

    const marker = markersRef.current[point.id];
    if (marker) {
      setTimeout(() => marker.openPopup(), 400);
    }
  };

  // Reset to full Indonesia overview
  const handleResetView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    setActivePointId(null);
    map.flyTo([-2.2, 118.0], 5, { duration: 1 });
    map.closePopup();
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-3xl p-5 sm:p-6 lg:p-7 space-y-4">
      {/* MAP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-[#c28e62] flex items-center justify-center font-bold">
              <MapPin size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base sm:text-lg">
                Peta Persebaran Lokasi Scan
              </h3>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
                Monitoring sebaran aktivitas scan QR tag di seluruh Indonesia
              </p>
            </div>
          </div>
        </div>

        {/* CONTROLS & ACTIONS */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleResetView}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Reset Peta</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR 3 WARNA STATUS (FULL ROUNDED) */}
      <div className="pt-1">
        {/* Filter Segmented Controls */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-zinc-800 rounded-full text-xs font-medium overflow-x-auto max-w-full">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white dark:bg-zinc-700 text-slate-800 dark:text-zinc-100 font-bold'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
            }`}
          >
            Semua Titik ({stats.total})
          </button>

          <button
            onClick={() => setStatusFilter('valid')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap cursor-pointer ${
              statusFilter === 'valid'
                ? 'bg-emerald-600 text-white font-bold'
                : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Asli ({stats.valid})</span>
          </button>

          <button
            onClick={() => setStatusFilter('repeated')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap cursor-pointer ${
              statusFilter === 'repeated'
                ? 'bg-amber-600 text-white font-bold'
                : 'text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>Berulang ({stats.repeated})</span>
          </button>

          <button
            onClick={() => setStatusFilter('suspicious')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full transition-all whitespace-nowrap cursor-pointer ${
              statusFilter === 'suspicious'
                ? 'bg-red-600 text-white font-bold'
                : 'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
            <span>Curiga ({stats.suspicious})</span>
          </button>
        </div>
      </div>

      {/* LEAFLET MAP VIEWPORT (FULL WIDTH) */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-700/80 h-[440px] sm:h-[480px] lg:h-[520px] bg-slate-100 dark:bg-zinc-800">
        <div ref={mapContainerRef} className="w-full h-full z-10"></div>

        {/* OVERLAY BADGE FOR QUICK REAL-TIME INFO */}
        <div className="absolute top-3 left-3 z-[400] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-3.5 py-2 rounded-full border border-slate-200/80 dark:border-zinc-700 text-xs flex items-center gap-2">
          <Radio size={14} className="text-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-800 dark:text-zinc-200">
            {stats.totalScans.toLocaleString('id-ID')} Total Scan Terpantau
          </span>
          <span className="text-slate-300 dark:text-zinc-700">•</span>
          <span className="text-slate-500 dark:text-zinc-400">
            {filteredPoints.length} Titik Ditampilkan
          </span>
        </div>

        {/* INTERACTIVE COLLAPSIBLE LEGEND INSIDE MAP */}
        <div className="absolute bottom-3.5 left-3.5 z-[400] pointer-events-auto">
          {isLegendOpen ? (
            <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/90 dark:border-zinc-700/90 rounded-2xl p-3 text-xs space-y-2.5 min-w-[210px] animate-in fade-in duration-200 select-none">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-zinc-800">
                <span className="font-bold text-[11px] text-slate-700 dark:text-zinc-200 uppercase tracking-wider">
                  Legenda Status
                </span>
                <button
                  onClick={() => setIsLegendOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-zinc-800"></span>
                    <span className="text-slate-700 dark:text-zinc-300 font-medium">Asli (Valid)</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{stats.valid} titik</span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white dark:border-zinc-800"></span>
                    <span className="text-slate-700 dark:text-zinc-300 font-medium">Berulang</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{stats.repeated} titik</span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white dark:border-zinc-800 ring-2 ring-red-500/30"></span>
                    <span className="text-red-600 dark:text-red-400 font-semibold">Curiga (Anomali)</span>
                  </div>
                  <span className="font-mono text-[11px] text-red-500 font-semibold">{stats.suspicious} titik</span>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsLegendOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200/90 dark:border-zinc-700/90 rounded-full text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-all cursor-pointer select-none"
            >
              <div className="flex items-center -space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white dark:border-zinc-800"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white dark:border-zinc-800"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white dark:border-zinc-800"></span>
              </div>
              <span>Legenda</span>
              <ChevronUp size={14} className="text-slate-400" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
