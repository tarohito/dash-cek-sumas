export type ScanSecurityStatus = 'valid' | 'repeated' | 'suspicious';

export interface ScanHistoryItem {
  scanNumber: number;
  scannedAt: string;
  city: string;
  province: string;
  venue?: string;
  lat: number;
  lng: number;
  ipAddress: string;
  isp?: string;
  device: string;
  browser?: string;
  status: ScanSecurityStatus;
  statusNote?: string;
}

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
  pin?: string;
  latestTime: string;
  status: ScanSecurityStatus;
  anomalyReason?: string;
  deviceInfo: string;
  scanHistory?: ScanHistoryItem[];
  createdAt?: string;
}
