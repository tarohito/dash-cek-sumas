import React, { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Upload, 
  Trash2, 
  Image as ImageIcon, 
  Check, 
  AlertCircle, 
  Layers, 
  Tag, 
  FileText, 
  Sliders, 
  Info,
  Sparkles,
  Camera
} from 'lucide-react';

interface BrandRef {
  id: string;
  name: string;
  category: string;
  logo?: string | null;
}

interface CategoryRef {
  id: string;
  name: string;
  level: number;
  parentId?: string | null;
  code?: string;
}

interface CreateSkuPageProps {
  brands: BrandRef[];
  categories: CategoryRef[];
  onBack: () => void;
  onSave: (product: {
    brandId: string;
    brandName: string;
    sku: string;
    skuCode: string;
    category: string;
    isB2B: boolean;
    description?: string;
    image?: string;
  }) => Promise<void>;
  onAlert: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type SectionKey = 'informasi' | 'spesifikasi' | 'deskripsi';

export const CreateSkuPage: React.FC<CreateSkuPageProps> = ({
  brands,
  categories,
  onBack,
  onSave,
  onAlert
}) => {
  // Form state
  const defaultBrand = brands[0] || { id: 'br-sumas', name: 'Sumas', category: 'Partisi Cubicle Toilet' };
  
  const [brandId, setBrandId] = useState<string>(defaultBrand.id);
  const [brandName, setBrandName] = useState<string>(defaultBrand.name);
  const [skuName, setSkuName] = useState<string>('');
  const [skuCode, setSkuCode] = useState<string>('');
  const [category, setCategory] = useState<string>(defaultBrand.category || 'Partisi Cubicle Toilet');
  const [isB2B, setIsB2B] = useState<boolean>(defaultBrand.name.toLowerCase() === 'sumas');
  const [productImage, setProductImage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  // Active anchor tab state
  const [activeSection, setActiveSection] = useState<SectionKey>('informasi');

  // References for scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionInformasiRef = useRef<HTMLDivElement>(null);
  const sectionSpesifikasiRef = useRef<HTMLDivElement>(null);
  const sectionDeskripsiRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-generate SKU Code if user enters SKU name and skuCode is empty
  const handleGenerateSkuCode = () => {
    const brandPrefix = brandName ? brandName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() : 'SKU';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    setSkuCode(`${brandPrefix}-${randomSuffix}`);
  };

  // Scroll to targeted section smoothly
  const scrollToSection = (section: SectionKey) => {
    setActiveSection(section);
    let targetEl: HTMLDivElement | null = null;
    if (section === 'informasi') targetEl = sectionInformasiRef.current;
    if (section === 'spesifikasi') targetEl = sectionSpesifikasiRef.current;
    if (section === 'deskripsi') targetEl = sectionDeskripsiRef.current;

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Track scroll position to update active anchor menu
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const infoPos = sectionInformasiRef.current?.getBoundingClientRect();
    const specPos = sectionSpesifikasiRef.current?.getBoundingClientRect();
    const descPos = sectionDeskripsiRef.current?.getBoundingClientRect();

    const triggerPoint = 200;

    if (descPos && descPos.top <= triggerPoint) {
      setActiveSection('deskripsi');
    } else if (specPos && specPos.top <= triggerPoint) {
      setActiveSection('spesifikasi');
    } else if (infoPos && infoPos.top <= triggerPoint) {
      setActiveSection('informasi');
    }
  };

  // Handle local image upload (converts to base64 data url)
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onAlert('Format Tidak Didukung', 'Harap unggah berkas gambar (JPG, PNG, WEBP).', 'warning');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      onAlert('Ukuran Terlalu Besar', 'Maksimal ukuran foto adalah 5MB.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProductImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Submit
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!skuName.trim()) {
      onAlert('Nama Produk Wajib Diisi', 'Silakan masukkan nama produk SKU pada formulir informasi produk.', 'warning');
      scrollToSection('informasi');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave({
        brandId,
        brandName,
        sku: skuName.trim(),
        skuCode: skuCode.trim() || `SKU-${Date.now().toString().slice(-4)}`,
        category: category.trim() || 'Umum',
        isB2B,
        image: productImage || undefined
      });
    } catch (err) {
      console.error('Gagal menyimpan SKU:', err);
      onAlert('Gagal Menyimpan SKU', 'Terjadi kesalahan sistem saat menyimpan produk baru.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-zinc-950 p-3.5 sm:p-5 md:p-6 lg:p-8 pb-32 animate-in fade-in duration-300"
    >
      <div className="w-full max-w-[1400px] mx-auto space-y-5 sm:space-y-6">

        {/* TOP UNIFIED STICKY BAR: TOMBOL KEMBALI + 3 MENU (INFORMASI PRODUK | SPESIFIKASI | DESKRIPSI) + AKSI */}
        <div className="sticky top-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-3 sm:px-5 py-2.5 flex items-center justify-between gap-3">
          {/* SISI KIRI: TOMBOL BACK & 3 MENU ANCHOR NAVIGASI */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-none flex-1 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer shrink-0"
              title="Kembali ke Katalog SKU"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="h-5 w-[1px] bg-slate-200 dark:bg-zinc-700 shrink-0 hidden sm:block mx-1" />

            {/* 3 MENU ANCHOR */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => scrollToSection('informasi')}
                className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  activeSection === 'informasi'
                    ? 'bg-[#c28e62]/10 text-[#c28e62]'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Tag size={15} />
                <span>Informasi Produk</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('spesifikasi')}
                className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  activeSection === 'spesifikasi'
                    ? 'bg-[#c28e62]/10 text-[#c28e62]'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <Sliders size={15} />
                <span>Spesifikasi</span>
              </button>

              <button
                type="button"
                onClick={() => scrollToSection('deskripsi')}
                className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                  activeSection === 'deskripsi'
                    ? 'bg-[#c28e62]/10 text-[#c28e62]'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800/60'
                }`}
              >
                <FileText size={15} />
                <span>Deskripsi</span>
              </button>
            </div>
          </div>

          {/* SISI KANAN: TOMBOL AKSI BATAL & SIMPAN */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onBack}
              className="px-3.5 sm:px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 sm:px-5 py-2 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span className="hidden sm:inline">Simpan SKU</span>
                  <span className="sm:hidden">Simpan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SECTION 1: INFORMASI PRODUK (2 KOLOM: FOTO 1:1 KIRI | FORM DETAIL KANAN)   */}
        {/* ========================================================================= */}
        <section 
          id="section-informasi-produk" 
          ref={sectionInformasiRef}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-6"
        >
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c28e62]"></span>
              <span>Informasi Produk</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Kelola foto visual utama, identitas produk, kode SKU, dan penugasan kategori produk.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
            
            {/* KOLOM KIRI: GAMBAR PRODUK BESAR (1:1 ASPECT RATIO) */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-2 w-full text-left">
                Foto Produk Utama (1:1) <span className="text-rose-500">*</span>
              </label>

              <div className="w-full max-w-[360px] aspect-square rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/40 relative overflow-hidden group flex flex-col items-center justify-center text-center p-4 transition-all hover:border-[#c28e62]">
                {productImage ? (
                  <>
                    <img 
                      src={productImage} 
                      alt="Pratinjau Produk" 
                      className="w-full h-full object-cover rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-full bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        Ganti Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductImage('')}
                        className="p-1.5 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer"
                        title="Hapus Foto"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center cursor-pointer p-4 w-full h-full"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center mb-3">
                      <Camera size={26} />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-200 mb-1">
                      Unggah Foto Produk
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-zinc-500 max-w-[200px] leading-relaxed">
                      Format JPG, PNG, WEBP. Maks 5MB. Rasio kotak 1:1.
                    </span>
                  </div>
                )}
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleImageFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>

              {/* URL alternatif atau panduan */}
              <div className="w-full max-w-[360px] mt-3">
                <input
                  type="text"
                  placeholder="Atau tempel URL gambar (https://...)"
                  value={productImage.startsWith('data:') ? '' : productImage}
                  onChange={(e) => setProductImage(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-700 dark:text-zinc-300 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
              </div>
            </div>

            {/* KOLOM KANAN: NAMA PRODUK, KODE SKU, KATEGORI, TIPE MODAL */}
            <div className="lg:col-span-7 space-y-4">
              
              {/* Brand Pemilik */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Brand / Merk Pemilik SKU <span className="text-rose-500">*</span>
                </label>
                <select
                  value={brandId}
                  onChange={(e) => {
                    const bId = e.target.value;
                    const b = brands.find(item => item.id === bId);
                    setBrandId(bId);
                    if (b) {
                      setBrandName(b.name);
                      setCategory(b.category || category);
                      setIsB2B(b.name.toLowerCase() === 'sumas');
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#c28e62] cursor-pointer"
                >
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} — ({b.category})
                    </option>
                  ))}
                </select>
              </div>

              {/* Nama Produk */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Nama Produk <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {skuName.length}/120 Karakter
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Contoh: Phenolic Board 12mm Standard, Heavyweight Boxy Tee"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
              </div>

              {/* Kode SKU */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Kode SKU
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSkuCode}
                    className="text-[11px] text-[#c28e62] hover:text-[#b07d53] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles size={12} />
                    <span>Generate Otomatis</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Kode identifikasi barang (Contoh: SMS-PHN-01, ASC-TSH-24)"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm font-mono uppercase text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
              </div>

              {/* Kategori Produk (Mendukung Struktur 3 Layer) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Kategori Produk
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Mendukung hirarki 3 layer
                  </span>
                </div>
                <input
                  type="text"
                  list="sku-category-options"
                  placeholder="Contoh: Material & Konstruksi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
                <datalist id="sku-category-options">
                  {categories.length > 0 ? (
                    <>
                      {categories.filter(c => c.level === 3).map(l3 => {
                        const l2 = categories.find(c => c.id === l3.parentId);
                        const l1 = l2 ? categories.find(c => c.id === l2.parentId) : null;
                        const fullPath = [l1?.name, l2?.name, l3.name].filter(Boolean).join(' > ');
                        return <option key={l3.id} value={fullPath} />;
                      })}
                      {categories.filter(c => c.level === 2).map(l2 => {
                        const l1 = categories.find(c => c.id === l2.parentId);
                        const path = [l1?.name, l2.name].filter(Boolean).join(' > ');
                        return <option key={l2.id} value={path} />;
                      })}
                      {categories.filter(c => c.level === 1).map(l1 => (
                        <option key={l1.id} value={l1.name} />
                      ))}
                    </>
                  ) : (
                    <>
                      <option value="Material & Konstruksi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard" />
                      <option value="Material & Konstruksi > Aksesoris & Hardware Cubicle > Nylon Fitting Set Hitam" />
                      <option value="Pakaian & Fashion > Atasan & T-Shirt > Oversized Boxy Cut Tee" />
                      <option value="Aksesoris & Merchandise > Topi & Headwear > 6-Panel Curved Dad Cap" />
                    </>
                  )}
                </datalist>
              </div>

              {/* TIPE MODAL (KOSONGIN DULU BLANK SESUAI INSTRUKSI USER) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Tipe Modal
                </label>
                <div className="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-800/30 flex items-center text-xs text-slate-400 dark:text-zinc-500">
                  {/* Dikosongkan blank sesuai instruksi user */}
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: SPESIFIKASI (KOSONGKAN DULU BLANK SESUAI INSTRUKSI USER)        */}
        {/* ========================================================================= */}
        <section 
          id="section-spesifikasi" 
          ref={sectionSpesifikasiRef}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-4"
        >
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c28e62]"></span>
              <span>Spesifikasi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Atribut spesifikasi teknis, dimensi produk, dan parameter manufaktur.
            </p>
          </div>

          {/* AREA SPESIFIKASI BLANK */}
          <div className="w-full min-h-[140px] rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-800/20 flex flex-col items-center justify-center p-6 text-center">
            {/* Blank placeholder */}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 3: DESKRIPSI (KOSONGKAN DULU BLANK SESUAI INSTRUKSI USER)          */}
        {/* ========================================================================= */}
        <section 
          id="section-deskripsi" 
          ref={sectionDeskripsiRef}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-4"
        >
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#c28e62]"></span>
              <span>Deskripsi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Deskripsi lengkap produk, panduan penggunaan, keunggulan, dan catatan operasional.
            </p>
          </div>

          {/* AREA DESKRIPSI BLANK */}
          <div className="w-full min-h-[140px] rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 bg-slate-50/40 dark:bg-zinc-800/20 flex flex-col items-center justify-center p-6 text-center">
            {/* Blank placeholder */}
          </div>
        </section>

        {/* BOTTOM FIXED / STICKY ACTION BAR */}
        <div className="sticky bottom-4 z-20 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-3.5 sm:p-4 flex items-center justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-zinc-400 hidden sm:block">
            Pastikan nama produk dan informasi utama telah terisi sebelum menyimpan.
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-6 py-2 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <>
                  <Check size={16} />
                  <span>Simpan SKU Produk</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
