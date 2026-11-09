// ==============================================================
// CLOUDFLARE PAGES FUNCTIONS: QR CODE DYNAMIC RESOLVER
// Route: /q/:tagNumber
// ==============================================================

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { params, env } = context;
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
          <title>Tag Tidak Terdaftar - Sumas Authenticity</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 32px 24px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
            h2 { color: #f43f5e; margin: 0 0 12px; font-size: 20px; }
            p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
            .badge { display: inline-block; padding: 6px 14px; border-radius: 999px; background: rgba(244, 63, 94, 0.15); color: #fb7185; font-family: monospace; font-size: 13px; font-weight: bold; border: 1px solid rgba(244, 63, 94, 0.3); }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Tag Tidak Terdaftar</h2>
            <p>Nomor tag fisik berikut tidak terdata pada sistem keamanan Sumas:</p>
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

  // Update tag scan / points telemetry in background
  try {
    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    await env.DB.prepare(`
      INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, latestTime, isB2B, status, deviceInfo, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, 'valid', 'Mobile Web Scanner', ?)
    `).bind(
      `scan-${Date.now()}`,
      'Jakarta',
      'DKI Jakarta',
      'Lokasi Konsumen',
      -6.2088,
      106.8456,
      batch?.brand || 'Sumas',
      batch?.sku || 'Produk',
      batch?.id || '',
      tag.tagNumber,
      nowStr,
      batch?.isB2B ? 1 : 0,
      new Date().toISOString()
    ).run();
  } catch (_) {}

  // Redirect to target URL
  return Response.redirect(targetUrl, 302);
};
