// ==============================================================
// CLOUDFLARE PAGES FUNCTIONS: SUMAS UNIFIED API ROUTER
// Powered by Cloudflare D1 Serverless SQLite Database
// ==============================================================

import {
  DEFAULT_SYSTEM_SETTINGS,
  mergeSystemSettings,
  evaluateScanAgainstPolicy,
  aggregateScanActivityFromPoints,
  type GeoIpResult,
  type ScanHistoryRecord,
  type NotificationConfig,
} from '../../src/utils/securityPolicy.ts';

interface Env {
  DB: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  WHATSAPP_API_TOKEN?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function corsOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const method = request.method;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (method === 'OPTIONS') {
    return corsOptions();
  }

  const db = env.DB;
  if (!db) {
    return jsonResponse({ error: 'Database D1 belum terhubung di Cloudflare Pages binding (DB).' }, 500);
  }

  try {
    // -------------------------------------------------------------
    // 1. DASHBOARD STATS
    // -------------------------------------------------------------
    if (pathname === '/api/dashboard/stats' && method === 'GET') {
      const totalBatches = await db.prepare('SELECT COUNT(*) as count FROM batches').first<{ count: number }>();
      const activeBatches = await db.prepare("SELECT COUNT(*) as count FROM batches WHERE status != 'Disuspend'").first<{ count: number }>();
      const suspendedBatches = await db.prepare("SELECT COUNT(*) as count FROM batches WHERE status = 'Disuspend'").first<{ count: number }>();
      const totalTags = await db.prepare('SELECT COALESCE(SUM(qty), 0) as total FROM batches').first<{ total: number }>();
      const b2bBatches = await db.prepare('SELECT COUNT(*) as count FROM batches WHERE isB2B = 1').first<{ count: number }>();
      const retailBatches = await db.prepare('SELECT COUNT(*) as count FROM batches WHERE isB2B = 0').first<{ count: number }>();
      const totalLogs = await db.prepare('SELECT COUNT(*) as count FROM audit_logs').first<{ count: number }>();
      const totalProducts = await db.prepare('SELECT COUNT(*) as count FROM products').first<{ count: number }>();
      const totalBrands = await db.prepare('SELECT COUNT(*) as count FROM brands').first<{ count: number }>();
      const activeBrands = await db.prepare("SELECT COUNT(*) as count FROM brands WHERE status = 'Aktif'").first<{ count: number }>();
      const scanSums = await db.prepare('SELECT COALESCE(SUM(totalScans), 0) as totalScans, COALESCE(SUM(todayScans), 0) as todayScans FROM scan_points').first<{ totalScans: number; todayScans: number }>();
      const cityCount = await db.prepare('SELECT COUNT(DISTINCT city) as count, COUNT(*) as totalPoints FROM scan_points').first<{ count: number; totalPoints: number }>();
      const scanValid = await db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'valid'").first<{ count: number }>();

      const brandStats = (await db.prepare('SELECT brand, COUNT(*) as batchCount, COALESCE(SUM(qty), 0) as totalQty FROM batches GROUP BY brand').all()).results;
      const recentLogsRaw = (await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5').all()).results as any[];
      const recentLogs = recentLogsRaw.map(r => {
        let parsed = [];
        try { parsed = JSON.parse(r.changes); } catch (_) {}
        return { ...r, changes: parsed };
      });

      const recentBatchesRaw = (await db.prepare('SELECT * FROM batches ORDER BY rowid DESC LIMIT 5').all()).results as any[];
      const recentBatches = recentBatchesRaw.map(row => ({
        ...row,
        isB2B: Boolean(row.isB2B),
        tags: null
      }));

      return jsonResponse({
        totalBatches: totalBatches?.count || 0,
        activeBatches: activeBatches?.count || 0,
        suspendedBatches: suspendedBatches?.count || 0,
        totalTags: totalTags?.total || 0,
        b2bBatches: b2bBatches?.count || 0,
        retailBatches: retailBatches?.count || 0,
        totalLogs: totalLogs?.count || 0,
        totalProducts: totalProducts?.count || 0,
        totalBrands: totalBrands?.count || 0,
        activeBrands: activeBrands?.count || 0,
        totalScans: scanSums?.totalScans || 0,
        todayScans: scanSums?.todayScans || 0,
        distinctCities: cityCount?.count || 0,
        totalScanPoints: cityCount?.totalPoints || 0,
        validScans: scanValid?.count || 0,
        brandStats,
        recentLogs,
        recentBatches,
        timestamp: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------
    // 2. SCANS & TELEMETRY
    // -------------------------------------------------------------
    if (pathname === '/api/scans/locations' && method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM scan_points ORDER BY id ASC').all()).results as any[];
      const result = rows.map((r) => {
        let history = [];
        if (r.scanHistory) {
          try {
            history = typeof r.scanHistory === 'string' ? JSON.parse(r.scanHistory) : r.scanHistory;
          } catch (_) {
            history = [];
          }
        }
        return {
          ...r,
          isB2B: Boolean(r.isB2B),
          scanHistory: history
        };
      });
      return jsonResponse(result);
    }

    if (pathname === '/api/scans/stats' && method === 'GET') {
      const totalPoints = await db.prepare('SELECT COUNT(*) as count FROM scan_points').first<{ count: number }>();
      const validCount = await db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'valid'").first<{ count: number }>();
      const repeatedCount = await db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'repeated'").first<{ count: number }>();
      const suspiciousCount = await db.prepare("SELECT COUNT(*) as count FROM scan_points WHERE status = 'suspicious'").first<{ count: number }>();
      const scanSums = await db.prepare('SELECT COALESCE(SUM(totalScans), 0) as totalScans, COALESCE(SUM(todayScans), 0) as todayScans FROM scan_points').first<{ totalScans: number; todayScans: number }>();

      return jsonResponse({
        totalLocations: totalPoints?.count || 0,
        totalScans: scanSums?.totalScans || 0,
        todayScans: scanSums?.todayScans || 0,
        valid: validCount?.count || 0,
        repeated: repeatedCount?.count || 0,
        suspicious: suspiciousCount?.count || 0
      });
    }

    if (pathname === '/api/scans/activity' && method === 'GET') {
      const range = url.searchParams.get('range') || '7d';
      const brand = url.searchParams.get('brand') || '';
      const rows = (await db.prepare('SELECT id, brand, totalScans, todayScans, status, latestTime, createdAt, scanHistory FROM scan_points').all()).results as any[];
      return jsonResponse(aggregateScanActivityFromPoints(rows, range, brand));
    }

    const sendEdgeAlertChannel = async (
      channel: 'email' | 'telegram' | 'whatsapp',
      cfg: NotificationConfig,
      subject: string,
      plainText: string,
      htmlBody: string
    ) => {
      if (channel === 'telegram') {
        const token = (cfg.telegramBotToken || env.TELEGRAM_BOT_TOKEN || '').trim();
        const chatId = (cfg.telegramChatId || '').trim();
        if (!token) return { success: false, target: chatId || '-', detail: 'Bot Token Telegram belum diisi.' };
        if (!chatId) return { success: false, target: '-', detail: 'Chat / Channel ID Telegram belum diisi.' };
        const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: htmlBody, parse_mode: 'HTML', disable_web_page_preview: true }),
        });
        const data = await res.json().catch(() => ({})) as any;
        if (res.ok && data?.ok) return { success: true, target: chatId, detail: `Terkirim ke Telegram (${chatId}), message_id: ${data.result?.message_id ?? '-'}.` };
        return { success: false, target: chatId, detail: `Telegram API menolak (${res.status}): ${data?.description || 'Periksa Bot Token dan Chat ID.'}` };
      }

      if (channel === 'whatsapp') {
        const gatewayUrl = (cfg.whatsappGatewayUrl || '').trim();
        const targetNumber = (cfg.whatsappNumber || '').trim();
        const apiToken = (cfg.whatsappApiToken || env.WHATSAPP_API_TOKEN || '').trim();
        if (!gatewayUrl || !targetNumber) return { success: false, target: targetNumber || '-', detail: 'URL Gateway atau nomor WhatsApp belum diisi.' };
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (apiToken) headers['Authorization'] = apiToken;
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ target: targetNumber, phone: targetNumber, message: plainText, countryCode: '62' }),
        });
        const rawText = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(rawText); } catch (_) {}
        if (res.ok && !(parsed && (parsed.status === false || parsed.ok === false))) {
          return { success: true, target: targetNumber, detail: `Terkirim ke WhatsApp Gateway (${parsed?.detail || parsed?.message || `HTTP ${res.status}`}).` };
        }
        return { success: false, target: targetNumber, detail: `WhatsApp Gateway menolak (${res.status}): ${parsed?.reason || parsed?.message || rawText.slice(0, 140)}` };
      }

      const recipients = (cfg.emailRecipients || '').split(/[,;]+/).map((s) => s.trim()).filter((s) => s.includes('@'));
      if (recipients.length === 0) return { success: false, target: '-', detail: 'Alamat email penerima belum diisi atau tidak valid.' };
      if (!env.RESEND_API_KEY) {
        return { success: false, target: recipients.join(', '), detail: 'RESEND_API_KEY belum dikonfigurasi pada Cloudflare Pages environment.' };
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: env.RESEND_FROM || 'Security Alert <onboarding@resend.dev>',
          to: recipients,
          subject,
          text: plainText,
          html: `<div style="font-family:sans-serif;line-height:1.6">${htmlBody.replace(/\n/g, '<br/>')}</div>`,
        }),
      });
      const data = await res.json().catch(() => ({})) as any;
      if (res.ok && data?.id) return { success: true, target: recipients.join(', '), detail: `Email terkirim via Resend API (id: ${data.id}).` };
      return { success: false, target: recipients.join(', '), detail: `Resend API menolak (${res.status}): ${data?.message || 'Periksa RESEND_API_KEY.'}` };
    };

    const loadActiveSettingsD1 = async () => {
      const row = await db.prepare("SELECT value FROM system_settings WHERE key = 'app_settings'").first<{ value: string }>();
      if (row?.value) {
        try { return mergeSystemSettings(JSON.parse(row.value)); } catch (_) {}
      }
      return mergeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    };

    const getCfGeoIp = (): GeoIpResult => {
      const cf = (request as any).cf || {};
      if (Number.isFinite(Number(cf.latitude)) && Number.isFinite(Number(cf.longitude))) {
        return {
          city: String(cf.city || 'Lokasi IP'),
          province: String(cf.region || ''),
          countryCode: String(cf.country || 'ID').toUpperCase(),
          lat: Number(cf.latitude),
          lng: Number(cf.longitude),
          isp: String(cf.asOrganization || 'ISP Publik'),
          isFallbackDefault: false,
        };
      }
      return {
        city: 'Jakarta',
        province: 'DKI Jakarta',
        countryCode: 'ID',
        lat: -6.2088,
        lng: 106.8456,
        isp: 'ISP Publik',
        isFallbackDefault: true,
      };
    };

    const verifyMatch = pathname.match(/^\/api\/q\/([^/]+)\/verify$/);
    if ((pathname === '/api/scans/record' || verifyMatch) && method === 'POST') {
      const s = await request.json().catch(() => ({})) as any;
      const tagLookup = verifyMatch ? decodeURIComponent(verifyMatch[1]) : (s.latestTagId || s.tagNumber || '');
      let tagRecord: any = null;
      let batchRecord: any = null;
      if (tagLookup) {
        tagRecord = await db.prepare('SELECT * FROM tags WHERE tagNumber = ?').bind(tagLookup).first<any>();
        if (tagRecord) {
          batchRecord = await db.prepare('SELECT * FROM batches WHERE id = ?').bind(tagRecord.batchId).first<any>();
        }
      }
      if (verifyMatch && !tagRecord) {
        return jsonResponse({ success: false, message: 'Nomor tag fisik tidak ditemukan.' }, 404);
      }

      const settings = await loadActiveSettingsD1();
      const geoIp = getCfGeoIp();
      const existingRow = tagLookup
        ? await db.prepare('SELECT * FROM scan_points WHERE latestTagId = ? ORDER BY rowid DESC LIMIT 1').bind(tagLookup).first<any>()
        : null;

      let existingHistory: ScanHistoryRecord[] = [];
      if (existingRow?.scanHistory) {
        try {
          const parsed = JSON.parse(existingRow.scanHistory);
          if (Array.isArray(parsed)) existingHistory = parsed;
        } catch (_) {}
      }

      const latVal = s.lat !== undefined && s.lat !== null && s.lat !== '' ? Number(s.lat) : null;
      const lngVal = s.lng !== undefined && s.lng !== null && s.lng !== '' ? Number(s.lng) : null;
      const gpsGranted = typeof s.gpsGranted === 'boolean' ? s.gpsGranted : (Number.isFinite(latVal) && Number.isFinite(lngVal));

      const evaluation = evaluateScanAgainstPolicy({
        settings,
        batchEnableGps: batchRecord ? batchRecord.enableGps !== 0 : true,
        existingTotalScans: existingRow ? Number(existingRow.totalScans) || 0 : 0,
        existingTodayScans: existingRow ? Number(existingRow.todayScans) || 0 : 0,
        existingStatus: existingRow?.status,
        existingHistory,
        gpsGranted,
        lat: latVal,
        lng: lngVal,
        accuracyMeters: s.accuracyMeters !== undefined && s.accuracyMeters !== null ? Number(s.accuracyMeters) : null,
        speedMps: s.speedMps !== undefined && s.speedMps !== null ? Number(s.speedMps) : null,
        isMockLocation: Boolean(s.isMockLocation),
        webdriver: Boolean(s.webdriver),
        city: s.city,
        province: s.province,
        venue: s.venue,
        countryCode: s.countryCode,
        geoIp,
        ipAddress: request.headers.get('cf-connecting-ip') || '0.0.0.0',
        isp: geoIp.isp,
        userAgent: request.headers.get('user-agent') || '',
        deviceInfo: s.deviceInfo,
      });

      if (evaluation.blocked) {
        return jsonResponse({ success: false, blocked: true, code: evaluation.blockCode, message: evaluation.blockMessage, error: evaluation.blockMessage }, 403);
      }

      const finalStatus = batchRecord?.status === 'Disuspend' ? 'suspicious' : evaluation.status;
      const updatedHistory = evaluation.withinCooldown
        ? existingHistory
        : [evaluation.historyEntry, ...existingHistory].slice(0, 50);

      let scanId: string;
      if (existingRow) {
        scanId = existingRow.id;
        await db.prepare(`
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
          scanId
        ).run();
      } else {
        scanId = s.id || `scan-${Date.now()}`;
        await db.prepare(`
          INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          scanId,
          evaluation.city,
          evaluation.province,
          evaluation.venue,
          evaluation.lat,
          evaluation.lng,
          evaluation.newTotalScans,
          evaluation.newTodayScans,
          s.brand || batchRecord?.brand || 'Sumas',
          s.productType || batchRecord?.sku || '',
          s.batchId || batchRecord?.batchId || '',
          tagLookup,
          s.pin || tagRecord?.pin || null,
          evaluation.historyEntry.scannedAt,
          (s.isB2B ?? batchRecord?.isB2B) ? 1 : 0,
          finalStatus,
          evaluation.anomalyReasonText,
          evaluation.historyEntry.device,
          JSON.stringify(updatedHistory),
          new Date().toISOString().split('T')[0]
        ).run();
      }

      const targetUrl = (batchRecord?.redirectUrl && batchRecord.redirectUrl.trim()) ? batchRecord.redirectUrl.trim() : 'https://cek.sumas.id/';
      const sep = targetUrl.includes('?') ? '&' : '?';
      const redirectUrl = `${targetUrl}${sep}tag=${encodeURIComponent(tagLookup)}&pin=${encodeURIComponent(tagRecord?.pin || '')}&batch=${encodeURIComponent(batchRecord?.batchId || '')}&sku=${encodeURIComponent(batchRecord?.sku || '')}&brand=${encodeURIComponent(batchRecord?.brand || '')}&status=${encodeURIComponent(finalStatus)}`;

      return jsonResponse({
        success: true,
        id: scanId,
        scanId,
        redirectUrl,
        status: finalStatus,
        anomalyReason: evaluation.anomalyReasonText,
        withinCooldown: evaluation.withinCooldown,
        totalScans: evaluation.newTotalScans,
        locationSource: evaluation.locationSource,
        city: evaluation.city,
        province: evaluation.province,
      });
    }

    // -------------------------------------------------------------
    // 3. BATCHES & TAGS
    // -------------------------------------------------------------
    if (pathname === '/api/batches' && method === 'GET') {
      const query = `
        SELECT 
          b.id,
          b.batchId,
          b.date,
          b.project,
          b.sku,
          b.brand,
          b.qty,
          b.specs,
          b.pinLength,
          b.status,
          b.isB2B,
          b.redirectUrl,
          b.qrType,
          b.requirePin,
          b.enableGps,
          COALESCE(tc.totalCount, b.qty) as actualTagCount,
          COALESCE(tc.availableCount, b.qty) as availableCount,
          COALESCE(tc.usedCount, 0) as usedCount
        FROM batches b
        LEFT JOIN (
          SELECT 
            batchId, 
            COUNT(*) as totalCount,
            SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as availableCount,
            SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as usedCount
          FROM tags
          GROUP BY batchId
        ) tc ON tc.batchId = b.id
        ORDER BY b.rowid DESC
      `;
      const rows = (await db.prepare(query).all()).results as any[];
      const result = rows.map((row) => ({
        ...row,
        isB2B: Boolean(row.isB2B),
        redirectUrl: row.redirectUrl || 'https://cek.sumas.id/',
        qrType: row.qrType || 'dynamic',
        requirePin: row.requirePin === null || row.requirePin === undefined ? true : Boolean(row.requirePin),
        enableGps: row.enableGps === null || row.enableGps === undefined ? true : Boolean(row.enableGps),
        tags: null
      }));
      return jsonResponse(result);
    }

    if (pathname === '/api/batches' && method === 'POST') {
      const batch = await request.json() as any;
      const id = batch.id || `b-${Date.now()}`;
      await db.prepare(`
        INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        batch.batchId,
        batch.date || new Date().toISOString(),
        batch.project || '',
        batch.sku,
        batch.brand,
        batch.qty || 100,
        batch.specs || '',
        batch.pinLength || 6,
        batch.status || 'Aktif',
        batch.isB2B ? 1 : 0,
        batch.redirectUrl || 'https://cek.sumas.id/',
        batch.qrType || 'dynamic',
        batch.requirePin ? 1 : 0,
        batch.enableGps ? 1 : 0
      ).run();

      return jsonResponse({ success: true, id, batchId: batch.batchId });
    }

    // Match /api/batches/:id/...
    const batchTagsMatch = pathname.match(/^\/api\/batches\/([^\/]+)\/tags$/);
    if (batchTagsMatch && method === 'GET') {
      const batchId = batchTagsMatch[1];
      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
      const limit = Math.min(500, Math.max(10, parseInt(url.searchParams.get('limit') || '96')));
      const offset = (page - 1) * limit;

      const totalResult = await db.prepare('SELECT COUNT(*) as count FROM tags WHERE batchId = ?').bind(batchId).first<{ count: number }>();
      const tags = (await db.prepare('SELECT * FROM tags WHERE batchId = ? LIMIT ? OFFSET ?').bind(batchId, limit, offset).all()).results;

      return jsonResponse({
        tags,
        page,
        limit,
        total: totalResult?.count || 0,
        totalPages: Math.ceil((totalResult?.count || 0) / limit)
      });
    }

    const batchSummaryMatch = pathname.match(/^\/api\/batches\/([^\/]+)\/summary$/);
    if (batchSummaryMatch && method === 'GET') {
      const batchId = batchSummaryMatch[1];
      const batch = await db.prepare('SELECT * FROM batches WHERE id = ?').bind(batchId).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      return jsonResponse({ ...batch, isB2B: Boolean(batch.isB2B) });
    }

    const batchIdMatch = pathname.match(/^\/api\/batches\/([^\/]+)$/);
    if (batchIdMatch) {
      const id = batchIdMatch[1];
      if (method === 'PUT') {
        const body = await request.json() as any;
        const existing = await db.prepare('SELECT * FROM batches WHERE id = ?').bind(id).first<any>();
        if (!existing) {
          return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
        }
        const updated = {
          sku: body.sku !== undefined ? body.sku : existing.sku,
          brand: body.brand !== undefined ? body.brand : existing.brand,
          specs: body.specs !== undefined ? body.specs : existing.specs,
          status: body.status !== undefined ? body.status : existing.status,
          redirectUrl: body.redirectUrl !== undefined ? body.redirectUrl : (existing.redirectUrl || 'https://cek.sumas.id/'),
          qrType: body.qrType !== undefined ? body.qrType : (existing.qrType || 'dynamic'),
          requirePin: body.requirePin !== undefined ? (body.requirePin ? 1 : 0) : existing.requirePin,
          enableGps: body.enableGps !== undefined ? (body.enableGps ? 1 : 0) : existing.enableGps
        };
        await db.prepare(`
          UPDATE batches 
          SET sku = ?, brand = ?, specs = ?, status = ?, redirectUrl = ?, qrType = ?, requirePin = ?, enableGps = ?
          WHERE id = ?
        `).bind(
          updated.sku,
          updated.brand,
          updated.specs,
          updated.status,
          updated.redirectUrl,
          updated.qrType,
          updated.requirePin,
          updated.enableGps,
          id
        ).run();
        return jsonResponse({ success: true, id, ...updated });
      }

      if (method === 'DELETE') {
        await db.prepare('DELETE FROM tags WHERE batchId = ?').bind(id).run();
        await db.prepare('DELETE FROM batches WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true, id });
      }
    }

    // -------------------------------------------------------------
    // 4. BRANDS
    // -------------------------------------------------------------
    if (pathname === '/api/brands' && method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM brands ORDER BY id DESC').all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/brands' && method === 'POST') {
      const b = await request.json() as any;
      const id = b.id || `br-${Date.now()}`;
      await db.prepare(`
        INSERT INTO brands (id, name, owner, description, status, logo, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, b.name, b.owner || '', b.description || '', b.status || 'Aktif', b.logo || '', new Date().toISOString()).run();
      return jsonResponse({ success: true, id });
    }

    const brandIdMatch = pathname.match(/^\/api\/brands\/([^\/]+)$/);
    if (brandIdMatch) {
      const id = brandIdMatch[1];
      if (method === 'PUT') {
        const b = await request.json() as any;
        const existing = await db.prepare('SELECT * FROM brands WHERE id = ?').bind(id).first<any>();
        if (!existing) {
          return jsonResponse({ error: 'Brand tidak ditemukan' }, 404);
        }
        const updated = {
          name: b.name !== undefined ? b.name : existing.name,
          owner: b.owner !== undefined ? b.owner : (existing.owner || ''),
          description: b.description !== undefined ? b.description : (existing.description || ''),
          status: b.status !== undefined ? b.status : (existing.status || 'Aktif'),
          logo: b.logo !== undefined ? b.logo : (existing.logo || '')
        };
        await db.prepare(`
          UPDATE brands SET name = ?, owner = ?, description = ?, status = ?, logo = ? WHERE id = ?
        `).bind(updated.name, updated.owner, updated.description, updated.status, updated.logo, id).run();
        return jsonResponse({ success: true, id, ...updated });
      }
      if (method === 'DELETE') {
        await db.prepare('DELETE FROM brands WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true, id });
      }
    }

    // -------------------------------------------------------------
    // 5. PRODUCTS (SKU)
    // -------------------------------------------------------------
    if (pathname === '/api/products' && method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM products ORDER BY id DESC').all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/products' && method === 'POST') {
      const p = await request.json() as any;
      const id = p.id || `prod-${Date.now()}`;
      await db.prepare(`
        INSERT INTO products (id, name, brand, category, description, skuCode, image, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, p.name, p.brand, p.category || '', p.description || '', p.skuCode || '', p.image || '', new Date().toISOString()).run();
      return jsonResponse({ success: true, id });
    }

    const prodIdMatch = pathname.match(/^\/api\/products\/([^\/]+)$/);
    if (prodIdMatch) {
      const id = prodIdMatch[1];
      if (method === 'PUT') {
        const p = await request.json() as any;
        const existing = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<any>();
        if (!existing) {
          return jsonResponse({ error: 'Produk tidak ditemukan' }, 404);
        }
        const updated = {
          name: p.name !== undefined ? p.name : existing.name,
          brand: p.brand !== undefined ? p.brand : existing.brand,
          category: p.category !== undefined ? p.category : (existing.category || ''),
          description: p.description !== undefined ? p.description : (existing.description || ''),
          skuCode: p.skuCode !== undefined ? p.skuCode : (existing.skuCode || ''),
          image: p.image !== undefined ? p.image : (existing.image || '')
        };
        await db.prepare(`
          UPDATE products SET name = ?, brand = ?, category = ?, description = ?, skuCode = ?, image = ? WHERE id = ?
        `).bind(updated.name, updated.brand, updated.category, updated.description, updated.skuCode, updated.image, id).run();
        return jsonResponse({ success: true, id, ...updated });
      }
      if (method === 'DELETE') {
        await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true, id });
      }
    }

    // -------------------------------------------------------------
    // 6. CATEGORIES
    // -------------------------------------------------------------
    if (pathname === '/api/categories' && method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM categories ORDER BY id ASC').all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/categories' && method === 'POST') {
      const c = await request.json() as any;
      const id = c.id || `cat-${Date.now()}`;
      await db.prepare(`
        INSERT INTO categories (id, name, description, specSchema)
        VALUES (?, ?, ?, ?)
      `).bind(id, c.name, c.description || '', c.specSchema || null).run();
      return jsonResponse({ success: true, id });
    }

    const catIdMatch = pathname.match(/^\/api\/categories\/([^\/]+)$/);
    if (catIdMatch) {
      const id = catIdMatch[1];
      if (method === 'PUT') {
        const c = await request.json() as any;
        await db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?').bind(c.name, c.description || '', id).run();
        return jsonResponse({ success: true, id });
      }
      if (method === 'DELETE') {
        await db.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true, id });
      }
    }

    // -------------------------------------------------------------
    // 7. USERS & AUDIT LOGS
    // -------------------------------------------------------------
    if (pathname === '/api/users' && method === 'GET') {
      const rows = (await db.prepare('SELECT id, name, username, email, phone, role, status, createdAt FROM users ORDER BY id ASC').all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/users' && method === 'POST') {
      const u = await request.json() as any;
      const id = u.id || `u-${Date.now()}`;
      await db.prepare(`
        INSERT INTO users (id, name, username, email, phone, role, status, password, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, u.name, u.username || u.email, u.email, u.phone || '', u.role || 'Staff', u.status || 'Aktif', u.password || 'password123', new Date().toISOString()).run();
      return jsonResponse({ success: true, id });
    }

    const userIdMatch = pathname.match(/^\/api\/users\/([^\/]+)$/);
    if (userIdMatch) {
      const id = userIdMatch[1];
      if (method === 'PUT') {
        const u = await request.json() as any;
        const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<any>();
        if (!existing) {
          return jsonResponse({ error: 'User tidak ditemukan' }, 404);
        }
        const updated = {
          name: u.name !== undefined ? u.name : existing.name,
          username: u.username !== undefined ? u.username : existing.username,
          email: u.email !== undefined ? u.email : existing.email,
          phone: u.phone !== undefined ? u.phone : (existing.phone || ''),
          role: u.role !== undefined ? u.role : (existing.role || 'Staff'),
          status: u.status !== undefined ? u.status : (existing.status || 'Aktif')
        };
        await db.prepare(`
          UPDATE users SET name = ?, username = ?, email = ?, phone = ?, role = ?, status = ? WHERE id = ?
        `).bind(updated.name, updated.username, updated.email, updated.phone, updated.role, updated.status, id).run();
        return jsonResponse({ success: true, id, ...updated });
      }
      if (method === 'DELETE') {
        await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true, id });
      }
    }

    if (pathname === '/api/audit-logs' && method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 50').all()).results as any[];
      const result = rows.map(r => {
        let parsed = [];
        try { parsed = JSON.parse(r.changes); } catch (_) {}
        return { ...r, changes: parsed };
      });
      return jsonResponse(result);
    }

    if (pathname === '/api/audit-logs' && method === 'POST') {
      const log = await request.json() as any;
      const id = log.id || Date.now();
      await db.prepare(`
        INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, log.batchId || '', log.timestamp || new Date().toISOString(), log.user || 'Admin', log.reason || '', JSON.stringify(log.changes || [])).run();
      return jsonResponse({ success: true, id });
    }

    // -------------------------------------------------------------
    // 8. NOTIFICATIONS & PASSWORD RESETS
    // -------------------------------------------------------------
    if (pathname === '/api/notifications' && method === 'GET') {
      const scanRows = (await db.prepare('SELECT * FROM scan_points ORDER BY rowid DESC LIMIT 15').all()).results as any[];
      const scanItems = scanRows.map(s => ({
        id: `notif-scan-${s.id}`,
        sourceId: s.id,
        category: 'scan',
        title: s.status === 'suspicious' ? 'Waspada Anomali Scan Tag' : 'Aktivitas Scan Tag Berhasil',
        subtitle: `${s.venue ? s.venue + ' · ' : ''}${s.city}, ${s.province}`,
        description: `Tag ${s.latestTagId || '-'} dipindai (${s.todayScans} scan hari ini)`,
        timestamp: s.createdAt || 'Hari ini',
        timeAgo: s.latestTime || 'Baru saja',
        status: s.status || 'valid',
        isRead: false
      }));
      return jsonResponse(scanItems);
    }

    if (pathname === '/api/notifications/mark-read' && method === 'POST') {
      return jsonResponse({ success: true });
    }

    // -------------------------------------------------------------
    // 9. SYSTEM SETTINGS & BACKUP/RESTORE
    // -------------------------------------------------------------
    const DEFAULT_SETTINGS = {
      anomalyThreshold: {
        validMaxScans: 1,
        warningMaxScans: 3,
        suspiciousMinScans: 4,
        cooldownSeconds: 60,
        enableImpossibleTravel: true,
        maxVelocityKmh: 300,
        consecutiveFailureAlert: 3
      },
      locationPolicy: {
        mode: 'hybrid',
        requireGpsByDefault: true,
        enforceIndonesiaOnly: true,
        maxAccuracyMeters: 150,
        detectMockLocation: true
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
        throttleMinutes: 5
      },
      backupInfo: {
        lastBackupDate: '10 Nov 2026, 08:30 WIB',
        autoBackupDaily: true,
        retentionDays: 30
      }
    };

    if (pathname === '/api/settings' && method === 'GET') {
      const row = await db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").first<{ value: string; updatedAt: string }>();
      if (row && row.value) {
        let parsed = {};
        try { parsed = JSON.parse(row.value); } catch (_) {}
        return jsonResponse({ ...DEFAULT_SETTINGS, ...parsed, updatedAt: row.updatedAt });
      }
      return jsonResponse({ ...DEFAULT_SETTINGS, updatedAt: 'Belum pernah diubah' });
    }

    if (pathname === '/api/settings' && method === 'PUT') {
      const newSettings = await request.json() as any;
      const merged = {
        anomalyThreshold: { ...DEFAULT_SETTINGS.anomalyThreshold, ...(newSettings?.anomalyThreshold || {}) },
        locationPolicy: { ...DEFAULT_SETTINGS.locationPolicy, ...(newSettings?.locationPolicy || {}) },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...(newSettings?.notifications || {}) },
        backupInfo: { ...DEFAULT_SETTINGS.backupInfo, ...(newSettings?.backupInfo || {}) }
      };
      const updatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      await db.prepare(`
        INSERT INTO system_settings (key, value, updatedAt)
        VALUES ('app_settings', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
      `).bind(JSON.stringify(merged), updatedAt).run();

      await db.prepare(`
        INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        Date.now(),
        'SYSTEM-CONFIG',
        updatedAt,
        'Super Admin',
        'Pembaruan Kebijakan Keamanan & Pengaturan Sistem',
        JSON.stringify([
          { field: 'Ambang Batas Anomali', old: 'Versi Sebelumnya', new: `${merged.anomalyThreshold.warningMaxScans}x Waspada, ≥${merged.anomalyThreshold.suspiciousMinScans}x Palsu` },
          { field: 'Mode Telemetri GPS', old: 'Versi Sebelumnya', new: merged.locationPolicy.mode },
          { field: 'Peringatan Notifikasi', old: 'Versi Sebelumnya', new: `Email: ${merged.notifications.emailEnabled ? 'Aktif' : 'Nonaktif'}, WA: ${merged.notifications.whatsappEnabled ? 'Aktif' : 'Nonaktif'}, Tele: ${merged.notifications.telegramEnabled ? 'Aktif' : 'Nonaktif'}` }
        ])
      ).run();

      return jsonResponse({ success: true, settings: { ...merged, updatedAt } });
    }

    if (pathname === '/api/settings/test-alert' && method === 'POST') {
      const body = await request.json().catch(() => ({})) as any;
      const channel = body?.channel;
      const target = body?.target;
      if (!['email', 'telegram', 'whatsapp'].includes(channel)) {
        return jsonResponse({ success: false, error: 'Channel notifikasi tidak valid.' }, 400);
      }

      const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      if (channel === 'telegram' || channel === 'whatsapp') {
        const label = channel === 'telegram' ? 'Telegram Bot' : 'WhatsApp Gateway';
        return jsonResponse({
          success: true,
          skipped: true,
          message: `Integrasi API ${label} dilewati sementara sehingga tidak mengirim permintaan ke server eksternal.`,
          timestamp: now,
        });
      }

      const active = await loadActiveSettingsD1();
      const effectiveNotif: NotificationConfig = {
        ...active.notifications,
        ...(body?.config && typeof body.config === 'object' ? body.config : {}),
      };
      if (target) {
        effectiveNotif.emailRecipients = String(target);
      }

      const channelName = 'Email Security';
      const subject = '[UJI COBA] Peringatan Keamanan Sistem Telemetri';
      const plainText = `Uji coba pengiriman peringatan keamanan berhasil terhubung.\nChannel: ${channelName}\nWaktu: ${now}`;
      const htmlBody = `<b>[UJI COBA] Peringatan Keamanan</b>\nChannel: ${channelName}\nWaktu: ${now}`;

      const result = await sendEdgeAlertChannel('email', effectiveNotif, subject, plainText, htmlBody);

      await db.prepare(`
        INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        Date.now(),
        'ALERT-TEST',
        now,
        'System Alert Engine',
        `Uji Coba Pengiriman Notifikasi Anomali (${channelName})`,
        JSON.stringify([
          { field: 'Channel', old: '-', new: channelName },
          { field: 'Tujuan', old: '-', new: result.target || '-' },
          { field: 'Status Uji Coba', old: 'Menunggu', new: result.success ? `Terkirim (${result.detail})` : `Gagal (${result.detail})` }
        ])
      ).run();

      if (!result.success) {
        return jsonResponse({ success: false, error: result.detail, timestamp: now }, 400);
      }
      return jsonResponse({ success: true, message: result.detail, timestamp: now });
    }

    if (pathname === '/api/settings/backup' && method === 'GET') {
      const format = (url.searchParams.get('format') || 'json').toLowerCase();
      const backupDate = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      const timestampIso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      if (format === 'sqlite' || format === 'db') {
        return jsonResponse(
          {
            error:
              'Unduh file biner .sqlite hanya tersedia pada server Node.js/VPS. Pada Cloudflare D1, gunakan format .sql (MySQL/phpMyAdmin) atau .json.'
          },
          400
        );
      }

      const batches = (await db.prepare('SELECT * FROM batches').all()).results as any[];
      const tags = (await db.prepare('SELECT * FROM tags').all()).results as any[];
      const scanPoints = (await db.prepare('SELECT * FROM scan_points').all()).results as any[];
      const scanActivities = (await db.prepare('SELECT * FROM scan_activities').all()).results as any[];
      const categories = (await db.prepare('SELECT * FROM categories').all()).results as any[];
      const brands = (await db.prepare('SELECT * FROM brands').all()).results as any[];
      const products = (await db.prepare('SELECT * FROM products').all()).results as any[];
      const auditLogs = (await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC').all()).results as any[];
      let passwordResetRequests: any[] = [];
      let readNotifications: any[] = [];
      let systemSettings: any[] = [];
      try { passwordResetRequests = (await db.prepare('SELECT * FROM password_reset_requests').all()).results as any[]; } catch (_) {}
      try { readNotifications = (await db.prepare('SELECT * FROM read_notifications').all()).results as any[]; } catch (_) {}
      try { systemSettings = (await db.prepare('SELECT * FROM system_settings').all()).results as any[]; } catch (_) {}
      const settingsRow = await db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").first<{ value: string; updatedAt: string }>();

      // Update lastBackupDate
      try {
        const current = settingsRow?.value ? JSON.parse(settingsRow.value) : structuredClone(DEFAULT_SETTINGS);
        current.backupInfo = { ...DEFAULT_SETTINGS.backupInfo, ...(current.backupInfo || {}), lastBackupDate: backupDate };
        await db.prepare(`
          INSERT INTO system_settings (key, value, updatedAt)
          VALUES ('app_settings', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
        `).bind(JSON.stringify(current), backupDate).run();
      } catch (_) {}

      if (format === 'mysql' || format === 'sql') {
        const usersFull = (await db.prepare('SELECT * FROM users').all()).results as any[];
        const esc = (val: any): string => {
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
          if (typeof val === 'boolean') return val ? '1' : '0';
          return `'${String(val)
            .replace(/\\/g, '\\\\')
            .replace(/\0/g, '\\0')
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\x1a/g, '\\Z')
            .replace(/'/g, "\\'")}'`;
        };
        const insertBlocks = (table: string, cols: string[], rows: any[]) => {
          if (!rows.length) return '';
          const colList = cols.map((c) => `\`${c}\``).join(', ');
          const chunks: string[] = [];
          for (let i = 0; i < rows.length; i += 100) {
            const slice = rows.slice(i, i + 100);
            const vals = slice.map((r) => `(${cols.map((c) => esc(r[c])).join(', ')})`).join(',\n');
            chunks.push(`INSERT INTO \`${table}\` (${colList}) VALUES\n${vals};`);
          }
          return chunks.join('\n\n') + '\n';
        };

        const sqlDump = [
          `-- SUMAS DATABASE BACKUP (MySQL / MariaDB - phpMyAdmin Ready)`,
          `-- Dibuat pada: ${backupDate}`,
          `SET NAMES utf8mb4;`,
          `SET FOREIGN_KEY_CHECKS = 0;`,
          `DROP TABLE IF EXISTS \`tags\`, \`batches\`, \`scan_points\`, \`scan_activities\`, \`audit_logs\`, \`users\`, \`brands\`, \`products\`, \`password_reset_requests\`, \`read_notifications\`, \`categories\`, \`system_settings\`;`,
          `CREATE TABLE \`batches\` (\`id\` VARCHAR(191) PRIMARY KEY, \`batchId\` VARCHAR(191) NOT NULL, \`date\` VARCHAR(191) NOT NULL, \`project\` VARCHAR(255), \`sku\` VARCHAR(255) NOT NULL, \`brand\` VARCHAR(191) NOT NULL, \`qty\` INT NOT NULL DEFAULT 0, \`specs\` LONGTEXT, \`pinLength\` INT NOT NULL DEFAULT 8, \`status\` VARCHAR(64) NOT NULL DEFAULT 'Aktif', \`isB2B\` TINYINT(1) NOT NULL DEFAULT 0, \`tags\` LONGTEXT, \`redirectUrl\` TEXT, \`qrType\` VARCHAR(32) DEFAULT 'dynamic', \`requirePin\` TINYINT(1) DEFAULT 1, \`enableGps\` TINYINT(1) DEFAULT 1) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('batches', ['id', 'batchId', 'date', 'project', 'sku', 'brand', 'qty', 'specs', 'pinLength', 'status', 'isB2B', 'tags', 'redirectUrl', 'qrType', 'requirePin', 'enableGps'], batches),
          `CREATE TABLE \`tags\` (\`id\` VARCHAR(191) PRIMARY KEY, \`batchId\` VARCHAR(191) NOT NULL, \`tagNumber\` VARCHAR(191) NOT NULL, \`pin\` VARCHAR(64) NOT NULL, \`status\` VARCHAR(64) NOT NULL DEFAULT 'Tersedia', \`project\` VARCHAR(255), \`specs\` TEXT, \`codeType\` VARCHAR(191), \`warranty\` VARCHAR(191), \`prodCode\` VARCHAR(191), \`note\` TEXT, \`allocatedAt\` VARCHAR(191)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('tags', ['id', 'batchId', 'tagNumber', 'pin', 'status', 'project', 'specs', 'codeType', 'warranty', 'prodCode', 'note', 'allocatedAt'], tags),
          `CREATE TABLE \`scan_points\` (\`id\` VARCHAR(191) PRIMARY KEY, \`city\` VARCHAR(191) NOT NULL, \`province\` VARCHAR(191) NOT NULL, \`venue\` VARCHAR(255), \`lat\` DOUBLE NOT NULL, \`lng\` DOUBLE NOT NULL, \`totalScans\` INT NOT NULL DEFAULT 0, \`todayScans\` INT NOT NULL DEFAULT 0, \`brand\` VARCHAR(191) NOT NULL, \`productType\` VARCHAR(255), \`batchId\` VARCHAR(191), \`latestTagId\` VARCHAR(191), \`pin\` VARCHAR(64), \`latestTime\` VARCHAR(191), \`isB2B\` TINYINT(1) DEFAULT 0, \`status\` VARCHAR(64) DEFAULT 'valid', \`anomalyReason\` TEXT, \`deviceInfo\` VARCHAR(255), \`scanHistory\` LONGTEXT, \`createdAt\` VARCHAR(191)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('scan_points', ['id', 'city', 'province', 'venue', 'lat', 'lng', 'totalScans', 'todayScans', 'brand', 'productType', 'batchId', 'latestTagId', 'pin', 'latestTime', 'isB2B', 'status', 'anomalyReason', 'deviceInfo', 'scanHistory', 'createdAt'], scanPoints),
          `CREATE TABLE \`scan_activities\` (\`id\` INT PRIMARY KEY AUTO_INCREMENT, \`rangeType\` VARCHAR(32) NOT NULL, \`label\` VARCHAR(191) NOT NULL, \`fullDate\` VARCHAR(191) NOT NULL, \`scans\` INT NOT NULL DEFAULT 0, \`valid\` INT NOT NULL DEFAULT 0, \`topBrand\` VARCHAR(191) NOT NULL, \`sortOrder\` INT NOT NULL DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('scan_activities', ['id', 'rangeType', 'label', 'fullDate', 'scans', 'valid', 'topBrand', 'sortOrder'], scanActivities),
          `CREATE TABLE \`audit_logs\` (\`id\` BIGINT PRIMARY KEY, \`batchId\` VARCHAR(191) NOT NULL, \`timestamp\` VARCHAR(191) NOT NULL, \`user\` VARCHAR(191) NOT NULL, \`reason\` TEXT NOT NULL, \`changes\` LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('audit_logs', ['id', 'batchId', 'timestamp', 'user', 'reason', 'changes'], auditLogs),
          `CREATE TABLE \`users\` (\`id\` VARCHAR(191) PRIMARY KEY, \`name\` VARCHAR(191) NOT NULL, \`username\` VARCHAR(191), \`email\` VARCHAR(191) NOT NULL, \`phone\` VARCHAR(64), \`role\` VARCHAR(64) NOT NULL, \`avatar\` LONGTEXT, \`status\` VARCHAR(64) DEFAULT 'Aktif', \`createdAt\` VARCHAR(191), \`password\` TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('users', ['id', 'name', 'username', 'email', 'phone', 'role', 'avatar', 'status', 'createdAt', 'password'], usersFull),
          `CREATE TABLE \`brands\` (\`id\` VARCHAR(191) PRIMARY KEY, \`name\` VARCHAR(191) NOT NULL, \`logo\` LONGTEXT, \`ownerId\` VARCHAR(191) NOT NULL, \`ownerName\` VARCHAR(191) NOT NULL, \`ownerEmail\` VARCHAR(191), \`ownerRole\` VARCHAR(64), \`description\` TEXT, \`category\` VARCHAR(191), \`businessType\` VARCHAR(64) DEFAULT 'Retail', \`status\` VARCHAR(64) NOT NULL DEFAULT 'Aktif', \`createdAt\` VARCHAR(191) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('brands', ['id', 'name', 'logo', 'ownerId', 'ownerName', 'ownerEmail', 'ownerRole', 'description', 'category', 'businessType', 'status', 'createdAt'], brands),
          `CREATE TABLE \`products\` (\`id\` VARCHAR(191) PRIMARY KEY, \`brandId\` VARCHAR(191), \`brandName\` VARCHAR(191) NOT NULL, \`sku\` VARCHAR(255) NOT NULL, \`category\` VARCHAR(255), \`isB2B\` TINYINT(1) DEFAULT 0, \`description\` TEXT, \`createdAt\` VARCHAR(191), \`skuCode\` VARCHAR(191), \`image\` LONGTEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('products', ['id', 'brandId', 'brandName', 'sku', 'category', 'isB2B', 'description', 'createdAt', 'skuCode', 'image'], products),
          `CREATE TABLE \`password_reset_requests\` (\`id\` VARCHAR(191) PRIMARY KEY, \`userId\` VARCHAR(191), \`userName\` VARCHAR(191) NOT NULL, \`userEmail\` VARCHAR(191) NOT NULL, \`userRole\` VARCHAR(64) NOT NULL, \`avatar\` LONGTEXT, \`requestedAt\` VARCHAR(191) NOT NULL, \`status\` VARCHAR(64) NOT NULL DEFAULT 'Menunggu', \`actionNote\` TEXT, \`isRead\` TINYINT(1) DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('password_reset_requests', ['id', 'userId', 'userName', 'userEmail', 'userRole', 'avatar', 'requestedAt', 'status', 'actionNote', 'isRead'], passwordResetRequests),
          `CREATE TABLE \`read_notifications\` (\`id\` VARCHAR(191) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('read_notifications', ['id'], readNotifications),
          `CREATE TABLE \`categories\` (\`id\` VARCHAR(191) PRIMARY KEY, \`name\` VARCHAR(191) NOT NULL, \`parentId\` VARCHAR(191), \`level\` INT NOT NULL, \`code\` VARCHAR(64), \`description\` TEXT, \`status\` VARCHAR(64) DEFAULT 'Aktif', \`itemCount\` INT DEFAULT 0, \`orderIndex\` INT DEFAULT 0, \`createdAt\` VARCHAR(191) NOT NULL, \`specSchema\` LONGTEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('categories', ['id', 'name', 'parentId', 'level', 'code', 'description', 'status', 'itemCount', 'orderIndex', 'createdAt', 'specSchema'], categories),
          `CREATE TABLE \`system_settings\` (\`key\` VARCHAR(191) PRIMARY KEY, \`value\` LONGTEXT NOT NULL, \`updatedAt\` VARCHAR(191) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
          insertBlocks('system_settings', ['key', 'value', 'updatedAt'], systemSettings),
          `SET FOREIGN_KEY_CHECKS = 1;`
        ].join('\n\n');

        return new Response(sqlDump, {
          headers: {
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': `attachment; filename="sumas-backup-mysql-${timestampIso}.sql"`,
            'X-Backup-Date': encodeURIComponent(backupDate),
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      const users = (await db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users').all()).results;

      const payload = {
        system: 'Sumas Anti-Counterfeiting Platform (Cloudflare Native)',
        version: '2.6.0-Enterprise',
        backupGeneratedAt: backupDate,
        summary: {
          totalBatches: batches.length,
          totalTags: tags.length,
          totalScanPoints: scanPoints.length,
          totalScanActivities: scanActivities.length,
          totalCategories: categories.length,
          totalBrands: brands.length,
          totalProducts: products.length,
          totalUsers: users.length,
          totalAuditLogs: auditLogs.length
        },
        data: {
          batches,
          tags,
          scanPoints,
          scanActivities,
          categories,
          brands,
          products,
          users,
          auditLogs,
          passwordResetRequests,
          readNotifications,
          settings: settingsRow?.value ? JSON.parse(settingsRow.value) : DEFAULT_SETTINGS
        }
      };

      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="sumas-backup-${timestampIso}.json"`,
          'X-Backup-Date': encodeURIComponent(backupDate),
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    if (pathname === '/api/settings/restore' && method === 'POST') {
      const backup = (await request.json()) as any;
      if (!backup || !backup.data || !backup.system) {
        return jsonResponse({ error: 'Format berkas cadangan tidak valid atau rusak.' }, 400);
      }

      const {
        batches,
        tags,
        scanPoints,
        scanActivities,
        categories,
        brands,
        products,
        auditLogs,
        settings
      } = backup.data;

      const stmts: D1PreparedStatement[] = [];
      const stats = { batches: 0, tags: 0, brands: 0, products: 0, categories: 0 };

      if (Array.isArray(batches)) {
        stmts.push(db.prepare('DELETE FROM batches'));
        for (const b of batches) {
          stmts.push(
            db.prepare(`
              INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, tags, redirectUrl, qrType, requirePin, enableGps)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              b.id, b.batchId, b.date || '', b.project ?? null, b.sku || '', b.brand || '',
              Number(b.qty) || 0, b.specs ?? null, Number(b.pinLength) || 8, b.status || 'Aktif',
              b.isB2B ? 1 : 0, b.tags ?? null, b.redirectUrl || 'https://cek.sumas.id/',
              b.qrType || 'dynamic', b.requirePin === 0 || b.requirePin === false ? 0 : 1,
              b.enableGps === 0 || b.enableGps === false ? 0 : 1
            )
          );
          stats.batches++;
        }
      }

      if (Array.isArray(tags)) {
        stmts.push(db.prepare('DELETE FROM tags'));
        for (const t of tags) {
          stmts.push(
            db.prepare(`
              INSERT INTO tags (id, batchId, tagNumber, pin, status, project, specs, codeType, warranty, prodCode, note, allocatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              t.id, t.batchId, t.tagNumber, t.pin, t.status || 'Tersedia',
              t.project ?? null, t.specs ?? null, t.codeType ?? null, t.warranty ?? null,
              t.prodCode ?? null, t.note ?? null, t.allocatedAt ?? null
            )
          );
          stats.tags++;
        }
      }

      if (Array.isArray(scanPoints)) {
        stmts.push(db.prepare('DELETE FROM scan_points'));
        for (const s of scanPoints) {
          const hist = s.scanHistory ? (typeof s.scanHistory === 'string' ? s.scanHistory : JSON.stringify(s.scanHistory)) : null;
          stmts.push(
            db.prepare(`
              INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              s.id, s.city || '', s.province || '', s.venue ?? null, Number(s.lat) || 0, Number(s.lng) || 0,
              Number(s.totalScans) || 0, Number(s.todayScans) || 0, s.brand || '', s.productType ?? null,
              s.batchId ?? null, s.latestTagId ?? null, s.pin ?? null, s.latestTime ?? null,
              s.isB2B ? 1 : 0, s.status || 'valid', s.anomalyReason ?? null, s.deviceInfo ?? null, hist, s.createdAt ?? null
            )
          );
        }
      }

      if (Array.isArray(scanActivities)) {
        stmts.push(db.prepare('DELETE FROM scan_activities'));
        for (const a of scanActivities) {
          stmts.push(
            db.prepare(`
              INSERT INTO scan_activities (rangeType, label, fullDate, scans, valid, topBrand, sortOrder)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).bind(a.rangeType || '7d', a.label || '', a.fullDate || '', Number(a.scans) || 0, Number(a.valid) || 0, a.topBrand || '', Number(a.sortOrder) || 0)
          );
        }
      }

      if (Array.isArray(categories)) {
        stmts.push(db.prepare('DELETE FROM categories'));
        for (const c of categories) {
          stmts.push(
            db.prepare(`
              INSERT INTO categories (id, name, parentId, level, code, description, status, itemCount, orderIndex, createdAt, specSchema)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              c.id, c.name, c.parentId ?? null, Number(c.level) || 1, c.code ?? null,
              c.description ?? null, c.status || 'Aktif', Number(c.itemCount) || 0,
              Number(c.orderIndex) || 0, c.createdAt || new Date().toISOString().split('T')[0], c.specSchema ?? null
            )
          );
          stats.categories++;
        }
      }

      if (Array.isArray(brands)) {
        stmts.push(db.prepare('DELETE FROM brands'));
        for (const br of brands) {
          stmts.push(
            db.prepare(`
              INSERT INTO brands (id, name, logo, ownerId, ownerName, ownerEmail, ownerRole, description, category, businessType, status, createdAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              br.id, br.name, br.logo ?? null, br.ownerId || '', br.ownerName || '',
              br.ownerEmail ?? null, br.ownerRole ?? null, br.description ?? null,
              br.category ?? null, br.businessType || 'Retail', br.status || 'Aktif',
              br.createdAt || new Date().toISOString().split('T')[0]
            )
          );
          stats.brands++;
        }
      }

      if (Array.isArray(products)) {
        stmts.push(db.prepare('DELETE FROM products'));
        for (const p of products) {
          stmts.push(
            db.prepare(`
              INSERT INTO products (id, brandId, brandName, sku, category, isB2B, description, createdAt, skuCode, image)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              p.id, p.brandId ?? null, p.brandName || '', p.sku || '', p.category ?? null,
              p.isB2B ? 1 : 0, p.description ?? null, p.createdAt ?? null, p.skuCode ?? null, p.image ?? null
            )
          );
          stats.products++;
        }
      }

      if (Array.isArray(auditLogs)) {
        stmts.push(db.prepare('DELETE FROM audit_logs'));
        for (const l of auditLogs) {
          const chg = typeof l.changes === 'string' ? l.changes : JSON.stringify(l.changes || []);
          stmts.push(
            db.prepare(`
              INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
              VALUES (?, ?, ?, ?, ?, ?)
            `).bind(l.id, l.batchId || '', l.timestamp || '', l.user || 'System', l.reason || '', chg)
          );
        }
      }

      if (settings) {
        const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
        stmts.push(
          db.prepare(`
            INSERT INTO system_settings (key, value, updatedAt)
            VALUES ('app_settings', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
          `).bind(JSON.stringify(settings), now)
        );
      }

      for (let i = 0; i < stmts.length; i += 100) {
        await db.batch(stmts.slice(i, i + 100));
      }

      return jsonResponse({
        success: true,
        restored: stats,
        message: `Pemulihan lengkap berhasil! ${stats.batches} batch, ${stats.tags} tag, ${stats.brands} brand, ${stats.products} SKU, dan ${stats.categories} kategori telah dipulihkan.`
      });
    }

    return jsonResponse({ error: 'Endpoint tidak ditemukan', path: pathname }, 404);
  } catch (error: any) {
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
};
