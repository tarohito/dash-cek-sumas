import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Edit3, 
  Trash2, 
  X, 
  Check,
  AlertTriangle,
  CheckCircle2,
  Layers,
  FolderKanban
} from 'lucide-react';

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
}

interface CategoryManagerProps {
  currentRole?: 'Administrator' | 'Operator';
  onAlert?: (title: string, message: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ currentRole = 'Administrator', onAlert }) => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active selections in 3 columns
  const [selectedLevel1Id, setSelectedLevel1Id] = useState<string | null>(null);
  const [selectedLevel2Id, setSelectedLevel2Id] = useState<string | null>(null);
  const [selectedLevel3Id, setSelectedLevel3Id] = useState<string | null>(null);

  // Search filter per column
  const [searchLevel1, setSearchLevel1] = useState<string>('');
  const [searchLevel2, setSearchLevel2] = useState<string>('');
  const [searchLevel3, setSearchLevel3] = useState<string>('');

  const showAlert = (title: string, message: string, type: 'success' | 'warning' | 'error' | 'info' = 'success') => {
    if (onAlert) onAlert(title, message, type);
  };

  // Helper level label
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

  // Modal State (Create Only)
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [targetLevel, setTargetLevel] = useState<number>(1);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: null as string | null,
    level: 1
  });

  // Inline Edit State (Langsung edit di teks tanpa modal)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');

  // Delete Confirmation Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryItem | null>(null);

  // Fetch categories from backend
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

  // Filtered lists for each column with recently created items at the top
  const level1List = useMemo(() => {
    const list = categories
      .filter(c => c.level === 1)
      .filter(c => !searchLevel1.trim() || c.name.toLowerCase().includes(searchLevel1.toLowerCase()));
    
    return [...list].sort((a, b) => {
      const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [categories, searchLevel1]);

  const level2List = useMemo(() => {
    if (!selectedLevel1Id) return [];
    const list = categories
      .filter(c => c.level === 2 && c.parentId === selectedLevel1Id)
      .filter(c => !searchLevel2.trim() || c.name.toLowerCase().includes(searchLevel2.toLowerCase()));
    
    return [...list].sort((a, b) => {
      const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [categories, selectedLevel1Id, searchLevel2]);

  const level3List = useMemo(() => {
    if (!selectedLevel2Id) return [];
    const list = categories
      .filter(c => c.level === 3 && c.parentId === selectedLevel2Id)
      .filter(c => !searchLevel3.trim() || c.name.toLowerCase().includes(searchLevel3.toLowerCase()));
    
    return [...list].sort((a, b) => {
      const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [categories, selectedLevel2Id, searchLevel3]);

  // Helper count children
  const getChildrenCount = (parentId: string) => {
    return categories.filter(c => c.parentId === parentId).length;
  };

  // Select Level 1 item
  const handleSelectLevel1 = (catId: string) => {
    if (editingId) return; // Prevent changing selection while editing
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
    if (editingId) return; // Prevent changing selection while editing
    setSelectedLevel2Id(catId);
    setSelectedLevel3Id(null);
  };

  // Parent category context for level 2 & 3
  const parentCategory = useMemo(() => {
    if (targetLevel === 2) {
      return categories.find(c => c.id === formData.parentId || c.id === selectedLevel1Id);
    }
    if (targetLevel === 3) {
      return categories.find(c => c.id === formData.parentId || c.id === selectedLevel2Id);
    }
    return null;
  }, [categories, targetLevel, formData.parentId, selectedLevel1Id, selectedLevel2Id]);

  // Open Create Modal (Tanpa kode kategori)
  const handleOpenCreate = (level: number) => {
    let parentId: string | null = null;
    if (level === 2) {
      if (!selectedLevel1Id) return;
      parentId = selectedLevel1Id;
    } else if (level === 3) {
      if (!selectedLevel2Id) return;
      parentId = selectedLevel2Id;
    }

    setFormData({
      name: '',
      description: '',
      parentId,
      level
    });
    setTargetLevel(level);
    setModalOpen(true);
  };

  // INLINE EDIT: Langsung mengedit di teks tanpa modal & tanpa kode kategori
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
          code: null, // tanpa kode kategori
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
      showAlert('Gagal Memperbarui Kategori', 'Koneksi ke server bermasalah saat memperbarui kategori.', 'error');
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

  // Execute Create Category (Tanpa kode kategori)
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    try {
      setIsSubmitting(true);
      const payload = {
        name: formData.name.trim(),
        description: formData.description?.trim() || null,
        parentId: formData.parentId,
        level: formData.level,
        code: null, // tanpa kode kategori
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
        setModalOpen(false);

        showAlert(
          'Kategori Ditambahkan',
          `"${newCat.name}" berhasil ditambahkan ke ${getLevelLabel(newCat.level)}`,
          'success'
        );

        if (newCat.level === 2 && newCat.parentId === selectedLevel1Id) {
          setSelectedLevel2Id(newCat.id);
        } else if (newCat.level === 1) {
          setSelectedLevel1Id(newCat.id);
          setSelectedLevel2Id(null);
        }
      } else {
        showAlert('Gagal Menambahkan Kategori', 'Terjadi kendala saat menyimpan kategori baru.', 'error');
      }
    } catch (err) {
      console.error('Gagal menyimpan kategori:', err);
      showAlert('Gagal Menambahkan Kategori', 'Koneksi ke server bermasalah saat menyimpan kategori.', 'error');
    } finally {
      setIsSubmitting(false);
    }
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
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="w-full max-w-[1720px] mx-auto space-y-4 sm:space-y-5">
        {/* 3 COLUMN GRID: KATEGORI UTAMA, SUB KATEGORI, VARIAN / JENIS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-5 items-start">

          {/* KOLOM 1: KATEGORI UTAMA */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl overflow-hidden flex flex-col h-[600px]">
            <div className="p-3.5 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-800/40">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Kategori Utama</h3>
                  <span className="text-[11px] font-mono text-slate-400">({level1List.length})</span>
                </div>
                {/* PRIMARY BUTTON: CLEAN TEXT ONLY (NO ICON) */}
                <button
                  onClick={() => handleOpenCreate(1)}
                  className="px-3.5 py-1 rounded-full bg-[#c28e62] hover:bg-[#b07d53] text-white text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Tambah
                </button>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchLevel1}
                  onChange={(e) => setSearchLevel1(e.target.value)}
                  placeholder="Cari kategori utama..."
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#c28e62]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {level1List.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Belum ada kategori utama</div>
              ) : (
                level1List.map(item => {
                  const isSelected = item.id === selectedLevel1Id;
                  const childCount = getChildrenCount(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => !editingId && handleSelectLevel1(item.id)}
                      className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
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
                            className="p-1.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelInlineEdit}
                            title="Batal"
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-xs truncate">{item.name}</span>
                            {isRecentlyCreated(item.createdAt, item.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wide uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Baru
                              </span>
                            )}
                          </div>

                          {/* AKSI: EDIT & HAPUS (MUNCUL SAAT HOVER ATAU KLIK/AKTIF) */}
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
                              onClick={(e) => handleStartInlineEdit(item, e)}
                              title="Edit Kategori"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenDelete(item, e)}
                              title="Hapus Kategori"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
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
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Sub Kategori</h3>
                  <span className="text-[11px] font-mono text-slate-400">({level2List.length})</span>
                </div>
                {/* PRIMARY BUTTON: CLEAN TEXT ONLY (NO ICON) */}
                <button
                  onClick={() => handleOpenCreate(2)}
                  disabled={!selectedLevel1Id}
                  className="px-3.5 py-1 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Tambah
                </button>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchLevel2}
                  disabled={!selectedLevel1Id}
                  onChange={(e) => setSearchLevel2(e.target.value)}
                  placeholder="Cari sub kategori..."
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#c28e62] disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!selectedLevel1Id ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Pilih kategori utama terlebih dahulu</div>
              ) : level2List.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Belum ada sub kategori</div>
              ) : (
                level2List.map(item => {
                  const isSelected = item.id === selectedLevel2Id;
                  const childCount = getChildrenCount(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => !editingId && handleSelectLevel2(item.id)}
                      className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
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
                            className="p-1.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelInlineEdit}
                            title="Batal"
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-xs truncate">{item.name}</span>
                            {isRecentlyCreated(item.createdAt, item.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wide uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Baru
                              </span>
                            )}
                          </div>

                          {/* AKSI: EDIT & HAPUS (MUNCUL SAAT HOVER ATAU KLIK/AKTIF) */}
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
                              onClick={(e) => handleStartInlineEdit(item, e)}
                              title="Edit Sub Kategori"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenDelete(item, e)}
                              title="Hapus Sub Kategori"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
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
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-xs text-slate-800 dark:text-zinc-100 uppercase tracking-wider">Varian / Jenis</h3>
                  <span className="text-[11px] font-mono text-slate-400">({level3List.length})</span>
                </div>
                {/* PRIMARY BUTTON: CLEAN TEXT ONLY (NO ICON) */}
                <button
                  onClick={() => handleOpenCreate(3)}
                  disabled={!selectedLevel2Id}
                  className="px-3.5 py-1 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  Tambah
                </button>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchLevel3}
                  disabled={!selectedLevel2Id}
                  onChange={(e) => setSearchLevel3(e.target.value)}
                  placeholder="Cari varian / jenis..."
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-8 pr-3 py-1.5 text-xs text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#c28e62] disabled:opacity-50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!selectedLevel2Id ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Pilih sub kategori terlebih dahulu</div>
              ) : level3List.length === 0 ? (
                <div className="p-6 text-center text-slate-400 dark:text-zinc-500 text-xs">Belum ada varian / jenis</div>
              ) : (
                level3List.map(item => {
                  const isSelected = item.id === selectedLevel3Id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => !editingId && setSelectedLevel3Id(prev => prev === item.id ? null : item.id)}
                      className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
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
                            className="p-1.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelInlineEdit}
                            title="Batal"
                            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1 flex items-center gap-1.5">
                            <span className="text-xs truncate">{item.name}</span>
                            {isRecentlyCreated(item.createdAt, item.id) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 tracking-wide uppercase shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                Baru
                              </span>
                            )}
                          </div>

                          {/* AKSI: EDIT & HAPUS (MUNCUL SAAT HOVER ATAU KLIK/AKTIF) */}
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
                              onClick={(e) => handleStartInlineEdit(item, e)}
                              title="Edit Varian"
                              className="p-1.5 text-slate-400 hover:text-[#c28e62] dark:hover:text-[#c28e62] hover:bg-slate-100 dark:hover:bg-zinc-700/60 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenDelete(item, e)}
                              title="Hapus Varian"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors cursor-pointer"
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

      {/* MODAL: CREATE CATEGORY (KONSISTEN DENGAN DESAIN MODAL LAINNYA) */}
      {modalOpen && (
        <div 
          onClick={(e) => { 
            if (e.target === e.currentTarget && !isSubmitting) setModalOpen(false); 
          }}
          className="fixed inset-0 bg-black/60 z-[10010] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Layers size={20} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  Tambah {getLevelLabel(targetLevel)}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setModalOpen(false)} 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL FORM BODY */}
            <form onSubmit={handleSubmitForm} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                {/* INFO KATEGORI INDUK (JIKA LEVEL 2 ATAU 3) */}
                {parentCategory && (
                  <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200/70 dark:border-zinc-700/60 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
                      <FolderKanban size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                        Kategori Induk ({targetLevel === 2 ? 'Kategori Utama' : 'Sub Kategori'})
                      </div>
                      <div className="text-xs font-bold text-slate-700 dark:text-zinc-200 truncate mt-0.5">
                        {parentCategory.name}
                      </div>
                    </div>
                  </div>
                )}

                {/* NAMA KATEGORI */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Nama {getLevelLabel(targetLevel)} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={
                      targetLevel === 1 
                        ? 'Contoh: Material & Konstruksi, Fashion & Apparel...'
                        : targetLevel === 2
                          ? 'Contoh: Partisi Cubicle Toilet, Pakaian Pria, Outerwear...'
                          : 'Contoh: Phenolic Board 12mm Standard, Heavy Duty, Nylon Set...'
                    }
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all"
                  />
                </div>

                {/* DESKRIPSI (OPSIONAL) */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Catatan / Deskripsi <span className="text-[11px] font-normal text-slate-400">(Opsional)</span>
                  </label>
                  <textarea 
                    rows={3}
                    placeholder="Tuliskan catatan spesifikasi atau peruntukan kategori ini..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none resize-none transition-all font-medium placeholder:font-normal"
                  />
                </div>
              </div>

              {/* MODAL FOOTER */}
              <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <button 
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setModalOpen(false)} 
                    className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmitting || !formData.name.trim()}
                    className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#c28e62] to-[#b37f54] hover:opacity-95 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isSubmitting ? 'Menyimpan...' : `Tambah ${getLevelLabel(targetLevel)}`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION (KONSISTEN DENGAN MODAL HAPUS LAINNYA) */}
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

    </div>
  );
};
