import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CustomSelect } from './CustomSelect';
import { CategorySpecDrawer } from './CategorySpecDrawer';
import { createPortal } from 'react-dom';
import { 
  Search, 
  Edit3, 
  Trash2, 
  X, 
  Check,
  AlertTriangle,
  Layers,
  Plus,
  Sliders
} from 'lucide-react';

export interface CategorySpecField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea';
  options?: string[];
  unit?: string;
  required?: boolean;
}

export interface CategoryItem {
  id: string;
  name: string;
  parentId: string | null;
  level: number; // 1 = Kategori Utama, 2 = Sub Kategori, 3 = Varian / Jenis
  code?: string | null;
  description?: string | null;
  status: 'Aktif' | 'Nonaktif';
  itemCount: number;
  orderIndex: number;
  createdAt: string;
  specSchema?: string | null;
}

interface CategoryManagerProps {
  currentRole?: 'Administrator' | 'Operator';
  onAlert?: (title: string, message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  onCategoriesUpdated?: (cats: CategoryItem[]) => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ currentRole = 'Administrator', onAlert, onCategoriesUpdated }) => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active selections in 3 columns
  const [selectedLevel1Id, setSelectedLevel1Id] = useState<string | null>(null);
  const [selectedLevel2Id, setSelectedLevel2Id] = useState<string | null>(null);
  const [selectedLevel3Id, setSelectedLevel3Id] = useState<string | null>(null);

  // Single unified search in top section header
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Inline Quick-Add states directly on front cards (no modal)
  const [newLevel1Name, setNewLevel1Name] = useState<string>('');
  const [newLevel2Name, setNewLevel2Name] = useState<string>('');
  const [newLevel3Name, setNewLevel3Name] = useState<string>('');

  // Inline Edit State (Langsung edit di baris teks tanpa modal)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Delete Confirmation Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryItem | null>(null);

  // Slide-over Drawer State untuk Konfigurasi Spesifikasi Kategori
  const [specDrawerOpen, setSpecDrawerOpen] = useState<boolean>(false);
  const [specTargetCategory, setSpecTargetCategory] = useState<CategoryItem | null>(null);

  const handleOpenSpecDrawer = (cat: CategoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setSpecTargetCategory(cat);
    setSpecDrawerOpen(true);
  };

  const showAlert = (title: string, message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    if (onAlert) onAlert(title, message, type);
  };

  const getLevelLabel = (level: number) => {
    if (level === 1) return 'Kategori Utama';
    if (level === 2) return 'Sub Kategori';
    return 'Varian / Jenis';
  };

  const isRecentlyCreated = (createdAt?: string | null, idVal?: string | null, maxMinutes = 5): boolean => {
    if (!createdAt && !idVal) return false;
    const lower = String(createdAt || '').toLowerCase();
    if (lower.includes('baru saja') || lower.includes('menit yang lalu')) return true;
    
    if (idVal && typeof idVal === 'string') {
      const numericPart = idVal.replace(/^[a-zA-Z_-]+/, '');
      if (/^\d{12,14}$/.test(numericPart)) {
        const dtFromId = new Date(Number(numericPart));
        if (!isNaN(dtFromId.getTime())) {
          const diffMs = Date.now() - dtFromId.getTime();
          return diffMs >= -60000 && diffMs <= maxMinutes * 60 * 1000;
        }
      }
    }

    if (!createdAt) return false;
    const dt = new Date(createdAt);
    if (isNaN(dt.getTime())) return false;
    const diffMs = Date.now() - dt.getTime();
    return diffMs >= -60000 && diffMs <= maxMinutes * 60 * 1000;
  };

  // Fetch categories from SQLite API
  const fetchCategories = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setCategories(data);
          
          // Auto-select first Level 1 if none selected
          const l1Items = data.filter((c: CategoryItem) => c.level === 1);
          if (l1Items.length > 0 && !selectedLevel1Id) {
            const firstL1 = l1Items[0];
            setSelectedLevel1Id(firstL1.id);

            const l2Items = data.filter((c: CategoryItem) => c.level === 2 && c.parentId === firstL1.id);
            if (l2Items.length > 0) {
              setSelectedLevel2Id(l2Items[0].id);
            }
          }
        }
      }
    } catch (err) {
      console.error('Gagal mengambil daftar kategori:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Matching category hierarchy for global search
  const matchingCategoryIds = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return null;

    const matched = new Set<string>();
    categories.forEach(cat => {
      if (cat.name.toLowerCase().includes(q)) {
        matched.add(cat.id);
        // Include its parents if any
        if (cat.parentId) {
          matched.add(cat.parentId);
          const parent = categories.find(c => c.id === cat.parentId);
          if (parent?.parentId) matched.add(parent.parentId);
        }
      }
    });
    return matched;
  }, [categories, globalSearch]);

  // Filtered lists for each column
  const level1List = useMemo(() => {
    const list = categories.filter(c => c.level === 1);
    const filtered = matchingCategoryIds ? list.filter(c => matchingCategoryIds.has(c.id)) : list;
    
    return [...filtered].sort((a, b) => {
      const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [categories, matchingCategoryIds]);

  const level2List = useMemo(() => {
    if (!selectedLevel1Id) return [];
    const list = categories.filter(c => c.level === 2 && c.parentId === selectedLevel1Id);
    const filtered = matchingCategoryIds ? list.filter(c => matchingCategoryIds.has(c.id)) : list;
    
    return [...filtered].sort((a, b) => {
      const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [categories, selectedLevel1Id, matchingCategoryIds]);

  const level3List = useMemo(() => {
    if (!selectedLevel2Id) return [];
    const list = categories.filter(c => c.level === 3 && c.parentId === selectedLevel2Id);
    const filtered = matchingCategoryIds ? list.filter(c => matchingCategoryIds.has(c.id)) : list;
    
    return [...filtered].sort((a, b) => {
      const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [categories, selectedLevel2Id, matchingCategoryIds]);

  // Selected item objects for contextual placeholder
  const selectedLevel1 = useMemo(() => categories.find(c => c.id === selectedLevel1Id), [categories, selectedLevel1Id]);
  const selectedLevel2 = useMemo(() => categories.find(c => c.id === selectedLevel2Id), [categories, selectedLevel2Id]);

  // Helper count children
  const getChildrenCount = (parentId: string) => {
    return categories.filter(c => c.parentId === parentId).length;
  };

  // Select Level 1 item
  const handleSelectLevel1 = (catId: string) => {
    if (editingId) return;
    setSelectedLevel1Id(catId);
    setSelectedLevel3Id(null);
    const children = categories.filter(c => c.level === 2 && c.parentId === catId);
    if (children.length > 0) {
      setSelectedLevel2Id(children[0].id);
    } else {
      setSelectedLevel2Id(null);
    }
  };

  // Select Level 2 item
  const handleSelectLevel2 = (catId: string) => {
    if (editingId) return;
    setSelectedLevel2Id(catId);
    setSelectedLevel3Id(null);
  };

  // DIRECT FRONT QUICK-ADD: Langsung tambah di form depan tanpa modal
  const handleQuickAdd = async (level: number, parentId: string | null, name: string, e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    if (level === 2 && !parentId) {
      showAlert('Pilih Kategori Utama', 'Silakan pilih kategori utama terlebih dahulu.', 'warning');
      return;
    }
    if (level === 3 && !parentId) {
      showAlert('Pilih Sub Kategori', 'Silakan pilih sub kategori terlebih dahulu.', 'warning');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        name: trimmed,
        description: null,
        parentId,
        level,
        code: null,
        status: 'Aktif'
      };
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const newCat = await res.json();
        setCategories(prev => [...prev, newCat]);

        // Clear input form
        if (level === 1) {
          setNewLevel1Name('');
          setSelectedLevel1Id(newCat.id);
          setSelectedLevel2Id(null);
        } else if (level === 2) {
          setNewLevel2Name('');
          setSelectedLevel2Id(newCat.id);
        } else if (level === 3) {
          setNewLevel3Name('');
        }

        showAlert(
          'Kategori Ditambahkan',
          `"${newCat.name}" berhasil ditambahkan ke ${getLevelLabel(newCat.level)}`,
          'success'
        );
      } else {
        showAlert('Gagal Menambahkan Kategori', 'Terjadi kendala saat menyimpan kategori baru.', 'error');
      }
    } catch (err) {
      console.error('Gagal menyimpan kategori:', err);
      showAlert('Gagal Menambahkan Kategori', 'Koneksi ke server bermasalah.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // INLINE EDIT: Langsung mengedit di teks baris tanpa modal
  const handleStartInlineEdit = (cat: CategoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  const handleCancelInlineEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveInlineEdit = async (catId: string, e?: React.MouseEvent | React.FormEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }

    const currentCat = categories.find(c => c.id === catId);
    if (currentCat && currentCat.name === trimmed) {
      setEditingId(null);
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/categories/${catId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          code: null,
          description: currentCat?.description || null
        })
      });
      if (res.ok) {
        const updatedCat = await res.json();
        setCategories(prev => prev.map(c => c.id === updatedCat.id ? { ...c, ...updatedCat } : c));
        showAlert(
          'Kategori Diperbarui',
          `"${updatedCat.name}" berhasil diperbarui`,
          'success'
        );
      } else {
        showAlert('Gagal Memperbarui Kategori', 'Terjadi kesalahan sistem saat memperbarui kategori.', 'error');
      }
    } catch (err) {
      console.error('Gagal memperbarui kategori:', err);
      showAlert('Gagal Memperbarui Kategori', 'Koneksi ke server bermasalah.', 'error');
    } finally {
      setIsSubmitting(false);
      setEditingId(null);
      setEditingName('');
    }
  };

  // Open Delete Confirmation
  const handleOpenDelete = (cat: CategoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCategoryToDelete(cat);
    setDeleteModalOpen(true);
  };

  // Execute Delete
  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    try {
      setIsSubmitting(true);
      const res = await fetch(`/api/categories/${categoryToDelete.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        const deletedIds = data.deletedIds || [categoryToDelete.id];
        setCategories(prev => prev.filter(c => !deletedIds.includes(c.id)));
        setDeleteModalOpen(false);

        showAlert(
          'Kategori Dihapus',
          `"${categoryToDelete.name}" telah dihapus`,
          'success'
        );

        if (selectedLevel1Id && deletedIds.includes(selectedLevel1Id)) {
          const remainingL1 = categories.filter(c => c.level === 1 && !deletedIds.includes(c.id));
          if (remainingL1.length > 0) {
            setSelectedLevel1Id(remainingL1[0].id);
            const remainingL2 = categories.filter(c => c.level === 2 && c.parentId === remainingL1[0].id && !deletedIds.includes(c.id));
            setSelectedLevel2Id(remainingL2.length > 0 ? remainingL2[0].id : null);
          } else {
            setSelectedLevel1Id(null);
            setSelectedLevel2Id(null);
          }
        } else if (selectedLevel2Id && deletedIds.includes(selectedLevel2Id)) {
          const remainingL2 = categories.filter(c => c.level === 2 && c.parentId === selectedLevel1Id && !deletedIds.includes(c.id));
          setSelectedLevel2Id(remainingL2.length > 0 ? remainingL2[0].id : null);
        }
      } else {
        showAlert('Gagal Menghapus Kategori', 'Terjadi kendala saat menghapus kategori dari server.', 'error');
      }
    } catch (err) {
      console.error('Gagal menghapus kategori:', err);
      showAlert('Gagal Menghapus Kategori', 'Koneksi bermasalah saat menghapus kategori.', 'error');
    } finally {
      setIsSubmitting(false);
      setCategoryToDelete(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300">
      <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
        
        {/* TOP STATUS BAR KATEGORI: SECTION STRUKTUR HIRARKI + FITUR PENCARIAN 1 INPUTAN DI ATAS KANAN */}
        <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
              <Layers size={16} />
            </div>
            <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
              Struktur Hirarki Kategori Produk (3 Level)
            </span>
          </div>

          {/* SINGLE UNIFIED SEARCH INPUT DI ATAS KANAN (UKURAN & TINGGI IDENTIK DENGAN TOMBOL SKU / BRAND) */}
          <div className="relative w-full sm:w-80">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Cari kategori, sub kategori, varian..."
              className="w-full h-10 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-10 pr-9 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => setGlobalSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* 3 COLUMN GRID: KATEGORI UTAMA, SUB KATEGORI, VARIAN / JENIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 items-start">

          {/* KOLOM 1: KATEGORI UTAMA */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-3.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Kategori Utama</h3>
                  <span className="text-[11px] font-mono text-slate-400">({level1List.length})</span>
                </div>
              </div>

              {/* FORM LANGSUNG DI DEPAN (TANPA MODAL) */}
              <form onSubmit={(e) => handleQuickAdd(1, null, newLevel1Name, e)} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newLevel1Name}
                  onChange={(e) => setNewLevel1Name(e.target.value)}
                  placeholder="Nama kategori utama baru..."
                  className="flex-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-3.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !newLevel1Name.trim()}
                  title="Tambah Kategori Utama"
                  className="w-8 h-8 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={16} />
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {level1List.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs flex flex-col items-center gap-2">
                  <span>{globalSearch ? 'Tidak ada kategori utama yang cocok dengan pencarian' : 'Belum ada kategori utama'}</span>
                </div>
              ) : (
                level1List.map(item => {
                  const isSelected = item.id === selectedLevel1Id;
                  const childCount = getChildrenCount(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => !editingId && handleSelectLevel1(item.id)}
                      className={`group px-3.5 py-2.5 rounded-full border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected 
                          ? 'bg-slate-50 dark:bg-zinc-800 border-[#c28e62] text-slate-900 dark:text-zinc-100 font-semibold' 
                          : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800/80 hover:bg-slate-50/60 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {editingId === item.id ? (
                        <form
                          onSubmit={(e) => handleSaveInlineEdit(item.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 flex-1 min-w-0"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                handleCancelInlineEdit();
                              }
                            }}
                            className="flex-1 bg-white dark:bg-zinc-900 border border-[#c28e62] rounded-full px-3 py-1 text-xs text-slate-800 dark:text-zinc-100 font-medium focus:outline-none min-w-0"
                            placeholder="Nama kategori..."
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting || !editingName.trim()}
                            title="Simpan"
                            className="p-1.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelInlineEdit}
                            title="Batal"
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-full transition-colors cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-xs truncate">{item.name}</span>
                            {(() => {
                              try {
                                const s = item.specSchema ? JSON.parse(item.specSchema) : [];
                                if (Array.isArray(s) && s.length > 0) {
                                  return (
                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] font-semibold shrink-0">
                                      {s.length} Atribut
                                    </span>
                                  );
                                }
                              } catch {}
                              return null;
                            })()}
                            {isRecentlyCreated(item.createdAt, item.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wide uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Baru
                              </span>
                            )}
                          </div>

                          {/* AKSI: EDIT & HAPUS */}
                          <div 
                            className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${
                              isSelected 
                                ? 'opacity-100 pointer-events-auto' 
                                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'
                            }`} 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleOpenSpecDrawer(item, e)}
                              title="Form Spesifikasi"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-full transition-colors cursor-pointer"
                            >
                              <Sliders size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleStartInlineEdit(item, e)}
                              title="Edit Kategori"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-full transition-colors cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenDelete(item, e)}
                              title="Hapus Kategori"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-full transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KOLOM 2: SUB KATEGORI */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-3.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Sub Kategori</h3>
                  <span className="text-[11px] font-mono text-slate-400">({level2List.length})</span>
                </div>
              </div>

              {/* FORM LANGSUNG DI DEPAN (TANPA MODAL) */}
              <form onSubmit={(e) => handleQuickAdd(2, selectedLevel1Id, newLevel2Name, e)} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newLevel2Name}
                  disabled={!selectedLevel1Id}
                  onChange={(e) => setNewLevel2Name(e.target.value)}
                  placeholder={selectedLevel1 ? `Sub kategori untuk "${selectedLevel1.name}"...` : 'Pilih kategori utama dulu...'}
                  className="flex-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-3.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedLevel1Id || !newLevel2Name.trim()}
                  title="Tambah Sub Kategori"
                  className="w-8 h-8 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={16} />
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!selectedLevel1Id ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Pilih kategori utama terlebih dahulu</div>
              ) : level2List.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs flex flex-col items-center gap-2">
                  <span>{globalSearch ? 'Tidak ada sub kategori yang cocok' : 'Belum ada sub kategori'}</span>
                </div>
              ) : (
                level2List.map(item => {
                  const isSelected = item.id === selectedLevel2Id;
                  const childCount = getChildrenCount(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => !editingId && handleSelectLevel2(item.id)}
                      className={`group px-3.5 py-2.5 rounded-full border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected 
                          ? 'bg-slate-50 dark:bg-zinc-800 border-[#c28e62] text-slate-900 dark:text-zinc-100 font-semibold' 
                          : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800/80 hover:bg-slate-50/60 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {editingId === item.id ? (
                        <form
                          onSubmit={(e) => handleSaveInlineEdit(item.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 flex-1 min-w-0"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                handleCancelInlineEdit();
                              }
                            }}
                            className="flex-1 bg-white dark:bg-zinc-900 border border-[#c28e62] rounded-full px-3 py-1 text-xs text-slate-800 dark:text-zinc-100 font-medium focus:outline-none min-w-0"
                            placeholder="Nama sub kategori..."
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting || !editingName.trim()}
                            title="Simpan"
                            className="p-1.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelInlineEdit}
                            title="Batal"
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-full transition-colors cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-xs truncate">{item.name}</span>
                            {(() => {
                              try {
                                const s = item.specSchema ? JSON.parse(item.specSchema) : [];
                                if (Array.isArray(s) && s.length > 0) {
                                  return (
                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] font-semibold shrink-0">
                                      {s.length} Atribut
                                    </span>
                                  );
                                }
                              } catch {}
                              return null;
                            })()}
                            {isRecentlyCreated(item.createdAt, item.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wide uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Baru
                              </span>
                            )}
                          </div>

                          {/* AKSI: EDIT & HAPUS */}
                          <div 
                            className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${
                              isSelected 
                                ? 'opacity-100 pointer-events-auto' 
                                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'
                            }`} 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleOpenSpecDrawer(item, e)}
                              title="Form Spesifikasi"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-full transition-colors cursor-pointer"
                            >
                              <Sliders size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleStartInlineEdit(item, e)}
                              title="Edit Sub Kategori"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-full transition-colors cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenDelete(item, e)}
                              title="Hapus Sub Kategori"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-full transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* KOLOM 3: VARIAN / JENIS */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-3.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Varian / Jenis</h3>
                  <span className="text-[11px] font-mono text-slate-400">({level3List.length})</span>
                </div>
              </div>

              {/* FORM LANGSUNG DI DEPAN (TANPA MODAL) */}
              <form onSubmit={(e) => handleQuickAdd(3, selectedLevel2Id, newLevel3Name, e)} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newLevel3Name}
                  disabled={!selectedLevel2Id}
                  onChange={(e) => setNewLevel3Name(e.target.value)}
                  placeholder={selectedLevel2 ? `Varian untuk "${selectedLevel2.name}"...` : 'Pilih sub kategori dulu...'}
                  className="flex-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-3.5 py-1.5 text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedLevel2Id || !newLevel3Name.trim()}
                  title="Tambah Varian / Jenis"
                  className="w-8 h-8 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-40 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Plus size={16} />
                </button>
              </form>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!selectedLevel2Id ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Pilih sub kategori terlebih dahulu</div>
              ) : level3List.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs flex flex-col items-center gap-2">
                  <span>{globalSearch ? 'Tidak ada varian / jenis yang cocok' : 'Belum ada varian / jenis'}</span>
                </div>
              ) : (
                level3List.map(item => {
                  const isSelected = item.id === selectedLevel3Id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => !editingId && setSelectedLevel3Id(prev => prev === item.id ? null : item.id)}
                      className={`group px-3.5 py-2.5 rounded-full border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected 
                          ? 'bg-slate-50 dark:bg-zinc-800 border-[#c28e62] text-slate-900 dark:text-zinc-100 font-semibold' 
                          : 'bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800/80 hover:bg-slate-50/60 dark:hover:bg-zinc-800/50 text-slate-700 dark:text-zinc-300'
                      }`}
                    >
                      {editingId === item.id ? (
                        <form
                          onSubmit={(e) => handleSaveInlineEdit(item.id, e)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 flex-1 min-w-0"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.stopPropagation();
                                handleCancelInlineEdit();
                              }
                            }}
                            className="flex-1 bg-white dark:bg-zinc-900 border border-[#c28e62] rounded-full px-3 py-1 text-xs text-slate-800 dark:text-zinc-100 font-medium focus:outline-none min-w-0"
                            placeholder="Nama varian / jenis..."
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting || !editingName.trim()}
                            title="Simpan"
                            className="p-1.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-full transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelInlineEdit}
                            title="Batal"
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-full transition-colors cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-xs truncate">{item.name}</span>
                            {(() => {
                              try {
                                const s = item.specSchema ? JSON.parse(item.specSchema) : [];
                                if (Array.isArray(s) && s.length > 0) {
                                  return (
                                    <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] font-semibold shrink-0">
                                      {s.length} Atribut
                                    </span>
                                  );
                                }
                              } catch {}
                              return null;
                            })()}
                            {isRecentlyCreated(item.createdAt, item.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wide uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Baru
                              </span>
                            )}
                          </div>

                          {/* AKSI: EDIT & HAPUS */}
                          <div 
                            className={`flex items-center gap-0.5 shrink-0 transition-opacity duration-150 ${
                              isSelected 
                                ? 'opacity-100 pointer-events-auto' 
                                : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto'
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={(e) => handleOpenSpecDrawer(item, e)}
                              title="Form Spesifikasi"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-full transition-colors cursor-pointer"
                            >
                              <Sliders size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleStartInlineEdit(item, e)}
                              title="Edit Varian"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-full transition-colors cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenDelete(item, e)}
                              title="Hapus Varian"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-full transition-colors cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>

      </div>

      {/* MODAL: DELETE CONFIRMATION (HANYA UNTUK KEAMANAN HAPUS DATA) */}
      {deleteModalOpen && categoryToDelete && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) setDeleteModalOpen(false); }}
          className="fixed inset-0 bg-black/60 z-[10010] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/90 dark:border-zinc-700/80 w-full max-w-sm overflow-hidden text-center p-6 mx-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
              <AlertTriangle size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base sm:text-lg mb-2">
              Hapus {getLevelLabel(categoryToDelete.level)}?
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mb-4 leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong>"{categoryToDelete.name}"</strong>?
              {categoryToDelete.level < 3 && ' Seluruh sub-kategori di bawahnya juga akan ikut terhapus.'}
            </p>

            <div className="flex gap-3 justify-center">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDeleteModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-full transition-colors cursor-pointer"
              >
                {isSubmitting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* SLIDE-OVER DRAWER KONFIGURASI FORM SPESIFIKASI (SMOOTH TRANSITION) */}
      <CategorySpecDrawer
        isOpen={specDrawerOpen}
        onClose={() => {
          setSpecDrawerOpen(false);
          setSpecTargetCategory(null);
        }}
        targetCategory={specTargetCategory}
        onSaved={(updated) => {
          setCategories(prev => {
            const next = prev.map(c => c.id === updated.id ? { ...c, specSchema: updated.specSchema } : c);
            onCategoriesUpdated?.(next);
            return next;
          });
        }}
        onAlert={showAlert}
      />
    </div>
  );
};
