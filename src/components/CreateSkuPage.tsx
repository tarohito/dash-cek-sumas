import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CustomSelect } from './CustomSelect';
import { CategoryPickerModal } from './CategoryPickerModal';
import { compressAndConvertToWebP } from '../utils/imageOptimizer';
import { 
  Trash2, 
  Check, 
  Tag, 
  FileText, 
  Sliders, 
  Sparkles,
  Camera,
  ChevronRight,
  X,
  AlertTriangle,
  AlertCircle
} from 'lucide-react';

interface BrandRef {
  id: string;
  name: string;
  category: string;
  logo?: string | null;
}

export interface CategorySpecField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  options?: string[];
  unit?: string;
  required?: boolean;
}

export interface CategoryRef {
  id: string;
  name: string;
  level: number;
  parentId?: string | null;
  code?: string | null;
  specSchema?: string | null;
}

interface CreateSkuPageProps {
  mode?: 'create' | 'edit';
  initialData?: {
    id: string;
    brandId: string;
    brandName: string;
    sku: string;
    skuCode?: string;
    category: string;
    description?: string;
    image?: string;
  } | null;
  brands: BrandRef[];
  categories: CategoryRef[];
  existingProducts?: Array<{ id?: string; sku: string; skuCode?: string; brandName: string; category?: string }>;
  onBack: () => void;
  onSave: (product: {
    brandId: string;
    brandName: string;
    sku: string;
    skuCode: string;
    category: string;
    description?: string;
    image?: string;
  }) => Promise<void>;
  onAlert: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

type SectionKey = 'informasi' | 'spesifikasi' | 'deskripsi';

export const CreateSkuPage: React.FC<CreateSkuPageProps> = ({
  mode = 'create',
  initialData = null,
  brands,
  categories,
  existingProducts = [],
  onBack,
  onSave,
  onAlert,
  onDirtyChange
}) => {
  interface CustomSpecItem {
    id: string;
    key: string;
    value: string;
  }

  // Parser spesifikasi dari deskripsi awal
  const parseInitialDescription = (rawDesc?: string) => {
    if (!rawDesc) return {
      desc: '',
      material: '',
      dimension: '',
      thickness: '',
      weight: '',
      capacity: '',
      finishing: '',
      grade: '',
      certification: '',
      warranty: '',
      origin: '',
      customSpecs: [] as CustomSpecItem[]
    };
    const lines = rawDesc.split('\n\n');
    const remainingLines: string[] = [];
    let material = '';
    let dimension = '';
    let thickness = '';
    let weight = '';
    let capacity = '';
    let finishing = '';
    let grade = '';
    let certification = '';
    let warranty = '';
    let origin = '';
    const customSpecs: CustomSpecItem[] = [];

    lines.forEach(line => {
      if (line.includes(':') && (line.includes(' | ') || line.match(/^[A-Za-z0-9\s\/\-_]+:\s*.+$/))) {
        const parts = line.split(' | ');
        let lineHasSpec = false;
        parts.forEach(part => {
          const m = part.match(/^([^:]+):\s*(.*)$/);
          if (m) {
            lineHasSpec = true;
            const k = m[1].trim().toLowerCase();
            const v = m[2].trim();
            if (k === 'material' || k === 'bahan') material = v;
            else if (k === 'dimensi' || k === 'ukuran') dimension = v;
            else if (k === 'ketebalan' || k === 'tebal' || k === 'diameter') thickness = v;
            else if (k === 'berat' || k === 'bobot') weight = v;
            else if (k === 'kapasitas' || k === 'daya tampung') capacity = v;
            else if (k === 'finishing/warna' || k === 'finishing' || k === 'warna') finishing = v;
            else if (k === 'ketahanan' || k === 'grade' || k === 'mutu') grade = v;
            else if (k === 'sertifikasi' || k === 'standar') certification = v;
            else if (k === 'garansi/standar' || k === 'garansi') warranty = v;
            else if (k === 'negara asal' || k === 'asal pabrik' || k === 'manufaktur') origin = v;
            else {
              customSpecs.push({ id: `cs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, key: m[1].trim(), value: v });
            }
          }
        });
        if (!lineHasSpec) remainingLines.push(line);
      } else {
        remainingLines.push(line);
      }
    });

    return {
      desc: remainingLines.join('\n\n').trim(),
      material,
      dimension,
      thickness,
      weight,
      capacity,
      finishing,
      grade,
      certification,
      warranty,
      origin,
      customSpecs
    };
  };

  const parsedInitial = useMemo(() => parseInitialDescription(initialData?.description), [initialData?.description]);

  // Form state
  const defaultBrand = brands.find(b => b.id === initialData?.brandId || b.name === initialData?.brandName) || brands[0] || { id: 'br-sumas', name: 'Sumas', category: 'Partisi Cubicle Toilet' };
  
  const [brandId, setBrandId] = useState<string>(initialData?.brandId || defaultBrand.id);
  const [brandName, setBrandName] = useState<string>(initialData?.brandName || defaultBrand.name);
  const [skuName, setSkuName] = useState<string>(initialData?.sku || '');
  const [skuCode, setSkuCode] = useState<string>(initialData?.skuCode || '');
  const [category, setCategory] = useState<string>(initialData?.category || defaultBrand.category || 'Partisi Cubicle Toilet');
  const [productImage, setProductImage] = useState<string>(initialData?.image || '');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Specifications state
  const [specMaterial, setSpecMaterial] = useState<string>(parsedInitial.material);
  const [specDimension, setSpecDimension] = useState<string>(parsedInitial.dimension);
  const [specThickness, setSpecThickness] = useState<string>(parsedInitial.thickness);
  const [specWeight, setSpecWeight] = useState<string>(parsedInitial.weight);
  const [specCapacity, setSpecCapacity] = useState<string>(parsedInitial.capacity);
  const [specFinishing, setSpecFinishing] = useState<string>(parsedInitial.finishing);
  const [specGrade, setSpecGrade] = useState<string>(parsedInitial.grade);
  const [specCertification, setSpecCertification] = useState<string>(parsedInitial.certification);
  const [specWarranty, setSpecWarranty] = useState<string>(parsedInitial.warranty);
  const [specOrigin, setSpecOrigin] = useState<string>(parsedInitial.origin);
  const [customSpecs, setCustomSpecs] = useState<CustomSpecItem[]>(parsedInitial.customSpecs);
  const [categoryFieldValues, setCategoryFieldValues] = useState<Record<string, string>>({});

  // Deteksi skema spesifikasi dinamis dari kategori terpilih
  const activeCategorySchema = useMemo<CategorySpecField[]>(() => {
    if (!category || !categories.length) return [];
    const parts = category.split('>').map(p => p.trim());
    const leafName = parts[parts.length - 1];
    const matched = categories.find(cat => cat.name.toLowerCase() === leafName?.toLowerCase())
      || categories.find(cat => parts.some(p => p.toLowerCase() === cat.name.toLowerCase() && cat.specSchema));
    if (matched?.specSchema) {
      try {
        const parsed = JSON.parse(matched.specSchema);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return [];
  }, [category, categories]);

  const handleAddCustomSpec = () => {
    setCustomSpecs(prev => [...prev, { id: `cs-${Date.now()}`, key: '', value: '' }]);
  };

  const handleUpdateCustomSpec = (id: string, field: 'key' | 'value', val: string) => {
    setCustomSpecs(prev => prev.map(item => item.id === id ? { ...item, [field]: val } : item));
  };

  const handleRemoveCustomSpec = (id: string) => {
    setCustomSpecs(prev => prev.filter(item => item.id !== id));
  };

  // Description state
  const [description, setDescription] = useState<string>(parsedInitial.desc);

  // Sinkronkan state saat initialData berubah
  useEffect(() => {
    if (initialData && mode === 'edit') {
      const bObj = brands.find(b => b.id === initialData.brandId || b.name === initialData.brandName) || defaultBrand;
      setBrandId(initialData.brandId || bObj.id);
      setBrandName(initialData.brandName || bObj.name);
      setSkuName(initialData.sku || '');
      setSkuCode(initialData.skuCode || '');
      setCategory(initialData.category || bObj.category || '');
      setProductImage(initialData.image || '');
      setSpecMaterial(parsedInitial.material);
      setSpecDimension(parsedInitial.dimension);
      setSpecThickness(parsedInitial.thickness);
      setSpecWeight(parsedInitial.weight);
      setSpecCapacity(parsedInitial.capacity);
      setSpecFinishing(parsedInitial.finishing);
      setSpecGrade(parsedInitial.grade);
      setSpecCertification(parsedInitial.certification);
      setSpecWarranty(parsedInitial.warranty);
      setSpecOrigin(parsedInitial.origin);
      setCustomSpecs(parsedInitial.customSpecs);
      setDescription(parsedInitial.desc);
    }
  }, [initialData, mode]);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  
  // Active anchor tab state
  const [activeSection, setActiveSection] = useState<SectionKey>('informasi');

  // References for scrolling
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sectionInformasiRef = useRef<HTMLDivElement>(null);
  const sectionSpesifikasiRef = useRef<HTMLDivElement>(null);
  const sectionDeskripsiRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cek duplikasi kode SKU terhadap seluruh produk yang telah terdaftar
  const trimmedSkuCode = skuCode.trim().toUpperCase();
  const duplicateProduct = useMemo(() => {
    if (!trimmedSkuCode) return null;
    return existingProducts.find(
      p => p.id !== initialData?.id && (
        (p.skuCode && p.skuCode.trim().toUpperCase() === trimmedSkuCode) ||
        (p.sku && p.sku.trim().toUpperCase() === trimmedSkuCode)
      )
    ) || null;
  }, [trimmedSkuCode, existingProducts, initialData]);

  const isDuplicateSkuCode = Boolean(duplicateProduct);

  // Helper untuk membuat kode SKU dengan format standar industri terbaik: [BRAND]-[KATEGORI]-[NOMOR URUT]
  const createBestPracticeSkuCode = (targetBrand: string, targetCategory: string, targetName: string) => {
    // 1. Ekstrak kode Brand (3 karakter akronim/huruf konsonan)
    const cleanBrand = (targetBrand || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    let brandPrefix = 'SKU';
    const brandWords = (targetBrand || '').trim().split(/\s+/).filter(Boolean);
    if (brandWords.length >= 2) {
      brandPrefix = brandWords.map(w => w[0]).join('').slice(0, 3).toUpperCase();
    } else if (cleanBrand.length >= 3) {
      brandPrefix = cleanBrand.slice(0, 3);
    } else if (cleanBrand.length > 0) {
      brandPrefix = cleanBrand.padEnd(3, 'X');
    }

    // 2. Ekstrak kode Kategori / Karakteristik Produk (3 karakter akronim)
    let catPrefix = 'PRD';
    const sourceText = targetCategory || targetName || '';
    if (sourceText) {
      const segments = sourceText.split('>').map(s => s.trim()).filter(Boolean);
      const lastSeg = segments[segments.length - 1] || '';
      const words = lastSeg.replace(/[^a-zA-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        catPrefix = (words[0][0] + words[1][0] + words[2][0]).toUpperCase();
      } else if (words.length === 2) {
        catPrefix = (words[0].slice(0, 2) + words[1][0]).toUpperCase();
      } else if (words.length === 1 && words[0].length >= 3) {
        catPrefix = words[0].slice(0, 3).toUpperCase();
      }
    }

    const basePrefix = `${brandPrefix}-${catPrefix}`;

    // 3. Sequential Counter dengan jaminan 100% bebas duplikasi
    const existingCodes = new Set(
      existingProducts.map(p => (p.skuCode || p.sku || '').trim().toUpperCase())
    );

    let counter = 1;
    while (true) {
      const formattedNum = String(counter).padStart(3, '0');
      const candidate = `${basePrefix}-${formattedNum}`;
      if (!existingCodes.has(candidate)) {
        return candidate;
      }
      counter++;
    }
  };

  // Generate Otomatis Kode SKU Menggunakan Metode Terbaik
  const handleGenerateSkuCode = () => {
    const generated = createBestPracticeSkuCode(brandName, category, skuName);
    setSkuCode(generated);
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

  // Handle local image upload dengan auto compress dan konversi ke WebP
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onAlert('Format Tidak Didukung', 'Harap unggah berkas gambar (JPG, PNG, WEBP, SVG).', 'warning');
      return;
    }

    try {
      const optimizedWebP = await compressAndConvertToWebP(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.85
      });
      setProductImage(optimizedWebP);
    } catch (err) {
      console.error('Gagal optimasi gambar:', err);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setProductImage(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Submit
  // Deteksi perubahan data formulir (di mode edit: apakah ada perubahan dibanding initialData)
  const isFormDirty = mode === 'edit' && initialData ? Boolean(
    skuName.trim() !== (initialData.sku || '').trim() ||
    skuCode.trim() !== (initialData.skuCode || '').trim() ||
    category.trim() !== (initialData.category || '').trim() ||
    brandId !== initialData.brandId ||
    productImage !== (initialData.image || '') ||
    specMaterial.trim() !== parsedInitial.material.trim() ||
    specDimension.trim() !== parsedInitial.dimension.trim() ||
    specThickness.trim() !== parsedInitial.thickness.trim() ||
    specWeight.trim() !== parsedInitial.weight.trim() ||
    specCapacity.trim() !== parsedInitial.capacity.trim() ||
    specFinishing.trim() !== parsedInitial.finishing.trim() ||
    specGrade.trim() !== parsedInitial.grade.trim() ||
    specCertification.trim() !== parsedInitial.certification.trim() ||
    specWarranty.trim() !== parsedInitial.warranty.trim() ||
    specOrigin.trim() !== parsedInitial.origin.trim() ||
    customSpecs.length !== parsedInitial.customSpecs.length ||
    description.trim() !== parsedInitial.desc.trim()
  ) : Boolean(
    skuName.trim() ||
    skuCode.trim() ||
    productImage ||
    specMaterial.trim() ||
    specDimension.trim() ||
    specThickness.trim() ||
    specWeight.trim() ||
    specCapacity.trim() ||
    specFinishing.trim() ||
    specGrade.trim() ||
    specCertification.trim() ||
    specWarranty.trim() ||
    specOrigin.trim() ||
    customSpecs.length > 0 ||
    description.trim()
  );

  // Sinkronkan status dirty form ke induk komponen
  useEffect(() => {
    onDirtyChange?.(isFormDirty);
  }, [isFormDirty, onDirtyChange]);

  // Tangani klik tombol Batal / Keluar
  const handleCancelClick = () => {
    onBack();
  };

  // Peringatan jika pengguna me-refresh atau menutup tab browser
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isFormDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFormDirty]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!skuName.trim()) {
      onAlert('Nama Produk Wajib Diisi', 'Silakan masukkan nama produk SKU pada formulir informasi produk.', 'warning');
      scrollToSection('informasi');
      return;
    }

    setIsSubmitting(true);
    try {
      // Gabungkan spesifikasi terstruktur ke dalam deskripsi produk jika diisi
      let specItems: string[] = [];
      if (activeCategorySchema.length > 0) {
        specItems = [
          ...activeCategorySchema.map(f => {
            const val = categoryFieldValues[f.label]?.trim();
            if (!val) return '';
            return f.unit ? `${f.label}: ${val} ${f.unit}` : `${f.label}: ${val}`;
          }),
          ...customSpecs.filter(cs => cs.key.trim() && cs.value.trim()).map(cs => `${cs.key.trim()}: ${cs.value.trim()}`)
        ].filter(Boolean);
      } else {
        specItems = [
          specMaterial.trim() ? `Material: ${specMaterial.trim()}` : '',
          specFinishing.trim() ? `Finishing/Warna: ${specFinishing.trim()}` : '',
          specDimension.trim() ? `Dimensi: ${specDimension.trim()}` : '',
          specGrade.trim() ? `Ketahanan: ${specGrade.trim()}` : '',
          specThickness.trim() ? `Ketebalan: ${specThickness.trim()}` : '',
          specCertification.trim() ? `Sertifikasi: ${specCertification.trim()}` : '',
          specWeight.trim() ? `Berat: ${specWeight.trim()}` : '',
          specWarranty.trim() ? `Garansi: ${specWarranty.trim()}` : '',
          specCapacity.trim() ? `Kapasitas: ${specCapacity.trim()}` : '',
          specOrigin.trim() ? `Negara Asal: ${specOrigin.trim()}` : '',
          ...customSpecs.filter(cs => cs.key.trim() && cs.value.trim()).map(cs => `${cs.key.trim()}: ${cs.value.trim()}`)
        ].filter(Boolean);
      }

      const parts: string[] = [];
      if (description.trim()) {
        parts.push(description.trim());
      }
      if (specItems.length > 0) {
        parts.push(specItems.join(' | '));
      }
      const combinedDescription = parts.join('\n\n');

      await onSave({
        brandId,
        brandName,
        sku: skuName.trim(),
        skuCode: skuCode.trim() || createBestPracticeSkuCode(brandName, category, skuName),
        category: category.trim() || 'Umum',
        description: combinedDescription || undefined,
        image: productImage || undefined
      });
      onDirtyChange?.(false);
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
      className="flex-1 overflow-y-auto bg-slate-50/60 dark:bg-zinc-950 flex flex-col animate-in fade-in duration-300"
    >
      {/* ========================================================================= */}
      {/* FULL-WIDTH STICKY SUB-HEADER: MENYATU SEPENUHNYA DI BAWAH HEADER SAAT DI-SCROLL */}
      {/* ========================================================================= */}
      <div className="sticky top-0 z-30 w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-b border-slate-200 dark:border-zinc-800 shadow-xs">
        <div className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          
          {/* SISI KIRI: 3 MENU ANCHOR NAVIGASI (DENGAN GARIS WARNA DI BAWAH SAAT AKTIF) */}
          <div className="flex items-center gap-1 sm:gap-3 overflow-x-auto scrollbar-none flex-1 min-w-0 h-full">
            <button
              type="button"
              onClick={() => scrollToSection('informasi')}
              className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                activeSection === 'informasi'
                  ? 'border-[#c28e62] text-[#c28e62] font-bold'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <Tag size={15} />
              <span>Informasi Produk</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('spesifikasi')}
              className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                activeSection === 'spesifikasi'
                  ? 'border-[#c28e62] text-[#c28e62] font-bold'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <Sliders size={15} />
              <span>Spesifikasi</span>
            </button>

            <button
              type="button"
              onClick={() => scrollToSection('deskripsi')}
              className={`h-full px-3 sm:px-4 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 border-b-2 ${
                activeSection === 'deskripsi'
                  ? 'border-[#c28e62] text-[#c28e62] font-bold'
                  : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <FileText size={15} />
              <span>Deskripsi</span>
            </button>
          </div>

          {/* SISI KANAN: TOMBOL BATAL, SIMPAN DRAF, DAN SIMPAN SKU */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleCancelClick}
              className="px-4 sm:px-5 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 sm:px-6 py-2 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center shadow-xs"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <span>{mode === 'edit' ? 'Perbarui SKU' : 'Simpan SKU'}</span>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* KONTEN UTAMA FORMULIR SKU (LAYOUT LEBAR KONSISTEN MAX-W-1720PX)          */}
      {/* ========================================================================= */}
      <div className="w-full max-w-[1720px] mx-auto p-3.5 sm:p-5 md:p-6 lg:p-8 space-y-6 sm:space-y-7 pb-20 sm:pb-24">

        {/* ========================================================================= */}
        {/* SECTION 1: INFORMASI PRODUK (2 KOLOM: FOTO 1:1 KIRI | FORM DETAIL KANAN)   */}
        {/* ========================================================================= */}
        <section 
          id="section-informasi-produk" 
          ref={sectionInformasiRef}
          className="scroll-mt-20 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <Tag size={16} className="text-[#c28e62]" />
              <span>Informasi Produk</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-stretch">
            
            {/* KOLOM KIRI: GAMBAR PRODUK (TINGGI SAMA RATA DENGAN KOLOM KANAN) */}
            <div className="lg:col-span-5 flex flex-col h-full">

              <div className="w-full h-full min-h-[300px] sm:min-h-[340px] rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/40 relative overflow-hidden group flex flex-col items-center justify-center text-center p-4 transition-all hover:border-[#c28e62]">
                {productImage ? (
                  <>
                    <img 
                      src={productImage} 
                      alt="Pratinjau Produk" 
                      className="w-full h-full object-contain rounded-xl"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-1.5 rounded-full bg-white text-slate-800 text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer shadow-xs"
                      >
                        Ganti Foto
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductImage('')}
                        className="p-2 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer shadow-xs"
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
                    <div className="w-14 h-14 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
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
            </div>

            {/* KOLOM KANAN: NAMA PRODUK, KODE SKU, KATEGORI, SEGMEN PASAR */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">
              
              {/* Brand Pemilik */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Brand / Merk Pemilik SKU <span className="text-rose-500">*</span>
                </label>
                <CustomSelect
                  value={brandId}
                  onChange={(bId) => {
                    const b = brands.find(item => item.id === bId);
                    setBrandId(bId);
                    if (b) {
                      setBrandName(b.name);
                      setCategory(b.category || category);
                    }
                  }}
                  options={brands.map(b => ({
                    value: b.id,
                    label: b.name,
                    sublabel: b.category,
                    avatar: b.logo || null
                  }))}
                  placeholder="Pilih Brand..."
                  searchable={true}
                  buttonClassName="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] dark:hover:border-[#c28e62] rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 cursor-pointer flex justify-between items-center transition-colors select-none"
                />
              </div>

              {/* Nama Produk */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Nama Produk SKU <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11px] text-slate-400">
                    {skuName.length}/120 Karakter
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Contoh: Phenolic Board 12mm Standard, Nylon Fitting Set, Boxy Cut Tee"
                  value={skuName}
                  onChange={(e) => setSkuName(e.target.value)}
                  className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
                />
              </div>

              {/* Kode SKU */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Kode SKU Produk
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateSkuCode}
                    className="text-[11px] text-[#c28e62] hover:text-[#b07d53] font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Sparkles size={12} />
                    <span>Generate Otomatis</span>
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Kode identifikasi barang unik (Contoh: SMS-CUB-001, AST-CLD-001)"
                  value={skuCode}
                  onChange={(e) => setSkuCode(e.target.value.toUpperCase())}
                  className={`w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border rounded-full text-xs sm:text-sm font-mono uppercase text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 transition-colors focus:outline-none ${
                    isDuplicateSkuCode
                      ? 'border-rose-500 focus:border-rose-500 bg-rose-50/20 dark:bg-rose-950/20 text-rose-900 dark:text-rose-100'
                      : skuCode.trim().length >= 3
                      ? 'border-emerald-500/80 focus:border-emerald-500 dark:border-emerald-600/80'
                      : 'border-slate-200 dark:border-zinc-700 focus:border-[#c28e62]'
                  }`}
                />

                {/* Indikator Peringatan Kode Duplikat atau Konfirmasi Unik */}
                {isDuplicateSkuCode && duplicateProduct && (
                  <p className="flex items-center gap-1.5 mt-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium animate-in fade-in slide-in-from-top-1">
                    <AlertCircle size={13} className="shrink-0 text-rose-500" />
                    <span>
                      Kode SKU sudah digunakan oleh produk <strong>"{duplicateProduct.sku}"</strong> ({duplicateProduct.brandName}). Gunakan kode lain.
                    </span>
                  </p>
                )}

                {!isDuplicateSkuCode && skuCode.trim().length >= 3 && (
                  <p className="flex items-center gap-1.5 mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in slide-in-from-top-1">
                    <Check size={13} className="shrink-0" />
                    <span>Kode SKU unik dan siap digunakan.</span>
                  </p>
                )}
              </div>

              {/* Kategori Produk (Mendukung Struktur 3 Level via Modal) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Kategori Produk
                </label>
                <div 
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] dark:hover:border-[#c28e62] rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 cursor-pointer flex justify-between items-center transition-colors group select-none shadow-2xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className={category ? 'font-medium truncate text-slate-800 dark:text-zinc-100' : 'text-slate-400 dark:text-zinc-500 truncate'}>
                      {category || 'Pilih Kategori Produk...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {category && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCategory('');
                        }}
                        className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-md hover:bg-slate-200/60 dark:hover:bg-zinc-700 transition-colors"
                        title="Hapus Kategori"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <span className="text-xs text-[#c28e62] font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      <span>Pilih</span>
                      <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 2: SPESIFIKASI TEKNIS PRODUK                                      */}
        {/* ========================================================================= */}
        <section 
          id="section-spesifikasi" 
          ref={sectionSpesifikasiRef}
          className="scroll-mt-20 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4 flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <Sliders size={16} className="text-[#c28e62]" />
              <span>Spesifikasi Produk</span>
            </h2>
            {activeCategorySchema.length > 0 && (
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] font-semibold">
                {activeCategorySchema.length} Parameter Khusus
              </span>
            )}
          </div>

          {activeCategorySchema.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
              {activeCategorySchema.map((field) => (
                <div key={field.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      {field.label}
                      {field.required && <span className="text-rose-500 ml-1">*</span>}
                    </label>
                    {field.unit && (
                      <span className="text-[10px] font-mono text-slate-400">
                        Satuan: {field.unit}
                      </span>
                    )}
                  </div>

                  {field.type === 'select' ? (
                    <CustomSelect
                      value={categoryFieldValues[field.label] || ''}
                      onChange={(val) => setCategoryFieldValues(prev => ({ ...prev, [field.label]: val }))}
                      options={(field.options || []).map(opt => ({ value: opt, label: opt }))}
                      placeholder={`Pilih ${field.label}...`}
                      buttonClassName="w-full h-10 px-5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100"
                    />
                  ) : field.type === 'boolean' ? (
                    <CustomSelect
                      value={categoryFieldValues[field.label] || ''}
                      onChange={(val) => setCategoryFieldValues(prev => ({ ...prev, [field.label]: val }))}
                      options={[
                        { value: 'Ya', label: 'Ya (Aktif)' },
                        { value: 'Tidak', label: 'Tidak (Nonaktif)' }
                      ]}
                      placeholder={`Pilih ${field.label}...`}
                      buttonClassName="w-full h-10 px-5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100"
                    />
                  ) : field.type === 'number' ? (
                    <div className="relative">
                      <input
                        type="number"
                        placeholder={`Masukkan ${field.label.toLowerCase()}...`}
                        value={categoryFieldValues[field.label] || ''}
                        onChange={(e) => setCategoryFieldValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                        className="w-full pl-5 pr-14 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-[#c28e62]"
                      />
                      {field.unit && (
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                          {field.unit}
                        </span>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      placeholder={`Masukkan ${field.label.toLowerCase()}...`}
                      value={categoryFieldValues[field.label] || ''}
                      onChange={(e) => setCategoryFieldValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                      className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none focus:border-[#c28e62]"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
            {/* 1. Material / Bahan */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Bahan / Material Utama
              </label>
              <input
                type="text"
                placeholder="Contoh: Solid Phenolic Resin, Nylon 66, Stainless 304"
                value={specMaterial}
                onChange={(e) => setSpecMaterial(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 2. Finishing & Warna */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Finishing &amp; Warna
              </label>
              <input
                type="text"
                placeholder="Contoh: Matte Black, Woodgrain, Brushed Chrome"
                value={specFinishing}
                onChange={(e) => setSpecFinishing(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 3. Dimensi / Ukuran */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Dimensi &amp; Ukuran (PxLxT)
              </label>
              <input
                type="text"
                placeholder="Contoh: 1830 x 2440 mm, 200 x 90 x 4 cm"
                value={specDimension}
                onChange={(e) => setSpecDimension(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 4. Grade Mutu & Ketahanan */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Grade Mutu &amp; Ketahanan
              </label>
              <input
                type="text"
                placeholder="Contoh: Water &amp; Fire Resistant, Anti-Bakteri, Grade A"
                value={specGrade}
                onChange={(e) => setSpecGrade(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 5. Ketebalan / Diameter */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Ketebalan / Diameter
              </label>
              <input
                type="text"
                placeholder="Contoh: Tebal 12 mm, 18 mm, Ø 2.5 inch"
                value={specThickness}
                onChange={(e) => setSpecThickness(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 6. Standar Mutu & Sertifikasi */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Standar Mutu &amp; Sertifikasi
              </label>
              <input
                type="text"
                placeholder="Contoh: SNI, ISO 9001, Green Label Indonesia, CE"
                value={specCertification}
                onChange={(e) => setSpecCertification(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 7. Berat / Bobot Produk */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Berat / Bobot Produk
              </label>
              <input
                type="text"
                placeholder="Contoh: 14.5 kg / lembar, 850 gram / unit"
                value={specWeight}
                onChange={(e) => setSpecWeight(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 8. Masa Garansi */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Masa Garansi
              </label>
              <input
                type="text"
                placeholder="Contoh: Garansi Resmi 1 Tahun, Life span 10 Tahun"
                value={specWarranty}
                onChange={(e) => setSpecWarranty(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 9. Kapasitas / Beban Maksimal */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Kapasitas / Beban Maksimal
              </label>
              <input
                type="text"
                placeholder="Contoh: Beban statis maks 150 kg, volume 250 liter"
                value={specCapacity}
                onChange={(e) => setSpecCapacity(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>

            {/* 10. Negara Asal / Manufaktur */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Negara Asal / Manufaktur
              </label>
              <input
                type="text"
                placeholder="Contoh: Indonesia (TKDN 45%), Jerman, Jepang"
                value={specOrigin}
                onChange={(e) => setSpecOrigin(e.target.value)}
                className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
              />
            </div>
          </div>
          )}

          {/* Spesifikasi Kustom / Dinamis */}
          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">
                  Spesifikasi Tambahan / Kustom
                </span>
                <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                  Tambahkan parameter teknis khusus produk bila diperlukan
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddCustomSpec}
                className="px-3.5 py-1.5 rounded-full border border-dashed border-[#c28e62]/70 hover:border-[#c28e62] bg-[#c28e62]/5 hover:bg-[#c28e62]/10 text-xs font-semibold text-[#c28e62] transition-colors cursor-pointer"
              >
                + Tambah Spesifikasi
              </button>
            </div>

            {customSpecs.length > 0 && (
              <div className="space-y-2.5">
                {customSpecs.map((cs) => (
                  <div key={cs.id} className="flex items-center gap-2 sm:gap-3">
                    <input
                      type="text"
                      placeholder="Nama parameter (Contoh: Voltase)"
                      value={cs.key}
                      onChange={(e) => handleUpdateCustomSpec(cs.id, 'key', e.target.value)}
                      className="w-1/3 px-4 py-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                    />
                    <input
                      type="text"
                      placeholder="Nilai parameter (Contoh: 220V / 50Hz)"
                      value={cs.value}
                      onChange={(e) => handleUpdateCustomSpec(cs.id, 'value', e.target.value)}
                      className="flex-1 px-4 py-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomSpec(cs.id)}
                      className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/60 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                      title="Hapus parameter ini"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* SECTION 3: DESKRIPSI PRODUK & CATATAN OPERASIONAL                         */}
        {/* ========================================================================= */}
        <section 
          id="section-deskripsi" 
          ref={sectionDeskripsiRef}
          className="scroll-mt-20 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl p-5 sm:p-7 space-y-6 shadow-xs"
        >
          <div className="border-b border-slate-100 dark:border-zinc-800 pb-4">
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
              <FileText size={16} className="text-[#c28e62]" />
              <span>Deskripsi Produk</span>
            </h2>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Deskripsi Produk
              </label>
              <span className="text-[11px] text-slate-400">
                {description.length} Karakter
              </span>
            </div>
            <textarea
              rows={4}
              placeholder="Tuliskan deskripsi lengkap produk, keunggulan material, petunjuk pemasangan, sertifikasi, atau catatan penting saat scan QR..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-5 py-3.5 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-3xl text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors leading-relaxed resize-y min-h-[110px]"
            />
          </div>
        </section>
      </div>
      {/* MODAL PICKER KATEGORI (LAYOUT 3 KOLOM SEPERTI HALAMAN KATEGORI PRODUK) */}
      <CategoryPickerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={categories}
        currentCategory={category}
        onSelectCategory={(chosenPath) => setCategory(chosenPath)}
      />


    </div>
  );
};