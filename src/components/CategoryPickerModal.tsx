import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Search, 
  Layers, 
  ChevronRight, 
  Check, 
} from 'lucide-react';

export interface CategoryRef {
  id: string;
  name: string;
  level: number;
  parentId?: string | null;
  code?: string | null;
}

interface CategoryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CategoryRef[];
  currentCategory: string;
  onSelectCategory: (categoryPath: string) => void;
}

export const CategoryPickerModal: React.FC<CategoryPickerModalProps> = ({
  isOpen,
  onClose,
  categories,
  currentCategory,
  onSelectCategory
}) => {
  const [selectedL1Id, setSelectedL1Id] = useState<string | null>(null);
  const [selectedL2Id, setSelectedL2Id] = useState<string | null>(null);
  const [selectedL3Id, setSelectedL3Id] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sinkronisasi pilihan saat modal dibuka
  useEffect(() => {
    if (!isOpen) return;
    
    setSearchQuery('');
    
    // Coba parse currentCategory ("L1 > L2 > L3")
    if (currentCategory && currentCategory.trim()) {
      const parts = currentCategory.split('>').map(p => p.trim());
      const l1 = categories.find(c => c.level === 1 && c.name.toLowerCase() === parts[0]?.toLowerCase());
      if (l1) {
        setSelectedL1Id(l1.id);
        const l2 = categories.find(c => c.level === 2 && c.parentId === l1.id && c.name.toLowerCase() === parts[1]?.toLowerCase());
        if (l2) {
          setSelectedL2Id(l2.id);
          const l3 = categories.find(c => c.level === 3 && c.parentId === l2.id && c.name.toLowerCase() === parts[2]?.toLowerCase());
          if (l3) {
            setSelectedL3Id(l3.id);
            return;
          }
          setSelectedL3Id(null);
          return;
        }
        setSelectedL2Id(null);
        setSelectedL3Id(null);
        return;
      }
    }

    // Default ke L1 pertama jika ada
    const firstL1 = categories.find(c => c.level === 1);
    if (firstL1) {
      setSelectedL1Id(firstL1.id);
      const firstL2 = categories.find(c => c.level === 2 && c.parentId === firstL1.id);
      setSelectedL2Id(firstL2 ? firstL2.id : null);
      setSelectedL3Id(null);
    } else {
      setSelectedL1Id(null);
      setSelectedL2Id(null);
      setSelectedL3Id(null);
    }
  }, [isOpen, currentCategory, categories]);

  // Listener ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Level 1 list
  const level1List = categories.filter(c => c.level === 1 && (
    !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  ));

  // Level 2 list (berdasarkan selected L1)
  const level2List = selectedL1Id 
    ? categories.filter(c => c.level === 2 && c.parentId === selectedL1Id && (
        !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
      ))
    : [];

  // Level 3 list (berdasarkan selected L2)
  const level3List = selectedL2Id
    ? categories.filter(c => c.level === 3 && c.parentId === selectedL2Id && (
        !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
      ))
    : [];

  const getSubCount = (parentId: string, targetLevel: number) => {
    return categories.filter(c => c.level === targetLevel && c.parentId === parentId).length;
  };

  const handleSelectL1 = (id: string) => {
    setSelectedL1Id(id);
    const childrenL2 = categories.filter(c => c.level === 2 && c.parentId === id);
    setSelectedL2Id(childrenL2.length > 0 ? childrenL2[0].id : null);
    setSelectedL3Id(null);
  };

  const handleSelectL2 = (id: string) => {
    setSelectedL2Id(id);
    setSelectedL3Id(null);
  };

  const handleSelectL3 = (id: string) => {
    setSelectedL3Id(id);
  };

  const selectedL1 = categories.find(c => c.id === selectedL1Id);
  const selectedL2 = categories.find(c => c.id === selectedL2Id);
  const selectedL3 = categories.find(c => c.id === selectedL3Id);

  // Buat path hasil pilihan
  const previewPath = [selectedL1?.name, selectedL2?.name, selectedL3?.name]
    .filter(Boolean)
    .join(' > ');

  const handleApply = () => {
    if (!previewPath) return;
    onSelectCategory(previewPath);
    onClose();
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 md:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl w-full max-w-5xl h-[88vh] max-h-[860px] min-h-[480px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER MODAL */}
        <div className="px-5 sm:px-6 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-4 bg-slate-50/50 dark:bg-zinc-800/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <Layers size={18} />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-zinc-100 truncate">
              Pilih Kategori Produk
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Tutup Modal"
          >
            <X size={17} />
          </button>
        </div>

        {/* SEARCH BAR CEPAT */}
        <div className="px-5 sm:px-6 py-2.5 border-b border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kategori, sub kategori, atau varian produk..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 p-0.5"
                title="Hapus filter"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* 3 KOLOM LAYOUT: DINAMIS MENYESUAIKAN TINGGI LAYAR */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 p-4 sm:p-5 flex-1 min-h-0 overflow-y-auto md:overflow-hidden bg-slate-50/50 dark:bg-zinc-950/40">
          
          {/* KOLOM 1: KATEGORI UTAMA (LEVEL 1) */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[300px] md:h-full min-h-0 shadow-2xs">
            <div className="p-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-800/40 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                Kategori Utama
              </h3>
              <span className="text-[11px] font-mono text-slate-400">({level1List.length})</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
              {level1List.length === 0 ? (
                <div className="h-full flex items-center justify-center p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                  {searchQuery ? 'Tidak ditemukan' : 'Belum ada kategori utama'}
                </div>
              ) : (
                level1List.map(item => {
                  const isSelected = item.id === selectedL1Id;
                  const childCount = getSubCount(item.id, 2);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectL1(item.id)}
                      className={`group px-3.5 py-2.5 rounded-full border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs select-none ${
                        isSelected 
                          ? 'bg-[#fcf7f3] dark:bg-[#c28e62]/10 border-[#c28e62] text-[#c28e62] font-bold shadow-2xs' 
                          : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                          {childCount}
                        </span>
                        <ChevronRight size={13} className={isSelected ? 'text-[#c28e62]' : 'text-slate-300 dark:text-zinc-600'} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KOLOM 2: SUB KATEGORI (LEVEL 2) */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[300px] md:h-full min-h-0 shadow-2xs">
            <div className="p-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-800/40 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                Sub Kategori
              </h3>
              <span className="text-[11px] font-mono text-slate-400">({level2List.length})</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
              {!selectedL1Id ? (
                <div className="h-full flex items-center justify-center p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                  Pilih Kategori Utama terlebih dahulu
                </div>
              ) : level2List.length === 0 ? (
                <div className="h-full flex items-center justify-center p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                  {searchQuery ? 'Tidak ditemukan' : 'Belum ada sub kategori pada kategori ini'}
                </div>
              ) : (
                level2List.map(item => {
                  const isSelected = item.id === selectedL2Id;
                  const childCount = getSubCount(item.id, 3);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectL2(item.id)}
                      className={`group px-3.5 py-2.5 rounded-full border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs select-none ${
                        isSelected 
                          ? 'bg-[#fcf7f3] dark:bg-[#c28e62]/10 border-[#c28e62] text-[#c28e62] font-bold shadow-2xs' 
                          : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                          {childCount}
                        </span>
                        <ChevronRight size={13} className={isSelected ? 'text-[#c28e62]' : 'text-slate-300 dark:text-zinc-600'} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KOLOM 3: VARIAN / JENIS PRODUK (LEVEL 3) */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[300px] md:h-full min-h-0 shadow-2xs">
            <div className="p-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-800/40 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-200 uppercase tracking-wider">
                Varian / Jenis
              </h3>
              <span className="text-[11px] font-mono text-slate-400">({level3List.length})</span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
              {!selectedL2Id ? (
                <div className="h-full flex items-center justify-center p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                  Pilih Sub Kategori terlebih dahulu
                </div>
              ) : level3List.length === 0 ? (
                <div className="h-full flex items-center justify-center p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                  {searchQuery ? 'Tidak ditemukan' : 'Belum ada varian produk pada sub kategori ini'}
                </div>
              ) : (
                level3List.map(item => {
                  const isSelected = item.id === selectedL3Id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelectL3(item.id)}
                      onDoubleClick={handleApply}
                      className={`group px-3.5 py-2.5 rounded-full border transition-all cursor-pointer flex items-center justify-between gap-2 text-xs select-none ${
                        isSelected 
                          ? 'bg-[#fcf7f3] dark:bg-[#c28e62]/10 border-[#c28e62] text-[#c28e62] font-bold shadow-2xs' 
                          : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-800/60 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="shrink-0">
                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-[#c28e62] text-white flex items-center justify-center">
                            <Check size={12} />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-200 dark:border-zinc-700" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

        {/* FOOTER: BREADCRUMB PREVIEW & AKSI KONFIRMASI */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">
              Struktur Kategori Terpilih:
            </span>
            <div className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-100 flex items-center gap-1.5 flex-wrap">
              {previewPath ? (
                <>
                  <span className="text-[#c28e62]">{selectedL1?.name}</span>
                  {selectedL2 && (
                    <>
                      <ChevronRight size={13} className="text-slate-400" />
                      <span className="text-[#c28e62]">{selectedL2.name}</span>
                    </>
                  )}
                  {selectedL3 && (
                    <>
                      <ChevronRight size={13} className="text-slate-400" />
                      <span className="text-[#c28e62] font-bold">{selectedL3.name}</span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-slate-400 italic">Belum ada kategori yang dipilih</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 sm:self-center shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!previewPath}
              className="px-5 py-2 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center shadow-2xs"
            >
              <span>Gunakan Kategori Ini</span>
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};
