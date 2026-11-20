export interface AnomalyThresholdConfig {
  validMaxScans: number;
  warningMaxScans: number;
  suspiciousMinScans: number;
  cooldownSeconds: number;
  enableImpossibleTravel: boolean;
  maxVelocityKmh: number;
  consecutiveFailureAlert: number;
}

export interface LocationPolicyConfig {
  mode: 'hybrid' | 'strict' | 'flexible';
  requireGpsByDefault: boolean;
  enforceIndonesiaOnly: boolean;
  maxAccuracyMeters: number;
  detectMockLocation: boolean;
}

export interface NotificationConfig {
  emailEnabled: boolean;
  emailRecipients: string;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  whatsappGatewayUrl: string;
  whatsappApiToken?: string;
  triggerOnSuspicious: boolean;
  triggerOnImpossibleTravel: boolean;
  throttleMinutes: number;
}

export interface BackupInfoConfig {
  lastBackupDate: string;
  autoBackupDaily: boolean;
  retentionDays: number;
}

export interface SystemSettingsConfig {
  anomalyThreshold: AnomalyThresholdConfig;
  locationPolicy: LocationPolicyConfig;
  notifications: NotificationConfig;
  backupInfo: BackupInfoConfig;
}

export const DEFAULT_SYSTEM_SETTINGS: SystemSettingsConfig = {
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
    whatsappApiToken: '',
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

export function mergeSystemSettings(raw: any): SystemSettingsConfig {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    anomalyThreshold: {
      ...DEFAULT_SYSTEM_SETTINGS.anomalyThreshold,
      ...(src.anomalyThreshold || {}),
    },
    locationPolicy: {
      ...DEFAULT_SYSTEM_SETTINGS.locationPolicy,
      ...(src.locationPolicy || {}),
    },
    notifications: {
      ...DEFAULT_SYSTEM_SETTINGS.notifications,
      ...(src.notifications || {}),
    },
    backupInfo: {
      ...DEFAULT_SYSTEM_SETTINGS.backupInfo,
      ...(src.backupInfo || {}),
    },
  };
}

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isWithinIndonesia(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -11.2 && lat <= 6.2 && lng >= 94.8 && lng <= 141.2;
}

const INDONESIAN_CITIES: Array<{ city: string; province: string; lat: number; lng: number }> = [
  { city: 'Jakarta', province: 'DKI Jakarta', lat: -6.2088, lng: 106.8456 },
  { city: 'Tangerang', province: 'Banten', lat: -6.1783, lng: 106.6319 },
  { city: 'Bekasi', province: 'Jawa Barat', lat: -6.2383, lng: 106.9756 },
  { city: 'Depok', province: 'Jawa Barat', lat: -6.4025, lng: 106.7942 },
  { city: 'Bogor', province: 'Jawa Barat', lat: -6.5971, lng: 106.806 },
  { city: 'Bandung', province: 'Jawa Barat', lat: -6.9175, lng: 107.6191 },
  { city: 'Cirebon', province: 'Jawa Barat', lat: -6.732, lng: 108.5523 },
  { city: 'Serang', province: 'Banten', lat: -6.12, lng: 106.1503 },
  { city: 'Semarang', province: 'Jawa Tengah', lat: -6.9667, lng: 110.4167 },
  { city: 'Surakarta', province: 'Jawa Tengah', lat: -7.5755, lng: 110.8243 },
  { city: 'Purwokerto', province: 'Jawa Tengah', lat: -7.4244, lng: 109.2302 },
  { city: 'Yogyakarta', province: 'DI Yogyakarta', lat: -7.7956, lng: 110.3695 },
  { city: 'Surabaya', province: 'Jawa Timur', lat: -7.2575, lng: 112.7521 },
  { city: 'Malang', province: 'Jawa Timur', lat: -7.9666, lng: 112.6326 },
  { city: 'Kediri', province: 'Jawa Timur', lat: -7.848, lng: 112.0178 },
  { city: 'Jember', province: 'Jawa Timur', lat: -8.1845, lng: 113.6681 },
  { city: 'Denpasar', province: 'Bali', lat: -8.6705, lng: 115.2126 },
  { city: 'Mataram', province: 'Nusa Tenggara Barat', lat: -8.5833, lng: 116.1167 },
  { city: 'Kupang', province: 'Nusa Tenggara Timur', lat: -10.1772, lng: 123.607 },
  { city: 'Banda Aceh', province: 'Aceh', lat: 5.5483, lng: 95.3238 },
  { city: 'Medan', province: 'Sumatera Utara', lat: 3.5952, lng: 98.6722 },
  { city: 'Padang', province: 'Sumatera Barat', lat: -0.9471, lng: 100.4172 },
  { city: 'Pekanbaru', province: 'Riau', lat: 0.5071, lng: 101.4478 },
  { city: 'Batam', province: 'Kepulauan Riau', lat: 1.0456, lng: 104.0305 },
  { city: 'Jambi', province: 'Jambi', lat: -1.6101, lng: 103.6131 },
  { city: 'Palembang', province: 'Sumatera Selatan', lat: -2.9761, lng: 104.7754 },
  { city: 'Bengkulu', province: 'Bengkulu', lat: -3.7928, lng: 102.2608 },
  { city: 'Bandar Lampung', province: 'Lampung', lat: -5.4292, lng: 105.261 },
  { city: 'Pangkal Pinang', province: 'Bangka Belitung', lat: -2.1316, lng: 106.1169 },
  { city: 'Pontianak', province: 'Kalimantan Barat', lat: -0.0263, lng: 109.3425 },
  { city: 'Palangka Raya', province: 'Kalimantan Tengah', lat: -2.2083, lng: 113.9167 },
  { city: 'Banjarmasin', province: 'Kalimantan Selatan', lat: -3.3186, lng: 114.5944 },
  { city: 'Balikpapan', province: 'Kalimantan Timur', lat: -1.2379, lng: 116.8529 },
  { city: 'Samarinda', province: 'Kalimantan Timur', lat: -0.5022, lng: 117.1536 },
  { city: 'Tarakan', province: 'Kalimantan Utara', lat: 3.3, lng: 117.6333 },
  { city: 'Makassar', province: 'Sulawesi Selatan', lat: -5.1477, lng: 119.4327 },
  { city: 'Manado', province: 'Sulawesi Utara', lat: 1.4748, lng: 124.8421 },
  { city: 'Palu', province: 'Sulawesi Tengah', lat: -0.8917, lng: 119.8707 },
  { city: 'Kendari', province: 'Sulawesi Tenggara', lat: -3.9985, lng: 122.5129 },
  { city: 'Gorontalo', province: 'Gorontalo', lat: 0.5435, lng: 123.0568 },
  { city: 'Ambon', province: 'Maluku', lat: -3.6954, lng: 128.1814 },
  { city: 'Ternate', province: 'Maluku Utara', lat: 0.7893, lng: 127.3872 },
  { city: 'Jayapura', province: 'Papua', lat: -2.5916, lng: 140.669 },
  { city: 'Sorong', province: 'Papua Barat Daya', lat: -0.8762, lng: 131.2558 },
];

export function nearestIndonesianCity(lat: number, lng: number): { city: string; province: string; distanceKm: number } {
  let best = INDONESIAN_CITIES[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of INDONESIAN_CITIES) {
    const d = haversineDistanceKm(lat, lng, item.lat, item.lng);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  if (!isWithinIndonesia(lat, lng)) {
    return { city: 'Luar Indonesia', province: 'Internasional', distanceKm: bestDist };
  }
  return { city: best.city, province: best.province, distanceKm: bestDist };
}

export function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  const cleaned = ip.replace(/^::ffff:/, '').trim();
  if (
    cleaned === '127.0.0.1' ||
    cleaned === '::1' ||
    cleaned === 'localhost' ||
    cleaned.startsWith('10.') ||
    cleaned.startsWith('192.168.') ||
    cleaned.startsWith('fc') ||
    cleaned.startsWith('fd') ||
    cleaned.startsWith('fe80:')
  ) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(cleaned)) return true;
  return false;
}

export function parseDeviceAndBrowser(userAgent: string): { device: string; browser: string } {
  const ua = userAgent || '';
  let device = 'Desktop Browser';
  if (/iPhone/i.test(ua)) device = 'iPhone (iOS)';
  else if (/iPad/i.test(ua)) device = 'iPad (iPadOS)';
  else if (/Android/i.test(ua)) {
    const modelMatch = ua.match(/Android\s[\d.]+;\s*([^;)]+)/i);
    device = modelMatch ? `Android (${modelMatch[1].trim().slice(0, 32)})` : 'Android Mobile';
  } else if (/Macintosh/i.test(ua)) device = 'macOS Desktop';
  else if (/Windows/i.test(ua)) device = 'Windows Desktop';
  else if (/Linux/i.test(ua)) device = 'Linux Desktop';

  let browser = 'Web Browser';
  if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = 'Google Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';

  return { device, browser };
}

export interface GeoIpResult {
  city: string;
  province: string;
  countryCode: string;
  countryName?: string;
  lat: number;
  lng: number;
  isp: string;
  isFallbackDefault: boolean;
}

export interface MockDetectionInput {
  isMockLocation?: boolean;
  webdriver?: boolean;
  userAgent?: string;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  lat?: number | null;
  lng?: number | null;
  gpsGranted?: boolean;
  geoIp?: GeoIpResult | null;
}

export function detectMockLocationSignals(input: MockDetectionInput): string[] {
  const signals: string[] = [];

  if (input.isMockLocation === true) {
    signals.push('Flag Mock GPS aktif pada perangkat');
  }
  if (input.webdriver === true) {
    signals.push('Browser otomatisasi / WebDriver terdeteksi');
  }
  const ua = input.userAgent || '';
  if (/HeadlessChrome|PhantomJS|Android SDK built for|Genymotion|BlueStacks|NoxPlayer|Emulator/i.test(ua)) {
    signals.push('Perangkat teridentifikasi sebagai emulator atau headless browser');
  }
  if (input.gpsGranted && typeof input.accuracyMeters === 'number') {
    if (input.accuracyMeters === 0) {
      signals.push('Akurasi GPS bernilai 0m (pola koordinat injeksi/palsu)');
    }
  }
  if (input.gpsGranted && typeof input.speedMps === 'number' && input.speedMps > 100) {
    signals.push(`Kecepatan sensor GPS tidak wajar (${Math.round(input.speedMps * 3.6)} km/jam)`);
  }
  if (
    input.gpsGranted &&
    typeof input.lat === 'number' &&
    typeof input.lng === 'number' &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    Number.isInteger(input.lat) &&
    Number.isInteger(input.lng)
  ) {
    signals.push('Koordinat GPS berupa bilangan bulat sempurna tanpa variasi satelit');
  }
  if (
    input.gpsGranted &&
    typeof input.lat === 'number' &&
    typeof input.lng === 'number' &&
    input.geoIp &&
    !input.geoIp.isFallbackDefault
  ) {
    const mismatchKm = haversineDistanceKm(input.lat, input.lng, input.geoIp.lat, input.geoIp.lng);
    if (mismatchKm > 1500) {
      signals.push(
        `Selisih ekstrem antara koordinat GPS dan jaringan IP (${Math.round(mismatchKm)} km dari ${input.geoIp.city || input.geoIp.countryCode})`
      );
    }
  }

  return signals;
}

export interface ScanHistoryRecord {
  scanNumber: number;
  scannedAt: string;
  scannedAtIso?: string;
  city: string;
  province: string;
  venue?: string;
  lat: number;
  lng: number;
  ipAddress: string;
  isp?: string;
  device: string;
  browser?: string;
  status: 'valid' | 'repeated' | 'suspicious';
  statusNote?: string;
  accuracyMeters?: number | null;
  locationSource?: 'GPS' | 'GeoIP' | 'GeoIP (Fallback)' | 'Manual';
}

export interface ScanPolicyEvaluationInput {
  settings: SystemSettingsConfig;
  batchEnableGps?: boolean;
  existingTotalScans: number;
  existingTodayScans: number;
  existingStatus?: 'valid' | 'repeated' | 'suspicious';
  existingHistory: ScanHistoryRecord[];
  gpsGranted: boolean;
  lat?: number | null;
  lng?: number | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  isMockLocation?: boolean;
  webdriver?: boolean;
  city?: string;
  province?: string;
  venue?: string;
  countryCode?: string;
  geoIp?: GeoIpResult | null;
  ipAddress: string;
  isp?: string;
  userAgent: string;
  deviceInfo?: string;
  nowMs?: number;
}

export interface ScanPolicyEvaluationResult {
  blocked: boolean;
  blockCode?: 'GPS_REQUIRED';
  blockMessage?: string;
  withinCooldown: boolean;
  effectiveMode: 'hybrid' | 'strict' | 'flexible';
  locationSource: 'GPS' | 'GeoIP' | 'GeoIP (Fallback)' | 'Manual';
  status: 'valid' | 'repeated' | 'suspicious';
  anomalyReasons: string[];
  anomalyReasonText: string | null;
  impossibleTravelDetected: boolean;
  velocityKmh: number | null;
  distanceKm: number | null;
  lat: number;
  lng: number;
  city: string;
  province: string;
  venue: string;
  newTotalScans: number;
  newTodayScans: number;
  historyEntry: ScanHistoryRecord;
}

export function evaluateScanAgainstPolicy(input: ScanPolicyEvaluationInput): ScanPolicyEvaluationResult {
  const { settings } = input;
  const nowMs = input.nowMs ?? Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const nowLabel = new Date(nowMs).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' WIB';

  const effectiveMode: 'hybrid' | 'strict' | 'flexible' =
    input.batchEnableGps === false ? 'flexible' : settings.locationPolicy.mode;

  const hasValidGps =
    input.gpsGranted &&
    typeof input.lat === 'number' &&
    typeof input.lng === 'number' &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    Math.abs(input.lat) <= 90 &&
    Math.abs(input.lng) <= 180;

  // 1. Strict GPS mode enforcement
  if (effectiveMode === 'strict' && !hasValidGps) {
    return {
      blocked: true,
      blockCode: 'GPS_REQUIRED',
      blockMessage:
        'Mode Wajib GPS (Strict) aktif. Izinkan akses lokasi GPS perangkat Anda untuk memverifikasi keaslian produk.',
      withinCooldown: false,
      effectiveMode,
      locationSource: 'GeoIP (Fallback)',
      status: input.existingStatus || 'valid',
      anomalyReasons: ['Akses GPS ditolak pada mode Wajib GPS'],
      anomalyReasonText: 'Akses GPS ditolak pada mode Wajib GPS',
      impossibleTravelDetected: false,
      velocityKmh: null,
      distanceKm: null,
      lat: -6.2088,
      lng: 106.8456,
      city: 'Lokasi Diblokir',
      province: '',
      venue: 'GPS Ditolak',
      newTotalScans: input.existingTotalScans,
      newTodayScans: input.existingTodayScans,
      historyEntry: {
        scanNumber: input.existingTotalScans,
        scannedAt: nowLabel,
        scannedAtIso: nowIso,
        city: 'Lokasi Diblokir',
        province: '',
        lat: -6.2088,
        lng: 106.8456,
        ipAddress: input.ipAddress,
        device: input.deviceInfo || 'Unknown',
        status: 'suspicious',
        statusNote: 'Akses GPS ditolak (Strict Mode)',
      },
    };
  }

  // 2. Resolve final coordinates, city, province, source
  let lat: number;
  let lng: number;
  let city: string;
  let province: string;
  let locationSource: 'GPS' | 'GeoIP' | 'GeoIP (Fallback)' | 'Manual';
  let hasRealExternalGeo = false;

  if (hasValidGps && effectiveMode !== 'flexible') {
    lat = Number(input.lat);
    lng = Number(input.lng);
    locationSource = 'GPS';
    hasRealExternalGeo = true;
    const nearest = nearestIndonesianCity(lat, lng);
    city = input.city || nearest.city;
    province = input.province || nearest.province;
  } else if (
    typeof input.lat === 'number' &&
    typeof input.lng === 'number' &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng) &&
    !input.geoIp
  ) {
    lat = Number(input.lat);
    lng = Number(input.lng);
    locationSource = 'Manual';
    hasRealExternalGeo = true;
    const nearest = nearestIndonesianCity(lat, lng);
    city = input.city || nearest.city;
    province = input.province || nearest.province;
  } else if (input.geoIp) {
    lat = input.geoIp.lat;
    lng = input.geoIp.lng;
    city = input.city || input.geoIp.city;
    province = input.province || input.geoIp.province;
    locationSource = effectiveMode === 'hybrid' ? 'GeoIP (Fallback)' : 'GeoIP';
    hasRealExternalGeo = !input.geoIp.isFallbackDefault;
  } else {
    lat = -6.2088;
    lng = 106.8456;
    city = input.city || 'Jakarta';
    province = input.province || 'DKI Jakarta';
    locationSource = effectiveMode === 'hybrid' ? 'GeoIP (Fallback)' : 'GeoIP';
    hasRealExternalGeo = false;
  }

  const parsedUa = parseDeviceAndBrowser(input.userAgent);
  const deviceLabel = input.deviceInfo || parsedUa.device;
  const venue =
    input.venue ||
    (locationSource === 'GPS'
      ? `GPS Presisi (${typeof input.accuracyMeters === 'number' ? `±${Math.round(input.accuracyMeters)}m` : 'Akurat'})`
      : locationSource === 'GeoIP (Fallback)'
      ? 'Estimasi GeoIP (GPS Ditolak)'
      : 'Estimasi GeoIP');

  // 3. Cooldown session deduplication check
  const prevHistory = Array.isArray(input.existingHistory) ? input.existingHistory : [];
  const lastEntry = prevHistory.length > 0 ? prevHistory[0] : null;
  let withinCooldown = false;

  if (lastEntry && lastEntry.scannedAtIso && settings.anomalyThreshold.cooldownSeconds > 0) {
    const prevMs = Date.parse(lastEntry.scannedAtIso);
    if (Number.isFinite(prevMs)) {
      const elapsedSeconds = (nowMs - prevMs) / 1000;
      const sameDevice = (lastEntry.device || '').toLowerCase() === deviceLabel.toLowerCase();
      const sameIp = (lastEntry.ipAddress || '') === input.ipAddress;
      if (elapsedSeconds >= 0 && elapsedSeconds <= settings.anomalyThreshold.cooldownSeconds && sameDevice && sameIp) {
        withinCooldown = true;
      }
    }
  }

  const newTotalScans = withinCooldown ? Math.max(1, input.existingTotalScans) : input.existingTotalScans + 1;
  const newTodayScans = withinCooldown ? Math.max(1, input.existingTodayScans) : input.existingTodayScans + 1;

  // 4. Anomaly Threshold Classification
  const anomalyReasons: string[] = [];
  let status: 'valid' | 'repeated' | 'suspicious' = 'valid';

  const validMax = Math.max(1, Number(settings.anomalyThreshold.validMaxScans) || 1);
  const warningMax = Math.max(validMax + 1, Number(settings.anomalyThreshold.warningMaxScans) || 3);
  const suspiciousMin = Math.max(warningMax + 1, Number(settings.anomalyThreshold.suspiciousMinScans) || warningMax + 1);

  if (newTotalScans >= suspiciousMin) {
    status = 'suspicious';
    anomalyReasons.push(
      `Terdeteksi ${newTotalScans}x pemindaian (melebihi ambang batas palsu ≥${suspiciousMin}x). Indikasi kuat duplikasi tag fisik.`
    );
  } else if (newTotalScans > validMax) {
    status = 'repeated';
    anomalyReasons.push(
      `Terdeteksi ${newTotalScans}x pemindaian pada tag ini (rentang waspada 2–${warningMax}x).`
    );
  }

  // 5. Impossible Travel Velocity Check
  let impossibleTravelDetected = false;
  let velocityKmh: number | null = null;
  let distanceKm: number | null = null;

  if (
    !withinCooldown &&
    settings.anomalyThreshold.enableImpossibleTravel &&
    lastEntry &&
    typeof lastEntry.lat === 'number' &&
    typeof lastEntry.lng === 'number' &&
    lastEntry.scannedAtIso
  ) {
    const prevMs = Date.parse(lastEntry.scannedAtIso);
    if (Number.isFinite(prevMs) && nowMs > prevMs) {
      const dist = haversineDistanceKm(lastEntry.lat, lastEntry.lng, lat, lng);
      const elapsedHours = Math.max((nowMs - prevMs) / 3600000, 1 / 3600);
      const velocity = dist / elapsedHours;
      distanceKm = Math.round(dist * 10) / 10;
      velocityKmh = Math.round(velocity);

      if (dist > 5 && velocity > settings.anomalyThreshold.maxVelocityKmh) {
        impossibleTravelDetected = true;
        status = 'suspicious';
        const elapsedMinutes = Math.max(1, Math.round((nowMs - prevMs) / 60000));
        anomalyReasons.push(
          `Impossible Travel terdeteksi: perpindahan ${Math.round(dist)} km (${lastEntry.city || 'Lokasi sebelumnya'} → ${city}) dalam ${elapsedMinutes} menit (${Math.round(velocity)} km/jam > batas ${settings.anomalyThreshold.maxVelocityKmh} km/jam).`
        );
      }
    }
  }

  // 6. Location Policy: Max GPS Accuracy
  if (
    locationSource === 'GPS' &&
    effectiveMode !== 'flexible' &&
    typeof input.accuracyMeters === 'number' &&
    Number.isFinite(input.accuracyMeters) &&
    input.accuracyMeters > settings.locationPolicy.maxAccuracyMeters
  ) {
    if (status === 'valid') status = 'repeated';
    anomalyReasons.push(
      `Akurasi GPS rendah (±${Math.round(input.accuracyMeters)}m melebihi batas maksimal ${settings.locationPolicy.maxAccuracyMeters}m).`
    );
  }

  // 7. Location Policy: Indonesia Only
  if (settings.locationPolicy.enforceIndonesiaOnly) {
    const country = (input.countryCode || input.geoIp?.countryCode || '').toUpperCase();
    const outsideCountry = Boolean(country && country !== 'ID');
    const outsideBounds = hasRealExternalGeo && !isWithinIndonesia(lat, lng);

    if (outsideCountry || outsideBounds) {
      status = 'suspicious';
      const detail = outsideCountry
        ? `negara ${input.geoIp?.countryName || country}`
        : `koordinat ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      anomalyReasons.push(`Pemindaian terdeteksi di luar wilayah Indonesia (${detail}).`);
    }
  }

  // 8. Location Policy: Fake GPS / Mock Location Detection
  if (settings.locationPolicy.detectMockLocation) {
    const mockSignals = detectMockLocationSignals({
      isMockLocation: input.isMockLocation,
      webdriver: input.webdriver,
      userAgent: input.userAgent,
      accuracyMeters: input.accuracyMeters,
      speedMps: input.speedMps,
      lat,
      lng,
      gpsGranted: locationSource === 'GPS',
      geoIp: input.geoIp,
    });
    if (mockSignals.length > 0) {
      status = 'suspicious';
      anomalyReasons.push(`Indikasi Fake GPS / Emulator: ${mockSignals.join('; ')}.`);
    }
  }

  const anomalyReasonText = anomalyReasons.length > 0 ? anomalyReasons.join(' ') : null;

  const historyEntry: ScanHistoryRecord = {
    scanNumber: newTotalScans,
    scannedAt: nowLabel,
    scannedAtIso: nowIso,
    city,
    province,
    venue,
    lat,
    lng,
    ipAddress: input.ipAddress || '0.0.0.0',
    isp: input.isp || input.geoIp?.isp || 'Jaringan Seluler / ISP',
    device: deviceLabel,
    browser: parsedUa.browser,
    status,
    statusNote:
      anomalyReasonText ||
      (withinCooldown
        ? `Dalam sesi cooldown (${settings.anomalyThreshold.cooldownSeconds} dtk)`
        : `Verifikasi asli via ${locationSource}`),
    accuracyMeters: typeof input.accuracyMeters === 'number' ? Math.round(input.accuracyMeters) : null,
    locationSource,
  };

  return {
    blocked: false,
    withinCooldown,
    effectiveMode,
    locationSource,
    status,
    anomalyReasons,
    anomalyReasonText,
    impossibleTravelDetected,
    velocityKmh,
    distanceKm,
    lat,
    lng,
    city,
    province,
    venue,
    newTotalScans,
    newTodayScans,
    historyEntry,
  };
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

function escapeInlineScriptJson(val: unknown): string {
  return JSON.stringify(val ?? '')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildQrVerificationHtml(params: {
  tagNumber: string;
  brand: string;
  sku: string;
  mode: 'hybrid' | 'strict';
  maxAccuracyMeters: number;
}): string {
  const safeTag = escapeHtml(params.tagNumber);
  const safeBrand = escapeHtml(params.brand || 'Produk');
  const safeSku = escapeHtml(params.sku || '');
  const isStrict = params.mode === 'strict';

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verifikasi Keaslian · ${safeTag}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #09090b; color: #f4f4f5; }
      .card { background: #18181b; border-color: #27272a; }
      .meta { color: #a1a1aa; }
      .tag-box { background: #27272a; border-color: #3f3f46; color: #e4e4e7; }
      .err-box { background: rgba(244,63,94,0.12); border-color: rgba(244,63,94,0.35); color: #fda4af; }
    }
    .card {
      width: 100%;
      max-width: 420px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 28px 24px;
      text-align: center;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 3px solid rgba(194, 142, 98, 0.22);
      border-top-color: #c28e62;
      border-radius: 50%;
      margin: 0 auto 18px;
      animation: spin 0.85s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .meta {
      margin: 0 0 18px;
      font-size: 13px;
      line-height: 1.55;
      color: #64748b;
    }
    .tag-box {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      margin-bottom: 16px;
    }
    .err-box {
      display: none;
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: #fff1f2;
      border: 1px solid #fecdd3;
      color: #be123c;
      font-size: 12.5px;
      line-height: 1.5;
      text-align: left;
    }
    .btn {
      display: none;
      width: 100%;
      margin-top: 14px;
      height: 44px;
      border: none;
      border-radius: 999px;
      background: #c28e62;
      color: #ffffff;
      font-size: 13.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn:hover { background: #b07d53; }
    .sub {
      margin-top: 14px;
      font-size: 11.5px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div id="spinner" class="spinner"></div>
    <div class="tag-box">${safeTag}</div>
    <h1 id="title">Memverifikasi Lokasi &amp; Keaslian</h1>
    <p id="desc" class="meta">
      ${isStrict
        ? 'Mohon izinkan akses GPS pada perangkat Anda agar sistem dapat memvalidasi keaslian produk.'
        : 'Memeriksa lokasi perangkat untuk mencatat verifikasi keaslian produk Anda...'}
    </p>
    <div id="errorBox" class="err-box"></div>
    <button id="retryBtn" type="button" class="btn">Coba Izinkan GPS Lagi</button>
    <div class="sub">${safeBrand}${safeSku ? ' · ' + safeSku : ''}</div>
  </div>

  <script>
    (function() {
      var tagNumber = ${escapeInlineScriptJson(params.tagNumber)};
      var mode = ${escapeInlineScriptJson(params.mode)};
      var titleEl = document.getElementById('title');
      var descEl = document.getElementById('desc');
      var errEl = document.getElementById('errorBox');
      var retryBtn = document.getElementById('retryBtn');
      var spinner = document.getElementById('spinner');

      function showBlocked(msg) {
        spinner.style.display = 'none';
        titleEl.textContent = 'Izin GPS Diperlukan';
        descEl.textContent = 'Kebijakan keamanan mewajibkan akses GPS aktif sebelum hasil verifikasi produk dapat ditampilkan.';
        errEl.textContent = msg;
        errEl.style.display = 'block';
        retryBtn.style.display = 'block';
      }

      function submitVerification(payload) {
        fetch('/api/q/' + encodeURIComponent(tagNumber) + '/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, status: res.status, data: data }; }); })
        .then(function(result) {
          if (result.ok && result.data && typeof result.data.redirectUrl === 'string' && /^https?:\/\//i.test(result.data.redirectUrl)) {
            titleEl.textContent = 'Verifikasi Berhasil';
            descEl.textContent = 'Mengalihkan ke halaman hasil verifikasi...';
            window.location.replace(result.data.redirectUrl);
          } else {
            showBlocked((result.data && result.data.message) || 'Gagal memverifikasi lokasi GPS. Silakan coba lagi.');
          }
        })
        .catch(function() {
          showBlocked('Koneksi ke server verifikasi terganggu. Periksa jaringan Anda lalu coba lagi.');
        });
      }

      function requestLocation() {
        spinner.style.display = 'block';
        errEl.style.display = 'none';
        retryBtn.style.display = 'none';
        titleEl.textContent = 'Memverifikasi Lokasi & Keaslian';

        if (!navigator.geolocation) {
          if (mode === 'strict') {
            showBlocked('Browser atau perangkat Anda tidak mendukung GPS. Gunakan browser seluler modern dengan GPS aktif.');
          } else {
            submitVerification({ gpsGranted: false, webdriver: Boolean(navigator.webdriver) });
          }
          return;
        }

        navigator.geolocation.getCurrentPosition(
          function(pos) {
            submitVerification({
              gpsGranted: true,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracyMeters: pos.coords.accuracy,
              speedMps: pos.coords.speed,
              webdriver: Boolean(navigator.webdriver)
            });
          },
          function(err) {
            if (mode === 'strict') {
              var reason = 'Akses lokasi ditolak oleh browser. Aktifkan izin Lokasi/GPS di pengaturan browser lalu tekan tombol di bawah.';
              if (err && err.code === 2) reason = 'Sinyal GPS perangkat tidak tersedia. Pastikan layanan Lokasi (GPS) aktif.';
              if (err && err.code === 3) reason = 'Waktu tunggu sinyal GPS habis. Coba lagi di area dengan sinyal lebih baik.';
              showBlocked(reason);
            } else {
              submitVerification({
                gpsGranted: false,
                fallbackReason: err ? err.message : 'GPS ditolak',
                webdriver: Boolean(navigator.webdriver)
              });
            }
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }

      retryBtn.addEventListener('click', requestLocation);
      requestLocation();
    })();
  </script>
</body>
</html>`;
}

// ==============================================================
// DYNAMIC SCAN ACTIVITY AGGREGATION (ZERO STATIC MOCK NUMBERS)
// ==============================================================
const ID_MONTH_MAP: Record<string, number> = {
  jan: 0, januari: 0,
  feb: 1, februari: 1,
  mar: 2, maret: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5,
  jul: 6, juli: 6,
  agt: 7, aug: 7, agustus: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oct: 9, oktober: 9,
  nov: 10, november: 10,
  des: 11, dec: 11, desember: 11,
};

const ID_SHORT_DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const ID_SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
const ID_FULL_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export function parseFlexibleScanDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // ISO date or datetime (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw.length === 10 ? `${raw}T12:00:00Z` : raw);
    if (!isNaN(d.getTime())) return d;
  }

  // Indonesian format: "04 Nov 2026, 09:30:10 WIB" or "19 Nov 2026, 02.59 WIB"
  const idMatch = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (idMatch) {
    const day = parseInt(idMatch[1], 10);
    const mon = ID_MONTH_MAP[idMatch[2].toLowerCase()];
    const year = parseInt(idMatch[3], 10);
    if (mon !== undefined && !isNaN(day) && !isNaN(year)) {
      const d = new Date(year, mon, day, 12, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export interface ActivityBucket {
  rangeType: '7d' | '30d' | '12m';
  label: string;
  fullDate: string;
  scans: number;
  valid: number;
  topBrand: string;
  sortOrder: number;
}

export function aggregateScanActivityFromPoints(
  scanPoints: any[],
  rangeInput: string,
  brandFilter?: string | null,
  nowDate: Date = new Date()
): ActivityBucket[] {
  const range: '7d' | '30d' | '12m' =
    rangeInput === '30d' || rangeInput === '12m' ? rangeInput : '7d';

  const normalizedFilter = (brandFilter || '').trim().toLowerCase();

  interface FlatEvent {
    date: Date;
    brand: string;
    isValid: boolean;
  }

  const events: FlatEvent[] = [];

  for (const pt of scanPoints || []) {
    const brand = String(pt.brand || 'Lainnya').trim() || 'Lainnya';
    if (normalizedFilter && brand.toLowerCase() !== normalizedFilter) {
      continue;
    }

    let parsedHistory: any[] = [];
    if (pt.scanHistory) {
      try {
        const h = typeof pt.scanHistory === 'string' ? JSON.parse(pt.scanHistory) : pt.scanHistory;
        if (Array.isArray(h)) parsedHistory = h;
      } catch (_) {}
    }

    if (parsedHistory.length > 0) {
      for (const h of parsedHistory) {
        const d =
          parseFlexibleScanDate(h.scannedAtIso) ||
          parseFlexibleScanDate(h.scannedAt) ||
          parseFlexibleScanDate(pt.createdAt) ||
          nowDate;
        events.push({
          date: d,
          brand,
          isValid: (h.status || pt.status || 'valid') === 'valid',
        });
      }
    } else {
      const d = parseFlexibleScanDate(pt.createdAt) || parseFlexibleScanDate(pt.latestTime) || nowDate;
      const count = Math.max(1, Number(pt.totalScans) || 1);
      const isValid = (pt.status || 'valid') === 'valid';
      for (let i = 0; i < count; i++) {
        events.push({ date: d, brand, isValid: i === 0 ? true : isValid });
      }
    }
  }

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayStart = startOfDay(nowDate);

  // Anchor to today if there are events within the last 7 days; otherwise anchor to the most recent recorded scan date
  let anchorDay = todayStart;
  if (events.length > 0) {
    let latestEventTime = 0;
    for (const ev of events) {
      const t = startOfDay(ev.date).getTime();
      if (t > latestEventTime) latestEventTime = t;
    }
    const diffDaysFromToday = (todayStart.getTime() - latestEventTime) / (24 * 60 * 60 * 1000);
    if (range === '7d' && diffDaysFromToday > 6) {
      anchorDay = new Date(latestEventTime);
    } else if (latestEventTime > todayStart.getTime()) {
      anchorDay = new Date(latestEventTime);
    }
  }

  const pickTopBrand = (counts: Map<string, number>): string => {
    let top = '-';
    let max = 0;
    for (const [b, c] of counts.entries()) {
      if (c > max) {
        max = c;
        top = b;
      }
    }
    return top;
  };

  if (range === '7d') {
    const buckets: ActivityBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(anchorDay.getFullYear(), anchorDay.getMonth(), anchorDay.getDate() - i);
      const dayStartMs = day.getTime();
      const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

      let scans = 0;
      let valid = 0;
      const brandMap = new Map<string, number>();

      for (const ev of events) {
        const t = ev.date.getTime();
        if (t >= dayStartMs && t < dayEndMs) {
          scans++;
          if (ev.isValid) valid++;
          brandMap.set(ev.brand, (brandMap.get(ev.brand) || 0) + 1);
        }
      }

      const dd = String(day.getDate()).padStart(2, '0');
      const mm = String(day.getMonth() + 1).padStart(2, '0');
      buckets.push({
        rangeType: '7d',
        label: `${ID_SHORT_DAYS[day.getDay()]} (${dd}/${mm})`,
        fullDate: `${dd} ${ID_SHORT_MONTHS[day.getMonth()]} ${day.getFullYear()}`,
        scans,
        valid,
        topBrand: pickTopBrand(brandMap),
        sortOrder: 7 - i,
      });
    }
    return buckets;
  }

  if (range === '30d') {
    const buckets: ActivityBucket[] = [];
    const totalDays = 30;
    const endDay = todayStart;
    const startDay = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - (totalDays - 1));

    for (let w = 0; w < 5; w++) {
      const segStart = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + w * 6);
      const segEnd =
        w === 4
          ? new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() + 1)
          : new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate() + (w + 1) * 6);
      const segEndDisplay = new Date(segEnd.getTime() - 1);

      let scans = 0;
      let valid = 0;
      const brandMap = new Map<string, number>();

      for (const ev of events) {
        const t = ev.date.getTime();
        if (t >= segStart.getTime() && t < segEnd.getTime()) {
          scans++;
          if (ev.isValid) valid++;
          brandMap.set(ev.brand, (brandMap.get(ev.brand) || 0) + 1);
        }
      }

      const d1 = String(segStart.getDate()).padStart(2, '0');
      const m1 = ID_SHORT_MONTHS[segStart.getMonth()];
      const d2 = String(segEndDisplay.getDate()).padStart(2, '0');
      const m2 = ID_SHORT_MONTHS[segEndDisplay.getMonth()];

      buckets.push({
        rangeType: '30d',
        label: `Periode ${w + 1}`,
        fullDate: `${d1} ${m1} – ${d2} ${m2} ${segEndDisplay.getFullYear()}`,
        scans,
        valid,
        topBrand: pickTopBrand(brandMap),
        sortOrder: w + 1,
      });
    }
    return buckets;
  }

  // 12m: last 12 calendar months up to current month
  const buckets: ActivityBucket[] = [];
  for (let m = 11; m >= 0; m--) {
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - m, 1);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

    let scans = 0;
    let valid = 0;
    const brandMap = new Map<string, number>();

    for (const ev of events) {
      const t = ev.date.getTime();
      if (t >= monthStart.getTime() && t < monthEnd.getTime()) {
        scans++;
        if (ev.isValid) valid++;
        brandMap.set(ev.brand, (brandMap.get(ev.brand) || 0) + 1);
      }
    }

    buckets.push({
      rangeType: '12m',
      label: ID_SHORT_MONTHS[monthStart.getMonth()],
      fullDate: `${ID_FULL_MONTHS[monthStart.getMonth()]} ${monthStart.getFullYear()}`,
      scans,
      valid,
      topBrand: pickTopBrand(brandMap),
      sortOrder: 12 - m,
    });
  }
  return buckets;
}
