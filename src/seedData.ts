import crypto from 'crypto';

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

  // 2. OVERHAUL BRANDS (15 records)
  const brands = [
    {
      id: 'br-sumas',
      name: 'Sumas',
      logo: '/assets/brand/logo_horizontal.svg',
      ownerId: 'u1',
      ownerName: 'Kalingga Jeandy',
      ownerEmail: 'kalinggajeandy3@gmail.com',
      ownerRole: 'Administrator',
      description: 'Material partisi cubicle toilet, phenolic board tahan air & benturan untuk proyek rumah sakit, bandara, mall, dan fasilitas komersial.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '28 Okt 2026, 09:00'
    },
    {
      id: 'br-assc',
      name: 'ASSC',
      logo: '/assets/brand/assc_logo.svg',
      ownerId: 'u4',
      ownerName: 'Siti Rahma',
      ownerEmail: 'siti.r@sumas.id',
      ownerRole: 'Operator',
      description: 'Lini streetwear retail eksklusif dengan sistem verifikasi QR code hologram anti-counterfeit dan PIN verifikasi publik.',
      category: 'Pakaian & Fashion',
      status: 'Aktif',
      createdAt: '23 Mei 2025, 10:00'
    },
    {
      id: 'br-blimey',
      name: 'BLIMEY!',
      logo: '/assets/brand/blimey_logo.svg',
      ownerId: 'u2',
      ownerName: 'Budi Santoso',
      ownerEmail: 'budi.s@sumas.id',
      ownerRole: 'Operator',
      description: 'Koleksi fashion premium & casual lifestyle dengan tag serial unik untuk garansi keaslian pakaian.',
      category: 'Pakaian & Fashion',
      status: 'Aktif',
      createdAt: '15 Jun 2025, 14:20'
    },
    {
      id: 'br-indosteel',
      name: 'IndoSteel Architectural',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%232b6cb0"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">IS</text></svg>',
      ownerId: 'u3',
      ownerName: 'Rina Wijaya',
      ownerEmail: 'rina.w@sumas.id',
      ownerRole: 'Operator',
      description: 'Komponen baja struktural, bracket penopang partisi, dan profil stainless SUS 304 tahan beban dinamis.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '28 Okt 2026, 10:30'
    },
    {
      id: 'br-aquatech',
      name: 'AquaTech Sanitary',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23319795"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">AT</text></svg>',
      ownerId: 'u7',
      ownerName: 'Hendra Gunawan',
      ownerEmail: 'hendra.g@sumas.id',
      ownerRole: 'Operator',
      description: 'Kran sensor otomatis cerdas, flush valve komersial, dan sistem sanitasi hemat air fasilitas publik.',
      category: 'Sanitasi & Perpipaan',
      status: 'Aktif',
      createdAt: '29 Okt 2026, 11:00'
    },
    {
      id: 'br-urbanfit',
      name: 'UrbanFit Apparel',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23805ad5"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">UF</text></svg>',
      ownerId: 'u9',
      ownerName: 'Farhan Nugraha',
      ownerEmail: 'farhan.n@sumas.id',
      ownerRole: 'Operator',
      description: 'Pakaian olahraga teknikal tahan gesek dan breathable dengan serial autentikasi perlindungan brand.',
      category: 'Pakaian & Fashion',
      status: 'Aktif',
      createdAt: '29 Okt 2026, 14:15'
    },
    {
      id: 'br-lumina',
      name: 'Lumina Architectural',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23d69e2e"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">LA</text></svg>',
      ownerId: 'u6',
      ownerName: 'Dewi Lestari',
      ownerEmail: 'dewi.l@sumas.id',
      ownerRole: 'Administrator',
      description: 'Sistem pencahayaan LED arsitektural komersial, track light museum, dan downlight hemat energi.',
      category: 'Elektronik & Smart Hardware',
      status: 'Aktif',
      createdAt: '30 Okt 2026, 09:00'
    },
    {
      id: 'br-modena',
      name: 'Modena Systems',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23c53030"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">MS</text></svg>',
      ownerId: 'u11',
      ownerName: 'Reza Firmansyah',
      ownerEmail: 'reza.f@sumas.id',
      ownerRole: 'Operator',
      description: 'Perlengkapan kitchen komersial dan perangkat sanitasi higienis berstandar HACCP.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '30 Okt 2026, 10:40'
    },
    {
      id: 'br-vanguard',
      name: 'Vanguard Heavy Gear',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%234a5568"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">VG</text></svg>',
      ownerId: 'u13',
      ownerName: 'Aditya Wardhana',
      ownerEmail: 'aditya.w@sumas.id',
      ownerRole: 'Operator',
      description: 'Perlengkapan kerja keselamatan industri, rompi taktikal reflektif, dan tas ransel tahan air cordura.',
      category: 'Aksesoris & Merchandise',
      status: 'Aktif',
      createdAt: '30 Okt 2026, 13:20'
    },
    {
      id: 'br-nordic',
      name: 'Nordic Laboratory',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%232c7a7b"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">NL</text></svg>',
      ownerId: 'u5',
      ownerName: 'Dimas Pratama',
      ownerEmail: 'dimas.p@sumas.id',
      ownerRole: 'Auditor',
      description: 'Panel phenolic meja lab tahan bahan kimia keras, asam kuat, dan sterilisasi autoclave ruangan medis.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '31 Okt 2026, 09:15'
    },
    {
      id: 'br-zenith',
      name: 'Zenith Wear',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%239f7aea"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">ZW</text></svg>',
      ownerId: 'u14',
      ownerName: 'Nabila Salsabila',
      ownerEmail: 'nabila.s@sumas.id',
      ownerRole: 'Operator',
      description: 'Edisi terbatas streetwear kasual dan headwear bertema tipografi grafis dengan sertifikasi digital.',
      category: 'Pakaian & Fashion',
      status: 'Aktif',
      createdAt: '31 Okt 2026, 11:30'
    },
    {
      id: 'br-solartec',
      name: 'SolarTec Energy',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23dd6b20"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">ST</text></svg>',
      ownerId: 'u15',
      ownerName: 'Fajar Ramadhan',
      ownerEmail: 'fajar.r@sumas.id',
      ownerRole: 'Administrator',
      description: 'Modul panel surya atap komersial dan inverter cerdas pemantauan energi gedung hijau.',
      category: 'Elektronik & Smart Hardware',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 09:00'
    },
    {
      id: 'br-titan',
      name: 'Titan Hardware',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%234c51bf"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">TH</text></svg>',
      ownerId: 'u2',
      ownerName: 'Budi Santoso',
      ownerEmail: 'budi.s@sumas.id',
      ownerRole: 'Operator',
      description: 'Kunci pintu mortise digital, akses kartu RFID, dan engsel heavy-duty fasilitas hotel & apartemen.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 10:30'
    },
    {
      id: 'br-primefiber',
      name: 'PrimeFiber Composite',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23285e61"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">PF</text></svg>',
      ownerId: 'u7',
      ownerName: 'Hendra Gunawan',
      ownerEmail: 'hendra.g@sumas.id',
      ownerRole: 'Operator',
      description: 'Panel komposit serat fiberglass eksterior tahan cuaca ekstrem dan insulasi termal fasad gedung.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 12:00'
    },
    {
      id: 'br-ecopanel',
      name: 'EcoPanel Akustik',
      logo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2338a169"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">EP</text></svg>',
      ownerId: 'u10',
      ownerName: 'Anisa Putri',
      ownerEmail: 'anisa.p@sumas.id',
      ownerRole: 'Auditor',
      description: 'Papan peredam suara ramah lingkungan dari serat polyester daur ulang untuk auditorium dan kantor.',
      category: 'Material & Konstruksi',
      status: 'Aktif',
      createdAt: '01 Nov 2026, 14:15'
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

  // 3. OVERHAUL PRODUCTS (15 records)
  const products = [
    {
      id: 'p1',
      brandId: 'br-sumas',
      brandName: 'Sumas',
      sku: 'Pintu Cubicle Toilet',
      skuCode: 'SMS-CUB-01',
      category: 'Material & Konstruksi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard',
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
      category: 'Material & Konstruksi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard',
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
      category: 'Material & Konstruksi > Aksesoris & Hardware Cubicle > Stainless Steel 304 Luxury',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400&auto=format&fit=crop&q=80',
      createdAt: '28 Okt 2026, 09:45',
      description: `Set aksesoris cubicle lengkap engsel gravity automatic closing, lock set indikator keterisian, handle knob, dan adjustable leg.

Material: Stainless Steel SUS 304 | Isi Paket: 2 Engsel, 1 Kunci Indikator, 2 Kaki Penopang, 1 Handle | Finishing: Satin Hairline Brushed | Garansi: 5 Tahun Anti Karat`
    },
    {
      id: 'p4',
      brandId: 'br-assc',
      brandName: 'ASSC',
      sku: 'Dew Drops Oversized Tee',
      skuCode: 'ASC-DED-04',
      category: 'Pakaian & Fashion > Atasan & T-Shirt > Oversized Boxy Cut Tee',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80',
      createdAt: '10 Nov 2026, 14:00',
      description: `Exclusive collection t-shirt grafis streetwear dengan verifikasi tag hologram anti-counterfeit dan PIN serial unik.

Material: 100% Cotton Combed 20s | Gramasi: 220 gsm | Sablon: High-Density Plastisol Ink | Potongan: Oversized Drop Shoulder | Fitur: Anti-Pilling & Pre-Shrunk`
    },
    {
      id: 'p5',
      brandId: 'br-assc',
      brandName: 'ASSC',
      sku: 'ASSC Classic Heavyweight Hoodie',
      skuCode: 'ASC-HOD-05',
      category: 'Pakaian & Fashion > Outerwear & Jaket > Heavyweight Fleece Hoodie',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&auto=format&fit=crop&q=80',
      createdAt: '10 Nov 2026, 14:15',
      description: `Heavyweight fleece hoodie dengan saku kangguru ganda dan grafis tipografi belakang khas ASSC.

Material: Katun Fleece Tebal 330 gsm | Lapisan: Brushed Interior Warmth | Tali Hoodie: Flat Drawcord Metal Aglet | Rib: 2x1 Spandex Heavy Ribbing | Label: QR Security Woven Tag`
    },
    {
      id: 'p6',
      brandId: 'br-assc',
      brandName: 'ASSC',
      sku: 'Overthinking Curved Cap',
      skuCode: 'ASC-CAP-06',
      category: 'Aksesoris & Merchandise > Topi & Headwear > 6-Panel Curved Dad Cap',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400&auto=format&fit=crop&q=80',
      createdAt: '10 Nov 2026, 14:20',
      description: `Topi 6-panel katun twill dengan bordir logo ikonik berdensitas tinggi serta gesper kuningan pengatur ukuran.

Bahan: 100% Premium Cotton Twill | Profil: 6-Panel Low Profile Curved | Pengencang: Antique Brass Buckle Strap | Ukuran: Adjustable All Size (54-60 cm) | Sweatband: Moisture Wicking Cotton`
    },
    {
      id: 'p7',
      brandId: 'br-blimey',
      brandName: 'BLIMEY!',
      sku: 'A LITTLE CLOSER (BLIMEY!) Tee',
      skuCode: 'BLM-ALC-07',
      category: 'Pakaian & Fashion > Atasan & T-Shirt > Regular Fit Graphic Tee',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400&auto=format&fit=crop&q=80',
      createdAt: '12 Nov 2026, 11:00',
      description: `Edisi terbatas drop t-shirt bertema tipografi grafis BLIMEY! dengan label barcode verifikasi cloud redirect.

Material: 100% Ring Spun Combed Cotton 24s | Gramasi: 185 gsm | Warna: Vintage Washed Black | Jahitan: Rantai Standar Ekspor Tiga Jarum | Garansi: Autentisitas Terdaftar`
    },
    {
      id: 'p8',
      brandId: 'br-blimey',
      brandName: 'BLIMEY!',
      sku: 'Oversized Street Denim Jacket',
      skuCode: 'BLM-JKT-08',
      category: 'Pakaian & Fashion > Outerwear & Jaket > Denim Trucker Jacket',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&auto=format&fit=crop&q=80',
      createdAt: '12 Nov 2026, 11:30',
      description: `Jaket trucker denim raw selvedge 14oz berpotongan santai dengan tag verifikasi digital anti-palsu.

Material: 14oz Raw Rigid Indigo Selvedge Denim | Hardware: Custom Embossed Shank Buttons | Saku: 2 Saku Dada & 2 Saku Samping Tersembunyi | Perawatan: Dry Clean Only`
    },
    {
      id: 'p9',
      brandId: 'br-indosteel',
      brandName: 'IndoSteel Architectural',
      sku: 'Heavy Beam Connection Bracket',
      skuCode: 'IDS-BKT-09',
      category: 'Material & Konstruksi > Aksesoris & Hardware Cubicle > Stainless Steel 304 Luxury',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=400&auto=format&fit=crop&q=80',
      createdAt: '14 Nov 2026, 09:15',
      description: `Bracket siku penopang partisi dan balok gantung berbahan baja canai galvanis anti-karat untuk beban geser tinggi.

Material: Baja Karbon Tinggi Hot-Dip Galvanized | Ketebalan Plat: 4.5 mm | Uji Beban: 8.5 kN Shear Strength | Finishing: Electrostatic Powder Coating | Standar: ASTM A36`
    },
    {
      id: 'p10',
      brandId: 'br-aquatech',
      brandName: 'AquaTech Sanitary',
      sku: 'Sensor Auto Faucet Pro Series',
      skuCode: 'AQT-SFT-10',
      category: 'Sanitasi & Perpipaan',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&auto=format&fit=crop&q=80',
      createdAt: '14 Nov 2026, 10:30',
      description: `Kran air sensor infra-merah tanpa sentuhan berbahan kuningan cor padat dengan katup selenoid hemat air hingga 65%.

Sensor: Dual Beam Optical Infrared | Catu Daya: AC 220V & DC 4x AA Battery Backup | Material Bodi: Solid Brass Chrome Plated | Waktu Respon: < 0.3 Detik | Aliran: 1.8 Liter/Menit`
    },
    {
      id: 'p11',
      brandId: 'br-urbanfit',
      brandName: 'UrbanFit Apparel',
      sku: 'Tactical Performance Cargo Jogger',
      skuCode: 'UBF-JOG-11',
      category: 'Pakaian & Fashion > Outerwear & Jaket > Denim Trucker Jacket',
      isB2B: 0,
      image: 'https://images.unsplash.com/photo-1552902865-b72c031ac5ea?w=400&auto=format&fit=crop&q=80',
      createdAt: '15 Nov 2026, 13:00',
      description: `Celana cargo jogger teknikal berfitur 4-way stretch water repellent DWR coating dengan saku ritsleting YKK.

Komposisi: 88% Nylon Ripstop, 12% Spandex | Fitur: DWR Water Repellent & Quick Dry | Ritsleting: YKK AquaGuard Waterproof | Pinggang: Elastic Waistband dengan Sabuk Fidlock`
    },
    {
      id: 'p12',
      brandId: 'br-lumina',
      brandName: 'Lumina Architectural',
      sku: 'Architectural Track Light 15W COB',
      skuCode: 'LMN-TRK-12',
      category: 'Elektronik & Smart Hardware',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1565814329452-e1efa11c5b89?w=400&auto=format&fit=crop&q=80',
      createdAt: '16 Nov 2026, 09:45',
      description: `Lampu track light sorot komersial museum dan galeri dengan indeks rendering warna ultra tinggi CRI > 95.

Daya: 15 Watt | Sudut Sorot: 24 Derajat Adjustable | Temperatur Warna: 3000K Warm White | CRI: Ra > 95 | Umur Pakai: 50.000 Jam L70`
    },
    {
      id: 'p13',
      brandId: 'br-titan',
      brandName: 'Titan Hardware',
      sku: 'Smart Digital Mortise Lock SUS 304',
      skuCode: 'TTN-DLK-13',
      category: 'Material & Konstruksi > Aksesoris & Hardware Cubicle > Stainless Steel 304 Luxury',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1558002038-1055907df827?w=400&auto=format&fit=crop&q=80',
      createdAt: '16 Nov 2026, 11:20',
      description: `Kunci pintu cerdas mortise stainless 304 dengan verifikasi PIN layar sentuh, kartu RFID Mifare, dan kunci mekanis darurat.

Konektivitas: RFID 13.56MHz & Touch Keypad | Body Mortise: SUS 304 Anti-Cungkil Class C | Sumber Daya: 4x Baterai AA (12 Bulan Standby) | Fitur Darurat: Port USB-C Power Bank`
    },
    {
      id: 'p14',
      brandId: 'br-primefiber',
      brandName: 'PrimeFiber Composite',
      sku: 'Architectural Exterior Cladding 4mm',
      skuCode: 'PFB-WCL-14',
      category: 'Material & Konstruksi > Wall Cladding & Plafon > Exterior Architectural Cladding',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400&auto=format&fit=crop&q=80',
      createdAt: '17 Nov 2026, 14:00',
      description: `Panel pelapis dinding luar gedung berbahan komposit serat polimer resin tahan sinar ultraviolet dan cuaca tropis basah.

Ketebalan: 4 mm | Lapisan Luar: PVDF Fluorocarbon 3-Layer Coating | Inti: Mineral Fire-Retardant Core | Dimensi: 1220 x 2440 mm | Garansi Warna: 15 Tahun Anti Pudar`
    },
    {
      id: 'p15',
      brandId: 'br-ecopanel',
      brandName: 'EcoPanel Akustik',
      sku: 'Polyester Acoustic Wall Panel 9mm',
      skuCode: 'ECO-SND-15',
      category: 'Material & Konstruksi > Wall Cladding & Plafon > Interior Decorative Panel',
      isB2B: 1,
      image: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=400&auto=format&fit=crop&q=80',
      createdAt: '17 Nov 2026, 15:30',
      description: `Papan peredam gema ruangan berbahan 100% serat daur ulang polyester tahan api dengan nilai NRC peredaman 0.85.

Ketebalan: 9 mm | Densitas: 1900 g/m² | Koefisien Reduksi Suara (NRC): 0.85 | Sertifikasi Emisi: Formaldehyde Free E0 | Pemotongan: Beveled Edge 45 Derajat`
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

  // 4. OVERHAUL BATCHES (15 records)
  const batches = [
    { id: 'b1', batchId: 'SUMAS-BATCH-0001-10', date: '28 Okt 2026, 09:15', project: 'RS Kediri', sku: 'Pintu Cubicle Toilet', brand: 'Sumas', qty: 50, specs: 'Phenolic Board 12mm Standard', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b2', batchId: 'BATCH-ASSC-082', date: '29 Okt 2026, 11:27', project: 'Grand Indonesia Store Drop', sku: 'Dew Drops Oversized Tee', brand: 'ASSC', qty: 250, specs: 'Cotton Combed 20s Heavyweight', pinLength: 8, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b3', batchId: 'BATCH-BLM-041', date: '30 Okt 2026, 14:20', project: 'Canggu Coastal Hub Drop', sku: 'A LITTLE CLOSER (BLIMEY!) Tee', brand: 'BLIMEY!', qty: 150, specs: 'Vintage Washed Combed 24s', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b4', batchId: 'SUMAS-BATCH-0002-25', date: '31 Okt 2026, 10:00', project: 'IKN Gedung Kemenko', sku: 'Phenolic Board 12mm Standard', brand: 'Sumas', qty: 120, specs: 'High Density Solid Phenolic Resin', pinLength: 8, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b5', batchId: 'BATCH-ASSC-104', date: '01 Nov 2026, 13:45', project: 'Paris Van Java Boutique', sku: 'ASSC Classic Heavyweight Hoodie', brand: 'ASSC', qty: 100, specs: 'Fleece 330gsm Terry', pinLength: 8, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b6', batchId: 'BATCH-BLM-058', date: '02 Nov 2026, 09:30', project: 'Seminyak Square Flagship', sku: 'Oversized Street Denim Jacket', brand: 'BLIMEY!', qty: 80, specs: '14oz Raw Rigid Selvedge', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b7', batchId: 'SUMAS-BATCH-0003-40', date: '02 Nov 2026, 11:15', project: 'Bandara Juanda T2 Surabaya', sku: 'Cubicle Hardware Set Stainless 304', brand: 'Sumas', qty: 200, specs: 'Stainless Steel SUS 304 Luxury', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b8', batchId: 'BATCH-IDS-012', date: '03 Nov 2026, 08:45', project: 'Pakuwon Mall Surabaya', sku: 'Heavy Beam Connection Bracket', brand: 'IndoSteel Architectural', qty: 300, specs: 'Hot-Dip Galvanized 4.5mm', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b9', batchId: 'BATCH-AQT-008', date: '03 Nov 2026, 14:00', project: 'RS Siloam Yogyakarta', sku: 'Sensor Auto Faucet Pro Series', brand: 'AquaTech Sanitary', qty: 60, specs: 'Dual Beam Optical Infrared', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b10', batchId: 'BATCH-UBF-033', date: '04 Nov 2026, 10:10', project: 'Trans Studio Mall Makassar', sku: 'Tactical Performance Cargo Jogger', brand: 'UrbanFit Apparel', qty: 150, specs: '88% Nylon Ripstop 4-Way Stretch', pinLength: 6, status: 'Aktif', isB2B: 0, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b11', batchId: 'BATCH-LMN-019', date: '04 Nov 2026, 15:30', project: 'Museum Seni Rupa Jakarta', sku: 'Architectural Track Light 15W COB', brand: 'Lumina Architectural', qty: 120, specs: 'CRI Ra>95 3000K Warm White', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b12', batchId: 'BATCH-TTN-005', date: '05 Nov 2026, 09:20', project: 'Hotel Tentrem Semarang', sku: 'Smart Digital Mortise Lock SUS 304', brand: 'Titan Hardware', qty: 90, specs: 'RFID & Touch Keypad SUS 304', pinLength: 8, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b13', batchId: 'BATCH-PFB-014', date: '05 Nov 2026, 13:50', project: 'Podomoro City Medan', sku: 'Architectural Exterior Cladding 4mm', brand: 'PrimeFiber Composite', qty: 250, specs: 'PVDF 3-Layer Mineral Core', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
    { id: 'b14', batchId: 'BATCH-ECO-022', date: '06 Nov 2026, 11:00', project: 'Auditorium Universitas Brawijaya Malang', sku: 'Polyester Acoustic Wall Panel 9mm', brand: 'EcoPanel Akustik', qty: 180, specs: '100% Recycled PET NRC 0.85', pinLength: 6, status: 'Aktif', isB2B: 1, redirectUrl: 'https://cek.sumas.id/', qrType: 'dynamic', requirePin: 1, enableGps: 1 },
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

  // 5. OVERHAUL TAGS (15 tags per batch = 225 tags total, all fields complete)
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

        const isAllocated = i <= 8;

        insertTag.run({
          id: `tag-${b.id}-${tagNumber}`,
          batchId: b.id,
          tagNumber,
          pin,
          status: isAllocated ? 'Telah Digunakan' : 'Tersedia',
          project: isAllocated ? b.project : 'Alokasi Cadangan Gudang',
          specs: b.specs || 'Standard Factory Spec',
          codeType: `${brandPrefix}-${b.isB2B ? 'B2B' : 'RET'}-2026`,
          warranty: b.isB2B ? '5 Tahun Garansi Resmi' : 'Garansi Keaslian Seumur Hidup',
          prodCode: `PRD-${brandPrefix}-${String(i).padStart(3, '0')}`,
          note: isAllocated ? `Pemasangan & verifikasi area ${b.project}` : 'Unit QC Passed siap distribusi',
          allocatedAt: isAllocated ? b.date : '06 Nov 2026, 17:00'
        });
      }
    }
  });
  insertAllTagsTx();

  // 6. OVERHAUL SCAN POINTS (15 records)
  const scanPoints = [
    {
      id: 'sp-1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      venue: 'Grand Indonesia & Plaza Indonesia',
      lat: -6.1950,
      lng: 106.8230,
      totalScans: 4820,
      todayScans: 184,
      brand: 'ASSC',
      productType: 'Dew Drops Oversized Tee',
      batchId: 'BATCH-ASSC-082',
      latestTagId: 'ASC-84920',
      latestTime: '2 menit yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPhone 15 Pro • Safari Mobile iOS 17.5',
      createdAt: '2026-10-20'
    },
    {
      id: 'sp-2',
      city: 'Jakarta Utara',
      province: 'DKI Jakarta',
      venue: 'PIK 2 Central Market & Commercial Hub',
      lat: -6.1025,
      lng: 106.7212,
      totalScans: 2150,
      todayScans: 92,
      brand: 'Sumas',
      productType: 'Pintu Cubicle Toilet',
      batchId: 'SUMAS-BATCH-0004-50',
      latestTagId: 'SMS-PIK-001',
      latestTime: '4 menit yang lalu',
      isB2B: 1,
      status: 'suspicious',
      anomalyReason: 'Duplikasi scan simultan dengan Surabaya (selisih 4 mnt)',
      deviceInfo: 'Samsung Galaxy S24 Ultra • Chrome v124',
      createdAt: '2026-10-21'
    },
    {
      id: 'sp-3',
      city: 'Surabaya',
      province: 'Jawa Timur',
      venue: 'Tunjungan Plaza 6 & Pakuwon Mall',
      lat: -7.2625,
      lng: 112.7381,
      totalScans: 3420,
      todayScans: 142,
      brand: 'Sumas',
      productType: 'Cubicle Hardware Set Stainless 304',
      batchId: 'SUMAS-BATCH-0003-40',
      latestTagId: 'SMS-SBY-049',
      latestTime: '8 menit yang lalu',
      isB2B: 1,
      status: 'suspicious',
      anomalyReason: 'Duplikasi scan lokasi terpisah 780 km dengan Jakarta',
      deviceInfo: 'Xiaomi Redmi Note 13 Pro • Mi Browser',
      createdAt: '2026-10-22'
    },
    {
      id: 'sp-4',
      city: 'Bandung',
      province: 'Jawa Barat',
      venue: 'Paris Van Java & Jalan Dago Boutique',
      lat: -6.8893,
      lng: 107.5960,
      totalScans: 2890,
      todayScans: 110,
      brand: 'ASSC',
      productType: 'ASSC Classic Heavyweight Hoodie',
      batchId: 'BATCH-ASSC-104',
      latestTagId: 'ASC-77319',
      latestTime: '24 menit yang lalu',
      isB2B: 0,
      status: 'repeated',
      anomalyReason: 'Scan Berulang Normal: Konsumen melakukan verifikasi keaslian ke-4 kalinya pada item yang sama.',
      deviceInfo: 'iPhone 14 Pro • Safari iOS 17.2',
      createdAt: '2026-10-23'
    },
    {
      id: 'sp-5',
      city: 'Denpasar & Badung',
      province: 'Bali',
      venue: 'Seminyak Square & Canggu Coastal Hub',
      lat: -8.6882,
      lng: 115.1565,
      totalScans: 2340,
      todayScans: 98,
      brand: 'BLIMEY!',
      productType: 'A LITTLE CLOSER (BLIMEY!) Tee',
      batchId: 'BATCH-BLM-041',
      latestTagId: 'BLM-92814',
      latestTime: '15 menit yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Google Pixel 8 Pro • Chrome Mobile',
      createdAt: '2026-10-24'
    },
    {
      id: 'sp-6',
      city: 'Penajam Paser / IKN',
      province: 'Kalimantan Timur',
      venue: 'Gedung Kemenko & Rumah Susun ASN',
      lat: -0.9610,
      lng: 116.7020,
      totalScans: 1980,
      todayScans: 76,
      brand: 'Sumas',
      productType: 'Phenolic Board 12mm Standard',
      batchId: 'SUMAS-BATCH-0002-25',
      latestTagId: 'SMS-IKN-0042',
      latestTime: '31 menit yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPad Air (5th gen) • Chrome iOS',
      createdAt: '2026-10-25'
    },
    {
      id: 'sp-7',
      city: 'Medan',
      province: 'Sumatera Utara',
      venue: 'Podomoro City Deli Park & Sun Plaza',
      lat: 3.5852,
      lng: 98.6750,
      totalScans: 1750,
      todayScans: 65,
      brand: 'PrimeFiber Composite',
      productType: 'Architectural Exterior Cladding 4mm',
      batchId: 'BATCH-PFB-014',
      latestTagId: 'PFB-MDN-081',
      latestTime: '45 menit yang lalu',
      isB2B: 1,
      status: 'repeated',
      anomalyReason: 'Pengecekan Ulang Proyek: Tim kontraktor melakukan audit checklist berkala untuk material terpasang.',
      deviceInfo: 'Samsung Tab S9 Ultra • Edge Mobile',
      createdAt: '2026-10-25'
    },
    {
      id: 'sp-8',
      city: 'Semarang',
      province: 'Jawa Tengah',
      venue: 'Kawasan Simpang Lima & Hotel Tentrem',
      lat: -6.9932,
      lng: 110.4203,
      totalScans: 1180,
      todayScans: 43,
      brand: 'Titan Hardware',
      productType: 'Smart Digital Mortise Lock SUS 304',
      batchId: 'BATCH-TTN-005',
      latestTagId: 'TTN-SMG-012',
      latestTime: '1 jam yang lalu',
      isB2B: 1,
      status: 'suspicious',
      anomalyReason: 'Percobaan PIN salah 7x dalam 10 menit',
      deviceInfo: 'Unknown Device (Proxy IP Terdeteksi)',
      createdAt: '2026-10-26'
    },
    {
      id: 'sp-9',
      city: 'Makassar',
      province: 'Sulawesi Selatan',
      venue: 'Trans Studio Mall & Mall Panakkukang',
      lat: -5.1477,
      lng: 119.4327,
      totalScans: 1420,
      todayScans: 54,
      brand: 'UrbanFit Apparel',
      productType: 'Tactical Performance Cargo Jogger',
      batchId: 'BATCH-UBF-033',
      latestTagId: 'UBF-MKS-055',
      latestTime: '1 jam yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Oppo Find N3 Flip • Chrome Mobile',
      createdAt: '2026-10-26'
    },
    {
      id: 'sp-10',
      city: 'Yogyakarta',
      province: 'DI Yogyakarta',
      venue: 'Ambarrukmo Plaza & RS Siloam',
      lat: -7.7828,
      lng: 110.4011,
      totalScans: 1290,
      todayScans: 51,
      brand: 'AquaTech Sanitary',
      productType: 'Sensor Auto Faucet Pro Series',
      batchId: 'BATCH-AQT-008',
      latestTagId: 'AQT-YGY-119',
      latestTime: '2 jam yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPhone 13 • Safari iOS',
      createdAt: '2026-10-27'
    },
    {
      id: 'sp-11',
      city: 'Kediri',
      province: 'Jawa Timur',
      venue: 'RSUD Gambiran & Proyek RS Kediri',
      lat: -7.8228,
      lng: 112.0118,
      totalScans: 890,
      todayScans: 38,
      brand: 'Sumas',
      productType: 'Pintu Cubicle Toilet',
      batchId: 'SUMAS-BATCH-0001-10',
      latestTagId: 'SMS-KDR-0001',
      latestTime: '10 menit yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Samsung Galaxy A54 • Chrome Mobile',
      createdAt: '2026-10-28'
    },
    {
      id: 'sp-12',
      city: 'Palembang',
      province: 'Sumatera Selatan',
      venue: 'Palembang Icon & Bandara SMB II',
      lat: -2.9761,
      lng: 104.7754,
      totalScans: 960,
      todayScans: 35,
      brand: 'BLIMEY!',
      productType: 'Oversized Street Denim Jacket',
      batchId: 'BATCH-BLM-058',
      latestTagId: 'BLM-PLM-442',
      latestTime: '3 jam yang lalu',
      isB2B: 0,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Vivo V29 5G • Chrome Mobile',
      createdAt: '2026-10-28'
    },
    {
      id: 'sp-13',
      city: 'Batam',
      province: 'Kepulauan Riau',
      venue: 'Mega Mall Batam Centre & Kawasan Nagoya',
      lat: 1.1293,
      lng: 104.0526,
      totalScans: 850,
      todayScans: 31,
      brand: 'IndoSteel Architectural',
      productType: 'Heavy Beam Connection Bracket',
      batchId: 'BATCH-IDS-012',
      latestTagId: 'IDS-BTM-019',
      latestTime: '3 jam yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'ASUS Zenfone 10 • Chrome Mobile',
      createdAt: '2026-10-29'
    },
    {
      id: 'sp-14',
      city: 'Balikpapan',
      province: 'Kalimantan Timur',
      venue: 'Pentacity Mall & Bandara Sepinggan',
      lat: -1.2654,
      lng: 116.8312,
      totalScans: 1120,
      todayScans: 48,
      brand: 'Sumas',
      productType: 'Phenolic Board 12mm Standard',
      batchId: 'SUMAS-BATCH-0002-25',
      latestTagId: 'SMS-BPN-094',
      latestTime: '4 jam yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'iPhone 15 Plus • Safari iOS',
      createdAt: '2026-10-29'
    },
    {
      id: 'sp-15',
      city: 'Malang',
      province: 'Jawa Timur',
      venue: 'Mall Olympic Garden & Universitas Brawijaya',
      lat: -7.9786,
      lng: 112.6318,
      totalScans: 780,
      todayScans: 29,
      brand: 'EcoPanel Akustik',
      productType: 'Polyester Acoustic Wall Panel 9mm',
      batchId: 'BATCH-ECO-022',
      latestTagId: 'ECO-MLG-088',
      latestTime: '5 jam yang lalu',
      isB2B: 1,
      status: 'valid',
      anomalyReason: null,
      deviceInfo: 'Xiaomi 13T • Chrome Mobile',
      createdAt: '2026-10-30'
    }
  ];

  db.prepare('DELETE FROM scan_points').run();
  const insertScanPoint = db.prepare(`
    INSERT INTO scan_points (id, city, province, venue, lat, lng, totalScans, todayScans, brand, productType, batchId, latestTagId, latestTime, isB2B, status, anomalyReason, deviceInfo, createdAt)
    VALUES (@id, @city, @province, @venue, @lat, @lng, @totalScans, @todayScans, @brand, @productType, @batchId, @latestTagId, @latestTime, @isB2B, @status, @anomalyReason, @deviceInfo, @createdAt)
  `);
  for (const sp of scanPoints) {
    insertScanPoint.run(sp);
  }

  // 7. OVERHAUL AUDIT LOGS (15 records)
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
      batchId: 'BATCH-ASSC-082',
      timestamp: '29 Okt 2026, 14:15',
      user: 'Siti Rahma',
      reason: 'Penambahan alokasi stok untuk gerai Flagship Store Grand Indonesia drop eksklusif.',
      changes: JSON.stringify([{ field: 'Quantity', old: '200 Tag', new: '250 Tag' }])
    },
    {
      id: 1730350800000,
      batchId: 'BATCH-BLM-041',
      timestamp: '30 Okt 2026, 11:30',
      user: 'Budi Santoso',
      reason: 'Perubahan alamat verifikasi QR Cloud Redirect ke domain keamanan resmi cek.sumas.id.',
      changes: JSON.stringify([{ field: 'Redirect URL', old: 'http://legacy.blimey.id', new: 'https://cek.sumas.id/' }])
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
      batchId: 'BATCH-ASSC-104',
      timestamp: '31 Okt 2026, 09:50',
      user: 'Dewi Lestari',
      reason: 'Pemberian nomor garansi resmi keaslian dan proteksi anti-counterfeit PIN 8 digit.',
      changes: JSON.stringify([{ field: 'PIN Length', old: '6 Digit', new: '8 Digit' }])
    },
    {
      id: 1730444400000,
      batchId: 'BATCH-IDS-012',
      timestamp: '31 Okt 2026, 14:20',
      user: 'Rina Wijaya',
      reason: 'Pemeriksaan kepatuhan standar uji beban tarik ASTM A36 bracket baja IndoSteel.',
      changes: JSON.stringify([{ field: 'Standar Mutu', old: 'SNI 07-0052', new: 'ASTM A36 Heavy Duty' }])
    },
    {
      id: 1730523600000,
      batchId: 'BATCH-AQT-008',
      timestamp: '01 Nov 2026, 10:10',
      user: 'Hendra Gunawan',
      reason: 'Penyesuaian spesifikasi sensor infra-merah dual beam hemat air RS Siloam.',
      changes: JSON.stringify([{ field: 'Sensor Type', old: 'Single Beam', new: 'Dual Beam Optical Infrared' }])
    },
    {
      id: 1730530800000,
      batchId: 'BATCH-UBF-033',
      timestamp: '01 Nov 2026, 16:30',
      user: 'Farhan Nugraha',
      reason: 'Pembaruan catatan instruksi perawatan celana tactical performance cargo jogger.',
      changes: JSON.stringify([{ field: 'Catatan Batch', old: 'Standar Tekstil', new: 'Lapisan DWR Water Repellent Anti-Air' }])
    },
    {
      id: 1730610000000,
      batchId: 'BATCH-LMN-019',
      timestamp: '02 Nov 2026, 08:45',
      user: 'Dewi Lestari',
      reason: 'Verifikasi sertifikat CRI > 95 untuk pencahayaan ruang pameran museum seni rupa.',
      changes: JSON.stringify([{ field: 'CRI Rating', old: 'Ra > 80', new: 'Ra > 95 High Fidelity' }])
    },
    {
      id: 1730617200000,
      batchId: 'BATCH-TTN-005',
      timestamp: '02 Nov 2026, 13:15',
      user: 'Budi Santoso',
      reason: 'Konfigurasi frekuensi RFID Mifare 13.56MHz kunci pintu digital Hotel Tentrem.',
      changes: JSON.stringify([{ field: 'Frekuensi Kunci', old: '125 KHz', new: '13.56 MHz High Security' }])
    },
    {
      id: 1730696400000,
      batchId: 'BATCH-PFB-014',
      timestamp: '03 Nov 2026, 11:00',
      user: 'Hendra Gunawan',
      reason: 'Penambahan kuota tag fisik proyek cladding fasad Podomoro City Medan.',
      changes: JSON.stringify([{ field: 'Quantity', old: '200 Tag', new: '250 Tag' }])
    },
    {
      id: 1730703600000,
      batchId: 'BATCH-ECO-022',
      timestamp: '03 Nov 2026, 15:20',
      user: 'Anisa Putri',
      reason: 'Penerbitan laporan uji serap suara laboratorium akustik akustik auditorium UB Malang.',
      changes: JSON.stringify([{ field: 'Nilai NRC', old: '0.70', new: '0.85 Sound Absorber' }])
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
      changes: JSON.stringify([{ field: 'Hasil Audit', old: 'Menunggu', new: 'Lulus Uji Ketahanan Korosi' }])
    },
    {
      id: 1730876400000,
      batchId: 'BATCH-BLM-058',
      timestamp: '05 Nov 2026, 10:45',
      user: 'Budi Santoso',
      reason: 'Verifikasi pelabelan QR security hologram batch jaket denim raw selvedge 14oz.',
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

  // 8. OVERHAUL PASSWORD RESET REQUESTS (15 records)
  const resetRequests = [
    { id: 'pr-1', userId: 'u2', userName: 'Budi Santoso', userEmail: 'budi.s@sumas.id', userRole: 'Operator', avatar: '/assets/avatars/user_budi.svg', requestedAt: '15 menit yang lalu', status: 'Menunggu', actionNote: 'Lupa kata sandi saat mencoba akses dari tablet lapangan proyek RSUD Kediri', isRead: 0 },
    { id: 'pr-2', userId: 'u4', userName: 'Siti Rahma', userEmail: 'siti.r@sumas.id', userRole: 'Operator', avatar: '/assets/avatars/user_siti.svg', requestedAt: '45 menit yang lalu', status: 'Menunggu', actionNote: 'Permintaan reset PIN dan kata sandi berkala perangkat brand operasional', isRead: 0 },
    { id: 'pr-3', userId: 'u3', userName: 'Rina Wijaya', userEmail: 'rina.w@sumas.id', userRole: 'Operator', avatar: '/assets/avatars/user_rina.svg', requestedAt: '2 jam yang lalu', status: 'Disetujui', actionNote: 'Tautan reset sandi 1-kali pakai telah dikirim otomatis ke email terdaftar', isRead: 1 },
    { id: 'pr-4', userId: 'u5', userName: 'Dimas Pratama', userEmail: 'dimas.p@sumas.id', userRole: 'Auditor', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80', requestedAt: '3 jam yang lalu', status: 'Disetujui', actionNote: 'Permintaan reset sandi diverifikasi melalui otentikasi WhatsApp dinas kantor', isRead: 1 },
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

  // 9. ENSURE CATEGORIES ARE COMPLETE
  try {
    db.prepare("UPDATE categories SET description = 'Material partisi toilet, phenolic board tahan air, dan perlengkapan arsitektural komersial Sumas', status = 'Aktif' WHERE id = 'cat-mat'").run();
    db.prepare("UPDATE categories SET description = 'Koleksi fashion retail, streetwear, dan apparel kasual berseri tag keaslian', status = 'Aktif' WHERE id = 'cat-app'").run();
    db.prepare("UPDATE categories SET description = 'Aksesoris pelengkap, tas, topi, dan barang merchandise resmi brand', status = 'Aktif' WHERE id = 'cat-acc'").run();
  } catch (_) {}
}
