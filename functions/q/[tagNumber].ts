// ==============================================================
// CLOUDFLARE PAGES FUNCTIONS: QR CODE DYNAMIC RESOLVER
// Route: /q/:tagNumber
// ==============================================================
import {
  DEFAULT_SYSTEM_SETTINGS,
  mergeSystemSettings,
  evaluateScanAgainstPolicy,
  buildQrVerificationHtml,
  type GeoIpResult,
  type ScanHistoryRecord,
} from '../../src/utils/securityPolicy.ts';

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env, request } = context;
  const tagNumber = params.tagNumber as string;

  if (!env.DB) {
    return new Response('Database tidak terhubung.', { status: 500 });
  }

  const tag = await env.DB.prepare('SELECT * FROM tags WHERE tagNumber = ?').bind(tagNumber).first<any>();

  if (!tag) {
    return new Response(`
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <title>Tag Tidak Terdaftar - Verifikasi Keaslian</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px 24px; max-width: 420px; width: 100%; text-align: center; }
            h2 { color: #f43f5e; margin: 0 0 12px; font-size: 20px; }
            p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
            .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(244, 63, 94, 0.15); color: #fb7185; font-family: monospace; font-size: 13px; font-weight: bold; border: 1px solid rgba(244, 63, 94, 0.3); }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Tag Tidak Terdaftar</h2>
            <p>Nomor tag fisik berikut tidak terdata pada sistem verifikasi keamanan:</p>
            <div class="badge">${tagNumber}</div>
          </div>
        </body>
      </html>
    `, {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  const batch = await env.DB.prepare('SELECT * FROM batches WHERE id = ?').bind(tag.batchId).first<any>();
  const targetUrl = (batch && batch.redirectUrl && batch.redirectUrl.trim())
    ? batch.redirectUrl.trim()
    : 'https://cek.sumas.id/';

  const settingsRow = await env.DB.prepare("SELECT value FROM system_settings WHERE key = 'app_settings'").first<{ value: string }>();
  let settings = mergeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
  if (settingsRow?.value) {
    try { settings = mergeSystemSettings(JSON.parse(settingsRow.value)); } catch (_) {}
  }

  const effectiveMode: 'hybrid' | 'strict' | 'flexible' =
    batch && batch.enableGps === 0 ? 'flexible' : settings.locationPolicy.mode;

  // Mode hybrid / strict: jalankan verifikasi GPS nyata di browser konsumen
  if (effectiveMode === 'hybrid' || effectiveMode === 'strict') {
    return new Response(
      buildQrVerificationHtml({
        tagNumber: tag.tagNumber,
        brand: batch?.brand || 'Produk',
        sku: batch?.sku || '',
        mode: effectiveMode,
        maxAccuracyMeters: settings.locationPolicy.maxAccuracyMeters,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  // Mode flexible: gunakan GeoIP real Cloudflare request.cf lalu catat & redirect
  const cf = (request as any).cf || {};
  const hasCfCoords = Number.isFinite(Number(cf.latitude)) && Number.isFinite(Number(cf.longitude));
  const geoIp: GeoIpResult = hasCfCoords
    ? {
        city: String(cf.city || 'Lokasi IP'),
        province: String(cf.region || ''),
        countryCode: String(cf.country || 'ID').toUpperCase(),
        lat: Number(cf.latitude),
        lng: Number(cf.longitude),
        isp: String(cf.asOrganization || 'ISP Publik'),
        isFallbackDefault: false,
      }
    : {
        city: 'Jakarta',
        province: 'DKI Jakarta',
        countryCode: 'ID',
        lat: -6.2088,
        lng: 106.8456,
        isp: 'ISP Publik',
        isFallbackDefault: true,
      };

  const existingRow = await env.DB
    .prepare('SELECT * FROM scan_points WHERE latestTagId = ? ORDER BY rowid DESC LIMIT 1')
    .bind(tag.tagNumber)
    .first<any>();

  let existingHistory: ScanHistoryRecord[] = [];
  if (existingRow?.scanHistory) {
    try {
      const parsed = JSON.parse(existingRow.scanHistory);
      if (Array.isArray(parsed)) existingHistory = parsed;
    } catch (_) {}
  }

  const evaluation = evaluateScanAgainstPolicy({
    settings,
    batchEnableGps: false,
    existingTotalScans: existingRow ? Number(existingRow.totalScans) || 0 : 0,
    existingTodayScans: existingRow ? Number(existingRow.todayScans) || 0 : 0,
    existingStatus: existingRow?.status,
    existingHistory,
    gpsGranted: false,
    geoIp,
    ipAddress: request.headers.get('cf-connecting-ip') || '0.0.0.0',
    isp: geoIp.isp,
    userAgent: request.headers.get('user-agent') || '',
  });

  const finalStatus = batch?.status === 'Disuspend' ? 'suspicious' : evaluation.status;
  const updatedHistory = evaluation.withinCooldown
    ? existingHistory
    : [evaluation.historyEntry, ...existingHistory].slice(0, 50);

  try {
    if (existingRow) {
      await env.DB.prepare(`
        UPDATE scan_points
        SET city = ?, province = ?, venue = ?, lat = ?, lng = ?,
            totalScans = ?, todayScans = ?, latestTime = ?,
            status = ?, anomalyReason = ?, deviceInfo = ?, scanHistory = ?
        WHERE id = ?
      `).bind(
        evaluation.city,
        evaluation.province,
        evaluation.venue,
        evaluation.lat,
        evaluation.lng,
        evaluation.newTotalScans,
        evaluation.newTodayScans,
        evaluation.historyEntry.scannedAt,
        finalStatus,
        evaluation.anomalyReasonText,
        evaluation.historyEntry.device,
        JSON.stringify(updatedHistory),
        existingRow.id
      ).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        `scan-${Date.now()}`,
        evaluation.city,
        evaluation.province,
        evaluation.venue,
        evaluation.lat,
        evaluation.lng,
        evaluation.newTotalScans,
        evaluation.newTodayScans,
        batch?.brand || 'Sumas',
        batch?.sku || 'Produk',
        batch?.batchId || batch?.id || '',
        tag.tagNumber,
        tag.pin || null,
        evaluation.historyEntry.scannedAt,
        batch?.isB2B ? 1 : 0,
        finalStatus,
        evaluation.anomalyReasonText,
        evaluation.historyEntry.device,
        JSON.stringify(updatedHistory),
        new Date().toISOString().split('T')[0]
      ).run();
    }
  } catch (_) {}

  const sep = targetUrl.includes('?') ? '&' : '?';
  const redirectTarget = `${targetUrl}${sep}tag=${encodeURIComponent(tag.tagNumber)}&pin=${encodeURIComponent(tag.pin || '')}&batch=${encodeURIComponent(batch?.batchId || '')}&sku=${encodeURIComponent(batch?.sku || '')}&brand=${encodeURIComponent(batch?.brand || '')}&status=${encodeURIComponent(finalStatus)}`;
  return Response.redirect(redirectTarget, 302);
};
