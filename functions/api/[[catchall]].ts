// ==============================================================
// CLOUDFLARE PAGES FUNCTIONS: SUMAS UNIFIED API ROUTER
// Powered by Cloudflare D1 Serverless SQLite Database + RBAC + Sessions
// ==============================================================

import crypto from 'node:crypto';
import {
  getPermissionsForRole,
  hasPermission,
  normalizeRole,
  type PermissionKey,
} from '../../src/utils/rbac.ts';
import {
  normalizeUsernameInput,
  validateUsernameFormat,
} from '../../src/utils/username.ts';
import {
  aggregateScanActivityFromPoints,
  DEFAULT_SYSTEM_SETTINGS,
  evaluateScanAgainstPolicy,
  mergeSystemSettings,
  type NotificationConfig,
  type ScanHistoryRecord,
} from '../../src/utils/securityPolicy.ts';
import {
  assertD1BrandAccess,
  buildSessionCookieFlags,
  canScopeAccessBrand,
  canUserAccessNotificationRow,
  corsOptions,
  createD1Notification,
  createD1UserSession,
  EMAIL_REGEX,
  escapeHtml,
  escapeLikePattern,
  extractSessionToken,
  formatNotificationRowForClient,
  generateTagsForBatchD1,
  getCfGeoIp,
  getD1RbacMatrix,
  getD1UserBrandScope,
  getNotificationActorLabel,
  getOrCreateD1SessionSecret,
  hashPassword,
  insertBatchTagsD1,
  isBrandB2BD1,
  jsonResponse,
  loadActiveSettingsD1,
  performDummyPasswordWork,
  resolveD1SessionUser,
  revokeAllD1UserSessions,
  revokeD1SessionByToken,
  sanitizeStringInput,
  saveD1RbacMatrix,
  sendEdgeAlertChannel,
  updateD1NotificationByEntity,
  validateHttpUrl,
  validatePublicWebhookUrl,
  validateSafeImageSource,
  verifyPassword,
  type EdgeEnv,
} from '../../src/utils/edgeHelpers.ts';

export const onRequest: PagesFunction<EdgeEnv> = async (context) => {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  if (method === 'OPTIONS') {
    return corsOptions(request);
  }

  const db = env.DB;
  if (!db) {
    return jsonResponse({ error: 'Database D1 belum terhubung di Cloudflare Pages binding (DB).' }, 500);
  }

  try {
    const sessionSecret = await getOrCreateD1SessionSecret(db, env);
    const rbacMatrix = await getD1RbacMatrix(db);

    // -------------------------------------------------------------
    // 1. PUBLIC ENDPOINTS (Auth, Scan Recording & Password Reset Request)
    // -------------------------------------------------------------
    if (pathname === '/api/auth/me' && method === 'GET') {
      const user = await resolveD1SessionUser(db, sessionSecret, request);
      if (!user) {
        return jsonResponse({ authenticated: false, user: null, permissions: [] });
      }
      return jsonResponse({
        authenticated: true,
        user,
        permissions: getPermissionsForRole(user.role, rbacMatrix),
        matrix: rbacMatrix,
      });
    }

    if (pathname === '/api/auth/demo-accounts' && method === 'GET') {
      try {
        const rows = (
          await db
            .prepare(
              `SELECT u.id, u.name, u.email, u.role,
                (SELECT GROUP_CONCAT(b.name, ', ') FROM brands b WHERE b.ownerId = u.id) as managedBrandNames
               FROM users u
               WHERE u.status = 'Aktif'
               ORDER BY CASE WHEN u.role = 'Super Admin' THEN 1 ELSE 2 END, u.id ASC
               LIMIT 3`
            )
            .all()
        ).results as any[];

        return jsonResponse(
          rows.map((u) => ({
            name: u.name,
            email: u.email,
            role:
              u.role === 'Super Admin'
                ? 'Super Admin'
                : `Admin Brand ${u.managedBrandNames ? `· (${u.managedBrandNames})` : ''}`,
          }))
        );
      } catch {
        return jsonResponse([]);
      }
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as any;
      const cleanId = sanitizeStringInput(body.identifier || body.email, 160).toLowerCase();
      const usernameLookup = cleanId.startsWith('@') ? cleanId.slice(1) : cleanId;
      const rawPassword = typeof body.password === 'string' ? body.password : '';
      const rememberMe = Boolean(body.rememberMe);

      if (!cleanId || !rawPassword) {
        return jsonResponse({ success: false, error: 'Email/username dan kata sandi wajib diisi.' }, 400);
      }

      const userRow = await db
        .prepare("SELECT * FROM users WHERE LOWER(email) = ? OR (username IS NOT NULL AND username != '' AND LOWER(username) = ?) LIMIT 1")
        .bind(cleanId, usernameLookup)
        .first<any>();

      if (!userRow) {
        performDummyPasswordWork(rawPassword);
        return jsonResponse({ success: false, error: 'Email/username atau kata sandi tidak valid.' }, 401);
      }

      if ((userRow.status || 'Aktif') === 'Nonaktif') {
        performDummyPasswordWork(rawPassword);
        return jsonResponse(
          { success: false, error: 'Akun Anda sedang dinonaktifkan. Hubungi Super Admin untuk mengaktifkan kembali.' },
          403
        );
      }

      if (!verifyPassword(rawPassword, userRow.password || '')) {
        return jsonResponse({ success: false, error: 'Email/username atau kata sandi tidak valid.' }, 401);
      }

      const maxAgeSeconds = rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60;
      const rawToken = await createD1UserSession(db, sessionSecret, userRow.id, maxAgeSeconds, request);
      const { password: _pwd, ...safeUser } = userRow;
      const normalizedUser = { ...safeUser, role: normalizeRole(safeUser.role) };

      return jsonResponse(
        {
          success: true,
          user: normalizedUser,
          permissions: getPermissionsForRole(normalizedUser.role, rbacMatrix),
          matrix: rbacMatrix,
          sessionToken: rawToken,
        },
        200,
        {
          'Set-Cookie': `sumas_session=${encodeURIComponent(rawToken)}; ${buildSessionCookieFlags(request, maxAgeSeconds)}`,
        }
      );
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      const rawToken = extractSessionToken(request);
      await revokeD1SessionByToken(db, sessionSecret, rawToken);
      return jsonResponse(
        { success: true },
        200,
        { 'Set-Cookie': `sumas_session=; ${buildSessionCookieFlags(request, 0)}` }
      );
    }

    if (pathname === '/api/password-resets' && method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as any;
      const lookupKey = sanitizeStringInput(body.identifier || body.userEmail || '', 160).toLowerCase();
      const usernameLookup = lookupKey.startsWith('@') ? lookupKey.slice(1) : lookupKey;
      if (!lookupKey) {
        return jsonResponse({ success: false, error: 'Masukkan alamat email atau username akun Anda.' }, 400);
      }

      const matchedUser = await db
        .prepare("SELECT id, name, email, role, avatar, status FROM users WHERE LOWER(email) = ? OR (username IS NOT NULL AND username != '' AND LOWER(username) = ?) LIMIT 1")
        .bind(lookupKey, usernameLookup)
        .first<any>();

      const genericSuccessMessage =
        'Permohonan reset kata sandi telah diterima dan akan segera diproses oleh administrator.';

      if (!matchedUser || (matchedUser.status || 'Aktif') === 'Nonaktif') {
        return jsonResponse({ success: true, message: genericSuccessMessage });
      }

      const nowTs = Date.now();
      const newId = `pr-${nowTs}-${crypto.randomBytes(2).toString('hex')}`;
      const requestedAt = new Date(nowTs).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      const sanitizedReason =
        sanitizeStringInput(body.reason, 300) || 'Permohonan lupa kata sandi melalui halaman login';

      await db
        .prepare(
          `INSERT INTO password_reset_requests (id, userId, requestedAt, status, actionNote, createdAtTs)
           VALUES (?, ?, ?, 'Menunggu', ?, ?)`
        )
        .bind(
          newId,
          matchedUser.id,
          requestedAt,
          sanitizedReason,
          nowTs
        )
        .run();

      await createD1Notification(db, {
        id: `notif-reset-${newId}`,
        type: 'password_reset',
        severity: 'warning',
        audience: 'super_admin',
        title: `Permintaan Reset Password: ${matchedUser.name}`,
        subtitle: `${matchedUser.email} · ${normalizeRole(matchedUser.role)}`,
        description: sanitizedReason,
        entityType: 'password_reset',
        entityId: newId,
        status: 'Menunggu',
        createdAtTs: nowTs,
        metadata: {
          user: {
            id: matchedUser.id,
            name: matchedUser.name,
            email: matchedUser.email,
            role: normalizeRole(matchedUser.role),
            avatar: matchedUser.avatar || null,
          },
        },
      });

      return jsonResponse({ success: true, requestedAt, message: genericSuccessMessage });
    }

    const verifyMatch = pathname.match(/^\/api\/q\/([^/]+)\/verify$/);
    if ((pathname === '/api/scans/record' || verifyMatch) && method === 'POST') {
      const s = (await request.json().catch(() => ({}))) as any;
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

      const settings = await loadActiveSettingsD1(db);
      const geoIp = getCfGeoIp(request);
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
      const gpsGranted = typeof s.gpsGranted === 'boolean' ? s.gpsGranted : Number.isFinite(latVal) && Number.isFinite(lngVal);

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
        return jsonResponse(
          { success: false, blocked: true, code: evaluation.blockCode, message: evaluation.blockMessage, error: evaluation.blockMessage },
          403
        );
      }

      const finalStatus = batchRecord?.status === 'Disuspend' ? 'suspicious' : evaluation.status;
      const updatedHistory = evaluation.withinCooldown
        ? existingHistory
        : [evaluation.historyEntry, ...existingHistory].slice(0, 50);

      let scanId: string;
      const scanBrand = s.brand || batchRecord?.brand || 'Umum';
      const scanProduct = s.productType || batchRecord?.sku || scanBrand;

      if (existingRow) {
        scanId = existingRow.id;
        await db
          .prepare(
            `UPDATE scan_points
             SET city = ?, province = ?, venue = ?, lat = ?, lng = ?,
                 totalScans = ?, todayScans = ?, latestTime = ?,
                 status = ?, anomalyReason = ?, deviceInfo = ?, scanHistory = ?
             WHERE id = ?`
          )
          .bind(
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
          )
          .run();
      } else {
        scanId = s.id || `scan-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
        await db
          .prepare(
            `INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            scanId,
            evaluation.city,
            evaluation.province,
            evaluation.venue,
            evaluation.lat,
            evaluation.lng,
            evaluation.newTotalScans,
            evaluation.newTodayScans,
            scanBrand,
            scanProduct,
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
          )
          .run();
      }

      const isAnomalyScan = finalStatus === 'suspicious' || evaluation.impossibleTravelDetected;
      await createD1Notification(db, {
        type: 'scan',
        severity: isAnomalyScan ? 'critical' : finalStatus === 'repeated' ? 'warning' : 'info',
        audience: 'brand_scope',
        brandName: scanBrand,
        title: isAnomalyScan
          ? `Anomali Scan Terdeteksi (${scanProduct})`
          : finalStatus === 'repeated'
            ? `Scan Berulang (${scanProduct})`
            : `Aktivitas Scan Valid (${scanProduct})`,
        subtitle: `${evaluation.venue ? `${evaluation.venue} · ` : ''}${evaluation.city}, ${evaluation.province}`,
        description: isAnomalyScan
          ? `Tag ${tagLookup || '-'} (${scanBrand}) terindikasi mencurigakan · ${evaluation.newTotalScans}x total scan`
          : `Tag ${tagLookup || '-'} (${scanBrand}) dipindai · ${evaluation.newTodayScans}x hari ini`,
        entityType: 'scan',
        entityId: scanId,
        status: finalStatus,
        dedupeKey: `scan:${scanId}:${finalStatus}:${evaluation.newTotalScans}`,
        dedupeWindowMs: 20_000,
        metadata: {
          brand: scanBrand,
          city: evaluation.city,
          province: evaluation.province,
          totalScans: evaluation.newTotalScans,
          todayScans: evaluation.newTodayScans,
        },
      });

      const rawTarget = (batchRecord?.redirectUrl && batchRecord.redirectUrl.trim()) ? batchRecord.redirectUrl.trim() : 'https://cek.sumas.id/';
      const targetUrl = /^https?:\/\//i.test(rawTarget) ? rawTarget : 'https://cek.sumas.id/';
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
    // 2. AUTHENTICATION & CENTRALIZED RBAC GUARD
    // -------------------------------------------------------------
    const authUser = await resolveD1SessionUser(db, sessionSecret, request);
    if (!authUser) {
      return jsonResponse({ error: 'Sesi login tidak valid atau telah berakhir. Silakan masuk terlebih dahulu.' }, 401);
    }

    const can = (perm: PermissionKey) => hasPermission(authUser.role, perm, rbacMatrix);
    const canAny = (...perms: PermissionKey[]) => perms.some((p) => can(p));
    const deny = (msg?: string) =>
      jsonResponse(
        { error: msg || `Akses ditolak. Peran "${authUser.role}" tidak memiliki izin untuk melakukan tindakan ini.` },
        403
      );

    const scope = await getD1UserBrandScope(db, authUser, rbacMatrix);
    const actorLabel = getNotificationActorLabel(authUser);

    // Check username format & availability
    if (pathname === '/api/auth/check-username' && method === 'GET') {
      const rawUsername = url.searchParams.get('username') || '';
      const format = validateUsernameFormat(rawUsername);
      if (!format.valid) {
        return jsonResponse({
          valid: false,
          available: false,
          normalized: format.normalized,
          reason: format.error,
          checks: format.checks,
        });
      }

      const requestedExcludeId = sanitizeStringInput(url.searchParams.get('excludeUserId') || '', 80);
      const isSuperAdmin = normalizeRole(authUser.role) === 'Super Admin';
      const effectiveExcludeId = isSuperAdmin || can('users.manage') ? requestedExcludeId : authUser.id;

      const dup = effectiveExcludeId
        ? await db
            .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1')
            .bind(format.normalized, effectiveExcludeId)
            .first()
        : await db
            .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1')
            .bind(format.normalized)
            .first();

      return jsonResponse({
        valid: true,
        available: !dup,
        normalized: format.normalized,
        reason: dup ? 'Username tersebut sudah digunakan oleh akun lain.' : null,
        checks: format.checks,
      });
    }

    // Self-service profile update
    if (pathname === '/api/auth/profile' && method === 'PUT') {
      const body = (await request.json().catch(() => ({}))) as any;
      const existingRow = await db.prepare('SELECT * FROM users WHERE id = ?').bind(authUser.id).first<any>();
      if (!existingRow) {
        return jsonResponse({ success: false, error: 'Akun pengguna tidak ditemukan.' }, 404);
      }

      const cleanName = body.name !== undefined ? sanitizeStringInput(body.name, 120) : existingRow.name;
      if (!cleanName) {
        return jsonResponse({ success: false, error: 'Nama lengkap wajib diisi.' }, 400);
      }

      let cleanUsername: string | null = existingRow.username ? normalizeUsernameInput(existingRow.username) : null;
      if (body.username !== undefined) {
        const usernameCheck = validateUsernameFormat(sanitizeStringInput(body.username, 80));
        if (!usernameCheck.valid) {
          return jsonResponse(
            { success: false, error: usernameCheck.error || 'Format username tidak valid.' },
            400
          );
        }
        cleanUsername = usernameCheck.normalized;
      }

      const cleanEmail = body.email !== undefined ? sanitizeStringInput(body.email, 160).toLowerCase() : existingRow.email;
      if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
        return jsonResponse({ success: false, error: 'Format alamat email tidak valid.' }, 400);
      }

      const cleanPhone = body.phone !== undefined ? sanitizeStringInput(body.phone, 40) : existingRow.phone;
      const rawNewPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
      const rawCurrentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';

      const dupEmail = await db
        .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1')
        .bind(cleanEmail, authUser.id)
        .first();
      if (dupEmail) {
        return jsonResponse({ success: false, error: 'Alamat email sudah digunakan oleh akun lain.' }, 409);
      }

      if (cleanUsername) {
        const dupUser = await db
          .prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1')
          .bind(cleanUsername, authUser.id)
          .first();
        if (dupUser) {
          return jsonResponse({ success: false, error: 'Username tersebut sudah digunakan akun lain.' }, 409);
        }
      }

      let nextAvatar = existingRow.avatar;
      if (body.avatar !== undefined) {
        const avatarCheck = validateSafeImageSource(body.avatar);
        if (!avatarCheck.valid) {
          return jsonResponse({ success: false, error: avatarCheck.error || 'Format foto profil tidak valid.' }, 400);
        }
        nextAvatar = avatarCheck.value;
      }

      let nextPasswordHash = existingRow.password;
      if (rawNewPassword.trim().length > 0) {
        if (rawNewPassword.trim().length < 6) {
          return jsonResponse({ success: false, error: 'Kata sandi baru minimal harus 6 karakter.' }, 400);
        }
        if (!rawCurrentPassword) {
          return jsonResponse({ success: false, error: 'Masukkan kata sandi saat ini untuk mengubah kata sandi.' }, 400);
        }
        if (!verifyPassword(rawCurrentPassword, existingRow.password || '')) {
          return jsonResponse({ success: false, error: 'Kata sandi saat ini tidak sesuai.' }, 400);
        }
        nextPasswordHash = hashPassword(rawNewPassword.trim());
      }

      await db
        .prepare('UPDATE users SET name = ?, username = ?, email = ?, phone = ?, avatar = ?, password = ? WHERE id = ?')
        .bind(cleanName, cleanUsername, cleanEmail, cleanPhone || null, nextAvatar, nextPasswordHash, authUser.id)
        .run();

      if (rawNewPassword.trim().length > 0) {
        const currentRawToken = extractSessionToken(request);
        const currentTokenHash = currentRawToken ? crypto.createHmac('sha256', sessionSecret).update(currentRawToken).digest('hex') : '';
        if (currentTokenHash) {
          await db.prepare('DELETE FROM user_sessions WHERE userId = ? AND tokenHash != ?').bind(authUser.id, currentTokenHash).run();
        } else {
          await revokeAllD1UserSessions(db, authUser.id);
        }
      }

      const updated = await db
        .prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?')
        .bind(authUser.id)
        .first<any>();

      return jsonResponse({
        success: true,
        user: { ...updated, role: normalizeRole(updated.role) },
        passwordUpdated: rawNewPassword.trim().length > 0,
      });
    }

    // RBAC Matrix
    if (pathname === '/api/rbac/permissions') {
      if (method === 'GET') {
        return jsonResponse({
          matrix: rbacMatrix,
          permissions: getPermissionsForRole(authUser.role, rbacMatrix),
        });
      }
      if (method === 'PUT') {
        if (normalizeRole(authUser.role) !== 'Super Admin') {
          return deny('Hanya Super Admin yang berwenang mengubah matriks hak akses (RBAC).');
        }
        const body = (await request.json().catch(() => ({}))) as any;
        if (!body?.matrix || typeof body.matrix !== 'object') {
          return jsonResponse({ success: false, error: 'Payload matriks hak akses tidak valid.' }, 400);
        }
        const saved = await saveD1RbacMatrix(db, body.matrix);
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
        try {
          await db
            .prepare('INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(
              Date.now(),
              'RBAC-POLICY',
              nowStr,
              authUser.name,
              'Pembaruan Matriks Hak Akses (RBAC)',
              JSON.stringify([
                { field: 'Super Admin', old: '-', new: `${saved['Super Admin'].length} izin aktif (Terkunci)` },
                { field: 'Admin Brand', old: '-', new: `${saved['Admin Brand'].length} izin aktif` },
              ])
            )
            .run();
        } catch (_) {}

        await createD1Notification(db, {
          type: 'system',
          severity: 'warning',
          audience: 'super_admin',
          title: 'Matriks Hak Akses (RBAC) Diperbarui',
          subtitle: `Diperbarui oleh ${actorLabel}`,
          description: `Izin aktif Admin Brand kini berjumlah ${saved['Admin Brand'].length} hak akses.`,
          entityType: 'rbac',
          entityId: 'RBAC-POLICY',
          status: 'edited',
          metadata: { actor: actorLabel, adminBrandPermissionsCount: saved['Admin Brand'].length },
        });
        return jsonResponse({ success: true, matrix: saved });
      }
    }

    // -------------------------------------------------------------
    // 3. DASHBOARD & SCAN TELEMETRY
    // -------------------------------------------------------------
    if (pathname === '/api/dashboard/stats' && method === 'GET') {
      if (!canAny('dashboard.view', 'scans.view')) return deny();

      const allBatches = (await db.prepare('SELECT * FROM batches ORDER BY rowid DESC').all()).results as any[];
      const scopedBatches = scope.isGlobal ? allBatches : allBatches.filter((b) => canScopeAccessBrand(scope, b.brand));

      const allProducts = (await db.prepare('SELECT id, brandId, brandName FROM products').all()).results as any[];
      const scopedProducts = scope.isGlobal ? allProducts : allProducts.filter((p) => canScopeAccessBrand(scope, p.brandName, p.brandId));

      const allBrands = (await db.prepare('SELECT id, name, status FROM brands').all()).results as any[];
      const scopedBrands = scope.isGlobal ? allBrands : allBrands.filter((br) => canScopeAccessBrand(scope, br.name, br.id));

      const allScans = (await db.prepare('SELECT city, brand, totalScans, todayScans, status FROM scan_points').all()).results as any[];
      const scopedScans = scope.isGlobal ? allScans : allScans.filter((s) => canScopeAccessBrand(scope, s.brand));

      const scopedBatchCodeSet = new Set(scopedBatches.map((b) => b.batchId));
      const allLogs = (await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all()).results as any[];
      const scopedLogs = scope.isGlobal ? allLogs : allLogs.filter((l) => scopedBatchCodeSet.has(l.batchId));

      const brandStatsMap = new Map<string, { brand: string; batchCount: number; totalQty: number }>();
      for (const b of scopedBatches) {
        const key = b.brand || 'Lainnya';
        const entry = brandStatsMap.get(key) || { brand: key, batchCount: 0, totalQty: 0 };
        entry.batchCount += 1;
        entry.totalQty += Number(b.qty) || 0;
        brandStatsMap.set(key, entry);
      }

      const recentLogs = scopedLogs.slice(0, 5).map((r) => {
        let changes = [];
        try { changes = JSON.parse(r.changes); } catch (_) {}
        return { ...r, changes };
      });
      const recentBatches = scopedBatches.slice(0, 5).map((row) => ({
        ...row,
        isB2B: Boolean(row.isB2B),
        tags: null,
      }));

      return jsonResponse({
        totalBatches: scopedBatches.length,
        activeBatches: scopedBatches.filter((b) => b.status !== 'Disuspend').length,
        suspendedBatches: scopedBatches.filter((b) => b.status === 'Disuspend').length,
        totalTags: scopedBatches.reduce((sum, b) => sum + (Number(b.qty) || 0), 0),
        b2bBatches: scopedBatches.filter((b) => Boolean(b.isB2B)).length,
        retailBatches: scopedBatches.filter((b) => !Boolean(b.isB2B)).length,
        totalLogs: scopedLogs.length,
        totalProducts: scopedProducts.length,
        totalBrands: scopedBrands.length,
        activeBrands: scopedBrands.filter((br) => br.status === 'Aktif').length,
        totalScans: scopedScans.reduce((sum, s) => sum + (Number(s.totalScans) || 0), 0),
        todayScans: scopedScans.reduce((sum, s) => sum + (Number(s.todayScans) || 0), 0),
        distinctCities: new Set(scopedScans.map((s) => s.city).filter(Boolean)).size,
        totalScanPoints: scopedScans.length,
        validScans: scopedScans.filter((s) => s.status === 'valid').length,
        brandStats: Array.from(brandStatsMap.values()),
        recentLogs,
        recentBatches,
        timestamp: new Date().toISOString(),
      });
    }

    if (pathname === '/api/scans/locations' && method === 'GET') {
      if (!canAny('dashboard.view', 'scans.view')) return deny();
      const rows = (await db.prepare('SELECT * FROM scan_points ORDER BY id ASC').all()).results as any[];
      const scoped = scope.isGlobal ? rows : rows.filter((r) => canScopeAccessBrand(scope, r.brand));
      return jsonResponse(
        scoped.map((r) => {
          let history = [];
          if (r.scanHistory) {
            try { history = typeof r.scanHistory === 'string' ? JSON.parse(r.scanHistory) : r.scanHistory; } catch (_) {}
          }
          return { ...r, isB2B: Boolean(r.isB2B), scanHistory: history };
        })
      );
    }

    if (pathname === '/api/scans/stats' && method === 'GET') {
      if (!canAny('dashboard.view', 'scans.view')) return deny();
      const allRows = (await db.prepare('SELECT brand, status, totalScans, todayScans FROM scan_points').all()).results as any[];
      const scoped = scope.isGlobal ? allRows : allRows.filter((r) => canScopeAccessBrand(scope, r.brand));
      return jsonResponse({
        totalLocations: scoped.length,
        totalScans: scoped.reduce((sum, r) => sum + (Number(r.totalScans) || 0), 0),
        todayScans: scoped.reduce((sum, r) => sum + (Number(r.todayScans) || 0), 0),
        valid: scoped.filter((r) => r.status === 'valid').length,
        repeated: scoped.filter((r) => r.status === 'repeated').length,
        suspicious: scoped.filter((r) => r.status === 'suspicious').length,
      });
    }

    if (pathname === '/api/scans/activity' && method === 'GET') {
      if (!canAny('dashboard.view', 'scans.view')) return deny();
      const range = sanitizeStringInput(url.searchParams.get('range') || '7d', 10);
      const requestedBrand = sanitizeStringInput(url.searchParams.get('brand') || '', 120);
      if (!scope.isGlobal && requestedBrand && !canScopeAccessBrand(scope, requestedBrand)) {
        return jsonResponse({ error: 'Akses ditolak untuk data aktivitas brand lain.' }, 403);
      }
      const rows = (await db.prepare('SELECT id, brand, totalScans, todayScans, status, latestTime, createdAt, scanHistory FROM scan_points').all()).results as any[];
      const scopedRows = scope.isGlobal ? rows : rows.filter((r) => canScopeAccessBrand(scope, r.brand));
      return jsonResponse(aggregateScanActivityFromPoints(scopedRows, range, requestedBrand));
    }

    // -------------------------------------------------------------
    // 4. BATCHES & TAGS
    // -------------------------------------------------------------
    if (pathname === '/api/batches' && method === 'GET') {
      if (!canAny('batches.view', 'dashboard.view')) return deny();
      const query = `
        SELECT 
          b.id, b.batchId, b.date, b.project, b.sku, b.brand, b.qty, b.specs, b.pinLength,
          b.status, b.isB2B, b.redirectUrl, b.qrType, b.requirePin, b.enableGps,
          COALESCE(tc.totalCount, b.qty) as actualTagCount,
          COALESCE(tc.availableCount, b.qty) as availableCount,
          COALESCE(tc.usedCount, 0) as usedCount
        FROM batches b
        LEFT JOIN (
          SELECT batchId, COUNT(*) as totalCount,
            SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as availableCount,
            SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as usedCount
          FROM tags GROUP BY batchId
        ) tc ON tc.batchId = b.id
        ORDER BY b.rowid DESC
      `;
      const rows = (await db.prepare(query).all()).results as any[];
      const scoped = scope.isGlobal ? rows : rows.filter((row) => canScopeAccessBrand(scope, row.brand));
      return jsonResponse(
        scoped.map((row) => ({
          ...row,
          isB2B: Boolean(row.isB2B),
          redirectUrl: row.redirectUrl || 'https://cek.sumas.id/',
          qrType: row.qrType || 'dynamic',
          requirePin: row.requirePin === null || row.requirePin === undefined ? true : Boolean(row.requirePin),
          enableGps: row.enableGps === null || row.enableGps === undefined ? true : Boolean(row.enableGps),
          tags: null,
        }))
      );
    }

    if (pathname === '/api/batches' && method === 'POST') {
      if (!can('batches.create')) return deny();
      const b = (await request.json().catch(() => ({}))) as any;
      const batchBrand = sanitizeStringInput(b.brand, 120);
      const batchSku = sanitizeStringInput(b.sku, 200);
      const batchCode = sanitizeStringInput(b.batchId, 120);
      const batchPk = sanitizeStringInput(b.id, 120) || `batch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

      if (!batchBrand || !batchSku || !batchCode) {
        return jsonResponse({ error: 'ID Batch, Brand, dan SKU wajib diisi.' }, 400);
      }
      const denied = assertD1BrandAccess(scope, batchBrand);
      if (denied) return denied;

      const rawQty = parseInt(String(b.qty), 10);
      if (!Number.isFinite(rawQty) || rawQty < 1 || rawQty > 25000) {
        return jsonResponse({ error: 'Jumlah tag per batch harus antara 1 hingga 25.000 tag.' }, 400);
      }
      const pinLength = Math.min(12, Math.max(4, parseInt(String(b.pinLength), 10) || 8));
      const isB2B = b.isB2B ? 1 : 0;

      const urlCheck = validateHttpUrl(b.redirectUrl, { allowEmpty: true, defaultUrl: 'https://cek.sumas.id/' });
      if (!urlCheck.valid) {
        return jsonResponse({ error: urlCheck.error || 'URL pengalihan QR tidak valid.' }, 400);
      }
      const redirectUrl = urlCheck.url || 'https://cek.sumas.id/';
      const qrType = b.qrType === 'static' ? 'static' : 'dynamic';
      const requirePin = b.requirePin === false || b.requirePin === 0 ? 0 : 1;
      const enableGps = b.enableGps === false || b.enableGps === 0 ? 0 : 1;
      const safeStatus = b.status === 'Disuspend' ? 'Disuspend' : 'Aktif';
      const safeDate = sanitizeStringInput(b.date, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const safeSpecs = sanitizeStringInput(b.specs, 500) || '-';
      const safeProject = b.project ? sanitizeStringInput(b.project, 200) : null;

      await db
        .prepare(
          `INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(batchPk, batchCode, safeDate, safeProject, batchSku, batchBrand, rawQty, safeSpecs, pinLength, safeStatus, isB2B, redirectUrl, qrType, requirePin, enableGps)
        .run();

      const generatedTags = generateTagsForBatchD1(batchPk, batchBrand, rawQty, pinLength, 0, '');
      await insertBatchTagsD1(db, generatedTags);

      return jsonResponse({
        ...b,
        id: batchPk,
        batchId: batchCode,
        date: safeDate,
        project: safeProject,
        sku: batchSku,
        brand: batchBrand,
        specs: safeSpecs,
        status: safeStatus,
        qty: rawQty,
        pinLength,
        isB2B: Boolean(isB2B),
        redirectUrl,
        qrType,
        requirePin: Boolean(requirePin),
        enableGps: Boolean(enableGps),
        actualTagCount: rawQty,
        availableCount: rawQty,
        usedCount: 0,
      });
    }

    const batchTagsMatch = pathname.match(/^\/api\/batches\/([^/]+)\/tags$/);
    if (batchTagsMatch && method === 'GET') {
      if (!canAny('batches.view', 'dashboard.view')) return deny();
      const id = decodeURIComponent(batchTagsMatch[1]);
      const batchRecord = await db.prepare('SELECT id, batchId, brand FROM batches WHERE id = ? OR batchId = ?').bind(id, id).first<any>();
      if (!batchRecord) return jsonResponse({ error: 'Batch tidak ditemukan.' }, 404);
      const denied = assertD1BrandAccess(scope, batchRecord.brand);
      if (denied) return denied;

      const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
      const limit = Math.min(500, Math.max(10, parseInt(url.searchParams.get('limit') || '96', 10)));
      const offset = (page - 1) * limit;
      const search = sanitizeStringInput(url.searchParams.get('search') || '', 120).toLowerCase();
      const status = sanitizeStringInput(url.searchParams.get('status') || 'all', 40) || 'all';
      const project = sanitizeStringInput(url.searchParams.get('project') || 'all', 120) || 'all';

      let countQuery = 'SELECT COUNT(*) as count FROM tags WHERE batchId = ?';
      let dataQuery = 'SELECT * FROM tags WHERE batchId = ?';
      const params: any[] = [batchRecord.id];

      if (search) {
        const escapedSearch = `%${escapeLikePattern(search)}%`;
        const searchClause = " AND (LOWER(pin) LIKE ? ESCAPE '\\' OR LOWER(tagNumber) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(project, '')) LIKE ? ESCAPE '\\')";
        countQuery += searchClause;
        dataQuery += searchClause;
        params.push(escapedSearch, escapedSearch, escapedSearch);
      }
      if (status !== 'all') {
        countQuery += ' AND status = ?';
        dataQuery += ' AND status = ?';
        params.push(status);
      }
      if (project !== 'all') {
        if (project === 'unallocated') {
          countQuery += ' AND (project IS NULL OR project = "")';
          dataQuery += ' AND (project IS NULL OR project = "")';
        } else {
          countQuery += ' AND project = ?';
          dataQuery += ' AND project = ?';
          params.push(project);
        }
      }

      dataQuery += ' ORDER BY rowid ASC LIMIT ? OFFSET ?';
      const totalRow = await db.prepare(countQuery).bind(...params).first<{ count: number }>();
      const totalCount = totalRow?.count || 0;
      const tags = (await db.prepare(dataQuery).bind(...params, limit, offset).all()).results;
      const batchSummary = await db
        .prepare(
          `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as available,
            SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as used
           FROM tags WHERE batchId = ?`
        )
        .bind(batchRecord.id)
        .first<{ total: number; available: number; used: number }>();

      return jsonResponse({
        tags,
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit) || 1,
        batchSummary: {
          total: batchSummary?.total || 0,
          available: batchSummary?.available || 0,
          used: batchSummary?.used || 0,
        },
      });
    }

    const batchAllTagsMatch = pathname.match(/^\/api\/batches\/([^/]+)\/all-tags$/);
    if (batchAllTagsMatch && method === 'GET') {
      if (!canAny('batches.view', 'dashboard.view')) return deny();
      const id = decodeURIComponent(batchAllTagsMatch[1]);
      const batch = await db.prepare('SELECT * FROM batches WHERE id = ? OR batchId = ?').bind(id, id).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, batch.brand);
      if (denied) return denied;
      const tags = (
        await db.prepare('SELECT id, batchId, tagNumber, pin, status, project, specs FROM tags WHERE batchId = ? ORDER BY rowid ASC').bind(batch.id).all()
      ).results;
      return jsonResponse({ batch, tags, total: tags.length });
    }

    const batchSummaryMatch = pathname.match(/^\/api\/batches\/([^/]+)\/summary$/);
    if (batchSummaryMatch && method === 'GET') {
      if (!canAny('batches.view', 'dashboard.view')) return deny();
      const id = decodeURIComponent(batchSummaryMatch[1]);
      const batch = await db.prepare('SELECT * FROM batches WHERE id = ? OR batchId = ?').bind(id, id).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, batch.brand);
      if (denied) return denied;

      const tagStats = await db
        .prepare(
          `SELECT COUNT(*) as total,
            SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as available,
            SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as used
           FROM tags WHERE batchId = ?`
        )
        .bind(batch.id)
        .first<{ total: number; available: number; used: number }>();

      const projectAllocations = (
        await db
          .prepare(
            `SELECT project as name, COUNT(*) as count, specs, warranty, codeType, prodCode, note, MAX(allocatedAt) as date
             FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'
             GROUP BY project`
          )
          .bind(batch.id)
          .all()
      ).results;

      const isB2B = await isBrandB2BD1(db, batch.brand, batch.isB2B);
      return jsonResponse({
        batch: { ...batch, isB2B },
        totalTags: tagStats?.total || batch.qty,
        availableCount: tagStats?.available || 0,
        usedCount: tagStats?.used || 0,
        projects: isB2B ? projectAllocations : [],
      });
    }

    const batchRedirectMatch = pathname.match(/^\/api\/batches\/([^/]+)\/redirect-url$/);
    if (batchRedirectMatch && method === 'PATCH') {
      if (!can('batches.redirect_url')) return deny();
      const id = decodeURIComponent(batchRedirectMatch[1]);
      const body = (await request.json().catch(() => ({}))) as any;
      const batch = await db.prepare('SELECT * FROM batches WHERE id = ?').bind(id).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, batch.brand);
      if (denied) return denied;

      if (batch.qrType === 'static') {
        return jsonResponse(
          { error: 'Batch dengan tipe QR Statis tidak mendukung perubahan URL karena alamat URL telah tertanam permanen pada stiker fisik.' },
          400
        );
      }

      let newUrl = batch.redirectUrl || 'https://cek.sumas.id/';
      if (body.redirectUrl !== undefined) {
        const urlCheck = validateHttpUrl(body.redirectUrl, { allowEmpty: false });
        if (!urlCheck.valid) {
          return jsonResponse({ error: urlCheck.error || 'URL pengalihan QR hanya boleh menggunakan http:// atau https://.' }, 400);
        }
        newUrl = urlCheck.url;
      }

      const newQrType = body.qrType === 'static' ? 'static' : body.qrType === 'dynamic' ? 'dynamic' : batch.qrType || 'dynamic';
      const newRequirePin = body.requirePin !== undefined ? (body.requirePin ? 1 : 0) : batch.requirePin ?? 1;
      const newEnableGps = body.enableGps !== undefined ? (body.enableGps ? 1 : 0) : batch.enableGps ?? 1;

      await db
        .prepare('UPDATE batches SET redirectUrl = ?, qrType = ?, requirePin = ?, enableGps = ? WHERE id = ?')
        .bind(newUrl, newQrType, newRequirePin, newEnableGps, id)
        .run();

      const timestamp = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      try {
        await db
          .prepare('INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(
            Date.now(),
            batch.batchId,
            timestamp,
            authUser.name,
            'Pembaruan URL Pengalihan QR Dinamis',
            JSON.stringify([
              { field: 'URL Pengalihan', old: batch.redirectUrl || '-', new: newUrl },
              { field: 'Tipe QR', old: batch.qrType || 'dynamic', new: newQrType },
            ])
          )
          .run();
      } catch (_) {}

      await createD1Notification(db, {
        type: 'edit',
        severity: 'info',
        audience: 'brand_scope',
        brandName: batch.brand,
        title: `Pengaturan QR Diperbarui: ${batch.batchId}`,
        subtitle: `Oleh ${actorLabel} · Brand ${batch.brand}`,
        description: `URL pengalihan QR diubah menjadi ${newUrl}`,
        entityType: 'batch',
        entityId: batch.batchId,
        status: 'edited',
        dedupeKey: `batch-url:${batch.batchId}:${newUrl}`,
        dedupeWindowMs: 10_000,
      });

      return jsonResponse({
        success: true,
        redirectUrl: newUrl,
        qrType: newQrType,
        requirePin: Boolean(newRequirePin),
        enableGps: Boolean(newEnableGps),
      });
    }

    const batchAllocateMatch = pathname.match(/^\/api\/batches\/([^/]+)\/allocate$/);
    if (batchAllocateMatch && method === 'POST') {
      if (!can('batches.allocate')) return deny();
      const id = decodeURIComponent(batchAllocateMatch[1]);
      const body = (await request.json().catch(() => ({}))) as any;
      const batch = await db.prepare('SELECT id, brand, isB2B FROM batches WHERE id = ?').bind(id).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, batch.brand);
      if (denied) return denied;

      if (!(await isBrandB2BD1(db, batch.brand, batch.isB2B))) {
        return jsonResponse({ error: `Batch milik brand "${batch.brand}" bertipe Retail dan tidak memiliki fitur alokasi proyek.` }, 403);
      }
      if (!Array.isArray(body.tagIds) || body.tagIds.length === 0 || body.tagIds.length > 10000) {
        return jsonResponse({ error: 'Jumlah tag yang dipilih harus antara 1 hingga 10.000 tag.' }, 400);
      }
      const cleanProject = sanitizeStringInput(body.project, 200);
      if (!cleanProject) return jsonResponse({ error: 'Nama proyek wajib diisi.' }, 400);

      const allocatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const cleanSpecs = sanitizeStringInput(body.specs, 300) || '-';
      const cleanCodeType = sanitizeStringInput(body.codeType, 120) || '-';
      const cleanWarranty = sanitizeStringInput(body.warranty, 120) || '-';
      const cleanProdCode = sanitizeStringInput(body.prodCode, 120) || '-';
      const cleanNote = sanitizeStringInput(body.note, 500) || '-';

      const stmt = db.prepare(
        `UPDATE tags SET status = 'Telah Digunakan', project = ?, specs = ?, codeType = ?, warranty = ?, prodCode = ?, note = ?, allocatedAt = ? WHERE id = ? AND batchId = ?`
      );
      const stmts = body.tagIds
        .filter((tid: any) => typeof tid === 'string' && tid)
        .map((tid: string) => stmt.bind(cleanProject, cleanSpecs, cleanCodeType, cleanWarranty, cleanProdCode, cleanNote, allocatedAt, tid, id));
      for (let i = 0; i < stmts.length; i += 80) {
        await db.batch(stmts.slice(i, i + 80));
      }

      const distinctRows = (
        await db.prepare("SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'").bind(id).all()
      ).results as { project: string }[];
      const distinctProjects = distinctRows.map((r) => r.project).join(', ');
      await db.prepare('UPDATE batches SET project = ? WHERE id = ?').bind(distinctProjects || null, id).run();

      return jsonResponse({ success: true, allocatedCount: stmts.length, project: cleanProject, allocatedAt });
    }

    const batchDeallocateMatch = pathname.match(/^\/api\/batches\/([^/]+)\/deallocate$/);
    if (batchDeallocateMatch && method === 'POST') {
      if (!can('batches.allocate')) return deny();
      const id = decodeURIComponent(batchDeallocateMatch[1]);
      const body = (await request.json().catch(() => ({}))) as any;
      const project = sanitizeStringInput(body?.project, 200);
      const batch = await db.prepare('SELECT id, brand, isB2B FROM batches WHERE id = ?').bind(id).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, batch.brand);
      if (denied) return denied;
      if (!(await isBrandB2BD1(db, batch.brand, batch.isB2B))) {
        return jsonResponse({ error: 'Operasi alokasi proyek hanya berlaku untuk brand/batch B2B.' }, 403);
      }

      await db
        .prepare("UPDATE tags SET status = 'Tersedia', project = NULL, specs = '-', codeType = '-', warranty = '-', prodCode = '-', note = '-', allocatedAt = NULL WHERE batchId = ? AND project = ?")
        .bind(id, project)
        .run();

      const distinctRows = (
        await db.prepare("SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'").bind(id).all()
      ).results as { project: string }[];
      await db.prepare('UPDATE batches SET project = ? WHERE id = ?').bind(distinctRows.map((r) => r.project).join(', ') || null, id).run();

      return jsonResponse({ success: true, deallocatedProject: project });
    }

    const batchProjectsMatch = pathname.match(/^\/api\/batches\/([^/]+)\/projects$/);
    if (batchProjectsMatch && method === 'PUT') {
      if (!can('batches.allocate')) return deny();
      const id = decodeURIComponent(batchProjectsMatch[1]);
      const batch = await db.prepare('SELECT id, brand, isB2B FROM batches WHERE id = ?').bind(id).first<any>();
      if (!batch) return jsonResponse({ error: 'Batch tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, batch.brand);
      if (denied) return denied;
      if (!(await isBrandB2BD1(db, batch.brand, batch.isB2B))) {
        return jsonResponse({ error: 'Pengeditan data proyek hanya berlaku untuk brand/batch B2B.' }, 403);
      }

      const b = (await request.json().catch(() => ({}))) as any;
      const trimmedOld = sanitizeStringInput(b.oldProjectName, 200);
      const trimmedNew = sanitizeStringInput(b.newProjectName, 200);
      if (!trimmedOld || !trimmedNew) {
        return jsonResponse({ error: 'Nama proyek lama dan baru wajib diisi' }, 400);
      }

      await db
        .prepare('UPDATE tags SET project = ?, specs = ?, codeType = ?, warranty = ?, prodCode = ?, note = ? WHERE batchId = ? AND project = ?')
        .bind(
          trimmedNew,
          sanitizeStringInput(b.specs, 300) || '-',
          sanitizeStringInput(b.codeType, 120) || '-',
          sanitizeStringInput(b.warranty, 120) || '-',
          sanitizeStringInput(b.prodCode, 120) || '-',
          sanitizeStringInput(b.note, 500) || '-',
          id,
          trimmedOld
        )
        .run();

      const distinctRows = (
        await db.prepare("SELECT DISTINCT project FROM tags WHERE batchId = ? AND project IS NOT NULL AND status = 'Telah Digunakan'").bind(id).all()
      ).results as { project: string }[];
      await db.prepare('UPDATE batches SET project = ? WHERE id = ?').bind(distinctRows.map((r) => r.project).join(', ') || null, id).run();

      return jsonResponse({ success: true });
    }

    const batchIdMatch = pathname.match(/^\/api\/batches\/([^/]+)$/);
    if (batchIdMatch) {
      const id = decodeURIComponent(batchIdMatch[1]);
      const existing = await db.prepare('SELECT * FROM batches WHERE id = ?').bind(id).first<any>();
      if (!existing) return jsonResponse({ error: 'Batch tidak ditemukan.' }, 404);
      const denied = assertD1BrandAccess(scope, existing.brand);
      if (denied) return denied;

      if (method === 'PUT') {
        const b = (await request.json().catch(() => ({}))) as any;
        const nextProject = b.project !== undefined ? (b.project === null ? null : sanitizeStringInput(b.project, 200)) : existing.project;
        const nextSpecs = b.specs !== undefined ? sanitizeStringInput(b.specs, 500) : existing.specs;
        const nextStatus = b.status !== undefined ? (b.status === 'Disuspend' ? 'Disuspend' : 'Aktif') : existing.status;

        const isModifyingDetails =
          (b.project !== undefined && nextProject !== existing.project) ||
          (b.specs !== undefined && nextSpecs !== existing.specs);
        const isModifyingStatus = b.status !== undefined && nextStatus !== existing.status;

        if (isModifyingDetails && !canAny('batches.allocate', 'batches.create')) {
          return deny('Akses ditolak. Anda tidak memiliki izin untuk mengubah detail batch.');
        }
        if (isModifyingStatus && !can('batches.suspend')) {
          return deny('Akses ditolak. Anda tidak memiliki izin untuk menangguhkan atau memulihkan batch.');
        }

        await db.prepare('UPDATE batches SET project = ?, specs = ?, status = ? WHERE id = ?').bind(nextProject, nextSpecs, nextStatus, id).run();
        const result = await db.prepare('SELECT * FROM batches WHERE id = ?').bind(id).first<any>();

        if (existing.status !== nextStatus) {
          const isSuspendedNow = nextStatus === 'Disuspend';
          await createD1Notification(db, {
            type: 'edit',
            severity: isSuspendedNow ? 'warning' : 'info',
            audience: 'brand_scope',
            brandName: existing.brand,
            title: isSuspendedNow ? `Batch Disuspend: ${existing.batchId}` : `Batch Dipulihkan: ${existing.batchId}`,
            subtitle: `Dilakukan oleh ${actorLabel} · Brand ${existing.brand}`,
            description: isSuspendedNow
              ? `Status batch ${existing.batchId} (${existing.sku}) diubah menjadi Disuspend.`
              : `Status batch ${existing.batchId} (${existing.sku}) telah diaktifkan kembali.`,
            entityType: 'batch',
            entityId: existing.batchId,
            status: 'edited',
            dedupeKey: `batch-status:${existing.batchId}:${nextStatus}`,
            dedupeWindowMs: 10_000,
          });
        }

        return jsonResponse({ ...result, isB2B: Boolean(result.isB2B), tags: null });
      }

      if (method === 'DELETE') {
        if (!can('batches.delete')) return deny();
        await db.batch([
          db.prepare('DELETE FROM batches WHERE id = ?').bind(id),
          db.prepare('DELETE FROM tags WHERE batchId = ?').bind(id),
          db.prepare('DELETE FROM audit_logs WHERE batchId = ?').bind(existing.batchId),
        ]);
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // 5. AUDIT LOGS
    // -------------------------------------------------------------
    if (pathname === '/api/audit-logs' && method === 'GET') {
      if (!canAny('batches.view', 'dashboard.view')) return deny();
      const rows = (await db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200').all()).results as any[];
      let filtered = rows;
      if (!scope.isGlobal) {
        const ownedBatches = (await db.prepare('SELECT batchId, brand FROM batches').all()).results as { batchId: string; brand: string }[];
        const allowed = new Set(ownedBatches.filter((b) => canScopeAccessBrand(scope, b.brand)).map((b) => b.batchId));
        filtered = rows.filter((r) => allowed.has(r.batchId));
      }
      return jsonResponse(
        filtered.map((r) => {
          let changes = [];
          try { changes = JSON.parse(r.changes); } catch (_) {}
          return { ...r, changes };
        })
      );
    }

    if (pathname === '/api/audit-logs' && method === 'POST') {
      if (!canAny('batches.create', 'batches.allocate', 'batches.suspend', 'batches.redirect_url', 'users.manage')) {
        return deny();
      }
      const log = (await request.json().catch(() => ({}))) as any;
      const batchIdStr = sanitizeStringInput(log.batchId, 120);
      if (!batchIdStr) return jsonResponse({ error: 'batchId audit log wajib diisi.' }, 400);

      const relatedBatch = await db.prepare('SELECT brand FROM batches WHERE batchId = ? OR id = ?').bind(batchIdStr, batchIdStr).first<{ brand: string }>();
      if (!scope.isGlobal) {
        if (!relatedBatch) {
          return jsonResponse({ error: 'Akses ditolak. Audit log hanya dapat dicatat untuk batch milik brand yang Anda kelola.' }, 403);
        }
        const denied = assertD1BrandAccess(scope, relatedBatch.brand);
        if (denied) return denied;
      }

      const safeId = Number.isSafeInteger(Number(log.id)) && Number(log.id) > 0 ? Number(log.id) : Date.now();
      const safeTimestamp = sanitizeStringInput(log.timestamp, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const safeReason = sanitizeStringInput(log.reason, 400) || 'Pembaruan data';
      const safeChanges = Array.isArray(log.changes) ? log.changes.slice(0, 50) : [];

      await db
        .prepare('INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(safeId, batchIdStr, safeTimestamp, authUser.name, safeReason, JSON.stringify(safeChanges))
        .run();

      const fieldSummary = safeChanges.map((c: any) => `${c.field}: "${c.old}" → "${c.new}"`).join(', ');
      await createD1Notification(db, {
        type: 'edit',
        severity: safeReason.toLowerCase().includes('suspend') ? 'warning' : 'info',
        audience: relatedBatch?.brand ? 'brand_scope' : 'super_admin',
        brandName: relatedBatch?.brand || null,
        title: `Pengeditan Data: ${batchIdStr}`,
        subtitle: `Dilakukan oleh ${actorLabel}${relatedBatch?.brand ? ` · ${relatedBatch.brand}` : ''}`,
        description: safeReason ? `${safeReason}${fieldSummary ? ` (${fieldSummary})` : ''}` : fieldSummary || 'Pembaruan data batch',
        entityType: 'audit_log',
        entityId: String(safeId),
        status: 'edited',
        dedupeKey: `audit:${batchIdStr}:${safeReason}`,
        dedupeWindowMs: 5_000,
        metadata: { user: actorLabel, batchId: batchIdStr, brand: relatedBatch?.brand || null, changes: safeChanges },
      });

      return jsonResponse({ id: safeId, batchId: batchIdStr, timestamp: safeTimestamp, user: authUser.name, reason: safeReason, changes: safeChanges });
    }

    // -------------------------------------------------------------
    // 6. BRANDS
    // -------------------------------------------------------------
    if (pathname === '/api/brands' && method === 'GET') {
      const rows = (
        await db
          .prepare(
            `SELECT b.*, u.name AS userOwnerName, u.email AS userOwnerEmail, u.role AS userOwnerRole
             FROM brands b
             LEFT JOIN users u ON u.id = b.ownerId
             ORDER BY b.rowid DESC`
          )
          .all()
      ).results as any[];
      const scopedRows = scope.isGlobal ? rows : rows.filter((b) => canScopeAccessBrand(scope, b.name, b.id));
      return jsonResponse(
        scopedRows.map(({ userOwnerName, userOwnerEmail, userOwnerRole, ...b }) => ({
          ...b,
          ownerName: userOwnerName || 'Belum Ditentukan',
          ownerEmail: userOwnerEmail || null,
          ownerRole: userOwnerRole ? normalizeRole(userOwnerRole) : null,
        }))
      );
    }

    if (pathname === '/api/brands' && method === 'POST') {
      if (!can('brands.manage')) return deny();
      const b = (await request.json().catch(() => ({}))) as any;
      const cleanName = sanitizeStringInput(b.name, 120);
      if (!cleanName) return jsonResponse({ error: 'Nama brand wajib diisi.' }, 400);
      const cleanId = sanitizeStringInput(b.id, 80) || `brand-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

      const logoCheck = validateSafeImageSource(b.logo);
      if (!logoCheck.valid) return jsonResponse({ error: logoCheck.error || 'Format logo brand tidak valid.' }, 400);

      const requestedOwnerId = b.ownerId && typeof b.ownerId === 'string' && b.ownerId.trim() !== '' ? sanitizeStringInput(b.ownerId, 80) : '';
      const finalOwnerId = scope.isGlobal ? requestedOwnerId : authUser.id;

      let ownerName = 'Belum Ditentukan';
      let ownerEmail: string | null = null;
      let ownerRole: string | null = null;
      if (finalOwnerId) {
        const u = await db.prepare('SELECT name, email, role FROM users WHERE id = ?').bind(finalOwnerId).first<any>();
        if (u) {
          ownerName = u.name;
          ownerEmail = u.email;
          ownerRole = normalizeRole(u.role);
        }
      }

      const businessType = b.businessType === 'B2B' ? 'B2B' : 'Retail';
      const safeStatus = b.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
      const safeDesc = sanitizeStringInput(b.description, 1000);
      const safeCat = sanitizeStringInput(b.category, 120) || 'Umum';
      const safeCreatedAt = sanitizeStringInput(b.createdAt, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

      await db
        .prepare(
          `INSERT INTO brands (id, name, logo, ownerId, description, category, businessType, status, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(cleanId, cleanName, logoCheck.value, finalOwnerId, safeDesc, safeCat, businessType, safeStatus, safeCreatedAt)
        .run();

      return jsonResponse({ id: cleanId, name: cleanName, logo: logoCheck.value, ownerId: finalOwnerId, ownerName, ownerEmail, ownerRole, description: safeDesc, category: safeCat, businessType, status: safeStatus, createdAt: safeCreatedAt });
    }

    const brandIdMatch = pathname.match(/^\/api\/brands\/([^/]+)$/);
    if (brandIdMatch) {
      if (!can('brands.manage')) return deny();
      const id = decodeURIComponent(brandIdMatch[1]);
      const existing = await db.prepare('SELECT * FROM brands WHERE id = ?').bind(id).first<any>();
      if (!existing) return jsonResponse({ error: 'Brand tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, existing.name, existing.id);
      if (denied) return denied;

      if (method === 'PUT') {
        const b = (await request.json().catch(() => ({}))) as any;
        let nextLogo = existing.logo;
        if (b.logo !== undefined) {
          const logoCheck = validateSafeImageSource(b.logo);
          if (!logoCheck.valid) return jsonResponse({ error: logoCheck.error || 'Format logo brand tidak valid.' }, 400);
          nextLogo = logoCheck.value;
        }

        const rawOwnerId = b.ownerId !== undefined ? b.ownerId : existing.ownerId;
        const requestedOwnerId = rawOwnerId && typeof rawOwnerId === 'string' && rawOwnerId.trim() !== '' ? sanitizeStringInput(rawOwnerId, 80) : '';
        if (!scope.isGlobal && b.ownerId !== undefined && requestedOwnerId !== String(existing.ownerId || '')) {
          return jsonResponse({ error: 'Hanya Super Admin atau pemilik akses lintas brand yang berwenang memindahkan kepemilikan brand.' }, 403);
        }
        const targetOwnerId = scope.isGlobal ? requestedOwnerId : String(existing.ownerId || '');

        let ownerName = 'Belum Ditentukan';
        let ownerEmail: string | null = null;
        let ownerRole: string | null = null;
        if (targetOwnerId) {
          const u = await db.prepare('SELECT name, email, role FROM users WHERE id = ?').bind(targetOwnerId).first<any>();
          if (u) {
            ownerName = u.name;
            ownerEmail = u.email;
            ownerRole = normalizeRole(u.role);
          }
        }

        const updated = {
          name: b.name !== undefined ? sanitizeStringInput(b.name, 120) : existing.name,
          logo: nextLogo,
          ownerId: targetOwnerId,
          description: b.description !== undefined ? sanitizeStringInput(b.description, 1000) : existing.description,
          category: b.category !== undefined ? sanitizeStringInput(b.category, 120) : existing.category,
          businessType: b.businessType !== undefined ? (b.businessType === 'B2B' ? 'B2B' : 'Retail') : (existing.businessType || 'Retail'),
          status: b.status !== undefined ? (b.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif') : existing.status,
        };

        await db
          .prepare('UPDATE brands SET name = ?, logo = ?, ownerId = ?, description = ?, category = ?, businessType = ?, status = ? WHERE id = ?')
          .bind(updated.name, updated.logo, updated.ownerId, updated.description, updated.category, updated.businessType, updated.status, id)
          .run();

        const result = await db.prepare('SELECT * FROM brands WHERE id = ?').bind(id).first<any>();
        return jsonResponse({ ...result, ownerName, ownerEmail, ownerRole });
      }

      if (method === 'DELETE') {
        await db.prepare('DELETE FROM brands WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // 7. CATEGORIES
    // -------------------------------------------------------------
    if (pathname === '/api/categories' && method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM categories ORDER BY level ASC, rowid ASC, name ASC').all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/categories' && method === 'POST') {
      if (!can('categories.manage')) return deny();
      const c = (await request.json().catch(() => ({}))) as any;
      const cleanName = sanitizeStringInput(c.name, 120);
      if (!cleanName) return jsonResponse({ error: 'Nama kategori wajib diisi.' }, 400);
      const id = sanitizeStringInput(c.id, 80) || `cat-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const level = Math.min(3, Math.max(1, Number(c.level) || 1));
      const parentId = c.parentId ? sanitizeStringInput(c.parentId, 80) : null;
      const specSchema = typeof c.specSchema === 'string' ? c.specSchema : c.specSchema ? JSON.stringify(c.specSchema) : null;
      const createdAt = new Date().toISOString().split('T')[0];

      await db
        .prepare(
          `INSERT INTO categories (id, name, parentId, level, createdAt, specSchema)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(id, cleanName, parentId, level, createdAt, specSchema)
        .run();
      const created = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<any>();
      return jsonResponse(created);
    }

    const catSpecsMatch = pathname.match(/^\/api\/categories\/([^/]+)\/specs$/);
    if (catSpecsMatch && method === 'PUT') {
      if (!can('categories.manage')) return deny();
      const id = decodeURIComponent(catSpecsMatch[1]);
      const existing = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<any>();
      if (!existing) return jsonResponse({ error: 'Kategori tidak ditemukan.' }, 404);
      const body = (await request.json().catch(() => ({}))) as any;
      const specSchema = typeof body.specSchema === 'string' ? body.specSchema : JSON.stringify(body.specSchema || []);
      await db.prepare('UPDATE categories SET specSchema = ? WHERE id = ?').bind(specSchema, id).run();
      const updated = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<any>();
      return jsonResponse(updated);
    }

    const catIdMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
    if (catIdMatch) {
      if (!can('categories.manage')) return deny();
      const id = decodeURIComponent(catIdMatch[1]);
      const existing = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<any>();
      if (!existing) return jsonResponse({ error: 'Kategori tidak ditemukan.' }, 404);

      if (method === 'PUT') {
        const c = (await request.json().catch(() => ({}))) as any;
        const name = c.name !== undefined ? sanitizeStringInput(c.name, 120) : existing.name;
        await db.prepare('UPDATE categories SET name = ? WHERE id = ?').bind(name, id).run();
        const updated = await db.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first<any>();
        return jsonResponse(updated);
      }

      if (method === 'DELETE') {
        const children = (await db.prepare('SELECT id FROM categories WHERE parentId = ?').bind(id).all()).results as { id: string }[];
        const stmts = [db.prepare('DELETE FROM categories WHERE id = ?').bind(id)];
        for (const ch of children) {
          stmts.push(db.prepare('DELETE FROM categories WHERE parentId = ?').bind(ch.id));
          stmts.push(db.prepare('DELETE FROM categories WHERE id = ?').bind(ch.id));
        }
        await db.batch(stmts);
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // 8. PRODUCTS (SKU)
    // -------------------------------------------------------------
    if (pathname === '/api/products' && method === 'GET') {
      if (!canAny('sku.view', 'batches.view', 'dashboard.view')) return deny();
      const rows = (await db.prepare('SELECT * FROM products ORDER BY brandName ASC, sku ASC').all()).results as any[];
      const scoped = scope.isGlobal ? rows : rows.filter((p) => canScopeAccessBrand(scope, p.brandName, p.brandId));
      return jsonResponse(
        scoped.map((p) => ({
          ...p,
          skuCode: p.skuCode || `SKU-${p.id.toUpperCase()}`,
          isB2B: Boolean(p.isB2B),
        }))
      );
    }

    const prodRelationalMatch = pathname.match(/^\/api\/products\/([^/]+)\/relational$/);
    if (prodRelationalMatch && method === 'GET') {
      if (!canAny('sku.view', 'batches.view', 'dashboard.view')) return deny();
      const id = decodeURIComponent(prodRelationalMatch[1]);
      let prod = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<any>();
      if (!prod) prod = await db.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?)').bind(id).first<any>();
      if (!prod) return jsonResponse({ error: 'Produk tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, prod.brandName, prod.brandId);
      if (denied) return denied;

      const brandRow = await db
        .prepare('SELECT id, name, logo, ownerId, category, status, description FROM brands WHERE id = ? OR LOWER(name) = LOWER(?)')
        .bind(prod.brandId, prod.brandName)
        .first<any>();
      let user: any = null;
      if (brandRow?.ownerId) {
        user = await db.prepare('SELECT id, name, username, email, phone, role, avatar, status FROM users WHERE id = ?').bind(brandRow.ownerId).first<any>();
      }
      const brand = brandRow
        ? {
            ...brandRow,
            ownerName: user?.name || 'Belum Ditentukan',
            ownerEmail: user?.email || null,
            ownerRole: user?.role ? normalizeRole(user.role) : null,
          }
        : null;

      const batches = (
        await db
          .prepare('SELECT id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps FROM batches WHERE LOWER(sku) = LOWER(?) AND (LOWER(brand) = LOWER(?) OR LOWER(brand) = LOWER(?)) ORDER BY date DESC')
          .bind(prod.sku, prod.brandName, brand?.name || prod.brandName)
          .all()
      ).results as any[];

      const batchIds = batches.map((b) => b.id);
      let tagStats = { totalTags: 0, usedTags: 0, availableTags: 0 };
      let projects: string[] = [];
      let warranties: string[] = [];
      let prodCodes: string[] = [];
      let sampleAllocatedTags: any[] = [];

      if (batchIds.length > 0) {
        const placeholders = batchIds.map(() => '?').join(',');
        const statsRow = await db
          .prepare(`SELECT COUNT(*) as totalTags, SUM(CASE WHEN status = 'Telah Digunakan' THEN 1 ELSE 0 END) as usedTags, SUM(CASE WHEN status = 'Tersedia' THEN 1 ELSE 0 END) as availableTags FROM tags WHERE batchId IN (${placeholders})`)
          .bind(...batchIds)
          .first<any>();
        if (statsRow) {
          tagStats = {
            totalTags: Number(statsRow.totalTags) || 0,
            usedTags: Number(statsRow.usedTags) || 0,
            availableTags: Number(statsRow.availableTags) || 0,
          };
        }
        projects = ((await db.prepare(`SELECT DISTINCT project FROM tags WHERE batchId IN (${placeholders}) AND project IS NOT NULL AND project != '' AND project != '-'`).bind(...batchIds).all()).results as any[]).map((r) => r.project);
        warranties = ((await db.prepare(`SELECT DISTINCT warranty FROM tags WHERE batchId IN (${placeholders}) AND warranty IS NOT NULL AND warranty != '' AND warranty != '-'`).bind(...batchIds).all()).results as any[]).map((r) => r.warranty);
        prodCodes = ((await db.prepare(`SELECT DISTINCT prodCode FROM tags WHERE batchId IN (${placeholders}) AND prodCode IS NOT NULL AND prodCode != '' AND prodCode != '-'`).bind(...batchIds).all()).results as any[]).map((r) => r.prodCode);
        sampleAllocatedTags = (await db.prepare(`SELECT tagNumber, pin, status, project, warranty, prodCode, note, allocatedAt FROM tags WHERE batchId IN (${placeholders}) AND status = 'Telah Digunakan' LIMIT 6`).bind(...batchIds).all()).results as any[];
      }

      const escapedSkuLike = `%${escapeLikePattern(String(prod.sku || '').toLowerCase())}%`;
      const scanRows = (
        await db
          .prepare(
            `SELECT city, province, venue, totalScans, todayScans, status, latestTime, deviceInfo
             FROM scan_points
             WHERE (LOWER(brand) = LOWER(?) OR LOWER(brand) = LOWER(?))
               AND (LOWER(productType) LIKE ? ESCAPE '\\' OR batchId IN (${batchIds.length ? batchIds.map(() => '?').join(',') : "''"}))
             ORDER BY totalScans DESC LIMIT 4`
          )
          .bind(prod.brandName, brand?.name || prod.brandName, escapedSkuLike, ...(batchIds.length ? batchIds : []))
          .all()
      ).results as any[];

      return jsonResponse({
        product: { ...prod, skuCode: prod.skuCode || `SKU-${prod.id.toUpperCase()}`, isB2B: Boolean(prod.isB2B) },
        brand,
        user,
        batches,
        activeBatchesCount: batches.filter((b) => b.status !== 'Disuspend').length,
        suspendedBatchesCount: batches.filter((b) => b.status === 'Disuspend').length,
        tagStats,
        projects,
        warranties,
        prodCodes,
        sampleAllocatedTags,
        scanActivity: { totalScans: scanRows.reduce((acc, r) => acc + (Number(r.totalScans) || 0), 0), locations: scanRows },
      });
    }

    if (pathname === '/api/products' && method === 'POST') {
      if (!can('sku.manage')) return deny();
      const p = (await request.json().catch(() => ({}))) as any;
      const cleanBrandName = sanitizeStringInput(p.brandName, 120);
      const cleanBrandId = p.brandId ? sanitizeStringInput(p.brandId, 80) : null;
      const cleanSku = sanitizeStringInput(p.sku, 200);
      if (!cleanBrandName || !cleanSku) return jsonResponse({ error: 'Nama brand dan nama SKU wajib diisi.' }, 400);
      const denied = assertD1BrandAccess(scope, cleanBrandName, cleanBrandId);
      if (denied) return denied;

      const imgCheck = validateSafeImageSource(p.image);
      if (!imgCheck.valid) return jsonResponse({ error: imgCheck.error || 'Format gambar produk tidak valid.' }, 400);

      const cleanId = sanitizeStringInput(p.id, 80) || `prod-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const createdAt = sanitizeStringInput(p.createdAt, 80) || new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
      const skuCode = sanitizeStringInput(p.skuCode, 80) || `SKU-${Date.now().toString().slice(-4)}`;
      const cleanCategory = sanitizeStringInput(p.category, 160) || 'Umum';
      const cleanDesc = p.description ? sanitizeStringInput(p.description, 1500) : null;

      await db
        .prepare('INSERT INTO products (id, brandId, brandName, sku, skuCode, category, isB2B, description, createdAt, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cleanId, cleanBrandId, cleanBrandName, cleanSku, skuCode, cleanCategory, p.isB2B ? 1 : 0, cleanDesc, createdAt, imgCheck.value)
        .run();

      return jsonResponse({ id: cleanId, brandId: cleanBrandId, brandName: cleanBrandName, sku: cleanSku, skuCode, category: cleanCategory, description: cleanDesc, createdAt, isB2B: Boolean(p.isB2B), image: imgCheck.value });
    }

    const prodIdMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (prodIdMatch) {
      if (!can('sku.manage')) return deny();
      const id = decodeURIComponent(prodIdMatch[1]);
      const existing = await db.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<any>();
      if (!existing) return jsonResponse({ error: 'Product tidak ditemukan' }, 404);
      const denied = assertD1BrandAccess(scope, existing.brandName, existing.brandId);
      if (denied) return denied;

      if (method === 'PUT') {
        const p = (await request.json().catch(() => ({}))) as any;
        const brandId = p.brandId !== undefined ? (p.brandId ? sanitizeStringInput(p.brandId, 80) : null) : existing.brandId;
        const brandName = p.brandName !== undefined ? sanitizeStringInput(p.brandName, 120) : existing.brandName;
        const targetDenied = assertD1BrandAccess(scope, brandName, brandId);
        if (targetDenied) return targetDenied;

        let nextImage = existing.image;
        if (p.image !== undefined) {
          const imgCheck = validateSafeImageSource(p.image);
          if (!imgCheck.valid) return jsonResponse({ error: imgCheck.error || 'Format gambar produk tidak valid.' }, 400);
          nextImage = imgCheck.value;
        }

        const sku = p.sku !== undefined ? sanitizeStringInput(p.sku, 200) : existing.sku;
        const skuCode = p.skuCode !== undefined ? sanitizeStringInput(p.skuCode, 80) : (existing.skuCode || `SKU-${id.toUpperCase()}`);
        const category = p.category !== undefined ? sanitizeStringInput(p.category, 160) : existing.category;
        const isB2B = p.isB2B !== undefined ? (p.isB2B ? 1 : 0) : existing.isB2B;
        const description = p.description !== undefined ? (p.description ? sanitizeStringInput(p.description, 1500) : null) : existing.description;

        await db
          .prepare('UPDATE products SET brandId = ?, brandName = ?, sku = ?, skuCode = ?, category = ?, isB2B = ?, description = ?, image = ? WHERE id = ?')
          .bind(brandId, brandName, sku, skuCode, category, isB2B, description, nextImage, id)
          .run();

        return jsonResponse({ id, brandId, brandName, sku, skuCode, category, isB2B: Boolean(isB2B), description, image: nextImage, createdAt: existing.createdAt });
      }

      if (method === 'DELETE') {
        await db.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // 9. USERS MANAGEMENT (Anti-Privilege Escalation)
    // -------------------------------------------------------------
    if (pathname === '/api/users' && method === 'GET') {
      if (!canAny('users.view', 'users.manage')) {
        return jsonResponse([authUser]);
      }
      const rows = (await db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users ORDER BY rowid DESC').all()).results;
      return jsonResponse(rows);
    }

    if (pathname === '/api/users' && method === 'POST') {
      if (!can('users.manage')) return deny();
      const u = (await request.json().catch(() => ({}))) as any;
      const isActorSuperAdmin = normalizeRole(authUser.role) === 'Super Admin';
      const requestedRole = normalizeRole(u.role || 'Admin Brand');
      if (!isActorSuperAdmin && requestedRole === 'Super Admin') {
        return jsonResponse({ error: 'Hanya Super Admin yang berwenang membuat akun dengan peran Super Admin.' }, 403);
      }

      const cleanEmail = sanitizeStringInput(u.email, 160).toLowerCase();
      const cleanName = sanitizeStringInput(u.name, 120);
      let cleanUsername: string | null = null;
      if (u.username !== undefined && u.username !== null) {
        const usernameCheck = validateUsernameFormat(sanitizeStringInput(u.username, 80));
        if (!usernameCheck.valid) {
          return jsonResponse({ error: usernameCheck.error || 'Format username tidak valid.' }, 400);
        }
        cleanUsername = usernameCheck.normalized;
      }
      const cleanPhone = u.phone ? sanitizeStringInput(u.phone, 40) : null;
      const cleanId = sanitizeStringInput(u.id, 80) || `usr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

      if (!cleanName) return jsonResponse({ error: 'Nama lengkap wajib diisi.' }, 400);
      if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
        return jsonResponse({ error: 'Format email tidak valid.' }, 400);
      }

      if (await db.prepare('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1').bind(cleanEmail).first()) {
        return jsonResponse({ error: 'Alamat email tersebut sudah terdaftar pada akun lain.' }, 409);
      }
      if (cleanUsername && (await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1').bind(cleanUsername).first())) {
        return jsonResponse({ error: 'Username tersebut sudah digunakan akun lain.' }, 409);
      }

      const avatarCheck = validateSafeImageSource(u.avatar);
      if (!avatarCheck.valid) return jsonResponse({ error: avatarCheck.error || 'Format foto profil tidak valid.' }, 400);

      let hashedPassword: string | null = null;
      if (u.password && typeof u.password === 'string' && u.password.trim().length > 0) {
        if (u.password.trim().length < 8) return jsonResponse({ error: 'Kata sandi minimal terdiri dari 8 karakter.' }, 400);
        hashedPassword = hashPassword(u.password);
      }

      const now = new Date().toISOString();
      const safeStatus = u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
      await db
        .prepare('INSERT INTO users (id, name, username, email, phone, role, avatar, status, createdAt, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(cleanId, cleanName, cleanUsername, cleanEmail, cleanPhone, requestedRole, avatarCheck.value, safeStatus, u.createdAt ? sanitizeStringInput(u.createdAt, 80) : now, hashedPassword)
        .run();

      const created = await db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?').bind(cleanId).first();
      return jsonResponse(created);
    }

    const userIdMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userIdMatch) {
      if (!can('users.manage')) return deny();
      const id = decodeURIComponent(userIdMatch[1]);
      const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<any>();
      if (!existing) return jsonResponse({ error: 'User tidak ditemukan' }, 404);

      const isActorSuperAdmin = normalizeRole(authUser.role) === 'Super Admin';
      if (!isActorSuperAdmin && normalizeRole(existing.role) === 'Super Admin') {
        return jsonResponse({ error: 'Anda tidak memiliki izin untuk mengubah atau menghapus akun Super Admin.' }, 403);
      }

      if (method === 'PUT') {
        const u = (await request.json().catch(() => ({}))) as any;
        if (authUser.id === id && u.status === 'Nonaktif') {
          return jsonResponse({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif login.' }, 400);
        }
        if (u.email !== undefined && (typeof u.email !== 'string' || !EMAIL_REGEX.test(u.email.trim()))) {
          return jsonResponse({ error: 'Format email tidak valid.' }, 400);
        }

        const nextEmail = u.email !== undefined ? sanitizeStringInput(u.email, 160).toLowerCase() : existing.email;
        let nextUsername: string | null = existing.username ? normalizeUsernameInput(existing.username) : null;
        if (u.username !== undefined) {
          if (u.username === null) {
            nextUsername = null;
          } else {
            const usernameCheck = validateUsernameFormat(sanitizeStringInput(u.username, 80));
            if (!usernameCheck.valid) {
              return jsonResponse({ error: usernameCheck.error || 'Format username tidak valid.' }, 400);
            }
            nextUsername = usernameCheck.normalized;
          }
        }
        const nextRole = normalizeRole(u.role !== undefined ? u.role : existing.role);
        const nextStatus = u.status !== undefined ? (u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif') : (existing.status || 'Aktif');

        if (!isActorSuperAdmin && nextRole === 'Super Admin') {
          return jsonResponse({ error: 'Hanya Super Admin yang berwenang menetapkan peran Super Admin.' }, 403);
        }

        if (normalizeRole(existing.role) === 'Super Admin' && (nextRole !== 'Super Admin' || nextStatus === 'Nonaktif')) {
          const otherAdmins = await db
            .prepare("SELECT COUNT(*) as count FROM users WHERE id != ? AND role = 'Super Admin' AND (status IS NULL OR status != 'Nonaktif')")
            .bind(id)
            .first<{ count: number }>();
          if (!otherAdmins || otherAdmins.count === 0) {
            return jsonResponse({ error: 'Tidak dapat menonaktifkan atau menurunkan peran Super Admin aktif terakhir di sistem.' }, 400);
          }
        }

        if (nextEmail.toLowerCase() !== String(existing.email || '').toLowerCase()) {
          if (await db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1').bind(nextEmail, id).first()) {
            return jsonResponse({ error: 'Alamat email tersebut sudah digunakan akun lain.' }, 409);
          }
        }
        if (nextUsername && nextUsername.toLowerCase() !== String(existing.username || '').toLowerCase()) {
          if (await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1').bind(nextUsername, id).first()) {
            return jsonResponse({ error: 'Username tersebut sudah digunakan akun lain.' }, 409);
          }
        }

        let nextAvatar = existing.avatar;
        if (u.avatar !== undefined) {
          const avatarCheck = validateSafeImageSource(u.avatar);
          if (!avatarCheck.valid) return jsonResponse({ error: avatarCheck.error || 'Format foto profil tidak valid.' }, 400);
          nextAvatar = avatarCheck.value;
        }

        const hasNewPassword = typeof u.password === 'string' && u.password.trim().length > 0;
        if (hasNewPassword && u.password.trim().length < 8) {
          return jsonResponse({ error: 'Kata sandi baru minimal terdiri dari 8 karakter.' }, 400);
        }

        const updated = {
          name: u.name !== undefined ? sanitizeStringInput(u.name, 120) : existing.name,
          username: nextUsername,
          email: nextEmail,
          phone: u.phone !== undefined ? (u.phone ? sanitizeStringInput(u.phone, 40) : null) : existing.phone,
          role: nextRole,
          avatar: nextAvatar,
          status: nextStatus,
        };

        await db
          .prepare('UPDATE users SET name = ?, username = ?, email = ?, phone = ?, role = ?, avatar = ?, status = ? WHERE id = ?')
          .bind(updated.name, updated.username, updated.email, updated.phone, updated.role, updated.avatar, updated.status, id)
          .run();

        if (hasNewPassword) {
          await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashPassword(u.password), id).run();
          await revokeAllD1UserSessions(db, id);
        } else if (nextStatus === 'Nonaktif' || nextRole !== normalizeRole(existing.role)) {
          await revokeAllD1UserSessions(db, id);
        }

        if (
          authUser.id &&
          authUser.id !== id &&
          (hasNewPassword || nextRole !== normalizeRole(existing.role) || nextStatus !== (existing.status || 'Aktif'))
        ) {
          const changeParts: string[] = [];
          if (hasNewPassword) changeParts.push('kata sandi diperbarui');
          if (nextRole !== normalizeRole(existing.role)) changeParts.push(`peran diubah menjadi ${nextRole}`);
          if (nextStatus !== (existing.status || 'Aktif')) changeParts.push(`status akun menjadi ${nextStatus}`);

          await createD1Notification(db, {
            type: 'system',
            severity: nextStatus === 'Nonaktif' ? 'warning' : 'info',
            audience: 'user',
            targetUserId: id,
            title: hasNewPassword ? 'Kata Sandi Akun Diperbarui' : 'Pembaruan Keamanan Akun Anda',
            subtitle: `Diproses oleh ${actorLabel}`,
            description: `Perubahan akun Anda: ${changeParts.join(', ')}.`,
            entityType: 'user',
            entityId: id,
            status: 'info',
            metadata: { actor: actorLabel, userId: id },
          });
        }

        const result = await db.prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ?').bind(id).first();
        return jsonResponse(result);
      }

      if (method === 'DELETE') {
        if (authUser.id === id) {
          return jsonResponse({ error: 'Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif login.' }, 400);
        }
        if (normalizeRole(existing.role) === 'Super Admin') {
          const otherAdmins = await db
            .prepare("SELECT COUNT(*) as count FROM users WHERE id != ? AND role = 'Super Admin' AND (status IS NULL OR status != 'Nonaktif')")
            .bind(id)
            .first<{ count: number }>();
          if (!otherAdmins || otherAdmins.count === 0) {
            return jsonResponse({ error: 'Tidak dapat menghapus Super Admin aktif terakhir di sistem.' }, 400);
          }
        }
        await revokeAllD1UserSessions(db, id);
        await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
        const fallbackUser = await db.prepare('SELECT id FROM users ORDER BY rowid ASC LIMIT 1').first<{ id: string }>();
        if (fallbackUser) {
          await db
            .prepare('UPDATE brands SET ownerId = ? WHERE ownerId = ?')
            .bind(fallbackUser.id, id)
            .run();
        }
        return jsonResponse({ success: true });
      }
    }

    // -------------------------------------------------------------
    // 10. PASSWORD RESETS & NOTIFICATIONS
    // -------------------------------------------------------------
    if (pathname === '/api/password-resets' && method === 'GET') {
      if (!can('users.manage')) return deny();
      const rows = (
        await db
          .prepare(
            `SELECT pr.id, pr.userId, u.name AS userName, u.email AS userEmail, u.role AS userRole, u.avatar AS avatar,
                    pr.requestedAt, pr.status, pr.actionNote, pr.createdAtTs
             FROM password_reset_requests pr
             LEFT JOIN users u ON u.id = pr.userId
             ORDER BY pr.rowid DESC`
          )
          .all()
      ).results;
      return jsonResponse(rows);
    }

    const resetRespondMatch = pathname.match(/^\/api\/password-resets\/([^/]+)\/respond$/);
    if (resetRespondMatch && method === 'POST') {
      if (!can('users.manage')) return deny();
      const id = decodeURIComponent(resetRespondMatch[1]);
      const body = (await request.json().catch(() => ({}))) as any;
      const action = body?.action;
      if (action !== 'approve' && action !== 'reject') {
        return jsonResponse({ success: false, error: 'Aksi persetujuan tidak valid.' }, 400);
      }

      const resetReq = await db
        .prepare(
          `SELECT pr.*, u.name AS userName, u.email AS userEmail, u.role AS userRole, u.avatar AS avatar
           FROM password_reset_requests pr
           LEFT JOIN users u ON u.id = pr.userId
           WHERE pr.id = ?`
        )
        .bind(id)
        .first<any>();
      if (!resetReq) return jsonResponse({ success: false, error: 'Permintaan reset sandi tidak ditemukan.' }, 404);

      const targetUserRow = await db
        .prepare('SELECT id, name, username, email, phone, role, avatar, status, createdAt FROM users WHERE id = ? LIMIT 1')
        .bind(resetReq.userId || '')
        .first<any>();
      const formattedTargetUser = targetUserRow ? { ...targetUserRow, role: normalizeRole(targetUserRow.role) } : null;

      if (resetReq.status && resetReq.status !== 'Menunggu') {
        return jsonResponse(
          { success: false, alreadyProcessed: true, status: resetReq.status, error: `Permintaan reset sandi ini sudah diproses sebelumnya (${resetReq.status}).`, targetUser: formattedTargetUser },
          409
        );
      }

      const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      const newStatus = action === 'approve' ? 'Disetujui' : 'Ditolak';
      let tempPassword: string | null = null;
      let emailSent = false;
      let note = sanitizeStringInput(body?.actionNote, 500);
      const targetName = resetReq.userName || targetUserRow?.name || 'Pengguna';
      const targetEmail = resetReq.userEmail || targetUserRow?.email || '';

      if (action === 'approve') {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let generated = '';
        for (let i = 0; i < 12; i++) generated += alphabet[crypto.randomInt(0, alphabet.length)];
        tempPassword = generated;

        if (targetUserRow) {
          await db.prepare('UPDATE users SET password = ? WHERE id = ?').bind(hashPassword(tempPassword), targetUserRow.id).run();
          await revokeAllD1UserSessions(db, targetUserRow.id);
        }

        if (targetEmail && targetEmail.includes('@')) {
          const activeSettings = await loadActiveSettingsD1(db);
          const emailCfg: NotificationConfig = { ...activeSettings.notifications, emailRecipients: targetEmail };
          const mailRes = await sendEdgeAlertChannel(
            env,
            'email',
            emailCfg,
            'Kata Sandi Sementara Akun Anda Telah Diterbitkan',
            `Halo ${targetName},\n\nPermintaan reset kata sandi Anda telah disetujui oleh ${actorLabel} pada ${nowStr}.\nKata sandi sementara baru Anda: ${tempPassword}\n\nSegera ubah kata sandi Anda setelah masuk.`,
            `Halo <b>${escapeHtml(targetName)}</b>,\nPermintaan reset kata sandi Anda telah disetujui oleh <b>${escapeHtml(actorLabel)}</b> pada ${escapeHtml(nowStr)}.\nKata sandi sementara baru Anda: <code>${escapeHtml(tempPassword)}</code>\nSegera ubah kata sandi setelah masuk.`
          );
          emailSent = mailRes.success;
        }

        if (!note) {
          note = emailSent
            ? `Kata sandi akun telah diperbarui dan dikirim ke email ${targetEmail} oleh ${actorLabel} (${nowStr}).`
            : `Kata sandi sementara baru telah diterapkan ke database oleh ${actorLabel} (${nowStr}). Bagikan sandi sementara kepada pengguna karena layanan email belum aktif.`;
        }
      } else if (!note) {
        note = `Permintaan reset ditolak oleh ${actorLabel} (${nowStr}).`;
      }

      await db.prepare('UPDATE password_reset_requests SET status = ?, actionNote = ? WHERE id = ?').bind(newStatus, note, id).run();
      await updateD1NotificationByEntity(db, 'password_reset', id, {
        status: newStatus,
        severity: action === 'approve' ? 'info' : 'warning',
        description: note,
        metadata: { emailSent, tempPassword: emailSent ? null : tempPassword, actionBy: actorLabel },
      });

      if (targetUserRow?.id) {
        await createD1Notification(db, {
          type: 'system',
          severity: action === 'approve' ? 'info' : 'warning',
          audience: 'user',
          targetUserId: targetUserRow.id,
          title: action === 'approve' ? 'Permohonan Reset Kata Sandi Disetujui' : 'Permohonan Reset Kata Sandi Ditolak',
          subtitle: `Diproses oleh ${actorLabel}`,
          description:
            action === 'approve'
              ? `Kata sandi sementara baru untuk akun Anda telah diterbitkan pada ${nowStr}.`
              : note,
          entityType: 'user',
          entityId: targetUserRow.id,
          status: newStatus,
          metadata: { actor: actorLabel, userId: targetUserRow.id, requestId: id },
        });
      }

      if (authUser.id) {
        await db
          .prepare('INSERT OR IGNORE INTO read_notifications (userId, notificationId, readAt) VALUES (?, ?, ?)')
          .bind(authUser.id, `notif-reset-${id}`, new Date().toISOString())
          .run();
      }

      return jsonResponse({ success: true, id, status: newStatus, actionNote: note, tempPassword: emailSent ? null : tempPassword, emailSent, targetUser: formattedTargetUser });
    }

    if (pathname === '/api/notifications/stream' && method === 'GET') {
      const canManageUsers = hasPermission(authUser.role, 'users.manage', rbacMatrix);
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              `event: connected\ndata: ${JSON.stringify({ role: authUser.role, isGlobal: scope.isGlobal, canManageUsers })}\n\n`
            )
          );
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
        },
      });
    }

    if (pathname === '/api/notifications' && method === 'GET') {
      const canManageUsers = hasPermission(authUser.role, 'users.manage', rbacMatrix);
      const nowMs = Date.now();
      const rawCategory = (url.searchParams.get('category') || 'all').toLowerCase();
      const category = ['all', 'important', 'reset', 'scan', 'edit'].includes(rawCategory) ? rawCategory : 'all';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

      const readRows = (await db.prepare('SELECT notificationId FROM read_notifications WHERE userId = ?').bind(authUser.id).all()).results as { notificationId: string }[];
      const readIds = new Set(readRows.map((r) => r.notificationId));
      const allRows = (await db.prepare('SELECT * FROM notifications ORDER BY createdAtTs DESC LIMIT 300').all()).results as any[];

      const accessCtx = {
        userId: authUser.id,
        isGlobal: scope.isGlobal,
        canManageUsers,
        ownedBrandNames: scope.ownedBrandNames,
        ownedBrandIds: scope.ownedBrandIds,
      };
      const accessibleItems = allRows
        .filter((row) => canUserAccessNotificationRow(row, accessCtx))
        .map((row) => formatNotificationRowForClient(row, readIds, nowMs));

      const isImportant = (item: any) =>
        item.severity === 'critical' ||
        item.severity === 'warning' ||
        (item.category === 'password_reset' && item.status === 'Menunggu') ||
        (item.category === 'scan' && item.status === 'suspicious');

      const counts = {
        all: accessibleItems.length,
        important: accessibleItems.filter(isImportant).length,
        reset: accessibleItems.filter((i) => i.category === 'password_reset').length,
        scan: accessibleItems.filter((i) => i.category === 'scan').length,
        edit: accessibleItems.filter((i) => i.category === 'edit' || i.category === 'system').length,
      };

      const filteredItems = accessibleItems.filter((item) => {
        if (category === 'important') return isImportant(item);
        if (category === 'reset') return item.category === 'password_reset';
        if (category === 'scan') return item.category === 'scan';
        if (category === 'edit') return item.category === 'edit' || item.category === 'system';
        return true;
      });

      const managedBrandRows = !scope.isGlobal
        ? ((await db.prepare('SELECT name FROM brands WHERE ownerId = ?').bind(authUser.id).all()).results as { name: string }[])
        : [];

      return jsonResponse({
        unreadCount: accessibleItems.filter((item) => !item.isRead).length,
        pendingResetCount: accessibleItems.filter((item) => item.category === 'password_reset' && item.status === 'Menunggu').length,
        importantCount: counts.important,
        counts,
        total: filteredItems.length,
        hasMore: offset + limit < filteredItems.length,
        roleScope: {
          role: authUser.role,
          isGlobal: scope.isGlobal,
          canManageUsers,
          managedBrands: managedBrandRows.map((b) => b.name),
        },
        notifications: filteredItems.slice(offset, offset + limit),
      });
    }

    if (pathname === '/api/notifications/mark-read' && method === 'POST') {
      if (!can('notifications.manage')) {
        return deny('Akses ditolak. Peran Anda tidak memiliki izin mengelola atau menandai notifikasi.');
      }
      const body = (await request.json().catch(() => ({}))) as any;
      const canManageUsers = hasPermission(authUser.role, 'users.manage', rbacMatrix);
      const readAtIso = new Date().toISOString();
      const insertStmt = db.prepare('INSERT OR IGNORE INTO read_notifications (userId, notificationId, readAt) VALUES (?, ?, ?)');
      const accessCtx = {
        userId: authUser.id,
        isGlobal: scope.isGlobal,
        canManageUsers,
        ownedBrandNames: scope.ownedBrandNames,
        ownedBrandIds: scope.ownedBrandIds,
      };

      if (body?.all) {
        const allRows = (await db.prepare('SELECT id, audience, targetUserId, brandName, brandId, type FROM notifications').all()).results as any[];
        const stmts = allRows
          .filter((row) => canUserAccessNotificationRow(row, accessCtx))
          .map((row) => insertStmt.bind(authUser.id, row.id, readAtIso));
        for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
      } else if (Array.isArray(body?.ids)) {
        const safeIds = body.ids.slice(0, 500).filter((v: any): v is string => typeof v === 'string' && v.length > 0 && v.length <= 120);
        const stmts = safeIds.map((nid: string) => insertStmt.bind(authUser.id, nid, readAtIso));
        for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
      } else if (typeof body?.id === 'string' && body.id.length > 0 && body.id.length <= 120) {
        await insertStmt.bind(authUser.id, body.id, readAtIso).run();
      }
      return jsonResponse({ success: true });
    }

    // -------------------------------------------------------------
    // 11. SYSTEM SETTINGS & BACKUP/RESTORE
    // -------------------------------------------------------------
    if (pathname === '/api/settings' && method === 'GET') {
      if (!canAny('settings.view', 'settings.manage')) return deny();
      const row = await db.prepare("SELECT value, updatedAt FROM system_settings WHERE key = 'app_settings'").first<{ value: string; updatedAt: string }>();
      if (row?.value) {
        let parsed = {};
        try { parsed = JSON.parse(row.value); } catch (_) {}
        return jsonResponse({ ...mergeSystemSettings(parsed), updatedAt: row.updatedAt });
      }
      return jsonResponse({ ...mergeSystemSettings(DEFAULT_SYSTEM_SETTINGS), updatedAt: 'Belum pernah diubah' });
    }

    if (pathname === '/api/settings' && method === 'PUT') {
      if (!can('settings.manage')) return deny();
      const newSettings = (await request.json().catch(() => ({}))) as any;
      const merged = mergeSystemSettings(newSettings);
      const gwUrl = (merged.notifications?.whatsappGatewayUrl || '').trim();
      if (gwUrl && !validatePublicWebhookUrl(gwUrl).valid) {
        return jsonResponse({ success: false, error: 'URL WhatsApp Gateway tidak valid atau mengarah ke jaringan lokal.' }, 400);
      }

      const updatedAt = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      await db
        .prepare(
          `INSERT INTO system_settings (key, value, updatedAt)
           VALUES ('app_settings', ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt`
        )
        .bind(JSON.stringify(merged), updatedAt)
        .run();

      try {
        await db
          .prepare('INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(
            Date.now(),
            'SYSTEM-CONFIG',
            updatedAt,
            authUser.name,
            'Pembaruan Kebijakan Keamanan & Pengaturan Sistem',
            JSON.stringify([
              { field: 'Ambang Batas Anomali', old: 'Versi Sebelumnya', new: `${merged.anomalyThreshold.warningMaxScans}x Waspada, >=${merged.anomalyThreshold.suspiciousMinScans}x Palsu` },
              { field: 'Mode Telemetri GPS', old: 'Versi Sebelumnya', new: merged.locationPolicy.mode },
            ])
          )
          .run();
      } catch (_) {}

      return jsonResponse({ success: true, settings: { ...merged, updatedAt } });
    }

    if (pathname === '/api/settings/test-alert' && method === 'POST') {
      if (!can('settings.manage')) return deny();
      const body = (await request.json().catch(() => ({}))) as any;
      const channel = body?.channel;
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

      const active = await loadActiveSettingsD1(db);
      const effectiveNotif: NotificationConfig = {
        ...active.notifications,
        ...(body?.config && typeof body.config === 'object' ? body.config : {}),
      };
      if (body?.target) effectiveNotif.emailRecipients = String(body.target);

      const result = await sendEdgeAlertChannel(
        env,
        'email',
        effectiveNotif,
        '[UJI COBA] Peringatan Keamanan Sistem Telemetri',
        `Uji coba pengiriman peringatan keamanan berhasil terhubung.\nChannel: Email Security\nWaktu: ${now}`,
        `<b>[UJI COBA] Peringatan Keamanan</b>\nChannel: Email Security\nWaktu: ${escapeHtml(now)}`
      );

      if (!result.success) {
        return jsonResponse({ success: false, error: result.detail, timestamp: now }, 400);
      }
      return jsonResponse({ success: true, message: result.detail, timestamp: now });
    }

    if (pathname === '/api/settings/backup' && method === 'GET') {
      if (!can('settings.manage')) return deny();
      const format = (url.searchParams.get('format') || 'json').toLowerCase();
      const backupDate = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
      const timestampIso = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

      if (format === 'sqlite' || format === 'db') {
        return jsonResponse(
          { error: 'Unduh file biner .sqlite hanya tersedia pada server Node.js/VPS. Pada Cloudflare D1, gunakan format .sql atau .json.' },
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
      const passwordResetRequests = (await db.prepare('SELECT * FROM password_reset_requests').all()).results as any[];
      const readNotifications = (await db.prepare('SELECT * FROM read_notifications').all()).results as any[];
      const systemSettings = (await db.prepare('SELECT * FROM system_settings').all()).results as any[];
      const settingsRow = await db.prepare("SELECT value FROM system_settings WHERE key = 'app_settings'").first<{ value: string }>();

      try {
        const current = settingsRow?.value ? JSON.parse(settingsRow.value) : mergeSystemSettings(DEFAULT_SYSTEM_SETTINGS);
        current.backupInfo = { ...DEFAULT_SYSTEM_SETTINGS.backupInfo, ...(current.backupInfo || {}), lastBackupDate: backupDate };
        await db
          .prepare("INSERT INTO system_settings (key, value, updatedAt) VALUES ('app_settings', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt")
          .bind(JSON.stringify(current), backupDate)
          .run();
      } catch (_) {}

      if (format === 'mysql' || format === 'sql') {
        const usersFull = (await db.prepare('SELECT * FROM users').all()).results as any[];
        const esc = (val: any): string => {
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'NULL';
          if (typeof val === 'boolean') return val ? '1' : '0';
          return `'${String(val).replace(/\\/g, '\\\\').replace(/\0/g, '\\0').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\x1a/g, '\\Z').replace(/'/g, "\\'")}'`;
        };
        const insertBlocks = (table: string, cols: string[], rows: any[]) => {
          if (!rows.length) return '';
          const colList = cols.map((c) => `\`${c}\``).join(', ');
          const chunks: string[] = [];
          for (let i = 0; i < rows.length; i += 100) {
            const slice = rows.slice(i, i + 100);
            chunks.push(`INSERT INTO \`${table}\` (${colList}) VALUES\n${slice.map((r) => `(${cols.map((c) => esc(r[c])).join(', ')})`).join(',\n')};`);
          }
          return chunks.join('\n\n') + '\n';
        };
        const sqlDump = [
          `-- SUMAS DATABASE BACKUP (MySQL / MariaDB - phpMyAdmin Ready)`,
          `-- Dibuat pada: ${backupDate}`,
          `SET NAMES utf8mb4;`,
          `SET FOREIGN_KEY_CHECKS = 0;`,
          insertBlocks('batches', ['id', 'batchId', 'date', 'project', 'sku', 'brand', 'qty', 'specs', 'pinLength', 'status', 'isB2B', 'redirectUrl', 'qrType', 'requirePin', 'enableGps'], batches),
          insertBlocks('tags', ['id', 'batchId', 'tagNumber', 'pin', 'status', 'project', 'specs', 'codeType', 'warranty', 'prodCode', 'note', 'allocatedAt'], tags),
          insertBlocks('scan_points', ['id', 'city', 'province', 'venue', 'lat', 'lng', 'totalScans', 'todayScans', 'brand', 'productType', 'batchId', 'latestTagId', 'pin', 'latestTime', 'isB2B', 'status', 'anomalyReason', 'deviceInfo', 'scanHistory', 'createdAt'], scanPoints),
          insertBlocks('scan_activities', ['id', 'rangeType', 'label', 'fullDate', 'scans', 'valid', 'topBrand', 'sortOrder'], scanActivities),
          insertBlocks('audit_logs', ['id', 'batchId', 'timestamp', 'user', 'reason', 'changes'], auditLogs),
          insertBlocks('users', ['id', 'name', 'username', 'email', 'phone', 'role', 'avatar', 'status', 'createdAt', 'password'], usersFull),
          insertBlocks('brands', ['id', 'name', 'logo', 'ownerId', 'description', 'category', 'businessType', 'status', 'createdAt'], brands),
          insertBlocks('products', ['id', 'brandId', 'brandName', 'sku', 'category', 'isB2B', 'description', 'createdAt', 'skuCode', 'image'], products),
          insertBlocks('password_reset_requests', ['id', 'userId', 'requestedAt', 'status', 'actionNote', 'createdAtTs'], passwordResetRequests),
          insertBlocks('read_notifications', ['userId', 'notificationId', 'readAt'], readNotifications),
          insertBlocks('categories', ['id', 'name', 'parentId', 'level', 'createdAt', 'specSchema'], categories),
          insertBlocks('system_settings', ['key', 'value', 'updatedAt'], systemSettings),
          `SET FOREIGN_KEY_CHECKS = 1;`,
        ].filter(Boolean).join('\n\n');

        return new Response(sqlDump, {
          headers: {
            'Content-Type': 'application/sql; charset=utf-8',
            'Content-Disposition': `attachment; filename="sumas-backup-mysql-${timestampIso}.sql"`,
            'X-Backup-Date': encodeURIComponent(backupDate),
          },
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
          totalAuditLogs: auditLogs.length,
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
          settings: settingsRow?.value ? JSON.parse(settingsRow.value) : DEFAULT_SYSTEM_SETTINGS,
        },
      };

      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="sumas-backup-${timestampIso}.json"`,
          'X-Backup-Date': encodeURIComponent(backupDate),
        },
      });
    }

    if (pathname === '/api/settings/restore' && method === 'POST') {
      if (!can('settings.manage')) return deny();
      const backup = (await request.json().catch(() => null)) as any;
      if (!backup || !backup.data || !backup.system) {
        return jsonResponse({ error: 'Format berkas cadangan tidak valid atau rusak.' }, 400);
      }

      const { batches, tags, scanPoints, scanActivities, categories, brands, products, auditLogs, settings } = backup.data;
      const stmts: any[] = [];
      const stats = { batches: 0, tags: 0, brands: 0, products: 0, categories: 0 };

      if (Array.isArray(batches)) {
        stmts.push(db.prepare('DELETE FROM batches'));
        for (const b of batches) {
          stmts.push(
            db.prepare('INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(b.id, b.batchId, b.date || '', b.project ?? null, b.sku || '', b.brand || '', Number(b.qty) || 0, b.specs ?? null, Number(b.pinLength) || 8, b.status || 'Aktif', b.isB2B ? 1 : 0, b.redirectUrl || 'https://cek.sumas.id/', b.qrType || 'dynamic', b.requirePin === 0 || b.requirePin === false ? 0 : 1, b.enableGps === 0 || b.enableGps === false ? 0 : 1)
          );
          stats.batches++;
        }
      }
      if (Array.isArray(tags)) {
        stmts.push(db.prepare('DELETE FROM tags'));
        for (const t of tags) {
          stmts.push(
            db.prepare('INSERT INTO tags (id, batchId, tagNumber, pin, status, project, specs, codeType, warranty, prodCode, note, allocatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(t.id, t.batchId, t.tagNumber, t.pin, t.status || 'Tersedia', t.project ?? null, t.specs ?? null, t.codeType ?? null, t.warranty ?? null, t.prodCode ?? null, t.note ?? null, t.allocatedAt ?? null)
          );
          stats.tags++;
        }
      }
      if (Array.isArray(scanPoints)) {
        stmts.push(db.prepare('DELETE FROM scan_points'));
        for (const s of scanPoints) {
          const hist = s.scanHistory ? (typeof s.scanHistory === 'string' ? s.scanHistory : JSON.stringify(s.scanHistory)) : null;
          stmts.push(
            db.prepare('INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(s.id, s.city || '', s.province || '', s.venue ?? null, Number(s.lat) || 0, Number(s.lng) || 0, Number(s.totalScans) || 0, Number(s.todayScans) || 0, s.brand || '', s.productType ?? null, s.batchId ?? null, s.latestTagId ?? null, s.pin ?? null, s.latestTime ?? null, s.isB2B ? 1 : 0, s.status || 'valid', s.anomalyReason ?? null, s.deviceInfo ?? null, hist, s.createdAt ?? null)
          );
        }
      }
      if (Array.isArray(scanActivities)) {
        stmts.push(db.prepare('DELETE FROM scan_activities'));
        for (const a of scanActivities) {
          stmts.push(
            db.prepare('INSERT INTO scan_activities (rangeType, label, fullDate, scans, valid, topBrand, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .bind(a.rangeType || '7d', a.label || '', a.fullDate || '', Number(a.scans) || 0, Number(a.valid) || 0, a.topBrand || '', Number(a.sortOrder) || 0)
          );
        }
      }
      if (Array.isArray(categories)) {
        stmts.push(db.prepare('DELETE FROM categories'));
        for (const c of categories) {
          stmts.push(
            db.prepare('INSERT INTO categories (id, name, parentId, level, createdAt, specSchema) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(c.id, c.name, c.parentId ?? null, Number(c.level) || 1, c.createdAt || new Date().toISOString().split('T')[0], c.specSchema ?? null)
          );
          stats.categories++;
        }
      }
      if (Array.isArray(brands)) {
        stmts.push(db.prepare('DELETE FROM brands'));
        for (const br of brands) {
          stmts.push(
            db.prepare('INSERT INTO brands (id, name, logo, ownerId, description, category, businessType, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(br.id, br.name, br.logo ?? null, br.ownerId || '', br.description ?? null, br.category ?? null, br.businessType || 'Retail', br.status || 'Aktif', br.createdAt || new Date().toISOString().split('T')[0])
          );
          stats.brands++;
        }
      }
      if (Array.isArray(products)) {
        stmts.push(db.prepare('DELETE FROM products'));
        for (const p of products) {
          stmts.push(
            db.prepare('INSERT INTO products (id, brandId, brandName, sku, category, isB2B, description, createdAt, skuCode, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .bind(p.id, p.brandId ?? null, p.brandName || '', p.sku || '', p.category ?? null, p.isB2B ? 1 : 0, p.description ?? null, p.createdAt ?? null, p.skuCode ?? null, p.image ?? null)
          );
          stats.products++;
        }
      }
      if (Array.isArray(auditLogs)) {
        stmts.push(db.prepare('DELETE FROM audit_logs'));
        for (const l of auditLogs) {
          const chg = typeof l.changes === 'string' ? l.changes : JSON.stringify(l.changes || []);
          stmts.push(db.prepare('INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes) VALUES (?, ?, ?, ?, ?, ?)').bind(l.id, l.batchId || '', l.timestamp || '', l.user || 'System', l.reason || '', chg));
        }
      }
      if (settings && typeof settings === 'object') {
        const safeSettings = mergeSystemSettings(settings);
        const now = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) + ' WIB';
        stmts.push(
          db.prepare("INSERT INTO system_settings (key, value, updatedAt) VALUES ('app_settings', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt")
            .bind(JSON.stringify(safeSettings), now)
        );
      }

      for (let i = 0; i < stmts.length; i += 80) {
        await db.batch(stmts.slice(i, i + 80));
      }

      return jsonResponse({
        success: true,
        restored: stats,
        message: `Pemulihan lengkap berhasil! ${stats.batches} batch, ${stats.tags} tag, ${stats.brands} brand, ${stats.products} SKU, dan ${stats.categories} kategori telah dipulihkan.`,
      });
    }

    return jsonResponse({ success: false, error: 'Endpoint API tidak ditemukan.', path: pathname }, 404);
  } catch (error: any) {
    console.error('[CF PAGES API ERROR]', error);
    return jsonResponse({ success: false, error: 'Terjadi kesalahan internal server saat memproses permintaan.' }, 500);
  }
};
