// ==============================================================
// CLOUDFLARE PAGES FUNCTIONS: SUMAS UNIFIED API ROUTER
// Powered by Cloudflare D1 Serverless SQLite Database
// ==============================================================

interface Env {
  DB: D1Database;
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
      const rows = (await db.prepare('SELECT * FROM scan_activities WHERE rangeType = ? ORDER BY sortOrder ASC').bind(range).all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/scans/record' && method === 'POST') {
      const s = await request.json() as any;
      const newId = s.id || `scan-${Date.now()}`;
      await db.prepare(`
        INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, latestTime, isB2B, status, anomalyReason, deviceInfo, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        newId,
        s.city || 'Jakarta',
        s.province || '',
        s.venue || '',
        s.lat || -6.2088,
        s.lng || 106.8456,
        s.totalScans || 1,
        s.todayScans || 1,
        s.brand || 'Sumas',
        s.productType || '',
        s.batchId || '',
        s.latestTagId || '',
        s.latestTime || 'Baru saja',
        s.isB2B ? 1 : 0,
        s.status || 'valid',
        s.anomalyReason || null,
        s.deviceInfo || 'Mobile Web Scanner',
        new Date().toISOString()
      ).run();
      return jsonResponse({ success: true, id: newId });
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
        await db.prepare(`
          UPDATE batches 
          SET sku = ?, brand = ?, specs = ?, status = ?, redirectUrl = ?, qrType = ?, requirePin = ?, enableGps = ?
          WHERE id = ?
        `).bind(
          body.sku,
          body.brand,
          body.specs,
          body.status,
          body.redirectUrl || 'https://cek.sumas.id/',
          body.qrType || 'dynamic',
          body.requirePin ? 1 : 0,
          body.enableGps ? 1 : 0,
          id
        ).run();
        return jsonResponse({ success: true, id });
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
        await db.prepare(`
          UPDATE brands SET name = ?, owner = ?, description = ?, status = ?, logo = ? WHERE id = ?
        `).bind(b.name, b.owner || '', b.description || '', b.status || 'Aktif', b.logo || '', id).run();
        return jsonResponse({ success: true, id });
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
        await db.prepare(`
          UPDATE products SET name = ?, brand = ?, category = ?, description = ?, skuCode = ?, image = ? WHERE id = ?
        `).bind(p.name, p.brand, p.category || '', p.description || '', p.skuCode || '', p.image || '', id).run();
        return jsonResponse({ success: true, id });
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
        await db.prepare(`
          UPDATE users SET name = ?, username = ?, email = ?, phone = ?, role = ?, status = ? WHERE id = ?
        `).bind(u.name, u.username || u.email, u.email, u.phone || '', u.role || 'Staff', u.status || 'Aktif', id).run();
        return jsonResponse({ success: true, id });
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

    return jsonResponse({ error: 'Endpoint tidak ditemukan', path: pathname }, 404);
  } catch (error: any) {
    return jsonResponse({ error: error?.message || String(error) }, 500);
  }
};
