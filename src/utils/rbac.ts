export type RoleName = 'Super Admin' | 'Admin Brand';

export const ALL_ROLES: RoleName[] = ['Super Admin', 'Admin Brand'];

export type PermissionKey =
  | 'dashboard.view'
  | 'scope.all_brands'
  | 'brands.view'
  | 'brands.manage'
  | 'categories.view'
  | 'categories.manage'
  | 'sku.view'
  | 'sku.manage'
  | 'batches.view'
  | 'batches.create'
  | 'batches.delete'
  | 'batches.allocate'
  | 'batches.redirect_url'
  | 'batches.suspend'
  | 'scans.view'
  | 'users.view'
  | 'users.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'notifications.manage';

export type RbacMatrix = Record<RoleName, PermissionKey[]>;

export interface RoleMeta {
  name: RoleName;
  label: string;
  shortDesc: string;
  scopeLabel: string;
  isLocked?: boolean;
}

export const ROLE_META: Record<RoleName, RoleMeta> = {
  'Super Admin': {
    name: 'Super Admin',
    label: 'Super Admin',
    shortDesc: 'Kontrol penuh atas seluruh brand, master data, pengguna, matriks hak akses, dan pengaturan sistem.',
    scopeLabel: 'Semua Brand · Akses Penuh',
    isLocked: true,
  },
  'Admin Brand': {
    name: 'Admin Brand',
    label: 'Admin Brand',
    shortDesc: 'Melihat brand yang dikelola, produk, batch QR tag, aktivitas scan, kelola profil & kata sandi sendiri, serta alokasi proyek khusus brand B2B.',
    scopeLabel: 'Brand Dikelola · B2B Alokasi / Retail Baca Saja',
  },
};

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  title: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'general',
    title: 'Dasbor & Cakupan Data',
    permissions: [
      { key: 'dashboard.view', label: 'Akses Dasbor & Statistik', description: 'Melihat ringkasan KPI, grafik aktivitas, dan peta sebaran.' },
      { key: 'scope.all_brands', label: 'Akses Lintas Semua Brand', description: 'Melihat data seluruh brand. Jika nonaktif, data terisolasi ke brand milik akun.' },
      { key: 'scans.view', label: 'Pantau Aktivitas Scan', description: 'Membuka log pemindaian QR, status keaslian, dan detail telemetri GPS.' },
    ],
  },
  {
    id: 'master',
    title: 'Master Data (Brand, Kategori & SKU)',
    permissions: [
      { key: 'brands.view', label: 'Lihat Daftar Brand', description: 'Membuka menu Brand / Merk dan melihat profil mitra.' },
      { key: 'brands.manage', label: 'Kelola Brand (Tambah/Ubah/Hapus)', description: 'Menambah, mengubah profil, menonaktifkan, atau menghapus brand.' },
      { key: 'categories.view', label: 'Lihat Kategori Produk', description: 'Membuka struktur kategori produk 3 level.' },
      { key: 'categories.manage', label: 'Kelola Kategori & Spesifikasi', description: 'Menambah, mengubah, menghapus kategori serta skema spesifikasinya.' },
      { key: 'sku.view', label: 'Lihat Katalog SKU', description: 'Membuka daftar SKU produk dan detail spesifikasi.' },
      { key: 'sku.manage', label: 'Kelola SKU Produk', description: 'Menambah, menyunting, dan menghapus SKU produk.' },
    ],
  },
  {
    id: 'tags',
    title: 'Batch Tag & QR Code',
    permissions: [
      { key: 'batches.view', label: 'Lihat Batch & Serial Tag', description: 'Membuka daftar batch, detail serial tag, dan riwayat audit batch.' },
      { key: 'batches.create', label: 'Buat Batch Tag Baru', description: 'Menerbitkan batch serial tag & kode PIN baru.' },
      { key: 'batches.allocate', label: 'Alokasi Proyek Fisik (B2B)', description: 'Mengalokasikan, menyunting, atau membatalkan alokasi serial tag ke proyek (khusus brand/batch B2B).' },
      { key: 'batches.redirect_url', label: 'Ubah URL & Kebijakan QR', description: 'Mengubah URL tujuan pengalihan QR, PIN wajib, dan pelacakan GPS.' },
      { key: 'batches.suspend', label: 'Suspend / Pulihkan Batch', description: 'Menangguhkan sementara atau mengaktifkan kembali status batch.' },
      { key: 'batches.delete', label: 'Hapus Batch Tag', description: 'Menghapus permanen batch beserta seluruh serial tag di dalamnya.' },
    ],
  },
  {
    id: 'admin',
    title: 'Pengguna, Notifikasi & Pengaturan Sistem',
    permissions: [
      { key: 'users.view', label: 'Lihat Daftar Pengguna', description: 'Membuka halaman daftar akun pengguna dan status akses.' },
      { key: 'users.manage', label: 'Kelola Pengguna & Reset Sandi', description: 'Membuat/edit akun pengguna non-Super Admin dan menyetujui permohonan reset sandi (matriks hak akses tetap khusus Super Admin).' },
      { key: 'settings.view', label: 'Lihat Pengaturan Sistem', description: 'Membuka halaman pengaturan telemetri, anomali, dan cadangan.' },
      { key: 'settings.manage', label: 'Ubah Pengaturan & Cadangan Data', description: 'Menyimpan konfigurasi sistem, unduh cadangan, dan pulihkan database.' },
      { key: 'notifications.manage', label: 'Kelola Notifikasi Sistem', description: 'Menandai notifikasi dan menindaklanjuti peringatan sistem.' },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionKey[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

export const DEFAULT_ROLE_PERMISSIONS: RbacMatrix = {
  'Super Admin': [...ALL_PERMISSIONS],
  'Admin Brand': [
    'dashboard.view',
    'brands.view',
    'sku.view',
    'batches.view',
    'batches.allocate',
    'scans.view',
    'notifications.manage',
  ],
};

export function normalizeRole(role?: string | null): RoleName {
  const raw = String(role || '').trim().toLowerCase();
  if (raw === 'super admin' || raw === 'administrator' || raw === 'admin') return 'Super Admin';
  return 'Admin Brand';
}

export function mergeRbacMatrix(stored?: Partial<Record<string, unknown>> | null): RbacMatrix {
  const validSet = new Set<string>(ALL_PERMISSIONS);
  const result: RbacMatrix = {
    'Super Admin': [...ALL_PERMISSIONS],
    'Admin Brand': [...DEFAULT_ROLE_PERMISSIONS['Admin Brand']],
  };

  if (!stored || typeof stored !== 'object') return result;

  const candidate = stored['Admin Brand'] ?? stored['Pengelola Brand'] ?? stored['Operator'];
  if (Array.isArray(candidate)) {
    result['Admin Brand'] = Array.from(
      new Set(candidate.filter((p): p is PermissionKey => typeof p === 'string' && validSet.has(p)))
    );
  }
  return result;
}

export function getPermissionsForRole(role?: string | null, matrix?: RbacMatrix | null): PermissionKey[] {
  const normalized = normalizeRole(role);
  if (normalized === 'Super Admin') return [...ALL_PERMISSIONS];
  const source = matrix || DEFAULT_ROLE_PERMISSIONS;
  return Array.isArray(source[normalized]) ? source[normalized] : DEFAULT_ROLE_PERMISSIONS[normalized];
}

export function hasPermission(
  role: string | null | undefined,
  permission: PermissionKey,
  matrix?: RbacMatrix | null
): boolean {
  const normalized = normalizeRole(role);
  if (normalized === 'Super Admin') return true;
  const perms = getPermissionsForRole(normalized, matrix);
  return perms.includes(permission);
}

export type AppMenuId =
  | 'dashboard'
  | 'brand'
  | 'category'
  | 'sku'
  | 'tag-qr'
  | 'scan'
  | 'users'
  | 'settings';

export function canAccessMenu(
  role: string | null | undefined,
  menu: AppMenuId,
  matrix?: RbacMatrix | null
): boolean {
  switch (menu) {
    case 'dashboard':
      return hasPermission(role, 'dashboard.view', matrix);
    case 'brand':
      return hasPermission(role, 'brands.view', matrix) || hasPermission(role, 'brands.manage', matrix);
    case 'category':
      return hasPermission(role, 'categories.view', matrix) || hasPermission(role, 'categories.manage', matrix);
    case 'sku':
      return hasPermission(role, 'sku.view', matrix) || hasPermission(role, 'sku.manage', matrix);
    case 'tag-qr':
      return hasPermission(role, 'batches.view', matrix) || hasPermission(role, 'batches.create', matrix);
    case 'scan':
      return hasPermission(role, 'scans.view', matrix);
    case 'users':
      return true;
    case 'settings':
      return hasPermission(role, 'settings.view', matrix) || hasPermission(role, 'settings.manage', matrix);
    default:
      return false;
  }
}
