import crypto from 'crypto';
import { initialScanPoints } from './data/scanTelemetryData.ts';

export function hashPassword(password: string): string {
  if (!password || !password.trim()) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password.trim(), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function seedComprehensiveData(db: any) {
  const defaultPassword = hashPassword('SumasPass2026!');

  // 1. OVERHAUL USERS (15 records)
  const users = [
    { id: 'u1', name: 'Kalingga Jeandy', username: 'kalingga.jeandy', email: 'kalinggajeandy3@gmail.com', phone: '+62 812-8899-1020', role: 'Administrator', avatar: '/assets/avatars/user_kalingga.svg', status: 'Aktif', createdAt: '28 Okt 2026, 08:30' },
    { id: 'u2', name: 'Budi Santoso', username: 'budi.santoso', email: 'budi.s@sumas.id', phone: '+62 813-7722-3344', role: 'Operator', avatar: '/assets/avatars/user_budi.svg', status: 'Aktif', createdAt: '28 Okt 2026, 09:15' },
    { id: 'u3', name: 'Rina Wijaya', username: 'rina.wijaya', email: 'rina.w@sumas.id', phone: '+62 821-4455-6677', role: 'Operator', avatar: '/assets/avatars/user_rina.svg', status: 'Aktif', createdAt: '28 Okt 2026, 10:00' },
    { id: 'u4', name: 'Siti Rahma', username: 'siti.rahma', email: 'siti.r@sumas.id', phone: '+62 811-9988-7766', role: 'Operator', avatar: '/assets/avatars/user_siti.svg', status: 'Aktif', createdAt: '28 Okt 2026, 11:30' },
    { id: 'u5', name: 'Dimas Pratama', username: 'dimas.pratama', email: 'dimas.p@sumas.id', phone: '+62 815-6677-8899', role: 'Auditor', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '29 Okt 2026, 08:00' },
    { id: 'u6', name: 'Dewi Lestari', username: 'dewi.lestari', email: 'dewi.l@sumas.id', phone: '+62 817-2233-4455', role: 'Administrator', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '29 Okt 2026, 09:10' },
    { id: 'u7', name: 'Hendra Gunawan', username: 'hendra.gunawan', email: 'hendra.g@sumas.id', phone: '+62 818-3344-5566', role: 'Operator', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '29 Okt 2026, 10:20' },
    { id: 'u8', name: 'Maya Anggraini', username: 'maya.anggraini', email: 'maya.a@sumas.id', phone: '+62 819-4455-6677', role: 'Viewer', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '30 Okt 2026, 08:45' },
    { id: 'u9', name: 'Farhan Nugraha', username: 'farhan.nugraha', email: 'farhan.n@sumas.id', phone: '+62 812-5566-7788', role: 'Operator', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '30 Okt 2026, 09:30' },
    { id: 'u10', name: 'Anisa Putri', username: 'anisa.putri', email: 'anisa.p@sumas.id', phone: '+62 813-6677-8899', role: 'Auditor', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '30 Okt 2026, 11:15' },
    { id: 'u11', name: 'Reza Firmansyah', username: 'reza.firmansyah', email: 'reza.f@sumas.id', phone: '+62 821-7788-9900', role: 'Operator', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '31 Okt 2026, 09:00' },
    { id: 'u12', name: 'Citra Wulandari', username: 'citra.wulandari', email: 'citra.w@sumas.id', phone: '+62 811-2233-4455', role: 'Viewer', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '31 Okt 2026, 10:45' },
    { id: 'u13', name: 'Aditya Wardhana', username: 'aditya.wardhana', email: 'aditya.w@sumas.id', phone: '+62 815-3344-5566', role: 'Operator', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '01 Nov 2026, 08:30' },
    { id: 'u14', name: 'Nabila Salsabila', username: 'nabila.salsabila', email: 'nabila.s@sumas.id', phone: '+62 817-4455-6677', role: 'Operator', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '01 Nov 2026, 10:15' },
    { id: 'u15', name: 'Fajar Ramadhan', username: 'fajar.ramadhan', email: 'fajar.r@sumas.id', phone: '+62 818-5566-7788', role: 'Administrator', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80', status: 'Aktif', createdAt: '01 Nov 2026, 13:00' }
  ];

  db.prepare('DELETE FROM users').run();
  const insertUser = db.prepare(`
    INSERT INTO users (id, name, username, email, phone, role, avatar, status, createdAt, password)
    VALUES (@id, @name, @username, @email, @phone, @role, @avatar, @status, @createdAt, @password)
  `);
  for (const u of users) {
    insertUser.run({ ...u, password: defaultPassword });
  }

  // 2. OVERHAUL CATEGORIES (SUMAS Architectural & Partisi + Skincare & Dermo-Cosmetics)
  db.prepare('DELETE FROM categories').run();
  const insertCategory = db.prepare(`
    INSERT INTO categories (id, name, parentId, level, code, description, status, itemCount, orderIndex, createdAt, specSchema)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialCategories = [
    // === LEVEL 1: KATEGORI UTAMA ===
    { id: 'cat-sumas', name: 'SUMAS Architectural & Partisi', parentId: null, level: 1, code: 'SMS-B2B', description: 'Sistem partisi toilet komersial, phenolic board tahan air, dan hardware arsitektural SUMAS', status: 'Aktif', itemCount: 3, orderIndex: 1, createdAt: '2026-10-01', specSchema: null },
    { id: 'cat-skincare', name: 'Skincare & Dermo-Cosmetics', parentId: null, level: 1, code: 'SKN-RET', description: 'Produk perawatan kulit wajah & tubuh, serum aktif, dermo-cosmetics bersertifikasi BPOM', status: 'Aktif', itemCount: 12, orderIndex: 2, createdAt: '2026-10-02', specSchema: null },

    // === LEVEL 2: SUB-KATEGORI SUMAS ===
    { id: 'cat-sumas-cubicle', name: 'Partisi Cubicle Toilet', parentId: 'cat-sumas', level: 2, code: 'SMS-CUB', description: 'Sistem partisi kubikal toilet modern fasilitas publik, bandara, mall, dan rumah sakit', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-05', specSchema: null },
    { id: 'cat-sumas-hardware', name: 'Aksesoris & Hardware SUS 304', parentId: 'cat-sumas', level: 2, code: 'SMS-HDW', description: 'Engsel gravity, kunci indikator keterisian, handle, dan bracket stainless steel SUS 304', status: 'Aktif', itemCount: 1, orderIndex: 2, createdAt: '2026-10-06', specSchema: null },
    { id: 'cat-sumas-cladding', name: 'Wall Cladding & Panel Phenolic', parentId: 'cat-sumas', level: 2, code: 'SMS-CLD', description: 'Panel phenolic tahan air, tahan api, dan pelapis estetika arsitektur gedung', status: 'Aktif', itemCount: 0, orderIndex: 3, createdAt: '2026-10-07', specSchema: null },

    // === LEVEL 2: SUB-KATEGORI SKINCARE ===
    { id: 'cat-skin-serum', name: 'Serum & Ampoule', parentId: 'cat-skincare', level: 2, code: 'SKN-SRM', description: 'Serum wajah konsentrat tinggi, pencerah noda hitam, retinol anti-aging, dan barrier booster', status: 'Aktif', itemCount: 4, orderIndex: 1, createdAt: '2026-10-08', specSchema: null },
    { id: 'cat-skin-cleanser', name: 'Facial Cleanser & Micellar', parentId: 'cat-skincare', level: 2, code: 'SKN-CLN', description: 'Pembersih wajah low-pH gentle cleanser, cleansing foam, dan micellar water pembersih pori', status: 'Aktif', itemCount: 1, orderIndex: 2, createdAt: '2026-10-09', specSchema: null },
    { id: 'cat-skin-moist', name: 'Moisturizer & Barrier Cream', parentId: 'cat-skincare', level: 2, code: 'SKN-MST', description: 'Pelembap wajah gel ceramide, hidrasi mendalam hyaluronic acid, dan soothing moisture cream', status: 'Aktif', itemCount: 3, orderIndex: 3, createdAt: '2026-10-10', specSchema: null },
    { id: 'cat-skin-sun', name: 'Sunscreen & UV Defense', parentId: 'cat-skincare', level: 2, code: 'SKN-SUN', description: 'Tabir surya harian broad-spectrum SPF 50+ PA++++ tekstur seringan air tanpa whitecast', status: 'Aktif', itemCount: 2, orderIndex: 4, createdAt: '2026-10-11', specSchema: null },
    { id: 'cat-skin-toner', name: 'Toner & Essence', parentId: 'cat-skincare', level: 2, code: 'SKN-TNR', description: 'Hydrating toner, clarifying exfoliation toner BHA/AHA, dan skin essence penyeimbang pH', status: 'Aktif', itemCount: 3, orderIndex: 5, createdAt: '2026-10-12', specSchema: null },
    { id: 'cat-skin-body', name: 'Body Care & Body Lotion', parentId: 'cat-skincare', level: 2, code: 'SKN-BDY', description: 'Body lotion pencerah dengan UV filter, nourishing body serum, dan brightening body scrub', status: 'Aktif', itemCount: 0, orderIndex: 6, createdAt: '2026-10-13', specSchema: null },

    // === LEVEL 3: SUB-SUB KATEGORI SUMAS ===
    { id: 'cat-sumas-phn12', name: 'Phenolic Board 12mm Standard', parentId: 'cat-sumas-cubicle', level: 3, code: 'SMS-PHN12', description: 'Papan phenolic kompak 12mm solid core densitas 1450 kg/m³ tahan air 100% dan benturan', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-14', specSchema: null },
    { id: 'cat-sumas-glass', name: 'Glass Cubicle System 10mm', parentId: 'cat-sumas-cubicle', level: 3, code: 'SMS-GLS10', description: 'Partisi cubicle kaca tempered premium 10mm untuk fasilitas eksekutif dan hotel bintang lima', status: 'Aktif', itemCount: 0, orderIndex: 2, createdAt: '2026-10-15', specSchema: null },

    // === LEVEL 3: SUB-SUB KATEGORI SKINCARE ===
    { id: 'cat-skin-niac', name: 'Niacinamide & Brightening Serum', parentId: 'cat-skin-serum', level: 3, code: 'SKN-NIA', description: 'Serum pencerah kulit dengan Niacinamide konsentrasi 5%-10% dan ekstrak alami pemudar flek', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-16', specSchema: null },
    { id: 'cat-skin-ret', name: 'Retinol & Anti-Aging Serum', parentId: 'cat-skin-serum', level: 3, code: 'SKN-RET', description: 'Serum regenerasi sel, peremajaan tekstur kulit dan pendorong kolagen alami', status: 'Aktif', itemCount: 1, orderIndex: 2, createdAt: '2026-10-17', specSchema: null },
    { id: 'cat-skin-crm', name: 'Ceramide Barrier Cream', parentId: 'cat-skin-moist', level: 3, code: 'SKN-CRM', description: 'Formula penguat skin barrier dengan 5 tipe Ceramide esensial dan Centella Asiatica', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-18', specSchema: null },
    { id: 'cat-skin-spf50', name: 'Broad Spectrum SPF 50+ PA++++', parentId: 'cat-skin-sun', level: 3, code: 'SKN-SPF', description: 'Perlindungan maksimal terhadap sinar UVA & UVB dengan formulasi ringan cepat meresap', status: 'Aktif', itemCount: 2, orderIndex: 1, createdAt: '2026-10-19', specSchema: null }
  ];

  for (const c of initialCategories) {
    insertCategory.run(c.id, c.name, c.parentId, c.level, c.code, c.description, c.status, c.itemCount, c.orderIndex, c.createdAt, c.specSchema);
  }

  // 3. OVERHAUL BRANDS (15 records: SUMAS + 14 Skincare Brands)
  const brands = [
    {
      id: 'br-sumas',
      name: 'Sumas',
      logo: '/assets/brand/logo_horizontal.svg',
      ownerId: 'u1',
      ownerName: 'Kalingga Jeandy',
      ownerEmail: 'kalinggajeandy3@gmail.com',
      ownerRole: 'Administrator',
      description: 'Material partisi cubicle toilet, phenolic board tahan air & benturan untuk proyek rumah sakit, bandara, mall, dan fasilitas komersial publik.',
      category: 'SUMAS Architectural & Partisi',
      status: 'Aktif',
      createdAt: '28 Okt 2026, 09:00'
    },
    {
      id: 'br-somethinc',
      name: 'Somethinc',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%232b3990"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">ST</text></svg>',
      ownerId: 'u4',
      ownerName: 'Siti Rahma',
      ownerEmail: 'siti.r@sumas.id',
      ownerRole: 'Operator',
      description: 'Brand skincare & kosmetik terkemuka Indonesia dengan formulasi aktif teruji klinis dan sistem verifikasi QR anti-counterfeit konsumen.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '28 Okt 2026, 10:00'
    },
    {
      id: 'br-avoskin',
      name: 'Avoskin',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%233a5a40"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">AV</text></svg>',
      ownerId: 'u2',
      ownerName: 'Budi Santoso',
      ownerEmail: 'budi.s@sumas.id',
      ownerRole: 'Operator',
      description: 'Pionir clean beauty di Indonesia dengan formulasi natural & active ingredients ramah lingkungan berseri serial autentikasi BPOM.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '28 Okt 2026, 11:15'
    },
    {
      id: 'br-skintific',
      name: 'Skintific',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%230284c7"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">SK</text></svg>',
      ownerId: 'u3',
      ownerName: 'Rina Wijaya',
      ownerEmail: 'rina.w@sumas.id',
      ownerRole: 'Operator',
      description: 'Formulasi paten TTE (Trilogy Triangle Effect) untuk pemulihan skin barrier cepat dengan teknologi tag QR tamper-proof.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '28 Okt 2026, 14:30'
    },
    {
      id: 'br-whitelab',
      name: 'Whitelab',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%230f172a"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">WL</text></svg>',
      ownerId: 'u9',
      ownerName: 'Farhan Nugraha',
      ownerEmail: 'farhan.n@sumas.id',
      ownerRole: 'Operator',
      description: 'Dermatologist tested brightening skincare dengan kandungan Niacinamide grade premium dan perlindungan serial verifikasi batch.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '29 Okt 2026, 09:20'
    },
    {
      id: 'br-originote',
      name: 'The Originote',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23059669"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">TO</text></svg>',
      ownerId: 'u7',
      ownerName: 'Hendra Gunawan',
      ownerEmail: 'hendra.g@sumas.id',
      ownerRole: 'Operator',
      description: 'Skincare berkualitas terjangkau dengan jutaan pengguna, dilengkapi proteksi barcode digital anti-tiruan pada kemasan botol & jar.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '29 Okt 2026, 11:45'
    },
    {
      id: 'br-wardah',
      name: 'Wardah',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%230d9488"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">WD</text></svg>',
      ownerId: 'u6',
      ownerName: 'Dewi Lestari',
      ownerEmail: 'dewi.l@sumas.id',
      ownerRole: 'Administrator',
      description: 'Pionir Halal Beauty & Dermo-Cosmetics terbesar di Indonesia dengan standar sertifikasi global dan verifikasi keaslian terdistribusi.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '29 Okt 2026, 14:00'
    },
    {
      id: 'br-azarine',
      name: 'Azarine',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23ea580c"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">AZ</text></svg>',
      ownerId: 'u11',
      ownerName: 'Reza Firmansyah',
      ownerEmail: 'reza.f@sumas.id',
      ownerRole: 'Operator',
      description: 'Suncare & herbal skin nutrition peraih penghargaan nasional dengan teknologi water-based sunscreen dan tag QR verifikasi toko resmi.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '30 Okt 2026, 08:30'
    },
    {
      id: 'br-truetoskin',
      name: 'True to Skin',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23db2777"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">TS</text></svg>',
      ownerId: 'u10',
      ownerName: 'Anisa Putri',
      ownerEmail: 'anisa.p@sumas.id',
      ownerRole: 'Auditor',
      description: 'Skincare minimalis berfokus pada single active ingredient seperti Bakuchiol dan Hyaluronic Acid dengan keamanan batch terverifikasi.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '30 Okt 2026, 10:15'
    },
    {
      id: 'br-studiotropik',
      name: 'Studio Tropik',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%237c3aed"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">ST</text></svg>',
      ownerId: 'u5',
      ownerName: 'Dimas Pratama',
      ownerEmail: 'dimas.p@sumas.id',
      ownerRole: 'Auditor',
      description: 'Spesialis priming water, setting spray, dan skin prep inovatif untuk iklim tropis dengan pengawasan nomor batch digital.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '30 Okt 2026, 13:00'
    },
    {
      id: 'br-dearme',
      name: 'Dear Me Beauty',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23e11d48"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">DM</text></svg>',
      ownerId: 'u14',
      ownerName: 'Nabila Salsabila',
      ownerEmail: 'nabila.s@sumas.id',
      ownerRole: 'Operator',
      description: 'Hybrid skincare multipurpose ramah kulit sensitif dengan proteksi hologram anti-counterfeit dan pelacakan QR retail.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '31 Okt 2026, 09:15'
    },
    {
      id: 'br-npure',
      name: 'NPURE',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2316a34a"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">NP</text></svg>',
      ownerId: 'u13',
      ownerName: 'Aditya Wardhana',
      ownerEmail: 'aditya.w@sumas.id',
      ownerRole: 'Operator',
      description: 'Skincare bahan alami lokal daun Centella Asiatica dan bunga Marigold asli Indonesia dengan autentikasi barcode batch pabrik.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '31 Okt 2026, 11:30'
    },
    {
      id: 'br-biobeautylab',
      name: 'Bio Beauty Lab',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23d97706"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">BB</text></svg>',
      ownerId: 'u8',
      ownerName: 'Maya Anggraini',
      ownerEmail: 'maya.a@sumas.id',
      ownerRole: 'Viewer',
      description: 'Minyak perawatan wajah mewah (luxurious facial treatment oil) dengan segel digital pembuktian keaslian bagi pengguna.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 08:45'
    },
    {
      id: 'br-lacoco',
      name: 'Lacoco',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%234f46e5"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">LC</text></svg>',
      ownerId: 'u12',
      ownerName: 'Citra Wulandari',
      ownerEmail: 'citra.w@sumas.id',
      ownerRole: 'Viewer',
      description: 'Perawatan kulit intensif formulasi Eropa-Asia En Nature dengan perlindungan PIN verifikasi produk premium bersertifikat BPOM.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 10:30'
    },
    {
      id: 'br-hadalabo',
      name: 'Hada Labo',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%232563eb"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">HL</text></svg>',
      ownerId: 'u15',
      ownerName: 'Fajar Ramadhan',
      ownerEmail: 'fajar.r@sumas.id',
      ownerRole: 'Administrator',
      description: 'Filosofi hidrasi kulit Rohto Tokyo dengan multi-molecular Hyaluronic Acid dan sistem anti-pemalsuan retail berskala nasional.',
      category: 'Skincare & Dermo-Cosmetics',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 12:00'
    }
  ];

  db.prepare('DELETE FROM brands').run();
  const insertBrand = db.prepare(`
    INSERT INTO brands (id, name, logo, ownerId, ownerName, ownerEmail, ownerRole, description, category, status, createdAt)
    VALUES (@id, @name, @logo, @ownerId, @ownerName, @ownerEmail, @ownerRole, @description, @category, @status, @createdAt)
  `);
  for (const b of brands) {
    insertBrand.run(b);
  }

  // 4. OVERHAUL PRODUCTS (15 SKUs: SUMAS B2B Products + Popular Skincare Products)
  const products = [
    {
      id: 'p1',
      brandId: 'br-sumas',
      brandName: 'Sumas',
      sku: 'Pintu Cubicle Toilet',
      skuCode: 'SMS-CUB-01',
      category: 'SUMAS Architectural & Partisi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 09:30',
      description: `Panel pintu cubicle toilet phenolic resin 12mm solid core tahan air 100%, anti-bakteri, dan tahan benturan untuk fasilitas publik komersial.

Ketebalan: 12 mm | Material: High Density Solid Phenolic Resin | Finishing: Matte Anti-Scratch | Dimensi: 600 x 1800 mm | Standar Uji: ISO 4586-2 Water Resistant`
    },
    {
      id: 'p2',
      brandId: 'br-sumas',
      brandName: 'Sumas',
      sku: 'Phenolic Board 12mm Standard',
      skuCode: 'SMS-PHN-02',
      category: 'SUMAS Architectural & Partisi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 09:40',
      description: `Lembaran phenolic board high density solid core untuk sekat partisi cubicle tahan air dan kelembapan ekstrem.

Ketebalan: 12 mm | Berat Jenis: 1450 kg/m³ | Ketahanan Api: Class B1 Flame Retardant | Ukuran Sheet: 1220 x 2440 mm | Warna: Light Grey Textured`
    },
    {
      id: 'p3',
      brandId: 'br-sumas',
      brandName: 'Sumas',
      sku: 'Cubicle Hardware Set Stainless 304',
      skuCode: 'SMS-HDW-03',
      category: 'SUMAS Architectural & Partisi > Aksesoris & Hardware SUS 304',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 09:45',
      description: `Set aksesoris cubicle lengkap engsel gravity automatic closing, lock set indikator keterisian, handle knob, dan adjustable leg.

Material: Stainless Steel SUS 304 | Isi Paket: 2 Engsel, 1 Kunci Indikator, 2 Kaki Penopang, 1 Handle | Finishing: Satin Hairline Brushed | Garansi: 5 Tahun Anti Karat`
    },
    {
      id: 'p4',
      brandId: 'br-somethinc',
      brandName: 'Somethinc',
      sku: '5% Niacinamide + Moisture Sabi Beet Serum',
      skuCode: 'SMT-SRM-04',
      category: 'Skincare & Dermo-Cosmetics > Serum & Ampoule > Niacinamide & Brightening Serum',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 10:15',
      description: `Serum pencerah kulit dengan kandungan 5% Niacinamide dipadukan dengan SabiWhite® (ekstrak kunyit) dan Beet Extract untuk memudarkan noda hitam serta memperkuat skin barrier.

Isi Bersih: 20 ml | Formulasi: Water-based Non-Sticky | Sertifikasi: BPOM NA18201901839 & Halal MUI | Kemasan: Dropper Bottle dengan QR Segel`
    },
    {
      id: 'p5',
      brandId: 'br-avoskin',
      brandName: 'Avoskin',
      sku: 'Miraculous Retinol Toner 100ml',
      skuCode: 'AVO-TNR-05',
      category: 'Skincare & Dermo-Cosmetics > Toner & Essence',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1608248597359-0f0f917b2b73?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 11:30',
      description: `Toner anti-aging dengan kandungan 1% Actosome Retinol, Peptide, Pomegranate, dan Niacinamide untuk memicu pergantian sel kulit mati dan elastisitas kulit.

Ukuran: 100 ml | Jenis Kulit: Semua jenis kulit dewasa | Cara Pakai: Malam hari secara berkala | BPOM: NA18201206132 | Tag QR: Tamper-proof Label`
    },
    {
      id: 'p6',
      brandId: 'br-skintific',
      brandName: 'Skintific',
      sku: '5X Ceramide Barrier Moisture Gel 30g',
      skuCode: 'SKT-MST-06',
      category: 'Skincare & Dermo-Cosmetics > Moisturizer & Barrier Cream > Ceramide Barrier Cream',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 14:45',
      description: `Pelembap gel ringan dengan 5 tipe Ceramide berbeda (NP, NS, AS, EOP, AP) yang meniru struktur skin barrier manusia, diperkaya Centella Asiatica dan Hyaluronic Acid.

Berat: 30 gram | Tekstur: Water-gel Melting | BPOM: NA11210100167 | Fitur Anti-Fake: QR Hologram pada segel kotak luar`
    },
    {
      id: 'p7',
      brandId: 'br-whitelab',
      brandName: 'Whitelab',
      sku: 'Brightening Face Serum Niacinamide 10%',
      skuCode: 'WHL-SRM-07',
      category: 'Skincare & Dermo-Cosmetics > Serum & Ampoule > Niacinamide & Brightening Serum',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1617897903246-719242758050?w=400&auto=format&fit=crop&q=80',
      createdAt: '29 Okt 2026, 09:40',
      description: `Serum konsentrat pencerah dengan 10% Niacinamide, HyaluComplex-10, dan Marine Collagen yang mencerahkan kulit kusam secara merata.

Ukuran: 20 ml | Target: Hiperpigmentasi & Noda Bekas Jerawat | BPOM: NA18211901142 | Fitur Keamanan: Nomor Serial Unik & PIN Verifikasi`
    },
    {
      id: 'p8',
      brandId: 'br-originote',
      brandName: 'The Originote',
      sku: 'Hyalucera Moisturizer Gel 50ml',
      skuCode: 'ORG-MST-08',
      category: 'Skincare & Dermo-Cosmetics > Moisturizer & Barrier Cream',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=400&auto=format&fit=crop&q=80',
      createdAt: '29 Okt 2026, 12:00',
      description: `Moisturizer bening gel dengan perpaduan Hyaluron, Ceramide, dan Chlorelina untuk hidrasi maksimal tanpa rasa lengket pada kulit berminyak.

Isi Bersih: 50 ml | Formulasi: Oil-free Soothing Gel | BPOM: NA18210111962 | Pelindung Kemasan: Barcode QR Verifikasi Otentisitas`
    },
    {
      id: 'p9',
      brandId: 'br-wardah',
      brandName: 'Wardah',
      sku: 'UV Shield Essential Sunscreen Gel SPF 50',
      skuCode: 'WRD-SUN-09',
      category: 'Skincare & Dermo-Cosmetics > Sunscreen & UV Defense > Broad Spectrum SPF 50+ PA++++',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1598452963314-b09f397a5c48?w=400&auto=format&fit=crop&q=80',
      createdAt: '29 Okt 2026, 14:15',
      description: `Sunscreen gel SPF 50 PA++++ dengan proteksi menyeluruh terhadap sinar UVA, UVB, dan blue light, diperkaya Vitamin C & Glutathione.

Netto: 40 ml | Tekstur: Ringan Bebas Alkohol & Paraben | Sertifikat: Halal Grade A & BPOM NA18231700201 | Keamanan: Segel Anti-Palsu`
    },
    {
      id: 'p10',
      brandId: 'br-azarine',
      brandName: 'Azarine',
      sku: 'Hydrasoothe Sunscreen Gel SPF 45 PA++++',
      skuCode: 'AZR-SUN-10',
      category: 'Skincare & Dermo-Cosmetics > Sunscreen & UV Defense',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&auto=format&fit=crop&q=80',
      createdAt: '30 Okt 2026, 08:45',
      description: `Tabir surya bertekstur gel air yang dingin dan cepat meresap dengan ekstrak propolis, lidah buaya, green tea, dan delima.

Ukuran: 50 ml | Bebas Minyak & Silikon | BPOM: NA18201700868 | Verifikasi: Dynamic QR Code Resmi Pabrik`
    },
    {
      id: 'p11',
      brandId: 'br-truetoskin',
      brandName: 'True to Skin',
      sku: 'Bakuchiol Anti-Aging Miracle Serum 20ml',
      skuCode: 'TTS-SRM-11',
      category: 'Skincare & Dermo-Cosmetics > Serum & Ampoule > Retinol & Anti-Aging Serum',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&auto=format&fit=crop&q=80',
      createdAt: '30 Okt 2026, 10:30',
      description: `Serum alternatif retinol alami berbahan dasar 1% Bakuchiol murni dan Probiotics yang aman digunakan bagi ibu hamil dan menyusui.

Ukuran: 20 ml | Target: Garis Halus & Tekstur Kulit Kasar | BPOM: NA18202000388 | Garansi: Autentisitas Terdaftar Cloud`
    },
    {
      id: 'p12',
      brandId: 'br-studiotropik',
      brandName: 'Studio Tropik',
      sku: 'Herbitus Skin Tonic 100ml',
      skuCode: 'STP-TNC-12',
      category: 'Skincare & Dermo-Cosmetics > Toner & Essence',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1608248597359-0f0f917b2b73?w=400&auto=format&fit=crop&q=80',
      createdAt: '30 Okt 2026, 13:20',
      description: `Toner penyegar formulasi herbal Centella Asiatica dan Mugwort yang meredakan kemerahan, menenangkan iritasi, serta menyeimbangkan sebum.

Isi: 100 ml | Jenis Kulit: Sensitif & Cenderung Berjerawat | BPOM: NA18211200389 | Fitur: Serial Tag Keamanan Digital`
    },
    {
      id: 'p13',
      brandId: 'br-dearme',
      brandName: 'Dear Me Beauty',
      sku: 'Skin Barrier Water Cream 30g',
      skuCode: 'DMB-MST-13',
      category: 'Skincare & Dermo-Cosmetics > Moisturizer & Barrier Cream > Ceramide Barrier Cream',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&auto=format&fit=crop&q=80',
      createdAt: '31 Okt 2026, 09:30',
      description: `Krim pelembap water-burst dengan 5% Niacinamide, Ceramide, dan Peptide yang melepaskan partikel kelembapan mikro saat diaplikasikan.

Berat: 30 gram | BPOM: NA18210100729 | Segel: Tamper-Evident Security Seal dengan QR Scan`
    },
    {
      id: 'p14',
      brandId: 'br-npure',
      brandName: 'NPURE',
      sku: 'Centella Asiatica Face Wash 100ml',
      skuCode: 'NPR-CLN-14',
      category: 'Skincare & Dermo-Cosmetics > Facial Cleanser & Micellar',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&auto=format&fit=crop&q=80',
      createdAt: '31 Okt 2026, 11:45',
      description: `Sabun pembersih wajah berbusa lembut dengan daun Centella Asiatica asli di dalam botol, Green Tea, dan Vitamin B3 untuk membersihkan kotoran.

Ukuran: 100 ml | pH Balanced 5.5 | BPOM: NA18201203883 | Perlindungan: Barcode Verifikasi Keaslian`
    },
    {
      id: 'p15',
      brandId: 'br-hadalabo',
      brandName: 'Hada Labo',
      sku: 'Gokujyun Premium Hyaluronic Acid Lotion',
      skuCode: 'HDL-LTN-15',
      category: 'Skincare & Dermo-Cosmetics > Toner & Essence',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1608248597359-0f0f917b2b73?w=400&auto=format&fit=crop&q=80',
      createdAt: '01 Nov 2026, 12:15',
      description: `Lotion hidrasi intensif dengan 7 tipe Hyaluronic Acid berbobot molekul variatif yang menembus hingga ke lapisan terdalam epidermis kulit.

Isi: 100 ml | Tekstur: Rich Essence | BPOM: NA18200108341 | Sertifikasi Resmi: Verifikasi Keaslian Distributor Nasional`
    }
  ];

  db.prepare('DELETE FROM products').run();
  const insertProduct = db.prepare(`
    INSERT INTO products (id, brandId, brandName, sku, category, isB2B, description, createdAt, skuCode, image)
    VALUES (@id, @brandId, @brandName, @sku, @category, @isB2B, @description, @createdAt, @skuCode, @image)
  `);
  for (const p of products) {
    insertProduct.run(p);
  }

  // 5. OVERHAUL BATCHES (15 Batches: SUMAS B2B with isB2B: 1 & real project allocations; Skincare Retail with isB2B: 0 & project: null)
  const batches = [
    { id: 'b1', batchId: 'SUMAS-BATCH-0001-10', date: '28 Okt 2026, 09:15', project: 'RS Kediri', sku: 'Pintu Cubicle Toilet', brand: 'Sumas', qty: 50, specs: 'Phenolic Board 12mm Standard', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b2', batchId: 'BATCH-SMT-082', date: '29 Okt 2026, 11:27', project: null, sku: '5% Niacinamide + Moisture Sabi Beet Serum', brand: 'Somethinc', qty: 250, specs: 'Niacinamide 5% + Sabi Beet 20ml', pinLength: 8, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b3', batchId: 'BATCH-AVO-041', date: '30 Okt 2026, 14:20', project: null, sku: 'Miraculous Retinol Toner 100ml', brand: 'Avoskin', qty: 150, specs: 'Actosome Retinol 1% 100ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b4', batchId: 'SUMAS-BATCH-0002-25', date: '31 Okt 2026, 10:00', project: 'IKN Gedung Kemenko', sku: 'Phenolic Board 12mm Standard', brand: 'Sumas', qty: 120, specs: 'High Density Solid Phenolic Resin', pinLength: 8, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b5', batchId: 'BATCH-SKT-104', date: '01 Nov 2026, 13:45', project: null, sku: '5X Ceramide Barrier Moisture Gel 30g', brand: 'Skintific', qty: 300, specs: '5X Ceramide + Centella Gel 30g', pinLength: 8, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b6', batchId: 'BATCH-WHL-058', date: '02 Nov 2026, 09:30', project: null, sku: 'Brightening Face Serum Niacinamide 10%', brand: 'Whitelab', qty: 200, specs: 'Niacinamide 10% + HyaluComplex 20ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b7', batchId: 'SUMAS-BATCH-0003-40', date: '02 Nov 2026, 11:15', project: 'Bandara Juanda T2 Surabaya', sku: 'Cubicle Hardware Set Stainless 304', brand: 'Sumas', qty: 200, specs: 'Stainless Steel SUS 304 Luxury', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b8', batchId: 'BATCH-ORG-012', date: '03 Nov 2026, 08:45', project: null, sku: 'Hyalucera Moisturizer Gel 50ml', brand: 'The Originote', qty: 400, specs: 'Hyaluron + Ceramide Gel 50ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b9', batchId: 'BATCH-WRD-008', date: '03 Nov 2026, 14:00', project: null, sku: 'UV Shield Essential Sunscreen Gel SPF 50', brand: 'Wardah', qty: 350, specs: 'Broad Spectrum SPF 50 PA++++ 40ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b10', batchId: 'BATCH-AZR-033', date: '04 Nov 2026, 10:10', project: null, sku: 'Hydrasoothe Sunscreen Gel SPF 45 PA++++', brand: 'Azarine', qty: 280, specs: 'Hydrasoothe Water Gel SPF 45 50ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b11', batchId: 'BATCH-TTS-019', date: '04 Nov 2026, 15:30', project: null, sku: 'Bakuchiol Anti-Aging Miracle Serum 20ml', brand: 'True to Skin', qty: 120, specs: 'Bakuchiol 1% + Probiotics 20ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b12', batchId: 'BATCH-STP-005', date: '05 Nov 2026, 09:20', project: null, sku: 'Herbitus Skin Tonic 100ml', brand: 'Studio Tropik', qty: 90, specs: 'Centella Asiatica + Mugwort 100ml', pinLength: 8, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b13', batchId: 'BATCH-DMB-014', date: '05 Nov 2026, 13:50', project: null, sku: 'Skin Barrier Water Cream 30g', brand: 'Dear Me Beauty', qty: 180, specs: 'Water Burst Barrier Cream 30g', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b14', batchId: 'BATCH-NPR-022', date: '06 Nov 2026, 11:00', project: null, sku: 'Centella Asiatica Face Wash 100ml', brand: 'NPURE', qty: 160, specs: 'Gentle Cleanser Centella Leaf 100ml', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b15', batchId: 'SUMAS-BATCH-0004-50', date: '06 Nov 2026, 16:15', project: 'PIK 2 Central Market', sku: 'Pintu Cubicle Toilet', brand: 'Sumas', qty: 150, specs: 'Phenolic Board 12mm Standard', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 }
  ];

  db.prepare('DELETE FROM batches').run();
  const insertBatch = db.prepare(`
    INSERT INTO batches (id, batchId, date, project, sku, brand, qty, specs, pinLength, status, isB2B, redirectUrl, qrType, requirePin, enableGps)
    VALUES (@id, @batchId, @date, @project, @sku, @brand, @qty, @specs, @pinLength, @status, @isB2B, @redirectUrl, @qrType, @requirePin, @enableGps)
  `);
  for (const b of batches) {
    insertBatch.run(b);
  }

  // 6. OVERHAUL TAGS (15 tags per batch = 225 tags total, all fields complete)
  db.prepare('DELETE FROM tags').run();
  const insertTag = db.prepare(`
    INSERT INTO tags (id, batchId, tagNumber, pin, status, project, specs, codeType, warranty, prodCode, note, allocatedAt)
    VALUES (@id, @batchId, @tagNumber, @pin, @status, @project, @specs, @codeType, @warranty, @prodCode, @note, @allocatedAt)
  `);

  const idChars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const pinDigits = '0123456789';
  const usedTagNumbers = new Set<string>();

  const insertAllTagsTx = db.transaction(() => {
    for (const b of batches) {
      const isSumasB2B = b.isB2B === 1 || b.brand.toLowerCase() === 'sumas';
      const brandPrefix = b.brand.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
      for (let i = 1; i <= 15; i++) {
        let tagNumber = '';
        do {
          let cand = '';
          for (let c = 0; c < 8; c++) cand += idChars.charAt(Math.floor(Math.random() * idChars.length));
          if (/[A-Z]/.test(cand) && /[0-9]/.test(cand)) tagNumber = cand;
        } while (!tagNumber || usedTagNumbers.has(tagNumber));
        usedTagNumbers.add(tagNumber);

        let pin = '';
        for (let p = 0; p < b.pinLength; p++) pin += pinDigits.charAt(Math.floor(Math.random() * pinDigits.length));

        // For SUMAS B2B batches, tags are allocated to B2B projects (first 8 tags allocated, remainder available).
        // For Retail batches, tags are consumer packaging verification tags (Tersedia / Siap Verifikasi) with NO project allocation.
        const isAllocated = isSumasB2B ? i <= 8 : false;

        insertTag.run({
          id: `tag-${b.id}-${tagNumber}`,
          batchId: b.id,
          tagNumber,
          pin,
          status: isAllocated ? 'Telah Digunakan' : 'Tersedia',
          project: isAllocated ? b.project : null,
          specs: b.specs || 'Standard Factory Spec',
          codeType: `${brandPrefix}-${isSumasB2B ? 'B2B' : 'RET'}-2026`,
          warranty: isSumasB2B ? '5 Tahun Garansi Resmi' : 'Garansi Keaslian BPOM Resmi',
          prodCode: `PRD-${brandPrefix}-${String(i).padStart(3, '0')}`,
          note: isAllocated
            ? `Pemasangan & verifikasi area proyek ${b.project}`
            : (isSumasB2B ? 'Unit partisi QC passed siap alokasi proyek' : 'Kemasan produk tersegel siap scan keaslian oleh konsumen'),
          allocatedAt: isAllocated ? b.date : null
        });
      }
    }
  });
  insertAllTagsTx();

  // 7. OVERHAUL SCAN POINTS (Per-Tag Individual Telemetry Records with PIN & Multi-Scan History)
  const scanPoints = initialScanPoints;

  db.prepare("DELETE FROM scan_points").run();
  const insertScanPoint = db.prepare(`
    INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, pin, latestTime, isB2B, status, anomalyReason, deviceInfo, scanHistory, createdAt)
    VALUES (@id, @city, @province, @venue, @lat, @lng, @totalScans, @todayScans, @brand, @productType, @batchId, @latestTagId, @pin, @latestTime, @isB2B, @status, @anomalyReason, @deviceInfo, @scanHistory, @createdAt)
  `);
  for (const sp of scanPoints) {
    insertScanPoint.run({
      ...sp,
      pin: sp.pin || "12345678",
      anomalyReason: sp.anomalyReason || null,
      isB2B: sp.brand.toLowerCase() === 'sumas' ? 1 : 0,
      createdAt: (sp as any).createdAt || "2026-11-07",
      scanHistory: JSON.stringify(sp.scanHistory || [])
    });
  }

  // 8. OVERHAUL SCAN ACTIVITIES (Chart timeline)
  db.prepare('DELETE FROM scan_activities').run();
  const insertActivity = db.prepare(`
    INSERT INTO scan_activities (rangeType, label, fullDate, scans, valid, topBrand, sortOrder)
    VALUES (@rangeType, @label, @fullDate, @scans, @valid, @topBrand, @sortOrder)
  `);

  const initialActivities = [
    // 7 Days
    { rangeType: '7d', label: 'Sen (26/10)', fullDate: '26 Okt 2026', scans: 520, valid: 519, topBrand: 'Sumas', sortOrder: 1 },
    { rangeType: '7d', label: 'Sel (27/10)', fullDate: '27 Okt 2026', scans: 680, valid: 679, topBrand: 'Somethinc', sortOrder: 2 },
    { rangeType: '7d', label: 'Rab (28/10)', fullDate: '28 Okt 2026', scans: 610, valid: 608, topBrand: 'Skintific', sortOrder: 3 },
    { rangeType: '7d', label: 'Kam (29/10)', fullDate: '29 Okt 2026', scans: 790, valid: 788, topBrand: 'Sumas', sortOrder: 4 },
    { rangeType: '7d', label: 'Jum (30/10)', fullDate: '30 Okt 2026', scans: 940, valid: 938, topBrand: 'Avoskin', sortOrder: 5 },
    { rangeType: '7d', label: 'Sab (31/10)', fullDate: '31 Okt 2026', scans: 1120, valid: 1118, topBrand: 'Somethinc', sortOrder: 6 },
    { rangeType: '7d', label: 'Min (01/11)', fullDate: '01 Nov 2026', scans: 860, valid: 859, topBrand: 'Whitelab', sortOrder: 7 },

    // 30 Days
    { rangeType: '30d', label: 'Minggu 1', fullDate: '01 - 07 Okt 2026', scans: 3450, valid: 3442, topBrand: 'Sumas', sortOrder: 1 },
    { rangeType: '30d', label: 'Minggu 2', fullDate: '08 - 14 Okt 2026', scans: 4120, valid: 4110, topBrand: 'Somethinc', sortOrder: 2 },
    { rangeType: '30d', label: 'Minggu 3', fullDate: '15 - 21 Okt 2026', scans: 4890, valid: 4881, topBrand: 'Sumas', sortOrder: 3 },
    { rangeType: '30d', label: 'Minggu 4', fullDate: '22 - 28 Okt 2026', scans: 5410, valid: 5402, topBrand: 'Skintific', sortOrder: 4 },
    { rangeType: '30d', label: 'Minggu 5', fullDate: '29 Okt - 01 Nov', scans: 2920, valid: 2915, topBrand: 'Somethinc', sortOrder: 5 },

    // 12 Months
    { rangeType: '12m', label: 'Jan', fullDate: 'Januari 2026', scans: 8900, valid: 8880, topBrand: 'Sumas', sortOrder: 1 },
    { rangeType: '12m', label: 'Feb', fullDate: 'Februari 2026', scans: 10400, valid: 10380, topBrand: 'Sumas', sortOrder: 2 },
    { rangeType: '12m', label: 'Mar', fullDate: 'Maret 2026', scans: 12100, valid: 12075, topBrand: 'Somethinc', sortOrder: 3 },
    { rangeType: '12m', label: 'Apr', fullDate: 'April 2026', scans: 11800, valid: 11770, topBrand: 'Avoskin', sortOrder: 4 },
    { rangeType: '12m', label: 'Mei', fullDate: 'Mei 2026', scans: 13900, valid: 13865, topBrand: 'Sumas', sortOrder: 5 },
    { rangeType: '12m', label: 'Jun', fullDate: 'Juni 2026', scans: 14500, valid: 14470, topBrand: 'Somethinc', sortOrder: 6 },
    { rangeType: '12m', label: 'Jul', fullDate: 'Juli 2026', scans: 15800, valid: 15760, topBrand: 'Skintific', sortOrder: 7 },
    { rangeType: '12m', label: 'Agt', fullDate: 'Agustus 2026', scans: 17200, valid: 17160, topBrand: 'Sumas', sortOrder: 8 },
    { rangeType: '12m', label: 'Sep', fullDate: 'September 2026', scans: 16900, valid: 16860, topBrand: 'Whitelab', sortOrder: 9 },
    { rangeType: '12m', label: 'Okt', fullDate: 'Oktober 2026', scans: 18492, valid: 18450, topBrand: 'Sumas', sortOrder: 10 },
    { rangeType: '12m', label: 'Nov', fullDate: 'November 2026', scans: 4820, valid: 4812, topBrand: 'Somethinc', sortOrder: 11 }
  ];

  for (const a of initialActivities) {
    insertActivity.run(a);
  }

  // 9. OVERHAUL AUDIT LOGS (15 records)
  const auditLogs = [
    {
      id: 1730260800000,
      batchId: 'SUMAS-BATCH-0001-10',
      timestamp: '29 Okt 2026, 10:20',
      user: 'Kalingga Jeandy',
      reason: 'Klien meminta penyesuaian ketebalan material karena standar kelembaban ruangan RS berubah.',
      changes: JSON.stringify([{ field: 'Spesifikasi', old: 'Phenolic Board 10mm', new: 'Phenolic Board 12mm Standard' }])
    },
    {
      id: 1730264400000,
      batchId: 'BATCH-SMT-082',
      timestamp: '29 Okt 2026, 14:15',
      user: 'Siti Rahma',
      reason: 'Penambahan alokasi stok untuk gerai Flagship Store Somethinc Grand Indonesia.',
      changes: JSON.stringify([{ field: 'Quantity', old: '200 Tag', new: '250 Tag' }])
    },
    {
      id: 1730350800000,
      batchId: 'BATCH-AVO-041',
      timestamp: '30 Okt 2026, 11:30',
      user: 'Budi Santoso',
      reason: 'Pembaruan alamat verifikasi QR Cloud Redirect ke domain keamanan resmi cek.sumas.id.',
      changes: JSON.stringify([{ field: 'Redirect URL', old: 'http://legacy.avoskin.id', new: 'https://cek.sumas.id/' }])
    },
    {
      id: 1730358000000,
      batchId: 'SUMAS-BATCH-0002-25',
      timestamp: '30 Okt 2026, 15:40',
      user: 'Kalingga Jeandy',
      reason: 'Pembaruan kode proyek konstruksi Gedung Kemenko IKN Nusantara.',
      changes: JSON.stringify([{ field: 'Proyek', old: 'IKN Kaltim Phase 1', new: 'IKN Gedung Kemenko' }])
    },
    {
      id: 1730437200000,
      batchId: 'BATCH-SKT-104',
      timestamp: '31 Okt 2026, 09:50',
      user: 'Dewi Lestari',
      reason: 'Pemberian nomor garansi resmi keaslian dan proteksi anti-counterfeit PIN 8 digit Skintific.',
      changes: JSON.stringify([{ field: 'PIN Length', old: '6 Digit', new: '8 Digit' }])
    },
    {
      id: 1730444400000,
      batchId: 'BATCH-WHL-058',
      timestamp: '31 Okt 2026, 14:20',
      user: 'Rina Wijaya',
      reason: 'Pemeriksaan kepatuhan standar BPOM kemasan serum Whitelab 20ml.',
      changes: JSON.stringify([{ field: 'Standar Mutu', old: 'BPOM Pending', new: 'BPOM NA18211901142' }])
    },
    {
      id: 1730523600000,
      batchId: 'BATCH-ORG-012',
      timestamp: '01 Nov 2026, 10:10',
      user: 'Hendra Gunawan',
      reason: 'Peningkatan kapasitas kuota tag kemasan gel The Originote untuk peluncuran Shopee Mall.',
      changes: JSON.stringify([{ field: 'Quantity', old: '300 Tag', new: '400 Tag' }])
    },
    {
      id: 1730530800000,
      batchId: 'BATCH-WRD-008',
      timestamp: '01 Nov 2026, 16:30',
      user: 'Farhan Nugraha',
      reason: 'Pembaruan catatan instruksi penyimpanan sunscreen Wardah UV Shield di gerai ritel.',
      changes: JSON.stringify([{ field: 'Catatan Batch', old: 'Suhu Kamar', new: 'Hindarkan dari Sinar Matahari Langsung' }])
    },
    {
      id: 1730610000000,
      batchId: 'BATCH-AZR-033',
      timestamp: '02 Nov 2026, 08:45',
      user: 'Dewi Lestari',
      reason: 'Verifikasi sertifikat SPF 45 PA++++ uji laboratorium independen Azarine.',
      changes: JSON.stringify([{ field: 'Rating SPF', old: 'SPF 30', new: 'SPF 45 PA++++ Water Gel' }])
    },
    {
      id: 1730617200000,
      batchId: 'BATCH-TTS-019',
      timestamp: '02 Nov 2026, 13:15',
      user: 'Budi Santoso',
      reason: 'Konfigurasi tag kemasan botol pipet Bakuchiol True to Skin.',
      changes: JSON.stringify([{ field: 'Tipe Label', old: 'Stiker Biasa', new: 'Tamper-Evident QR Label' }])
    },
    {
      id: 1730696400000,
      batchId: 'BATCH-STP-005',
      timestamp: '03 Nov 2026, 11:00',
      user: 'Hendra Gunawan',
      reason: 'Penambahan kuota tag botol Herbitus Skin Tonic Studio Tropik Sephora batch.',
      changes: JSON.stringify([{ field: 'Quantity', old: '60 Tag', new: '90 Tag' }])
    },
    {
      id: 1730703600000,
      batchId: 'BATCH-DMB-014',
      timestamp: '03 Nov 2026, 15:20',
      user: 'Anisa Putri',
      reason: 'Penerbitan laporan uji stabilitas tekstur water cream Dear Me Beauty.',
      changes: JSON.stringify([{ field: 'Hasil Uji', old: 'Uji Stabilitas', new: 'Lolos Uji Stabilitas 40°C' }])
    },
    {
      id: 1730782800000,
      batchId: 'SUMAS-BATCH-0004-50',
      timestamp: '04 Nov 2026, 09:30',
      user: 'Kalingga Jeandy',
      reason: 'Pemberian persetujuan alokasi batch partisi cubicle PIK 2 Central Market.',
      changes: JSON.stringify([{ field: 'Status Batch', old: 'Review', new: 'Aktif Produksi' }])
    },
    {
      id: 1730790000000,
      batchId: 'SUMAS-BATCH-0003-40',
      timestamp: '04 Nov 2026, 14:00',
      user: 'Dimas Pratama',
      reason: 'Audit fisik berkala material engsel stainless steel SUS 304 Bandara Juanda T2.',
      changes: JSON.stringify([{ field: 'Hasil Audit', old: 'Menunggu', new: 'Lulus Uji Ketahanan Korosi SUS 304' }])
    },
    {
      id: 1730876400000,
      batchId: 'BATCH-NPR-022',
      timestamp: '05 Nov 2026, 10:45',
      user: 'Budi Santoso',
      reason: 'Verifikasi pelabelan QR security hologram batch botol face wash daun Centella Asiatica.',
      changes: JSON.stringify([{ field: 'Label QR', old: 'Stiker Biasa', new: 'Hologram Tamper-Evident' }])
    }
  ];

  db.prepare('DELETE FROM audit_logs').run();
  const insertAuditLog = db.prepare(`
    INSERT INTO audit_logs (id, batchId, timestamp, user, reason, changes)
    VALUES (@id, @batchId, @timestamp, @user, @reason, @changes)
  `);
  for (const log of auditLogs) {
    insertAuditLog.run(log);
  }

  // 10. OVERHAUL PASSWORD RESET REQUESTS (15 records)
  const resetRequests = [
    { id: 'pr-1', userId: 'u2', userName: 'Budi Santoso', userEmail: 'budi.s@sumas.id', userRole: 'Operator', avatar: '/assets/avatars/user_budi.svg', requestedAt: '15 menit yang lalu', status: 'Menunggu', actionNote: 'Lupa kata sandi saat mencoba akses dari tablet lapangan proyek RSUD Kediri', isRead: 0 },
    { id: 'pr-2', userId: 'u4', userName: 'Siti Rahma', userEmail: 'siti.r@sumas.id', userRole: 'Operator', avatar: '/assets/avatars/user_siti.svg', requestedAt: '45 menit yang lalu', status: 'Menunggu', actionNote: 'Permintaan reset PIN dan kata sandi berkala perangkat brand operasional Somethinc', isRead: 0 },
    { id: 'pr-3', userId: 'u3', userName: 'Rina Wijaya', userEmail: 'rina.w@sumas.id', userRole: 'Operator', avatar: '/assets/avatars/user_rina.svg', requestedAt: '2 jam yang lalu', status: 'Disetujui', actionNote: 'Tautan reset sandi 1-kali pakai telah dikirim otomatis ke email terdaftar', isRead: 1 },
    { id: 'pr-4', userId: 'u5', userName: 'Dimas Pratama', userEmail: 'dimas.p@sumas.id', userRole: 'Auditor', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', requestedAt: '3 jam yang lalu', status: 'Disetujui', actionNote: 'Permintaan reset sandi diverifikasi melalui otentikasi dinas kantor', isRead: 1 },
    { id: 'pr-5', userId: 'u7', userName: 'Hendra Gunawan', userEmail: 'hendra.g@sumas.id', userRole: 'Operator', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80', requestedAt: '5 jam yang lalu', status: 'Selesai', actionNote: 'Sandi baru telah diaktifkan oleh pengguna secara mandiri', isRead: 1 },
    { id: 'pr-6', userId: 'u8', userName: 'Maya Anggraini', userEmail: 'maya.a@sumas.id', userRole: 'Viewer', avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=120&auto=format&fit=crop&q=80', requestedAt: 'Kemarin, 09:20', status: 'Selesai', actionNote: 'Sandi sementara telah direset dan diverifikasi', isRead: 1 },
    { id: 'pr-7', userId: 'u9', userName: 'Farhan Nugraha', userEmail: 'farhan.n@sumas.id', userRole: 'Operator', avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=120&auto=format&fit=crop&q=80', requestedAt: 'Kemarin, 11:45', status: 'Ditolak', actionNote: 'Permintaan ditolak karena pengguna salah memasukkan email verifikasi 3 kali berturut-turut', isRead: 1 },
    { id: 'pr-8', userId: 'u10', userName: 'Anisa Putri', userEmail: 'anisa.p@sumas.id', userRole: 'Auditor', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&auto=format&fit=crop&q=80', requestedAt: 'Kemarin, 14:10', status: 'Selesai', actionNote: 'Reset kata sandi berhasil diselesaikan melalui tautan email terenkripsi', isRead: 1 },
    { id: 'pr-9', userId: 'u11', userName: 'Reza Firmansyah', userEmail: 'reza.f@sumas.id', userRole: 'Operator', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80', requestedAt: 'Kemarin, 16:30', status: 'Menunggu', actionNote: 'Perangkat mobile diganti dengan handset baru kantor, menunggu verifikasi manajer', isRead: 0 },
    { id: 'pr-10', userId: 'u12', userName: 'Citra Wulandari', userEmail: 'citra.w@sumas.id', userRole: 'Viewer', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=120&auto=format&fit=crop&q=80', requestedAt: '2 hari yang lalu', status: 'Selesai', actionNote: 'Kata sandi berhasil diperbarui via self-service verification', isRead: 1 },
    { id: 'pr-11', userId: 'u13', userName: 'Aditya Wardhana', userEmail: 'aditya.w@sumas.id', userRole: 'Operator', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&auto=format&fit=crop&q=80', requestedAt: '2 hari yang lalu', status: 'Disetujui', actionNote: 'Disetujui oleh Administrator Kalingga Jeandy untuk reset kredensial darurat', isRead: 1 },
    { id: 'pr-12', userId: 'u14', userName: 'Nabila Salsabila', userEmail: 'nabila.s@sumas.id', userRole: 'Operator', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=120&auto=format&fit=crop&q=80', requestedAt: '3 hari yang lalu', status: 'Selesai', actionNote: 'Proses reset sandi selesai tanpa kendala teknis', isRead: 1 },
    { id: 'pr-13', userId: 'u15', userName: 'Fajar Ramadhan', userEmail: 'fajar.r@sumas.id', userRole: 'Administrator', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80', requestedAt: '4 hari yang lalu', status: 'Selesai', actionNote: 'Reset sandi administratif dengan otentikasi dua faktor (2FA)', isRead: 1 },
    { id: 'pr-14', userId: 'u6', userName: 'Dewi Lestari', userEmail: 'dewi.l@sumas.id', userRole: 'Administrator', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80', requestedAt: '5 hari yang lalu', status: 'Selesai', actionNote: 'Penyegaran kata sandi berkala triwulanan sesuai SOP keamanan perusahaan', isRead: 1 },
    { id: 'pr-15', userId: 'u1', userName: 'Kalingga Jeandy', userEmail: 'kalinggajeandy3@gmail.com', userRole: 'Administrator', avatar: '/assets/avatars/user_kalingga.svg', requestedAt: '6 hari yang lalu', status: 'Selesai', actionNote: 'Verifikasi keamanan akun Master Administrator selesai', isRead: 1 }
  ];

  db.prepare('DELETE FROM password_reset_requests').run();
  const insertResetReq = db.prepare(`
    INSERT INTO password_reset_requests (id, userId, userName, userEmail, userRole, avatar, requestedAt, status, actionNote, isRead)
    VALUES (@id, @userId, @userName, @userEmail, @userRole, @avatar, @requestedAt, @status, @actionNote, @isRead)
  `);
  for (const pr of resetRequests) {
    insertResetReq.run(pr);
  }
}
