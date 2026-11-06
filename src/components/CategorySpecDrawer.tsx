import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Trash2, Plus } from 'lucide-react';
import { CustomSelect } from './CustomSelect';

export interface CategorySpecField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean' | 'textarea';
  options?: string[];
  unit?: string;
  required?: boolean;
}

export interface CategorySpecDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetCategory: {
    id: string;
    name: string;
    specSchema?: string | null;
  } | null;
  onSaved: (updated: { id: string; specSchema: string }) => void;
  onAlert?: (title: string, message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}


interface SelectOptionsEditorProps {
  options?: string[];
  onChange: (options: string[]) => void;
}

const SelectOptionsEditor: React.FC<SelectOptionsEditorProps> = ({ options = [], onChange }) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = (textToAdd?: string) => {
    const raw = textToAdd !== undefined ? textToAdd : inputValue;
    if (!raw.trim()) return;

    const newItems = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (newItems.length === 0) return;

    const existingLower = new Set(options.map(o => o.toLowerCase()));
    const filteredToAdd = newItems.filter(item => !existingLower.has(item.toLowerCase()));

    if (filteredToAdd.length > 0) {
      onChange([...options, ...filteredToAdd]);
    }
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleRemove = (indexToRemove: number) => {
    onChange(options.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="pl-7 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
          Opsi Pilihan Dropdown ({options.length} Opsi)
        </span>
        <span className="text-[10px] text-slate-400">
          Pisahkan dengan koma atau Enter
        </span>
      </div>

      {/* Chip Tag Pilihan */}
      {options.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl max-h-28 overflow-y-auto">
          {options.map((opt, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#c28e62]/10 text-[#c28e62] border border-[#c28e62]/20"
            >
              <span>{opt}</span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                className="hover:text-red-500 cursor-pointer transition-colors p-0.5 rounded-full hover:bg-[#c28e62]/20"
                title="Hapus opsi ini"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input Tambah Opsi */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Ketik opsi pilihan (contoh: Standar, Premium, Custom)..."
          value={inputValue}
          onChange={(e) => {
            const val = e.target.value;
            if (val.includes(',')) {
              handleAdd(val);
            } else {
              setInputValue(val);
            }
          }}
          onKeyDown={handleKeyDown}
          className="flex-1 h-9 px-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] focus:border-[#c28e62] rounded-full text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={() => handleAdd()}
          disabled={!inputValue.trim()}
          className="h-9 px-4 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          + Tambah
        </button>
      </div>
    </div>
  );
};

export const CategorySpecDrawer: React.FC<CategorySpecDrawerProps> = ({
  isOpen,
  onClose,
  targetCategory,
  onSaved,
  onAlert
}) => {
  const [fields, setFields] = useState<CategorySpecField[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen && targetCategory) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      try {
        const parsed = targetCategory.specSchema ? JSON.parse(targetCategory.specSchema) : [];
        setFields(Array.isArray(parsed) ? parsed : []);
      } catch {
        setFields([]);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsVisible(true);
        });
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen, targetCategory]);

  const handleClose = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsVisible(false);
    closeTimerRef.current = setTimeout(() => {
      onClose();
      closeTimerRef.current = null;
    }, 300);
  };

  const handleAddField = () => {
    setFields(prev => [
      ...prev,
      {
        id: `f-${Date.now()}`,
        label: '',
        type: 'text',
        options: [],
        unit: '',
        required: false
      }
    ]);
  };

  const handleUpdateField = (id: string, updates: Partial<CategorySpecField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const handleRemoveField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  const handleSave = async () => {
    if (!targetCategory) return;
    const validFields = fields.filter(f => f.label.trim());
    setIsSaving(true);
    try {
      const res = await fetch(`/api/categories/${targetCategory.id}/specs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specSchema: JSON.stringify(validFields) })
      });

      if (res.ok) {
        const updated = await res.json();
        onSaved({ id: updated.id, specSchema: updated.specSchema });
        onAlert?.(
          'Spesifikasi Disimpan',
          `Template spesifikasi untuk "${targetCategory.name}" berhasil diperbarui.`,
          'success'
        );
        handleClose();
      } else {
        const errData = await res.json().catch(() => ({}));
        onAlert?.('Gagal Menyimpan', errData.error || 'Terjadi kesalahan saat menyimpan spesifikasi ke server.', 'error');
      }
    } catch (err: any) {
      console.error('Error saving specs in drawer:', err);
      onAlert?.('Gagal Menyimpan', err.message || 'Koneksi ke server terputus. Pastikan server aktif.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen && !isVisible) return null;
  if (!targetCategory) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end transition-opacity duration-300 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={() => !isSaving && handleClose()}
    >
      <div
        className={`bg-white dark:bg-zinc-900 w-full max-w-lg h-full border-l border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-zinc-800/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-zinc-100">
              Form Spesifikasi
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] font-semibold truncate max-w-[200px]">
              {targetCategory.name}
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3 scrollbar-thin">
          {fields.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400 dark:text-zinc-500 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800">
              Belum ada atribut spesifikasi untuk kategori ini
            </div>
          ) : (
            fields.map((field, idx) => (
              <div
                key={field.id}
                className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200/80 dark:border-zinc-700/60 space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400 w-5 shrink-0 text-center">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    placeholder="Nama atribut (misal: Bahan, Ketebalan, Garansi)"
                    value={field.label}
                    onChange={(e) => handleUpdateField(field.id, { label: e.target.value })}
                    className="flex-1 h-9 px-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] focus:border-[#c28e62] rounded-full text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveField(field.id)}
                    title="Hapus atribut"
                    className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* TIPE DATA & WAJIB DIISI */}
                <div className="pl-7 grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Tipe Input</span>
                    <CustomSelect
                      value={field.type}
                      onChange={(val) => handleUpdateField(field.id, { type: val as any })}
                      options={[
                        { value: 'text', label: 'Teks Singkat' },
                        { value: 'number', label: 'Angka' },
                        { value: 'date', label: 'Tanggal / Kalender' },
                        { value: 'select', label: 'Pilihan Dropdown' },
                        { value: 'boolean', label: 'Ya / Tidak' },
                        { value: 'textarea', label: 'Teks Paragraf' }
                      ]}
                      placeholder="Pilih tipe input..."
                      minDropdownWidth={180}
                      searchable={false}
                      buttonClassName="w-full h-9 px-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] rounded-full text-xs text-slate-700 dark:text-zinc-300 flex items-center justify-between cursor-pointer select-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Wajib Diisi</span>
                    <div className="flex items-center gap-2.5 h-9">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(field.required)}
                          onChange={(e) => handleUpdateField(field.id, { required: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4.5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-[#c28e62]"></div>
                      </label>
                      <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium">
                        {field.required ? 'Ya' : 'Opsional'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* OPSI JIKA SELECT */}
                {field.type === 'select' && (
                  <SelectOptionsEditor
                    options={field.options || []}
                    onChange={(newOpts) => handleUpdateField(field.id, { options: newOpts })}
                  />
                )}

                {/* SATUAN JIKA NUMBER */}
                {field.type === 'number' && (
                  <div className="pl-7 space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">Satuan Unit (Opsional)</span>
                    <input
                      type="text"
                      placeholder="Contoh: mm, cm, kg, Watt, Volt"
                      value={field.unit || ''}
                      onChange={(e) => handleUpdateField(field.id, { unit: e.target.value })}
                      className="w-full h-9 px-3.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] focus:border-[#c28e62] rounded-full text-xs text-slate-800 dark:text-zinc-100 placeholder-slate-400 focus:outline-none transition-colors"
                    />
                  </div>
                )}
              </div>
            ))
          )}

          <button
            type="button"
            onClick={handleAddField}
            className="w-full py-2.5 rounded-full border border-dashed border-[#c28e62]/60 hover:border-[#c28e62] bg-[#c28e62]/5 hover:bg-[#c28e62]/10 text-xs font-semibold text-[#c28e62] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Plus size={14} />
            <span>Tambah Bidang Atribut</span>
          </button>
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-zinc-800/30 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-5 py-2 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan Spesifikasi'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
