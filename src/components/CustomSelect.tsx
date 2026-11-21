import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { getAvatarColorCss, getInitials, getInitialsAvatar } from '../utils/avatar';

export interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  avatar?: string | null;
}

export interface CustomSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  buttonClassName?: string;
  searchable?: boolean;
  minDropdownWidth?: number;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  options, 
  placeholder = 'Pilih pilihan...',
  searchPlaceholder: customSearchPlaceholder,
  className = '',
  buttonClassName,
  searchable = true,
  minDropdownWidth
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [searchQuery, setSearchQuery] = useState('');
  const buttonRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const calculatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const minW = minDropdownWidth ?? 220;
    const dropdownW = Math.max(rect.width, minW);
    const estimatedHeight = Math.min(options.length * 44 + 68, 320);
    
    if (spaceBelow < estimatedHeight && rect.top > estimatedHeight) {
      setDirection('up');
      setPos({ top: rect.top - 6, left: rect.left, width: dropdownW });
    } else {
      setDirection('down');
      setPos({ top: rect.bottom + 6, left: rect.left, width: dropdownW });
    }
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      setIsOpen(false);
      setSearchQuery('');
      return;
    }
    
    calculatePosition();
    setSearchQuery('');
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleUpdate = () => calculatePosition();
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [isOpen, options.length, minDropdownWidth]);

  useEffect(() => {
    if (isOpen && searchable) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, searchable]);

  const selectedOpt = options.find(o => o.value === value);

  const filteredOptions = options.filter(opt => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (opt.label && opt.label.toLowerCase().includes(q)) ||
           (opt.sublabel && opt.sublabel.toLowerCase().includes(q)) ||
           (opt.badge && opt.badge.toLowerCase().includes(q));
  });

  const cleanPlaceholder = (placeholder || '')
    .replace(/^(Pilih|Semua|Urutkan)\s+/i, '')
    .replace(/^-+\s*|\s*-+$/g, '')
    .trim();
  const searchPlaceholder = customSearchPlaceholder || (cleanPlaceholder ? `Cari ${cleanPlaceholder}...` : 'Cari pilihan...');

  return (
    <div className={className || 'w-full'}>
      <div 
        ref={buttonRef}
        onClick={toggleDropdown}
        className={`cursor-pointer flex items-center justify-between select-none transition-colors duration-200 ${
          buttonClassName || `w-full bg-white dark:bg-zinc-800 border ${isOpen ? 'border-[#c28e62]' : 'border-slate-300 dark:border-zinc-600'} rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-700 dark:text-zinc-200 hover:border-[#c28e62] dark:hover:border-[#c28e62]`
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 pr-2">
          {selectedOpt?.avatar ? (
            <img 
              src={selectedOpt.avatar} 
              alt={selectedOpt.label} 
              onError={(e) => {
                const el = e.currentTarget;
                el.onerror = null;
                el.src = getInitialsAvatar(selectedOpt.label, selectedOpt.value || selectedOpt.label);
              }}
              className="w-5 h-5 rounded-full object-cover flex-shrink-0" 
            />
          ) : selectedOpt?.sublabel ? (
            <div
              className="w-5 h-5 rounded-full text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0"
              style={{ backgroundColor: getAvatarColorCss(selectedOpt.value || selectedOpt.label) }}
            >
              {getInitials(selectedOpt.label)}
            </div>
          ) : null}
          <span className={selectedOpt ? 'font-medium truncate' : 'text-slate-400 dark:text-zinc-500 truncate'}>
            {selectedOpt ? (selectedOpt.sublabel ? `${selectedOpt.label} (${selectedOpt.sublabel})` : selectedOpt.label) : placeholder}
          </span>
          {selectedOpt?.badge && (
            <span className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 flex-shrink-0">
              {selectedOpt.badge}
            </span>
          )}
        </div>
        <ChevronDown size={15} className={`text-slate-400 dark:text-zinc-400 transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && createPortal(
        <>
          {/* BACKDROP PALING ATAS */}
          <div 
            className="fixed inset-0 z-[999990]" 
            onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSearchQuery(''); }}
          />
          {/* MENU DROPDOWN CUSTOM KONSISTEN */}
          <div 
            className={`fixed z-[999991] bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200/90 dark:border-zinc-700 p-1.5 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-80 flex flex-col shadow-xl ${
              direction === 'up' ? '-translate-y-full origin-bottom' : 'origin-top'
            }`}
            style={{ 
              top: pos.top, 
              left: Math.max(10, Math.min(pos.left, window.innerWidth - pos.width - 14)), 
              width: pos.width 
            }}
          >
            {/* FITUR PENCARIAN DI DALAM MENU DROPDOWN */}
            {searchable && (
              <div className="p-1.5 pb-2 border-b border-slate-100 dark:border-zinc-800 mb-1 sticky top-0 bg-white dark:bg-zinc-900 z-30">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] focus:ring-1 focus:ring-[#c28e62]/25"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSearchQuery(''); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 cursor-pointer p-0.5"
                      title="Hapus pencarian"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {searchQuery && (
                  <div className="mt-1 px-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-zinc-500">
                    <span>{filteredOptions.length} opsi ditemukan</span>
                  </div>
                )}
              </div>
            )}
            
            {filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 dark:text-zinc-500">
                {searchQuery ? `Tidak ada pilihan "${searchQuery}"` : 'Tidak ada pilihan data.'}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filteredOptions.map((opt) => {
                  const isSelected = value === opt.value;
                  return (
                    <div
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearchQuery('');
                      }}
                      className={`px-3 py-2 text-xs sm:text-sm cursor-pointer transition-colors flex items-center justify-between gap-2.5 rounded-xl select-none ${
                        isSelected
                          ? 'bg-[#c28e62]/12 dark:bg-[#c28e62]/20 text-[#b07d53] dark:text-[#d4a379] font-semibold'
                          : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100/90 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {opt.avatar ? (
                          <img 
                            src={opt.avatar} 
                            alt={opt.label} 
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.onerror = null;
                              el.src = getInitialsAvatar(opt.label, opt.value || opt.label);
                            }}
                            className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-slate-200 dark:border-zinc-700" 
                          />
                        ) : opt.sublabel ? (
                          <div
                            className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0"
                            style={{ backgroundColor: getAvatarColorCss(opt.value || opt.label) }}
                          >
                            {getInitials(opt.label)}
                          </div>
                        ) : null}
                        <div className="min-w-0">
                          <div className="truncate font-medium">{opt.label}</div>
                          {opt.sublabel && (
                            <div className="text-[11px] text-slate-400 dark:text-zinc-400 truncate font-normal">{opt.sublabel}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {opt.badge && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 whitespace-nowrap">
                            {opt.badge}
                          </span>
                        )}
                        <span
                          className={`w-4 h-4 rounded-lg inline-flex items-center justify-center transition-opacity ${
                            isSelected ? 'opacity-100 text-[#c28e62]' : 'opacity-0'
                          }`}
                        >
                          <Check size={14} strokeWidth={2.75} />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
