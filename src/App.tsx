import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  LayoutDashboard, 
  Building2, 
  Layers, 
  Box, 
  QrCode, 
  Scan, 
  Users, 
  Settings, 
  Moon,
  Sun, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  LogOut,
  Hash,
  AlertCircle,
  Download, 
  Trash2, 
  Check,
  CheckCircle2, 
  ChevronDown, 
  Edit3, 
  Clock, 
  List, 
  Printer, 
  FileSpreadsheet, 
  MoreVertical, 
  X, 
  Menu, 
  Ban, 
  RotateCcw,
  Info,
  Database as DatabaseIcon,
  Activity,
  TrendingUp,
  RefreshCw,
  FolderKanban,
  ArrowUpRight,
  Plus,
  Image as ImageIcon,
  Upload,
  Eye,
  EyeOff,
  Lock,
  Phone,
  Sparkles,
  AtSign,
  UserCheck,
  Briefcase,
  Tag,
  Filter,
  Globe,
  Mail,
  User,
  UserPlus,
  Bell,
  KeyRound,
  CheckCheck,
  Send,
  FileEdit,
  AlertTriangle
} from 'lucide-react';
import { ScanLocationMap } from './components/ScanLocationMap';
import { ScanActivityChart } from './components/ScanActivityChart';
import { CustomTooltipProvider } from './components/CustomTooltip';
import { CategoryManager } from './components/CategoryManager';
import { CreateSkuPage } from './components/CreateSkuPage';
import { generateA3PlusStickersPdf, generateTagsCsv, saveFileWithNativePicker } from './utils/pdfGenerator';
import { compressAndConvertToWebP } from './utils/imageOptimizer';

// ==========================================
// RESILIENT OFFLINE FALLBACK AVATARS & LOGOS
// ==========================================
const getInitialsAvatar = (name: string, bg = 'c28e62') => {
  const initials = (name || 'U').trim().slice(0, 2).toUpperCase() || 'U';
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="50" fill="%23${bg}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">${initials}</text></svg>`;
};

const getBrandInitialsLogo = (name: string, bg = 'c28e62') => {
  const initials = (name || 'B').trim().slice(0, 2).toUpperCase() || 'B';
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%23${bg}"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="%23ffffff" font-family="sans-serif" font-weight="bold" font-size="36">${initials}</text></svg>`;
};

// ==========================================
// HELPER & BADGE UNTUK DATA BARU DIBUAT (NEW BADGE)
// ==========================================
const parseFlexibleDate = (dateVal?: string | null, idVal?: string | null): Date | null => {
  // If item ID contains timestamp (e.g. b1730700000000, br-1730700000000, u1730700000000)
  if (idVal && typeof idVal === 'string') {
    const numericPart = idVal.replace(/^[a-zA-Z_-]+/, '');
    if (/^\d{12,14}$/.test(numericPart)) {
      const dtFromId = new Date(Number(numericPart));
      if (!isNaN(dtFromId.getTime())) return dtFromId;
    }
  }

  if (!dateVal) return null;
  const str = String(dateVal).trim();
  if (!str) return null;

  // Numeric timestamp in string or number form
  if (/^\d{12,14}$/.test(str)) {
    const d = new Date(Number(str));
    if (!isNaN(d.getTime())) return d;
  }

  // Direct ISO parse
  const direct = new Date(str);
  if (!isNaN(direct.getTime()) && !str.includes(' ') && str.includes('-')) return direct;

  // Indonesian format parse: "28 Okt 2026, 09:15" or "4 Nov 2026, 16.14" or "4 Nov 2026"
  const bulanMap: { [key: string]: number } = {
    jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, jun: 5,
    jul: 6, agu: 7, agt: 7, sep: 8, okt: 9, nov: 10, des: 11
  };
  const parts = str.replace(/,/g, '').split(/\s+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const monthKey = parts[1].substring(0, 3).toLowerCase();
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(year) && bulanMap[monthKey] !== undefined) {
      let hours = 0;
      let minutes = 0;
      if (parts[3]) {
        const timeParts = parts[3].split(/[:.]/);
        hours = parseInt(timeParts[0], 10) || 0;
        minutes = parseInt(timeParts[1], 10) || 0;
      }
      return new Date(year, bulanMap[monthKey], day, hours, minutes);
    }
  }

  if (!isNaN(direct.getTime())) return direct;

  return null;
};

// Data baru dianggap "Baru" selama maxMinutes (default 5 menit), setelah itu badge otomatis hilang
const isRecentlyCreated = (createdAt?: string | null, idVal?: string | null, maxMinutes = 5): boolean => {
  if (!createdAt && !idVal) return false;
  const lower = String(createdAt || '').toLowerCase();
  if (lower.includes('baru saja') || lower.includes('menit yang lalu')) return true;

  const dt = parseFlexibleDate(createdAt, idVal);
  if (!dt) return false;

  const diffMs = Date.now() - dt.getTime();
  // Valid dalam rentang maxMinutes (5 menit lalu otomatis hilang)
  return diffMs >= -60000 && diffMs <= maxMinutes * 60 * 1000;
};

const getRelativeCreatedTime = (createdAt?: string | null, idVal?: string | null): string => {
  if (!createdAt && !idVal) return 'baru saja';
  const lower = String(createdAt || '').toLowerCase();
  if (lower.includes('baru saja')) return 'baru saja';
  if (lower.includes('menit yang lalu')) return lower;

  const dt = parseFlexibleDate(createdAt, idVal);
  if (!dt) return 'baru saja';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 1000));
  if (diffSeconds < 60) return '< 1 mnt';
  const diffMinutes = Math.floor(diffSeconds / 60);
  return `${diffMinutes} mnt`;
};

const formatDateTimeDisplay = (dateVal?: string | null, idVal?: string | null): string => {
  if (!dateVal && !idVal) return 'Katalog Master';
  const dt = parseFlexibleDate(dateVal, idVal);
  if (!dt) return String(dateVal || 'Katalog Master');
  return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

const NewBadge: React.FC<{ 
  date?: string | null; 
  id?: string | null; 
  label?: string; 
  className?: string; 
  maxMinutes?: number;
}> = ({
  date,
  id,
  label = 'Baru',
  className = '',
  maxMinutes = 5
}) => {
  if (!isRecentlyCreated(date, id, maxMinutes)) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700/80 tracking-wider uppercase select-none transition-all  shrink-0 ${className}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
      </span>
      <span>{label}</span>
    </span>
  );
};

// ==========================================
// KOMPONEN CUSTOM SELECT (REUSABLE)
// ==========================================
interface CustomSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  avatar?: string | null;
}

const CustomSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder,
  className = '',
  buttonClassName,
  searchable = true,
  minDropdownWidth
}: { 
  value: any; 
  onChange: (val: any) => void; 
  options: CustomSelectOption[]; 
  placeholder: string;
  className?: string;
  buttonClassName?: string;
  searchable?: boolean;
  minDropdownWidth?: number;
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
    .trim();
  const searchPlaceholder = cleanPlaceholder ? `Cari ${cleanPlaceholder}...` : 'Cari pilihan...';

  return (
    <div className={className || 'w-full'}>
      <div 
        ref={buttonRef}
        onClick={toggleDropdown}
        className={`cursor-pointer flex items-center justify-between select-none transition-colors duration-200 ${
          buttonClassName || `w-full bg-white dark:bg-zinc-800 border ${isOpen ? 'border-[#cd9a6f]' : 'border-slate-300 dark:border-zinc-600'} rounded-full px-4 sm:px-5 py-2.5 text-xs sm:text-sm text-slate-700 dark:text-zinc-200 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f]`
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
                el.src = getInitialsAvatar(selectedOpt.label);
              }}
              className="w-5 h-5 rounded-full object-cover flex-shrink-0" 
            />
          ) : selectedOpt?.sublabel ? (
            <div className="w-5 h-5 rounded-full bg-[#c28e62]/20 text-[#c28e62] flex items-center justify-center font-bold text-[10px] flex-shrink-0">
              {selectedOpt.label.charAt(0).toUpperCase()}
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
          {/* MENU DROPDOWN PALING ATAS DENGAN SHADOW & MAX-H */}
          <div 
            className={`fixed z-[999991] bg-white dark:bg-zinc-800 rounded-3xl border border-[#cd9a6f]/30 dark:border-zinc-600 p-2 animate-in fade-in zoom-in-95 duration-150 overflow-y-auto max-h-80 flex flex-col shadow-2xl ${
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
              <div className="p-1.5 pb-2 border-b border-slate-100 dark:border-zinc-700/80 mb-1 sticky top-0 bg-white dark:bg-zinc-800 z-30">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-full text-xs text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#cd9a6f] focus:ring-1 focus:ring-[#cd9a6f]/30"
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
              filteredOptions.map((opt) => (
                <div
                  key={opt.value}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearchQuery('');
                  }}
                  className={`px-3.5 py-2 text-xs sm:text-sm cursor-pointer transition-colors flex items-center justify-between gap-2.5 rounded-full my-0.5 select-none ${value === opt.value ? 'bg-[#fcf7f3] dark:bg-zinc-700/80 text-[#c28e62] font-bold' : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62]'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {opt.avatar ? (
                      <img 
                        src={opt.avatar} 
                        alt={opt.label} 
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.onerror = null;
                          el.src = getInitialsAvatar(opt.label);
                        }}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0 border border-slate-200 dark:border-zinc-700" 
                      />
                    ) : opt.sublabel ? (
                      <div className="w-6 h-6 rounded-full bg-[#c28e62]/15 text-[#c28e62] flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                        {opt.label.charAt(0).toUpperCase()}
                      </div>
                    ) : null}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="text-[11px] text-slate-400 dark:text-zinc-400 truncate">{opt.sublabel}</div>
                      )}
                    </div>
                  </div>
                  {opt.badge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-700 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-600 flex-shrink-0 whitespace-nowrap">
                      {opt.badge}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};

// ==========================================
// HIGH PERFORMANCE TABLE PAGINATION (SLICING & VIRTUAL WINDOWING)
// ==========================================
interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (items: number) => void;
  itemName?: string;
}

const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  itemName = 'data'
}) => {
  if (totalItems === 0) return null;

  const startIdx = (currentPage - 1) * itemsPerPage + 1;
  const endIdx = Math.min(currentPage * itemsPerPage, totalItems);

  // Sliding window of max 5 page buttons
  const getPageNumbers = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }
    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="px-4 sm:px-6 py-4 sm:py-5 border-t border-slate-100 dark:border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 bg-white dark:bg-zinc-900 rounded-b-2xl">
      <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
        <span>
          Menampilkan <strong className="text-slate-800 dark:text-zinc-200">{startIdx.toLocaleString('id-ID')}</strong> - <strong className="text-slate-800 dark:text-zinc-200">{endIdx.toLocaleString('id-ID')}</strong> dari <strong className="text-[#c28e62]">{totalItems.toLocaleString('id-ID')}</strong> {itemName}
        </span>

        {onItemsPerPageChange && (
          <div className="flex items-center gap-2 pl-2.5 border-l border-slate-200 dark:border-zinc-700">
            <span className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">Baris:</span>
            <CustomSelect
              value={String(itemsPerPage)}
              onChange={(val) => {
                onItemsPerPageChange(Number(val));
                onPageChange(1);
              }}
              placeholder={String(itemsPerPage)}
              className="w-auto"
              searchable={false}
              minDropdownWidth={84}
              buttonClassName="bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-2.5 py-1 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex items-center justify-between gap-1.5 transition-colors select-none font-semibold"
              options={[
                { value: '10', label: '10' },
                { value: '25', label: '25' },
                { value: '50', label: '50' },
                { value: '100', label: '100' },
              ]}
            />
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            data-tooltip="Halaman Pertama"
            data-tooltip-pos="top"
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-bold"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 sm:py-1.5 border border-slate-200 dark:border-zinc-700 rounded-full text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Prev
          </button>

          {pageNumbers[0] > 1 && (
            <span className="px-1 text-xs text-slate-400">...</span>
          )}

          {pageNumbers.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              className={`w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-all cursor-pointer ${
                currentPage === p
                  ? 'bg-gradient-to-r from-[#c28e62] to-[#b37f54] text-white scale-105'
                  : 'border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800'
              }`}
            >
              {p}
            </button>
          ))}

          {pageNumbers[pageNumbers.length - 1] < totalPages && (
            <span className="px-1 text-xs text-slate-400">...</span>
          )}

          <button
            type="button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 sm:py-1.5 border border-slate-200 dark:border-zinc-700 rounded-full text-xs text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            data-tooltip="Halaman Terakhir"
            data-tooltip-pos="top"
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-bold"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
};

// ==========================================
// LOGO SUMAS (HORIZONTAL - BRAND ASSET)
// ==========================================
const SumasLogo = ({ className = "h-8 w-auto" }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 105.06 26.73" 
    className={className} 
    role="img"
    aria-label="SUMAS Logo"
  >
    <g>
      {/* Emblem & Laurel Wreath in Brand Warm Gold / Bronze */}
      <path className="fill-[#c2986b]" d="M20.92,13.75l-.7-1.05C18.27,9.82,15.9,7.29,15.9,4.52A4.21,4.21,0,0,1,16.72,2a3,3,0,0,1,1-.77A3.3,3.3,0,0,1,19.13,1a2.24,2.24,0,0,1,2,.91,5.74,5.74,0,0,1,.92,2,6.9,6.9,0,0,1,.25,2h1V.39h-1c-.05.51-.15.77-.29.8A1.09,1.09,0,0,1,21.33,1,5.3,5.3,0,0,0,19.09,0,3.93,3.93,0,0,0,16,1,5.65,5.65,0,0,0,14.46,3.7a7,7,0,0,0-.07,2.67c.74,3.59,3.35,6.87,5.3,9.87h0l-1.14,2.32L11.85,5.88H9v.67h1V19.77a10.18,10.18,0,0,1-1-.67A10.82,10.82,0,0,1,6.31,16,10.47,10.47,0,0,1,4.9,11.36a10.61,10.61,0,0,1,.71-4.77.37.37,0,0,0,0-.11,3.08,3.08,0,0,0,.44-1A11.06,11.06,0,0,1,7.86,3,2.36,2.36,0,0,0,9.05,2,2.57,2.57,0,0,0,9,.2,2.52,2.52,0,0,0,7.55,1.29,2.32,2.32,0,0,0,7.48,2.9c.36-.63.62-1.07.91-1.52.18-.26.25-.2.14.1s-.4.92-.65,1.41l-.08,0A11.07,11.07,0,0,0,6.17,5.06s0-.06,0-.09A3.53,3.53,0,0,0,5,2.69,3.54,3.54,0,0,0,3.85,5a3.27,3.27,0,0,0,.92,2c.06-1,.1-1.71.19-2.45,0-.44.18-.4.22,0a19.35,19.35,0,0,1,.08,2.34A10.85,10.85,0,0,0,4.64,9.5a3.17,3.17,0,0,0-.55-1.37A4.42,4.42,0,0,0,1.21,6.67a4.5,4.5,0,0,0,.51,3.19,4,4,0,0,0,2.45,1.38C3.49,10.18,3,9.43,2.54,8.62c-.27-.48-.11-.55.26-.14a26.38,26.38,0,0,1,1.76,2.25c0,.22,0,.44,0,.66a10.45,10.45,0,0,0,.32,2.09,3.72,3.72,0,0,0-1.35-1.11A4.92,4.92,0,0,0,0,12.56a4.85,4.85,0,0,0,2.22,2.75,4.46,4.46,0,0,0,3.08,0c-1.23-.64-2.1-1.08-3-1.6-.52-.31-.4-.46.17-.27A28.49,28.49,0,0,1,5.18,14.5a10.38,10.38,0,0,0,.72,1.67,11.42,11.42,0,0,0,.71,1.13,4,4,0,0,0-1.25-.44A6.23,6.23,0,0,0,1,18.24a6.3,6.3,0,0,0,3.65,2.7,5.75,5.75,0,0,0,3.82-1c-1.73-.4-3-.68-4.22-1-.75-.21-.65-.44.13-.39A35.34,35.34,0,0,1,8,19c.22.21.44.41.66.59a11.75,11.75,0,0,0,2.66,1.63c.34.15.63.24.82.31l.05,0v-.7c-.16-.06-.37-.12-.62-.23l-.4-.18V9.61l6.32,12h.61l2.18-4.37A8.75,8.75,0,0,1,22,22.08,5.22,5.22,0,0,1,21,24.85a3,3,0,0,1-1.06.83,2.37,2.37,0,0,1-1.2.3,3.35,3.35,0,0,1-1.35-.33,3.15,3.15,0,0,1-.91-.73,3.67,3.67,0,0,1-.58-1,8.47,8.47,0,0,1-.37-1.07,11.88,11.88,0,0,1-.2-1.37c0-.34,0-.71,0-.71h-.93v5.69h.95c0-.49.13-.74.31-.77a1.44,1.44,0,0,1,.75.2,4.77,4.77,0,0,0,2.32.8,3.53,3.53,0,0,0,2-.4,4.1,4.1,0,0,0,1.34-1,5.24,5.24,0,0,0,.9-1.4,9.29,9.29,0,0,0,.63-3,12,12,0,0,0-2.11-6.22C21.34,14.42,21.14,14.09,20.92,13.75Zm-3,7.43h-.13L11.13,8.66V8.11l.2.36L17.94,21h0Zm4.64.77a5.68,5.68,0,0,1-1,3l-.1.11.11-.1c-.08.09-.17.17-.26.26l.1-.12a5.62,5.62,0,0,0,1-3c.1-1.69-.72-3.46-1.86-5.31-.19-.31-.4-.63-.61-1-.32-.49-.66-1-1-1.48-1.73-2.55-3.53-5.2-4.12-8.06a6.47,6.47,0,0,1,.07-2.5,5.17,5.17,0,0,1,1.39-2.51l.07-.06A5.26,5.26,0,0,0,15,3.64a6.47,6.47,0,0,0-.07,2.5c.59,2.86,2.39,5.5,4.13,8.06l1,1.41c.21.32.42.64.61,1C21.79,18.44,22.63,20.24,22.52,22Z" />
      <path className="fill-[#c2986b]" d="M18.06,4.28a2.29,2.29,0,0,0,.65,1.45c0-.67,0-1.06.06-1.72,0-.31.14-.34.16,0,.05.67.07,1,.13,1.74a2.24,2.24,0,0,0,.66-1.45,3,3,0,0,0-.86-1.75A3,3,0,0,0,18.06,4.28Z" />
      <path className="fill-[#c2986b]" d="M31.64,16.86a4,4,0,0,0-1.25.44,11.42,11.42,0,0,0,.71-1.13,10.38,10.38,0,0,0,.72-1.67,27.45,27.45,0,0,1,2.69-1.08c.57-.19.68,0,.16.27-.88.52-1.74,1-3,1.6a4.46,4.46,0,0,0,3.08,0A4.89,4.89,0,0,0,37,12.56a4.92,4.92,0,0,0-3.53-.19,3.72,3.72,0,0,0-1.35,1.11,10.45,10.45,0,0,0,.32-2.09c0-.22,0-.44,0-.66A26.38,26.38,0,0,1,34.2,8.48c.37-.41.53-.34.25.14-.46.81-.94,1.56-1.62,2.62a4,4,0,0,0,2.45-1.38,4.5,4.5,0,0,0,.51-3.19A4.45,4.45,0,0,0,32.9,8.13a3.15,3.15,0,0,0-.54,1.37,10.86,10.86,0,0,0-.63-2.57c0-.83,0-1.64.08-2.34.05-.43.18-.47.23,0,.08.74.13,1.45.19,2.45a3.27,3.27,0,0,0,.92-2A3.54,3.54,0,0,0,32,2.69,3.57,3.57,0,0,0,30.81,5s0,.06,0,.09A11.48,11.48,0,0,0,29.2,2.94l-.08,0c-.25-.49-.48-1-.65-1.41s0-.36.14-.1c.29.45.54.89.91,1.52a2.38,2.38,0,0,0-.07-1.61A2.55,2.55,0,0,0,28,.2,2.51,2.51,0,0,0,28,2a2.31,2.31,0,0,0,1.18,1,10.78,10.78,0,0,1,1.77,2.5,3.06,3.06,0,0,0,.43,1l.06.11a10.61,10.61,0,0,1,.71,4.77A10.6,10.6,0,0,1,30.69,16,11,11,0,0,1,28,19.1c-.3.23-.58.42-.86.6V6.55h1V5.88H24.79L21.2,13.17h0c.22.33.43.66.62,1l3-5.95V20.8h0v.7l.06,0c.19-.07.47-.16.82-.31a12,12,0,0,0,2.66-1.63c.22-.18.44-.38.66-.59a34.65,34.65,0,0,1,3.61-.46c.78,0,.87.18.13.39-1.27.36-2.49.64-4.23,1a5.79,5.79,0,0,0,3.83,1A6.3,6.3,0,0,0,36,18.24,6.23,6.23,0,0,0,31.64,16.86ZM25.19,7.71l.19-.35V20.59l-.19.07Z" />

      {/* SUMAS Typography: Dark Navy in light mode, clean white in dark mode */}
      <path className="fill-[#242156] dark:fill-white transition-colors" d="M48.26,18.71a5.26,5.26,0,0,1-3.84,1.34A6.67,6.67,0,0,1,40.65,19a2.89,2.89,0,0,1,0,.63c-.05.2-.26.3-.6.3V15.41h.65q.36,4,3.66,4a3.64,3.64,0,0,0,1.53-.31A2.31,2.31,0,0,0,47,15.89a5.41,5.41,0,0,0-2.46-1.75c-1.39-.6-2.21-1-2.46-1.1a3.35,3.35,0,0,1-2-2.95A2.94,2.94,0,0,1,41,8a4.9,4.9,0,0,1,3.62-1.3A7,7,0,0,1,48,7.52a1.45,1.45,0,0,1,0-.4c.06-.22.26-.33.61-.33v3.77H48a3.29,3.29,0,0,0-.6-2,3.29,3.29,0,0,0-2.76-1.23,3.8,3.8,0,0,0-1.34.23,2,2,0,0,0-1.4,2,2,2,0,0,0,.26,1,4.92,4.92,0,0,0,2.41,1.68c1.41.62,2.25,1,2.52,1.15a3.47,3.47,0,0,1,2.07,3.08A3.13,3.13,0,0,1,48.26,18.71Z" />
      <path className="fill-[#242156] dark:fill-white transition-colors" d="M50.48,6.9h5.28v.56h-1.7v7.39a8.16,8.16,0,0,0,.3,2.38,3.08,3.08,0,0,0,3.32,2.22,4.36,4.36,0,0,0,.51,0q3.11-.32,3.11-4.5V7.46H59.57V6.9h4.21v.56H62.05v7.33A9.48,9.48,0,0,1,61.82,17c-.54,2.06-2.07,3.1-4.6,3.1q-5,0-5-5.07V7.46H50.48Z" />
      <path className="fill-[#242156] dark:fill-white transition-colors" d="M80.72,7.46H79V19.27h1.16a.83.83,0,0,1,.22,0c.23,0,.34.22.34.53H75.55v-.56h1.72V8.84l-5,11.1h-.45L67.12,10v9.27h1.16a.78.78,0,0,1,.22,0c.23,0,.34.22.34.53H64.53v-.56h1.73V7.46H64.53V6.9h3.09l5,10.54L77.27,6.9h3.45Z" />
      <path className="fill-[#242156] dark:fill-white transition-colors" d="M89.93,19.83v-.56h1.4l-1.62-4.18h-4.5l-1.62,4.18h1.06a.76.76,0,0,1,.21,0c.23,0,.35.22.35.53H81.37v-.56h1.36L87.56,6.9h.8l4.93,12.37H94a.78.78,0,0,1,.22,0c.23,0,.35.22.35.53ZM87.45,9.25l-2,5.22h4Z" />
      <path className="fill-[#242156] dark:fill-white transition-colors" d="M104.14,18.71a5.26,5.26,0,0,1-3.84,1.34A6.67,6.67,0,0,1,96.53,19a2.89,2.89,0,0,1,0,.63c0,.2-.26.3-.6.3V15.41h.65q.36,4,3.66,4a3.64,3.64,0,0,0,1.53-.31,2.31,2.31,0,0,0,1.19-3.25,5.41,5.41,0,0,0-2.46-1.75c-1.4-.6-2.21-1-2.46-1.1a3.35,3.35,0,0,1-2-2.95A2.94,2.94,0,0,1,96.83,8a4.9,4.9,0,0,1,3.62-1.3,7,7,0,0,1,3.45.84,1.45,1.45,0,0,1,0-.4c.06-.22.26-.33.61-.33v3.77h-.65a3.29,3.29,0,0,0-.6-2,3.29,3.29,0,0,0-2.76-1.23,3.8,3.8,0,0,0-1.34.23,2,2,0,0,0-1.4,2,2,2,0,0,0,.26,1,4.92,4.92,0,0,0,2.41,1.68c1.41.62,2.25,1,2.52,1.15a3.47,3.47,0,0,1,2.07,3.08A3.13,3.13,0,0,1,104.14,18.71Z" />
    </g>
  </svg>
);

// ==========================================
// EMBLEM SUMAS (HANYA SIMBOL LAUREL & S - TANPA TEKS & TANPA BG LINGKARAN)
// ==========================================
const SumasEmblem = ({ className = "h-7 w-auto" }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 37 26.73" 
    className={className} 
    role="img"
    aria-label="SUMAS Emblem"
  >
    <path className="fill-[#c2986b]" d="M28.13,6.55h-1V20.77l1,0v.65H24.78v-.68h0V8.21L18.12,21.58h-.61l-6.33-12V20.77l1,0v.65H9v-.68h1V6.55H9V5.88h2.85l6.7,12.69L24.79,5.88h3.34Z"/>
    <path className="fill-[#c2986b]" d="M15.9,4.52A4.14,4.14,0,0,1,16.72,2a2.79,2.79,0,0,1,1-.77A3.33,3.33,0,0,1,19.12,1a2.26,2.26,0,0,1,2,.91,5.58,5.58,0,0,1,.91,2,7.11,7.11,0,0,1,.26,2h1V.39h-1c-.05.51-.15.77-.29.8A1.09,1.09,0,0,1,21.33,1,5.42,5.42,0,0,0,19.09,0,3.93,3.93,0,0,0,16,1,5.57,5.57,0,0,0,14.46,3.7a6.83,6.83,0,0,0-.07,2.67c1.26,6.08,7.87,11.29,7.58,15.71A5.24,5.24,0,0,1,21,24.84a3,3,0,0,1-1.06.84,2.41,2.41,0,0,1-1.2.3,3.27,3.27,0,0,1-1.35-.33,3,3,0,0,1-.91-.73,3.71,3.71,0,0,1-.59-1,10.34,10.34,0,0,1-.36-1.07,10,10,0,0,1-.2-1.37,4.89,4.89,0,0,1,0-.71h-.93v5.68h.95c0-.48.12-.74.31-.76a1.39,1.39,0,0,1,.74.2,4.86,4.86,0,0,0,2.32.8,3.49,3.49,0,0,0,2-.4,4,4,0,0,0,1.35-1A5.11,5.11,0,0,0,23,23.91a9.17,9.17,0,0,0,.63-3c0-2.71-1.33-5.15-3.41-8.25C18.27,9.82,15.9,7.29,15.9,4.52Z"/>
    <path className="fill-[#c2986b]" d="M4.41,18.49a38.65,38.65,0,0,1,4.24.57,5.76,5.76,0,0,0-3.29-2.2A6.23,6.23,0,0,0,1,18.24a6.26,6.26,0,0,0,3.65,2.69,5.75,5.75,0,0,0,3.82-1c-1.73-.4-3-.68-4.22-1C3.53,18.66,3.63,18.44,4.41,18.49Z"/>
    <path className="fill-[#c2986b]" d="M2.49,13.42a30.36,30.36,0,0,1,3.09,1.25,4.52,4.52,0,0,0-2.05-2.3A4.92,4.92,0,0,0,0,12.56a4.85,4.85,0,0,0,2.22,2.75,4.46,4.46,0,0,0,3.08,0c-1.23-.64-2.1-1.08-3-1.6C1.8,13.38,1.92,13.23,2.49,13.42Z"/>
    <path className="fill-[#c2986b]" d="M2.8,8.48a26.8,26.8,0,0,1,1.87,2.4,4,4,0,0,0-.58-2.75A4.42,4.42,0,0,0,1.21,6.67a4.5,4.5,0,0,0,.51,3.19,4.1,4.1,0,0,0,2.45,1.38C3.49,10.18,3,9.43,2.54,8.62,2.27,8.14,2.43,8.07,2.8,8.48Z"/>
    <path className="fill-[#c2986b]" d="M5.18,4.59A18.67,18.67,0,0,1,5.26,7a3.17,3.17,0,0,0,.92-2A3.53,3.53,0,0,0,5,2.69,3.54,3.54,0,0,0,3.85,5a3.27,3.27,0,0,0,.92,2c.06-1,.1-1.71.19-2.45C5,4.12,5.14,4.16,5.18,4.59Z"/>
    <path className="fill-[#c2986b]" d="M8.53,1.48A15.27,15.27,0,0,1,7.8,3.05,2.3,2.3,0,0,0,9.05,2,2.57,2.57,0,0,0,9,.2,2.52,2.52,0,0,0,7.55,1.29,2.32,2.32,0,0,0,7.48,2.9c.36-.63.62-1.07.91-1.52C8.56,1.12,8.64,1.18,8.53,1.48Z"/>
    <path className="fill-[#c2986b]" d="M12.21,20.8c-.16-.06-.37-.12-.62-.23A10.93,10.93,0,0,1,9,19.1,10.82,10.82,0,0,1,6.31,16,10.47,10.47,0,0,1,4.9,11.36a10.61,10.61,0,0,1,.71-4.77A11.4,11.4,0,0,1,7.88,3s.12-.08.06-.13-.14.06-.14.06A11.43,11.43,0,0,0,5.41,6.51a11.22,11.22,0,0,0,.49,9.66,11.32,11.32,0,0,0,2.78,3.37,11.75,11.75,0,0,0,2.66,1.63c.34.15.63.24.82.31l.05,0Z"/>
    <path className="fill-[#c2986b]" d="M18.77,4c0,.66-.06,1-.06,1.72a2.34,2.34,0,0,1-.65-1.45,3,3,0,0,1,.8-1.75,3,3,0,0,1,.86,1.75,2.24,2.24,0,0,1-.66,1.45C19,5,19,4.66,18.93,4,18.91,3.67,18.79,3.7,18.77,4Z"/>
    <path className="fill-[#c2986b]" d="M32.59,18.49a38.33,38.33,0,0,0-4.24.57,5.76,5.76,0,0,1,3.29-2.2A6.23,6.23,0,0,1,36,18.24a6.26,6.26,0,0,1-3.65,2.69,5.79,5.79,0,0,1-3.83-1c1.74-.4,3-.68,4.23-1C33.46,18.66,33.37,18.44,32.59,18.49Z"/>
    <path className="fill-[#c2986b]" d="M34.51,13.42a30.36,30.36,0,0,0-3.09,1.25,4.48,4.48,0,0,1,2-2.3,4.92,4.92,0,0,1,3.53.19,4.88,4.88,0,0,1-2.23,2.75,4.43,4.43,0,0,1-3.07,0c1.23-.64,2.09-1.08,3-1.6C35.19,13.38,35.08,13.23,34.51,13.42Z"/>
    <path className="fill-[#c2986b]" d="M34.2,8.48a26.8,26.8,0,0,0-1.87,2.4,4.05,4.05,0,0,1,.57-2.75,4.45,4.45,0,0,1,2.89-1.46,4.5,4.5,0,0,1-.51,3.19,4.15,4.15,0,0,1-2.45,1.38c.68-1.06,1.16-1.81,1.62-2.62C34.73,8.14,34.57,8.07,34.2,8.48Z"/>
    <path className="fill-[#c2986b]" d="M31.81,4.59A23.08,23.08,0,0,0,31.73,7a3.27,3.27,0,0,1-.92-2A3.57,3.57,0,0,1,32,2.69,3.54,3.54,0,0,1,33.15,5a3.27,3.27,0,0,1-.92,2c-.06-1-.11-1.71-.19-2.45C32,4.12,31.86,4.16,31.81,4.59Z"/>
    <path className="fill-[#c2986b]" d="M28.47,1.48a15.27,15.27,0,0,0,.73,1.57A2.3,2.3,0,0,1,28,2,2.51,2.51,0,0,1,28,.2a2.55,2.55,0,0,1,1.48,1.09,2.38,2.38,0,0,1,.07,1.61c-.37-.63-.62-1.07-.91-1.52C28.43,1.12,28.36,1.18,28.47,1.48Z"/>
    <path className="fill-[#c2986b]" d="M24.78,20.8c.17-.06.38-.12.63-.23A10.71,10.71,0,0,0,30.69,16a10.6,10.6,0,0,0,1.41-4.59,10.61,10.61,0,0,0-.71-4.77A11.4,11.4,0,0,0,29.12,3s-.12-.08-.07-.13.15.06.15.06a11.41,11.41,0,0,1,2.38,3.57,10.86,10.86,0,0,1,.86,4.87,10.9,10.9,0,0,1-1.35,4.79,11.3,11.3,0,0,1-2.77,3.37,12,12,0,0,1-2.66,1.63c-.35.15-.63.24-.82.31l-.06,0Z"/>
  </svg>
);

export default function App() {
  // STATE UNTUK MENU AKTIF
  const [activeMenu, setActiveMenu] = useState('dashboard');

  const [selectedSku, setSelectedSku] = useState('');
  const [selectedPinLength, setSelectedPinLength] = useState('8');
  
  // TEMA & ANIMASI
  const [isDarkMode, setIsDarkMode] = useState(() => {
    try {
      const saved = localStorage.getItem('sumas_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem('sumas_theme', isDarkMode ? 'dark' : 'light');
    } catch (_) {}
  }, [isDarkMode]);

  const toggleTheme = (e?: React.MouseEvent) => {
    const nextTheme = !isDarkMode;
    const isAppearanceTransition =
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isAppearanceTransition || !e) {
      setIsDarkMode(nextTheme);
      return;
    }

    try {
      const rect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.() || {
        left: window.innerWidth - 60,
        top: 30,
        width: 40,
        height: 40,
      };
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const transition = (document as any).startViewTransition(() => {
        setIsDarkMode(nextTheme);
      });

      transition.ready?.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 500,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      }).catch(() => {
        setIsDarkMode(nextTheme);
      });
    } catch (_) {
      setIsDarkMode(nextTheme);
    }
  };

  const [isSidebarMinimized, setIsSidebarMinimized] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [formQty, setFormQty] = useState('');
  const [formQrType, setFormQrType] = useState<'dynamic' | 'static'>('dynamic');
  const [formRedirectUrl, setFormRedirectUrl] = useState('https://cek.sumas.id/');
  const [formRequirePin, setFormRequirePin] = useState(true);
  const [formEnableGps, setFormEnableGps] = useState(true);
  const [isCreateBatchModalOpen, setIsCreateBatchModalOpen] = useState(false);

  // Pencarian & Pengurutan (Sort By) Riwayat Batch
  const [batchSearch, setBatchSearch] = useState('');
  const [batchSortBy, setBatchSortBy] = useState('newest');
  const [batchFilterStatus, setBatchFilterStatus] = useState('all');

  // Modal Edit URL Pengalihan Dinamis Pasca-Cetak
  const [isEditUrlModalOpen, setIsEditUrlModalOpen] = useState(false);
  const [batchToEditUrl, setBatchToEditUrl] = useState<any>(null);
  const [editRedirectUrlInput, setEditRedirectUrlInput] = useState('');
  const [editQrTypeInput, setEditQrTypeInput] = useState<'dynamic' | 'static'>('dynamic');
  const [editRequirePinInput, setEditRequirePinInput] = useState(true);
  const [editEnableGpsInput, setEditEnableGpsInput] = useState(true);
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false);

  interface UserItem {
    id: string;
    name: string;
    username?: string;
    email: string;
    phone?: string;
    role: string;
    avatar?: string | null;
    status?: 'Aktif' | 'Nonaktif';
    createdAt?: string;
  }

  interface BrandItem {
    id: string;
    name: string;
    logo: string | null;
    ownerId: string;
    ownerName: string;
    ownerEmail?: string;
    ownerRole?: string;
    description: string;
    category: string;
    status: 'Aktif' | 'Nonaktif';
    createdAt: string;
  }

  interface ProductItem {
    id: string;
    brandId: string;
    brandName: string;
    sku: string;
    skuCode?: string;
    category: string;
    description?: string;
    image?: string;
    createdAt?: string;
  }

  // HELPER API UNTUK SQLITE
  const api = {
    async getBatches() {
      const res = await fetch('/api/batches');
      if (!res.ok) throw new Error('Gagal memuat batch');
      return res.json();
    },
    async createBatch(batch: any) {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error('Gagal membuat batch');
      return res.json();
    },
    async updateBatch(id: string, updates: any) {
      const res = await fetch(`/api/batches/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Gagal memperbarui batch');
      return res.json();
    },
    async updateBatchRedirectUrl(id: string, payload: { redirectUrl: string; qrType?: string; requirePin?: boolean; enableGps?: boolean }) {
      const res = await fetch(`/api/batches/${id}/redirect-url`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Gagal memperbarui URL Pengalihan QR');
      return res.json();
    },
    async deleteBatch(id: string) {
      const res = await fetch(`/api/batches/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus batch');
      return res.json();
    },
    async getBatchTags(batchId: string, page = 1, limit = 96, search = '', status = 'all', project = 'all') {
      const q = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        search,
        status,
        project
      });
      const res = await fetch(`/api/batches/${batchId}/tags?${q.toString()}`);
      if (!res.ok) throw new Error('Gagal memuat tags');
      return res.json();
    },
    async getAllBatchTags(batchId: string) {
      const res = await fetch(`/api/batches/${batchId}/all-tags`);
      if (!res.ok) throw new Error('Gagal memuat seluruh data tag batch');
      return res.json();
    },
    async getBatchSummary(batchId: string) {
      const res = await fetch(`/api/batches/${batchId}/summary`);
      if (!res.ok) throw new Error('Gagal memuat ringkasan batch');
      return res.json();
    },
    async allocateTags(batchId: string, payload: any) {
      const res = await fetch(`/api/batches/${batchId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Gagal mengalokasikan tag');
      return res.json();
    },
    async deallocateProject(batchId: string, project: string) {
      const res = await fetch(`/api/batches/${batchId}/deallocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project }),
      });
      if (!res.ok) throw new Error('Gagal membatalkan alokasi');
      return res.json();
    },
    async updateProject(batchId: string, payload: any) {
      const res = await fetch(`/api/batches/${batchId}/projects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Gagal memperbarui data proyek');
      return res.json();
    },
    async getAuditLogs() {
      const res = await fetch('/api/audit-logs');
      if (!res.ok) throw new Error('Gagal memuat audit log');
      return res.json();
    },
    async createAuditLog(log: any) {
      const res = await fetch('/api/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(log),
      });
      if (!res.ok) throw new Error('Gagal menyimpan log');
      return res.json();
    },
    async getDashboardStats() {
      const res = await fetch('/api/dashboard/stats');
      if (!res.ok) throw new Error('Gagal memuat stats');
      return res.json();
    },
    async getBrands() {
      const res = await fetch('/api/brands');
      if (!res.ok) throw new Error('Gagal memuat brands');
      return res.json();
    },
    async createBrand(brand: any) {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brand),
      });
      if (!res.ok) throw new Error('Gagal membuat brand');
      return res.json();
    },
    async updateBrand(id: string, updates: any) {
      const res = await fetch(`/api/brands/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Gagal memperbarui brand');
      return res.json();
    },
    async deleteBrand(id: string) {
      const res = await fetch(`/api/brands/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus brand');
      return res.json();
    },
    async getUsers() {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Gagal memuat users');
      return res.json();
    },
    async createUser(user: any) {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      if (!res.ok) throw new Error('Gagal membuat user');
      return res.json();
    },
    async updateUser(id: string, updates: any) {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Gagal memperbarui user');
      return res.json();
    },
    async deleteUser(id: string) {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus user');
      return res.json();
    },
    async getCategories() {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Gagal memuat categories');
      return res.json();
    },
    async getProducts() {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Gagal memuat products');
      return res.json();
    },
    async createProduct(product: any) {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      if (!res.ok) throw new Error('Gagal membuat product');
      return res.json();
    },
    async updateProduct(id: string, product: any) {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
      });
      if (!res.ok) throw new Error('Gagal memperbarui product');
      return res.json();
    },
    async deleteProduct(id: string) {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus product');
      return res.json();
    },
    async getNotifications() {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Gagal memuat notifikasi');
      return res.json();
    },
    async markNotificationsRead(payload?: { id?: string; all?: boolean; ids?: string[] }) {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || { all: true }),
      });
      if (!res.ok) throw new Error('Gagal menandai notifikasi');
      return res.json();
    },
    async respondPasswordReset(id: string, action: 'approve' | 'reject', actionNote?: string) {
      const res = await fetch(`/api/password-resets/${id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actionNote }),
      });
      if (!res.ok) throw new Error('Gagal memproses permohonan reset sandi');
      return res.json();
    }
  };

  const [dbStatus, setDbStatus] = useState<'connected' | 'connecting' | 'fallback'>('connecting');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  const [batches, setBatches] = useState<any[]>(() => {
    try {
      const savedBatches = localStorage.getItem('sumas_batches') || localStorage.getItem('mki_batches');
      return savedBatches ? JSON.parse(savedBatches) : [];
    } catch (e) {
      return [];
    }
  });

  const [auditLogs, setAuditLogs] = useState<any[]>(() => {
    try {
      const savedLogs = localStorage.getItem('sumas_auditLogs') || localStorage.getItem('mki_auditLogs');
      return savedLogs ? JSON.parse(savedLogs) : [];
    } catch (e) {
      return [];
    }
  });

  const [brands, setBrands] = useState<BrandItem[]>(() => {
    try {
      const savedBrands = localStorage.getItem('sumas_brands') || localStorage.getItem('mki_brands');
      if (savedBrands) {
        const parsed = JSON.parse(savedBrands);
        return parsed.map((b: BrandItem) => {
          if (b.name.toLowerCase() === 'sumas' && (!b.logo || b.logo.includes('541888946425') || b.logo.includes('logo_vertikal'))) {
            return { ...b, name: 'Sumas', logo: '/assets/brand/logo_horizontal.svg' };
          }
          return b;
        });
      }
      return [];
    } catch (e) {
      return [];
    }
  });

  const [users, setUsers] = useState<UserItem[]>(() => {
    try {
      const savedUsers = localStorage.getItem('sumas_users') || localStorage.getItem('mki_users');
      return savedUsers ? JSON.parse(savedUsers) : [];
    } catch (e) {
      return [];
    }
  });

  const [products, setProducts] = useState<ProductItem[]>(() => {
    try {
      const savedProducts = localStorage.getItem('sumas_products') || localStorage.getItem('mki_products');
      return savedProducts ? JSON.parse(savedProducts) : [];
    } catch (e) {
      return [];
    }
  });

  // State master kategori produk dari database SQLite (untuk resolusi hirarki 3 layer)
  const [categories, setCategories] = useState<{ id: string; name: string; level: number; parentId?: string | null; code?: string | null; specSchema?: string | null }[]>([]);

  // Helper resolusi teks kategori 3 layer (misal: "Material & Konstruksi > Partisi Cubicle Toilet > Phenolic Board 12mm Standard")
  const resolveCategoryHierarchy = (categoryStr: string, categoriesList?: { id: string; name: string; level: number; parentId?: string | null }[]) => {
    if (!categoryStr) return null;
    const trimmed = categoryStr.trim();

    // 1. Cek pemisah umum ' > ', '>', '›', '→', atau ' / '
    for (const sep of ['>', '›', '→', ' / ']) {
      if (trimmed.includes(sep)) {
        const parts = trimmed.split(sep).map(p => p.trim()).filter(Boolean);
        if (parts.length > 1) return parts;
      }
    }

    // 2. Lookup ke database kategori berdasarkan nama jika kategori tunggal
    if (categoriesList && categoriesList.length > 0) {
      const match = categoriesList.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
      if (match) {
        if (match.level === 3) {
          const parent = categoriesList.find(c => c.id === match.parentId);
          const grandparent = parent ? categoriesList.find(c => c.id === parent.parentId) : null;
          const res: string[] = [];
          if (grandparent) res.push(grandparent.name);
          if (parent) res.push(parent.name);
          res.push(match.name);
          return res;
        } else if (match.level === 2) {
          const parent = categoriesList.find(c => c.id === match.parentId);
          const res: string[] = [];
          if (parent) res.push(parent.name);
          res.push(match.name);
          return res;
        } else if (match.level === 1) {
          return [match.name];
        }
      }
    }

    return null;
  };

  // Metrik Live yang diagregasikan langsung dari database & state batches & brands
  const liveStats = React.useMemo(() => {
    let totalTags = 0;
                    const projectMap: { [key: string]: { name: string; count: number; batchId: string; batchObj: any; specs: string } } = {};
    const brandMap: { [key: string]: { brand: string; batchCount: number; totalQty: number; logo?: string | null } } = {};

    // Inisialisasi peta brand dari master brands
    brands.forEach(br => {
      brandMap[br.name] = {
        brand: br.name,
        batchCount: 0,
        totalQty: 0,
        logo: br.logo
      };
    });

    batches.forEach(b => {
      const qty = Number(b.qty) || 0;
      totalTags += qty;
      if (!brandMap[b.brand]) {
        brandMap[b.brand] = { brand: b.brand, batchCount: 0, totalQty: 0 };
      }
      brandMap[b.brand].batchCount += 1;
      brandMap[b.brand].totalQty += qty;

      const used = typeof b.usedCount === 'number' ? b.usedCount : (b.project ? qty : 0);
      if (b.project) {
        const parts = String(b.project).split(',').map((p: string) => p.trim()).filter(Boolean);
        parts.forEach((proj: string) => {
          if (!projectMap[proj]) {
            projectMap[proj] = { name: proj, count: used || qty, batchId: b.batchId, batchObj: b, specs: b.specs || '-' };
          }
        });
      }
    });

    const projectsList = Object.values(projectMap).sort((a, b) => b.count - a.count);

    return {
      totalTags,
      totalBatches: batches.length,
      activeBatches: batches.filter(b => b.status !== 'Disuspend').length,
      suspendedBatches: batches.filter(b => b.status === 'Disuspend').length,
      projectsList,
      brandList: Object.values(brandMap),
      totalLogs: auditLogs.length,
      totalBrands: brands.length,
      activeBrands: brands.filter(b => b.status === 'Aktif').length,
    };
  }, [batches, auditLogs, brands]);

  // Fungsi sinkronisasi manual live dengan database SQLite
  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const [dbBatches, dbLogs, dbBrands, dbUsers, dbProducts, dbCategories] = await Promise.all([
        api.getBatches(), 
        api.getAuditLogs(),
        api.getBrands(),
        api.getUsers(),
        api.getProducts(),
        api.getCategories()
      ]);
      if (Array.isArray(dbBatches)) setBatches(dbBatches);
      if (Array.isArray(dbLogs)) setAuditLogs(dbLogs);
      if (Array.isArray(dbBrands)) setBrands(dbBrands);
      if (Array.isArray(dbUsers)) setUsers(dbUsers);
      if (Array.isArray(dbProducts)) setProducts(dbProducts);
      if (Array.isArray(dbCategories)) setCategories(dbCategories);
      setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDbStatus('connected');
    } catch (err) {
      console.error('Gagal sinkronkan data:', err);
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  // Load awal dari database SQLite
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.getBatches(), 
      api.getAuditLogs(), 
      api.getBrands(), 
      api.getUsers(),
      api.getProducts(),
      api.getCategories()
    ])
      .then(([dbBatches, dbLogs, dbBrands, dbUsers, dbProducts, dbCategories]) => {
        if (!isMounted) return;
        if (Array.isArray(dbBatches)) {
          setBatches(dbBatches);
        }
        if (Array.isArray(dbLogs)) {
          setAuditLogs(dbLogs);
        }
        if (Array.isArray(dbBrands)) {
          setBrands(dbBrands);
        }
        if (Array.isArray(dbUsers)) {
          setUsers(dbUsers);
        }
        if (Array.isArray(dbProducts)) {
          setProducts(dbProducts);
        }
        if (Array.isArray(dbCategories)) {
          setCategories(dbCategories);
        }
        setDbStatus('connected');
        setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      })
      .catch((err) => {
        console.warn('Gagal menghubungkan ke SQLite backend, fallback ke localStorage:', err);
        if (isMounted) setDbStatus('fallback');
      });

    loadNotifications();
    const notifInterval = setInterval(() => {
      if (isMounted) loadNotifications();
    }, 25000);

    return () => {
      isMounted = false;
      clearInterval(notifInterval);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('sumas_batches', JSON.stringify(batches));
    } catch (e) {
      console.error("Gagal menyimpan data ke localStorage", e);
    }
  }, [batches]);

  useEffect(() => {
    try {
      localStorage.setItem('sumas_auditLogs', JSON.stringify(auditLogs));
    } catch (e) {
      console.error("Gagal menyimpan log ke localStorage", e);
    }
  }, [auditLogs]);

  useEffect(() => {
    try {
      localStorage.setItem('sumas_brands', JSON.stringify(brands));
    } catch (e) {
      console.error("Gagal menyimpan brands ke localStorage", e);
    }
  }, [brands]);

  useEffect(() => {
    try {
      localStorage.setItem('sumas_users', JSON.stringify(users));
    } catch (e) {
      console.error("Gagal menyimpan users ke localStorage", e);
    }
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem('sumas_products', JSON.stringify(products));
    } catch (e) {
      console.error("Gagal menyimpan products ke localStorage", e);
    }
  }, [products]);

  // Sinkronisasi otomatis saat berpindah ke menu Brand, SKU, atau Users
  useEffect(() => {
    if (activeMenu === 'brand' || activeMenu === 'users' || activeMenu === 'sku') {
      Promise.all([api.getBrands(), api.getUsers(), api.getProducts()])
        .then(([dbBrands, dbUsers, dbProducts]) => {
          if (Array.isArray(dbBrands)) setBrands(dbBrands);
          if (Array.isArray(dbUsers)) setUsers(dbUsers);
          if (Array.isArray(dbProducts)) setProducts(dbProducts);
        })
        .catch(() => {});
    }
  }, [activeMenu]);

  // ==========================================
  // STATE KHUSUS BRAND MANAGEMENT (CRUD)
  // ==========================================
  const [brandSearch, setBrandSearch] = useState('');
  const [brandSortBy, setBrandSortBy] = useState('newest');
  const [brandFilterStatus, setBrandFilterStatus] = useState('all');

  const [isCreateBrandModalOpen, setIsCreateBrandModalOpen] = useState(false);
  const [isEditBrandModalOpen, setIsEditBrandModalOpen] = useState(false);
  const [isDeleteBrandModalOpen, setIsDeleteBrandModalOpen] = useState(false);
  const [isDetailBrandModalOpen, setIsDetailBrandModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  const [brandToDelete, setBrandToDelete] = useState<BrandItem | null>(null);
  const [brandToView, setBrandToView] = useState<BrandItem | null>(null);

  const [brandForm, setBrandForm] = useState({
    id: '',
    name: '',
    logo: '',
    ownerId: '',
    description: '',
    category: 'Material & Konstruksi',
    status: 'Aktif' as 'Aktif' | 'Nonaktif'
  });

  // ==========================================
  // STATE KHUSUS SKU / PRODUK MANAGEMENT (CRUD)
  // ==========================================
  const [skuSearch, setSkuSearch] = useState('');
  const [skuFilterBrand, setSkuFilterBrand] = useState('all');
  const [skuSortBy, setSkuSortBy] = useState('newest');
  const [skuPage, setSkuPage] = useState(1);
  const [skuPerPage, setSkuPerPage] = useState(10);
  const [skuSubView, setSkuSubView] = useState<'list' | 'create' | 'edit'>('list');
  const [isSkuFormDirty, setIsSkuFormDirty] = useState<boolean>(false);
  const [showSkuLeaveModal, setShowSkuLeaveModal] = useState<boolean>(false);
  const [pendingSkuLeaveNav, setPendingSkuLeaveNav] = useState<(() => void) | null>(null);

  // Helper pelindung navigasi saat form SKU sedang diedit / belum disimpan
  const requestLeaveSkuPage = (onProceed: () => void) => {
    if (activeMenu === 'sku' && (skuSubView === 'create' || skuSubView === 'edit') && isSkuFormDirty) {
      setPendingSkuLeaveNav(() => onProceed);
      setShowSkuLeaveModal(true);
    } else {
      onProceed();
    }
  };

  // Tangani navigasi mundur browser (popstate) saat di halaman tambah SKU
  useEffect(() => {
    if (activeMenu === 'sku' && (skuSubView === 'create' || skuSubView === 'edit')) {
      window.history.pushState({ skuView: 'create' }, '');

      const handlePopState = () => {
        if (isSkuFormDirty) {
          window.history.pushState({ skuView: 'create' }, '');
          setPendingSkuLeaveNav(() => () => {
            setIsSkuFormDirty(false);
            setSkuSubView('list');
          });
          setShowSkuLeaveModal(true);
        } else {
          setSkuSubView('list');
        }
      };

      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }, [activeMenu, skuSubView, isSkuFormDirty]);

  // Tangani refresh atau tutup tab browser saat form SKU belum tersimpan
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeMenu === 'sku' && (skuSubView === 'create' || skuSubView === 'edit') && isSkuFormDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeMenu, skuSubView, isSkuFormDirty]);

  const [isCreateSkuModalOpen, setIsCreateSkuModalOpen] = useState(false);
  const [isEditSkuModalOpen, setIsEditSkuModalOpen] = useState(false);
  const [isDeleteSkuModalOpen, setIsDeleteSkuModalOpen] = useState(false);
  const [isDetailSkuModalOpen, setIsDetailSkuModalOpen] = useState(false);

  const [skuToEdit, setSkuToEdit] = useState<ProductItem | null>(null);
  const [skuToDelete, setSkuToDelete] = useState<ProductItem | null>(null);
  const [skuToView, setSkuToView] = useState<ProductItem | null>(null);

  const [openSkuDropdownId, setOpenSkuDropdownId] = useState<string | null>(null);
  const [skuDropdownPos, setSkuDropdownPos] = useState({ top: 0, left: 0 });
  const [skuDropdownDirection, setSkuDropdownDirection] = useState<'up' | 'down'>('down');

  const defaultSkuForm = {
    id: '',
    brandId: '',
    brandName: '',
    sku: '',
    skuCode: '',
    category: '',
    description: ''
  };
  const [skuForm, setSkuForm] = useState(defaultSkuForm);

  // ==========================================
  // STATE KHUSUS USER MANAGEMENT (CRUD)
  // ==========================================
  const [userSearch, setUserSearch] = useState('');
  const [userSortBy, setUserSortBy] = useState('newest');
  const [userFilterRole, setUserFilterRole] = useState('all');

  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [isDeleteUserModalOpen, setIsDeleteUserModalOpen] = useState(false);
  const [isDetailUserModalOpen, setIsDetailUserModalOpen] = useState(false);

  const [userToDelete, setUserToDelete] = useState<UserItem | null>(null);
  const [userToView, setUserToView] = useState<UserItem | null>(null);

  const [openUserDropdownId, setOpenUserDropdownId] = useState<string | null>(null);
  const [userDropdownPos, setUserDropdownPos] = useState({ top: 0, left: 0 });
  const [userDropdownDirection, setUserDropdownDirection] = useState<'up' | 'down'>('down');

  // Hak akses aktif (Role sistem 2 tingkat: Administrator & Operator)
  const [currentRole, setCurrentRole] = useState<'Administrator' | 'Operator'>('Administrator');

  const defaultUserForm = {
    id: '',
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    role: 'Operator',
    status: 'Aktif' as 'Aktif' | 'Nonaktif',
    avatar: '',
    brandIds: [] as string[],
    sendWelcomeEmail: true
  };

  const [userForm, setUserForm] = useState(defaultUserForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isResetPasswordMode, setIsResetPasswordMode] = useState(false);

  const slugifyUsername = (val: string) => {
    return val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '.')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  };

  const isValidEmail = (email: string): boolean => {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  };

  const generateRandomPassword = () => {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnpqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%&*';
    const all = uppercase + lowercase + numbers + symbols;
    let res = '';
    res += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    res += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    res += numbers.charAt(Math.floor(Math.random() * numbers.length));
    res += symbols.charAt(Math.floor(Math.random() * symbols.length));
    for (let i = 0; i < 8; i++) {
      res += all.charAt(Math.floor(Math.random() * all.length));
    }
    const shuffled = res.split('').sort(() => 0.5 - Math.random()).join('');
    setUserForm(prev => ({
      ...prev,
      password: shuffled,
      confirmPassword: shuffled
    }));
  };

  const userRolesList = [
    'Administrator',
    'Operator'
  ];

  const brandCategoriesList = [
    'Material & Konstruksi',
    'Fashion & Streetwear',
    'Apparel & Lifestyle',
    'Elektronik & Hardware',
    'FMCG & Konsumsi',
    'Umum'
  ];

  const presetUserAvatars = [
    { label: 'Kalingga Jeandy (Admin)', url: '/assets/avatars/user_kalingga.svg' },
    { label: 'Budi Santoso (Operator)', url: '/assets/avatars/user_budi.svg' },
    { label: 'Rina Wijaya (Operator)', url: '/assets/avatars/user_rina.svg' },
    { label: 'Siti Rahma (Operator)', url: '/assets/avatars/user_siti.svg' },
  ];

  const [logoInputTab, setLogoInputTab] = useState<'upload' | 'url' | 'preset'>('upload');

  // Preset foto/logo brand arsitektural siap pakai (100% lokal SVG)
  const presetBrandLogos = [
    { label: 'Sumas / Architectural & Material', url: '/assets/brand/logo_horizontal.svg' },
    { label: 'ASSC / Streetwear & Fashion', url: '/assets/brand/assc_logo.svg' },
    { label: 'BLIMEY! / Apparel & Lifestyle', url: '/assets/brand/blimey_logo.svg' },
  ];

  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<any>(null);
  const [editProjectError, setEditProjectError] = useState<string | null>(null);
  const [deallocatingProject, setDeallocatingProject] = useState<{ name: string; count: number } | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false); 
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false); 
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false); 
  const [isDownloadingLayout, setIsDownloadingLayout] = useState(false); 
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false); 
  const [batchToDownload, setBatchToDownload] = useState<any>(null); 
  const [batchToDelete, setBatchToDelete] = useState<any>(null); 
  const [showLabelGuide, setShowLabelGuide] = useState(false);
  const [activeTab, setActiveTab] = useState('tags'); 
  const [currentTags, setCurrentTags] = useState<any[]>([]); 
  const [tagSearch, setTagSearch] = useState(''); 
  const [tagProjectFilter, setTagProjectFilter] = useState<string>('all');
  const [tagsPage, setTagsPage] = useState(1);
  const [tagsTotalPages, setTagsTotalPages] = useState(1);
  const [tagsTotalCount, setTagsTotalCount] = useState(0);
  const [tagsAvailableCount, setTagsAvailableCount] = useState(0);
  const [tagsUsedCount, setTagsUsedCount] = useState(0);
  const [isTagsLoading, setIsTagsLoading] = useState(false);
  const [batchProjectsList, setBatchProjectsList] = useState<any[]>([]);
  
  const [activeBatch, setActiveBatch] = useState<any>(null);
  const [hoveredTagInfo, setHoveredTagInfo] = useState<{ tag: any; rect: DOMRect } | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [dropdownDirection, setDropdownDirection] = useState<'up' | 'down'>('down');

  const [openBrandDropdownId, setOpenBrandDropdownId] = useState<string | null>(null);
  const [brandDropdownPos, setBrandDropdownPos] = useState({ top: 0, left: 0 });
  const [brandDropdownDirection, setBrandDropdownDirection] = useState<'up' | 'down'>('down');

  // Notifikasi Sistem & Aktivitas (Scan, Pengeditan User, Reset Password)
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [pendingResetCount, setPendingResetCount] = useState(0);
  const [notifCounts, setNotifCounts] = useState({ all: 0, scan: 0, edit: 0, reset: 0 });
  const [isNotifLoading, setIsNotifLoading] = useState(false);
  const [notifToast, setNotifToast] = useState<string | null>(null);
  const notifButtonRef = useRef<HTMLButtonElement>(null);
  const [notifPos, setNotifPos] = useState({ top: 0, right: 0 });

  // Blueprint Standard In-App Toast Alert System (Bottom-Right Positioned)
  interface AlertToast {
    id: string;
    title: string;
    message: string;
    type: 'success' | 'warning' | 'info' | 'error';
    timestamp: number;
  }

  const [alerts, setAlerts] = useState<AlertToast[]>([]);

  const triggerAlert = (
    title: string, 
    message: string, 
    type: 'success' | 'warning' | 'info' | 'error' = 'success',
    duration = 5000
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newAlert: AlertToast = { id, title, message, type, timestamp: Date.now() };

    setAlerts(prev => {
      // Keep up to 4 latest toasts to prevent screen crowding
      const updated = [...prev, newAlert];
      return updated.slice(-4);
    });

    // Auto dismiss tepat setelah 5 detik (5000ms)
    setTimeout(() => {
      setAlerts(prev => prev.filter(a => a.id !== id));
    }, duration || 5000);
  };

  const dismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  // Ambil daftar SKU produk per brand langsung dari database products & batches
  const getBrandProductList = (brandName: string): string[] => {
    const norm = (brandName || '').toLowerCase().trim();
    const catalogSkus = products
      .filter(p => (p.brandName || '').toLowerCase().trim() === norm)
      .map(p => p.sku)
      .filter(Boolean);
    const batchSkus = batches
      .filter(b => (b.brand || '').toLowerCase().trim() === norm)
      .map(b => b.sku)
      .filter(Boolean);
    const uniqueSkus = Array.from(new Set([...catalogSkus, ...batchSkus]));
    return uniqueSkus.length > 0 ? uniqueSkus : ['1 SKU Produk Standar'];
  };

  const [selectedTagsToAllocate, setSelectedTagsToAllocate] = useState<string[]>([]);
  
  // STATE UNTUK MODAL ALOKASI BARU
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [allocationForm, setAllocationForm] = useState({
    project: '',
    codeType: '',
    specs: '',
    warranty: '',
    prodCode: '',
    note: ''
  });

  const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
  const [suspendForm, setSuspendForm] = useState({
    reason: ''
  });

  const [isUnsuspendModalOpen, setIsUnsuspendModalOpen] = useState(false);
  const [unsuspendForm, setUnsuspendForm] = useState({
    reason: ''
  });

  const [editProjectForm, setEditProjectForm] = useState({
    oldProjectName: '',
    name: '',
    specs: '',
    codeType: '',
    warranty: '',
    prodCode: '',
    note: '',
    reason: ''
  });

  // Paginasi & Optimasi Render Tabel Skala Besar (Ribuan - Puluhan Ribu Data)
  const [currentPage, setCurrentPage] = useState(1);
  const [batchPerPage, setBatchPerPage] = useState(10);

  const [brandPage, setBrandPage] = useState(1);
  const [brandPerPage, setBrandPerPage] = useState(10);

  const [userPage, setUserPage] = useState(1);
  const [userPerPage, setUserPerPage] = useState(10); 

  // Menutup modal, dropdown, atau menu saat tombol Escape (Esc) ditekan
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        // Jangan batalkan jika sedang dalam proses unduh / render file
        if (isDownloadingLayout || isDownloadingExcel) return;

        if (isNotifOpen) {
          setIsNotifOpen(false);
          return;
        }

        // Tutup modal paling atas terlebih dahulu sesuai hierarki
        if (isAddUserModalOpen) {
          setIsAddUserModalOpen(false);
          return;
        }
        if (isCreateBrandModalOpen) {
          setIsCreateBrandModalOpen(false);
          return;
        }
        if (isEditBrandModalOpen) {
          setIsEditBrandModalOpen(false);
          return;
        }
        if (isDeleteBrandModalOpen) {
          setIsDeleteBrandModalOpen(false);
          setBrandToDelete(null);
          return;
        }
        if (isDetailBrandModalOpen) {
          setIsDetailBrandModalOpen(false);
          setBrandToView(null);
          return;
        }
        if (isAllocateModalOpen) {
          setIsAllocateModalOpen(false);
          return;
        }
        if (isSuspendModalOpen) {
          setIsSuspendModalOpen(false);
          return;
        }
        if (isUnsuspendModalOpen) {
          setIsUnsuspendModalOpen(false);
          return;
        }
        if (isDownloadModalOpen) {
          setIsDownloadModalOpen(false);
          return;
        }
        if (isCreateBatchModalOpen) {
          setIsCreateBatchModalOpen(false);
          return;
        }
        if (isEditUrlModalOpen) {
          setIsEditUrlModalOpen(false);
          setBatchToEditUrl(null);
          return;
        }
        if (isDeleteModalOpen) {
          setIsDeleteModalOpen(false);
          setBatchToDelete(null);
          return;
        }
        if (isEditProjectModalOpen) {
          setIsEditProjectModalOpen(false);
          setProjectToEdit(null);
          return;
        }
        if (isDetailModalOpen) {
          closeDetailModal();
          return;
        }
        if (openUserDropdownId) {
          setOpenUserDropdownId(null);
          return;
        }
        if (openSkuDropdownId) {
          setOpenSkuDropdownId(null);
          return;
        }
        if (isCreateSkuModalOpen) {
          setIsCreateSkuModalOpen(false);
          return;
        }
        if (isEditSkuModalOpen) {
          setIsEditSkuModalOpen(false);
          return;
        }
        if (isDeleteSkuModalOpen) {
          setIsDeleteSkuModalOpen(false);
          setSkuToDelete(null);
          return;
        }
        if (isDetailSkuModalOpen) {
          setIsDetailSkuModalOpen(false);
          setSkuToView(null);
          return;
        }
        if (isCreateUserModalOpen) {
          setIsCreateUserModalOpen(false);
          return;
        }
        if (isEditUserModalOpen) {
          setIsEditUserModalOpen(false);
          setIsResetPasswordMode(false);
          return;
        }
        if (isDeleteUserModalOpen) {
          setIsDeleteUserModalOpen(false);
          setUserToDelete(null);
          return;
        }
        if (isDetailUserModalOpen) {
          setIsDetailUserModalOpen(false);
          setUserToView(null);
          return;
        }
        if (openBrandDropdownId) {
          setOpenBrandDropdownId(null);
          return;
        }
        if (openDropdownId) {
          setOpenDropdownId(null);
          return;
        }
        if (isMobileMenuOpen) {
          setIsMobileMenuOpen(false);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    isAddUserModalOpen,
    isCreateBrandModalOpen,
    isEditBrandModalOpen,
    isDeleteBrandModalOpen,
    isDetailBrandModalOpen,
    isCreateSkuModalOpen,
    isEditSkuModalOpen,
    isDeleteSkuModalOpen,
    isDetailSkuModalOpen,
    openSkuDropdownId,
    isCreateUserModalOpen,
    isEditUserModalOpen,
    isDeleteUserModalOpen,
    isDetailUserModalOpen,
    openUserDropdownId,
    isAllocateModalOpen,
    isSuspendModalOpen,
    isUnsuspendModalOpen,
    isDownloadModalOpen,
    isCreateBatchModalOpen,
    isEditUrlModalOpen,
    isDeleteModalOpen,
    isEditProjectModalOpen,
    isDetailModalOpen,
    isDownloadingLayout,
    isDownloadingExcel,
    openDropdownId,
    openBrandDropdownId,
    isMobileMenuOpen,
    isNotifOpen
  ]); 

  // Membersihkan hoveredTagInfo secara otomatis saat modal detail ditutup atau batch berubah
  useEffect(() => {
    if (!isDetailModalOpen || !activeBatch) {
      setHoveredTagInfo(null);
    }
  }, [isDetailModalOpen, activeBatch]);

  // Global dismiss untuk hoveredTagInfo saat ada scroll atau klik di mana pun
  useEffect(() => {
    if (!hoveredTagInfo) return;
    const handleDismiss = () => setHoveredTagInfo(null);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('click', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('click', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [hoveredTagInfo]);

  // Global dismiss untuk seluruh dropdown menu Aksi:
  // Menutup dropdown segera saat pengguna mulai scroll / wheel atau sentuh layar,
  // sehingga scroll halaman TIDAK PERNAH terblokir atau macet!
  useEffect(() => {
    if (!openDropdownId && !openBrandDropdownId && !openUserDropdownId && !openSkuDropdownId) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target && target.closest && target.closest('[data-dropdown-menu]')) return;
      setOpenDropdownId(null);
      setOpenBrandDropdownId(null);
      setOpenUserDropdownId(null);
      setOpenSkuDropdownId(null);
    };

    const handleScrollOrWheel = () => {
      setOpenDropdownId(null);
      setOpenBrandDropdownId(null);
      setOpenUserDropdownId(null);
      setOpenSkuDropdownId(null);
    };

    window.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('scroll', handleScrollOrWheel, { capture: true, passive: true });
    window.addEventListener('wheel', handleScrollOrWheel, { capture: true, passive: true });
    window.addEventListener('touchmove', handleScrollOrWheel, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrWheel);

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('scroll', handleScrollOrWheel, true);
      window.removeEventListener('wheel', handleScrollOrWheel, true);
      window.removeEventListener('touchmove', handleScrollOrWheel, true);
      window.removeEventListener('resize', handleScrollOrWheel);
    };
  }, [openDropdownId, openBrandDropdownId, openUserDropdownId, openSkuDropdownId]);

  // Live timer ticker untuk update NewBadge otomatis hilang setelah 5 menit
  const [, setLiveTick] = useState<number>(Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTick(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Responsiveness: Otomatis minimize sidebar saat lebar layar tablet dan HP (< 1024px)
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        if (window.innerWidth < 1024) {
          setIsSidebarMinimized(true);
        }
        if (window.innerWidth >= 768) {
          setIsMobileMenuOpen(false);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ==========================================
  // HANDLERS UNTUK BRAND CRUD & USER LINKING
  // ==========================================
  // ==========================================
  // HANDLERS UNTUK BRAND CRUD & USER LINKING
  // ==========================================
  const handleOpenCreateBrand = async () => {
    let freshUsersList = users;
    try {
      const dbUsers = await api.getUsers();
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        setUsers(dbUsers);
        freshUsersList = dbUsers;
      }
    } catch (_) {}

    const defaultOwnerId = freshUsersList[0]?.id || '';

    setBrandForm({
      id: '',
      name: '',
      logo: '',
      ownerId: defaultOwnerId,
      description: '',
      category: 'Material & Konstruksi',
      status: 'Aktif'
    });
    setLogoInputTab('upload');
    setIsCreateBrandModalOpen(true);
  };

  const handleOpenEditBrand = async (brand: BrandItem) => {
    let freshUsersList = users;
    try {
      const dbUsers = await api.getUsers();
      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        setUsers(dbUsers);
        freshUsersList = dbUsers;
      }
    } catch (_) {}

    let targetOwnerId = brand.ownerId;
    if (!freshUsersList.some(u => u.id === targetOwnerId)) {
      const matchedByName = freshUsersList.find(u => u.name.toLowerCase() === (brand.ownerName || '').toLowerCase());
      targetOwnerId = matchedByName ? matchedByName.id : (freshUsersList[0]?.id || '');
    }

    setBrandForm({
      id: brand.id,
      name: brand.name,
      logo: brand.logo || '',
      ownerId: targetOwnerId,
      description: brand.description || '',
      category: brand.category || 'Material & Konstruksi',
      status: brand.status
    });
    setLogoInputTab(brand.logo ? (brand.logo.startsWith('data:') ? 'upload' : 'url') : 'upload');
    setIsEditBrandModalOpen(true);
  };

  const handleCreateBrand = async () => {
    if (!brandForm.name.trim()) return;
    const owner = users.find(u => u.id === brandForm.ownerId) || users[0];
    const newBrand: BrandItem = {
      id: `br-${Date.now()}`,
      name: brandForm.name.trim(),
      logo: brandForm.logo.trim() || null,
      ownerId: owner?.id || (users[0]?.id || 'u1'),
      ownerName: owner?.name || (users[0]?.name || 'Admin'),
      ownerEmail: owner?.email,
      ownerRole: owner?.role,
      description: brandForm.description.trim() || 'Katalog brand resmi PT Mitra Kreasi Inovasi.',
      category: brandForm.category || 'Umum',
      status: brandForm.status,
      createdAt: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    };

    setBrands(prev => [newBrand, ...prev]);
    setIsCreateBrandModalOpen(false);

    try {
      await api.createBrand(newBrand);
      const [freshBrands, freshUsers] = await Promise.all([api.getBrands(), api.getUsers()]);
      if (Array.isArray(freshBrands)) setBrands(freshBrands);
      if (Array.isArray(freshUsers)) setUsers(freshUsers);
      triggerAlert(
        'Brand Berhasil Ditambahkan',
        `Brand "${newBrand.name}" berhasil disimpan ke sistem.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal menyimpan brand ke SQLite:', err);
      triggerAlert(
        'Gagal Menyimpan Brand',
        'Terjadi kesalahan sistem saat menyimpan data brand.',
        'error'
      );
    }
  };

  const handleUpdateBrand = async () => {
    if (!brandForm.id || !brandForm.name.trim()) return;
    const owner = users.find(u => u.id === brandForm.ownerId) || users[0];

    const updatedData: Partial<BrandItem> = {
      name: brandForm.name.trim(),
      logo: brandForm.logo.trim() || null,
      ownerId: owner?.id || (users[0]?.id || 'u1'),
      ownerName: owner?.name || (users[0]?.name || 'Admin'),
      ownerEmail: owner?.email,
      ownerRole: owner?.role,
      description: brandForm.description.trim(),
      category: brandForm.category,
      status: brandForm.status
    };

    setBrands(prev => prev.map(b => b.id === brandForm.id ? { ...b, ...updatedData } : b));
    setIsEditBrandModalOpen(false);

    try {
      await api.updateBrand(brandForm.id, updatedData);
      const [freshBrands, freshUsers] = await Promise.all([api.getBrands(), api.getUsers()]);
      if (Array.isArray(freshBrands)) setBrands(freshBrands);
      if (Array.isArray(freshUsers)) setUsers(freshUsers);
      triggerAlert(
        'Brand Berhasil Diperbarui',
        `Data brand "${brandForm.name.trim()}" berhasil diperbarui.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal update brand ke SQLite:', err);
      triggerAlert(
        'Gagal Memperbarui Brand',
        'Terjadi kesalahan saat memperbarui data brand.',
        'error'
      );
    }
  };

  const handleOpenDeleteBrand = (brand: BrandItem) => {
    setBrandToDelete(brand);
    setIsDeleteBrandModalOpen(true);
  };

  const handleConfirmDeleteBrand = async () => {
    if (!brandToDelete) return;
    const brandId = brandToDelete.id;
    const brandName = brandToDelete.name;
    setBrands(prev => prev.filter(b => b.id !== brandId));
    setIsDeleteBrandModalOpen(false);
    setBrandToDelete(null);

    try {
      await api.deleteBrand(brandId);
      const freshBrands = await api.getBrands();
      if (Array.isArray(freshBrands)) setBrands(freshBrands);
      triggerAlert(
        'Brand Berhasil Dihapus',
        `Brand "${brandName}" telah berhasil dihapus dari sistem.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal hapus brand di SQLite:', err);
      triggerAlert(
        'Gagal Menghapus Brand',
        'Terjadi kesalahan saat menghapus brand.',
        'error'
      );
    }
  };

  const handleToggleBrandStatus = async (brand: BrandItem) => {
    const nextStatus = brand.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    setBrands(prev => prev.map(b => b.id === brand.id ? { ...b, status: nextStatus } : b));
    triggerAlert(
      'Status Brand Diperbarui',
      `Brand "${brand.name}" berhasil diubah menjadi: ${nextStatus}`,
      nextStatus === 'Aktif' ? 'success' : 'warning'
    );
    try {
      await api.updateBrand(brand.id, { status: nextStatus });
    } catch (err) {
      console.error('Gagal ubah status brand:', err);
      triggerAlert(
        'Gagal Mengubah Status',
        'Terjadi kesalahan saat memperbarui status brand.',
        'error'
      );
    }
  };

  const handleToggleUserStatus = async (user: UserItem) => {
    const nextStatus = (user.status || 'Aktif') === 'Aktif' ? 'Nonaktif' : 'Aktif';
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: nextStatus } : u));
    triggerAlert(
      'Status Akun Diperbarui',
      `Akun pengguna "${user.name}" berhasil diubah menjadi: ${nextStatus}`,
      nextStatus === 'Aktif' ? 'success' : 'warning'
    );
    try {
      await api.updateUser(user.id, { status: nextStatus });
    } catch (err) {
      console.error('Gagal ubah status akun pengguna di SQLite:', err);
      triggerAlert(
        'Gagal Mengubah Status',
        'Terjadi kesalahan saat memperbarui status akun pengguna.',
        'error'
      );
    }
  };

  const handleToggleBatchStatus = async (batch: any) => {
    const isCurrentlySuspended = batch.status === 'Disuspend';
    const nextStatus = isCurrentlySuspended ? 'Aktif' : 'Disuspend';

    // Update state batches & activeBatch secara langsung
    setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, status: nextStatus } : b));
    setActiveBatch((prev: any) => prev && prev.id === batch.id ? { ...prev, status: nextStatus } : prev);

    const newLog = {
      id: Date.now(),
      batchId: batch.batchId,
      timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      user: currentRole,
      reason: isCurrentlySuspended 
        ? 'Pemulihan status langsung melalui badge status' 
        : 'Suspensi langsung melalui badge status',
      changes: [
        { field: 'Status Batch', old: batch.status, new: nextStatus }
      ]
    };
    setAuditLogs(prev => [newLog, ...prev]);

    triggerAlert(
      nextStatus === 'Disuspend' ? 'Batch Disuspend' : 'Batch Dipulihkan',
      `Status batch "${batch.batchId}" berhasil diubah menjadi: ${nextStatus}.`,
      nextStatus === 'Disuspend' ? 'warning' : 'success'
    );

    try {
      await api.updateBatch(batch.id, { status: nextStatus });
      await api.createAuditLog(newLog);
    } catch (err) {
      console.error('Gagal memperbarui status batch di SQLite:', err);
      triggerAlert(
        'Gagal Mengubah Status',
        'Terjadi kesalahan saat memperbarui status batch.',
        'error'
      );
    }
  };

  const handleOpenDetailBrand = (brand: BrandItem) => {
    setBrandToView(brand);
    setIsDetailBrandModalOpen(true);
  };

  const handleQuickCreateUser = async () => {
    if (!userForm.name.trim()) {
      triggerAlert('Validasi Formulir', 'Nama lengkap pengguna wajib diisi.', 'warning');
      return;
    }
    if (!userForm.email.trim()) {
      triggerAlert('Validasi Formulir', 'Alamat email pengguna wajib diisi.', 'warning');
      return;
    }
    if (!isValidEmail(userForm.email)) {
      triggerAlert('Format Email Tidak Valid', 'Silakan masukkan format alamat email yang valid (contoh: nama@perusahaan.com).', 'warning');
      return;
    }
    const newUser: UserItem = {
      id: `u${Date.now()}`,
      name: userForm.name.trim(),
      email: userForm.email.trim(),
      role: userForm.role || 'Operator',
      avatar: userForm.avatar.trim() || null
    };

    setUsers(prev => [newUser, ...prev]);
    setBrandForm(prev => ({ ...prev, ownerId: newUser.id }));
    setIsAddUserModalOpen(false);
    setUserForm(defaultUserForm);

    try {
      await api.createUser(newUser);
      const freshUsers = await api.getUsers();
      if (Array.isArray(freshUsers)) {
        setUsers(freshUsers);
        setBrandForm(prev => ({ ...prev, ownerId: newUser.id }));
      }
      triggerAlert(
        'Pengguna Berhasil Ditambahkan',
        `Akun baru "${newUser.name}" (${newUser.role}) berhasil dibuat.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal membuat user baru di SQLite:', err);
      triggerAlert(
        'Gagal Menyimpan Akun',
        'Terjadi kesalahan sistem saat menambahkan akun pengguna.',
        'error'
      );
    }
  };

  const handleOpenCreateUser = () => {
    setUserForm({
      id: '',
      name: '',
      username: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      role: 'Operator',
      status: 'Aktif',
      avatar: '',
      brandIds: [],
      sendWelcomeEmail: true
    });
    setIsResetPasswordMode(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setIsCreateUserModalOpen(true);
  };

  const handleOpenEditUser = (user: UserItem, resetPasswordDirectly = false) => {
    const ownedBrandIds = brands.filter(b => b.ownerId === user.id).map(b => b.id);
    setUserForm({
      id: user.id,
      name: user.name,
      username: user.username || slugifyUsername(user.name),
      email: user.email,
      phone: user.phone || '',
      password: '',
      confirmPassword: '',
      role: user.role,
      status: user.status || 'Aktif',
      avatar: user.avatar || '',
      brandIds: ownedBrandIds,
      sendWelcomeEmail: false
    });
    setIsResetPasswordMode(resetPasswordDirectly);
    setShowPassword(resetPasswordDirectly);
    setShowConfirmPassword(resetPasswordDirectly);
    if (resetPasswordDirectly) {
      const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const lowercase = 'abcdefghijkmnpqrstuvwxyz';
      const numbers = '23456789';
      const symbols = '!@#$%&*';
      const all = uppercase + lowercase + numbers + symbols;
      let res = '';
      res += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
      res += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
      res += numbers.charAt(Math.floor(Math.random() * numbers.length));
      res += symbols.charAt(Math.floor(Math.random() * symbols.length));
      for (let i = 0; i < 8; i++) {
        res += all.charAt(Math.floor(Math.random() * all.length));
      }
      const shuffled = res.split('').sort(() => 0.5 - Math.random()).join('');
      setUserForm(prev => ({
        ...prev,
        password: shuffled,
        confirmPassword: shuffled
      }));
    }
    setIsEditUserModalOpen(true);
  };

  const handleOpenDetailUser = (user: UserItem) => {
    setUserToView(user);
    setIsDetailUserModalOpen(true);
  };

  const handleOpenDeleteUser = (user: UserItem) => {
    setUserToDelete(user);
    setIsDeleteUserModalOpen(true);
  };

  const handleCreateUser = async () => {
    if (!userForm.name.trim()) {
      triggerAlert('Validasi Formulir', 'Nama lengkap pengguna wajib diisi.', 'warning');
      return;
    }
    if (!userForm.email.trim()) {
      triggerAlert('Validasi Formulir', 'Alamat email pengguna wajib diisi.', 'warning');
      return;
    }
    if (!isValidEmail(userForm.email)) {
      triggerAlert('Format Email Tidak Valid', 'Silakan masukkan format alamat email yang valid (contoh: nama@perusahaan.com).', 'warning');
      return;
    }
    if (userForm.password && userForm.confirmPassword && userForm.password !== userForm.confirmPassword) {
      triggerAlert('Validasi Formulir', 'Konfirmasi kata sandi tidak cocok!', 'warning');
      return;
    }
    const cleanUsername = userForm.username.trim() || slugifyUsername(userForm.name);
    const newUserId = `u${Date.now()}`;
    const newUser: UserItem = {
      id: newUserId,
      name: userForm.name.trim(),
      username: cleanUsername,
      email: userForm.email.trim(),
      phone: userForm.phone.trim() || undefined,
      role: userForm.role || 'Operator',
      status: (userForm.status as 'Aktif' | 'Nonaktif') || 'Aktif',
      avatar: userForm.avatar.trim() || null,
      createdAt: new Date().toISOString()
    };

    setUsers(prev => [newUser, ...prev]);

    // Update brands owned by this newly created user
    const selectedBrandIds = userForm.brandIds || [];
    if (selectedBrandIds.length > 0) {
      setBrands(prev => prev.map(b => selectedBrandIds.includes(b.id) ? {
        ...b,
        ownerId: newUserId,
        ownerName: newUser.name,
        ownerEmail: newUser.email,
        ownerRole: newUser.role
      } : b));
    }

    setBrandForm(prev => ({ ...prev, ownerId: newUserId }));
    setIsCreateUserModalOpen(false);

    try {
      await api.createUser(newUser);
      if (selectedBrandIds.length > 0) {
        for (const bId of selectedBrandIds) {
          await api.updateBrand(bId, {
            ownerId: newUserId,
            ownerName: newUser.name,
            ownerEmail: newUser.email,
            ownerRole: newUser.role
          });
        }
      }
      const [freshUsers, freshBrands] = await Promise.all([api.getUsers(), api.getBrands()]);
      if (Array.isArray(freshUsers)) {
        setUsers(freshUsers);
        setBrandForm(prev => ({ ...prev, ownerId: newUserId }));
      }
      if (Array.isArray(freshBrands)) setBrands(freshBrands);
      triggerAlert(
        'Akun Berhasil Dibuat',
        `Akun pengguna "${newUser.name}" (${newUser.role}) berhasil ditambahkan.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal membuat user di SQLite:', err);
      triggerAlert(
        'Gagal Menyimpan Akun',
        'Terjadi kesalahan sistem saat membuat akun pengguna.',
        'error'
      );
    }
  };

  const handleUpdateUser = async () => {
    if (!userForm.id) return;
    if (!userForm.name.trim()) {
      triggerAlert('Validasi Formulir', 'Nama lengkap pengguna wajib diisi.', 'warning');
      return;
    }
    if (!userForm.email.trim()) {
      triggerAlert('Validasi Formulir', 'Alamat email pengguna wajib diisi.', 'warning');
      return;
    }
    if (!isValidEmail(userForm.email)) {
      triggerAlert('Format Email Tidak Valid', 'Silakan masukkan format alamat email yang valid (contoh: nama@perusahaan.com).', 'warning');
      return;
    }
    if (isResetPasswordMode) {
      if (!userForm.password.trim()) {
        triggerAlert('Validasi Kata Sandi', 'Kata sandi baru tidak boleh kosong!', 'warning');
        return;
      }
      if (userForm.password !== userForm.confirmPassword) {
        triggerAlert('Validasi Kata Sandi', 'Konfirmasi kata sandi baru tidak cocok!', 'warning');
        return;
      }
    }
    const cleanUsername = userForm.username.trim() || slugifyUsername(userForm.name);
    const updatedUser: UserItem & { password?: string } = {
      id: userForm.id,
      name: userForm.name.trim(),
      username: cleanUsername,
      email: userForm.email.trim(),
      phone: userForm.phone.trim() || undefined,
      role: userForm.role || 'Operator',
      status: (userForm.status as 'Aktif' | 'Nonaktif') || 'Aktif',
      avatar: userForm.avatar.trim() || null,
      ...(isResetPasswordMode && userForm.password.trim() ? { password: userForm.password.trim() } : {})
    };

    const targetUserId = userForm.id;

    // Synchronize brand owner details if user information changed
    const updatedBrands = brands.map(b => {
      if (b.ownerId === targetUserId) {
        return {
          ...b,
          ownerName: updatedUser.name,
          ownerEmail: updatedUser.email,
          ownerRole: updatedUser.role
        };
      }
      return b;
    });

    setUsers(prev => prev.map(u => u.id === userForm.id ? { ...u, ...updatedUser } : u));
    setBrands(updatedBrands);

    setIsEditUserModalOpen(false);
    setIsResetPasswordMode(false);

    try {
      await api.updateUser(userForm.id, updatedUser);

      // Persist changed brands in SQLite
      for (const b of updatedBrands) {
        const prevB = brands.find(ob => ob.id === b.id);
        if (prevB && (prevB.ownerId !== b.ownerId || prevB.ownerName !== b.ownerName)) {
          await api.updateBrand(b.id, {
            ownerId: b.ownerId,
            ownerName: b.ownerName,
            ownerEmail: b.ownerEmail,
            ownerRole: b.ownerRole
          });
        }
      }

      const [freshUsers, freshBrands] = await Promise.all([api.getUsers(), api.getBrands()]);
      if (Array.isArray(freshUsers)) setUsers(freshUsers);
      if (Array.isArray(freshBrands)) setBrands(freshBrands);
      triggerAlert(
        'Akun Berhasil Diperbarui',
        `Perubahan data pengguna "${updatedUser.name}" berhasil disimpan.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal update user di SQLite:', err);
      triggerAlert(
        'Gagal Memperbarui Akun',
        'Terjadi kesalahan saat menyimpan pembaruan akun pengguna.',
        'error'
      );
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    const userId = userToDelete.id;
    const userName = userToDelete.name;
    setUsers(prev => prev.filter(u => u.id !== userId));
    setIsDeleteUserModalOpen(false);
    setUserToDelete(null);

    try {
      await api.deleteUser(userId);
      const [freshUsers, freshBrands] = await Promise.all([api.getUsers(), api.getBrands()]);
      if (Array.isArray(freshUsers)) setUsers(freshUsers);
      if (Array.isArray(freshBrands)) setBrands(freshBrands);
      triggerAlert(
        'Akun Berhasil Dihapus',
        `Pengguna "${userName}" berhasil dihapus dari sistem.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal hapus user di SQLite:', err);
      triggerAlert(
        'Gagal Menghapus Akun',
        'Terjadi kesalahan sistem saat menghapus akun pengguna.',
        'error'
      );
    }
  };

  const toggleUserDropdownMenu = (e: React.MouseEvent<HTMLButtonElement>, userId: string) => {
    e.stopPropagation();
    if (openUserDropdownId === userId) {
      setOpenUserDropdownId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedDropdownHeight = 160; 
    
    if (spaceBelow < estimatedDropdownHeight) {
      setUserDropdownDirection('up');
      setUserDropdownPos({ top: rect.top - 4, left: rect.right }); 
    } else {
      setUserDropdownDirection('down');
      setUserDropdownPos({ top: rect.bottom + 4, left: rect.right }); 
    }
    
    setOpenUserDropdownId(userId);
  };

  const activeDropdownUser = users.find(u => u.id === openUserDropdownId);

  const handleUserAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedWebP = await compressAndConvertToWebP(file, {
        maxWidth: 600,
        maxHeight: 600,
        quality: 0.82
      });
      setUserForm(prev => ({ ...prev, avatar: optimizedWebP }));
    } catch (err) {
      console.error('Gagal optimasi avatar:', err);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setUserForm(prev => ({ ...prev, avatar: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleLogoFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const optimizedWebP = await compressAndConvertToWebP(file, {
        maxWidth: 800,
        maxHeight: 800,
        quality: 0.85
      });
      setBrandForm(prev => ({ ...prev, logo: optimizedWebP }));
    } catch (err) {
      console.error('Gagal optimasi logo:', err);
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setBrandForm(prev => ({ ...prev, logo: reader.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  // ==========================================
  // HANDLERS KHUSUS SKU / PRODUK (CRUD & RELATIONAL)
  // ==========================================
  const toggleSkuDropdownMenu = (e: React.MouseEvent<HTMLButtonElement>, productId: string) => {
    e.stopPropagation();
    if (openSkuDropdownId === productId) {
      setOpenSkuDropdownId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedDropdownHeight = 160; 
    
    if (spaceBelow < estimatedDropdownHeight) {
      setSkuDropdownDirection('up');
      setSkuDropdownPos({ top: rect.top - 4, left: rect.right }); 
    } else {
      setSkuDropdownDirection('down');
      setSkuDropdownPos({ top: rect.bottom + 4, left: rect.right }); 
    }
    
    setOpenSkuDropdownId(productId);
  };

  const getSkuBatches = (skuName: string, brandName?: string) => {
    const sNorm = (skuName || '').toLowerCase().trim();
    const bNorm = (brandName || '').toLowerCase().trim();
    return batches.filter(b => {
      const bSku = (b.sku || '').toLowerCase().trim();
      const bBrand = (b.brand || '').toLowerCase().trim();
      const matchBrand = !bNorm || bBrand === bNorm;
      const matchSku = bSku === sNorm || bSku.includes(sNorm) || sNorm.includes(bSku);
      return matchBrand && matchSku;
    });
  };

  const handleOpenCreateSku = () => {
    setIsSkuFormDirty(false);
    setSkuSubView('create');
  };

  const handleSaveNewSkuFromPage = async (productData: {
    brandId: string;
    brandName: string;
    sku: string;
    skuCode: string;
    category: string;
    description?: string;
    image?: string;
  }) => {
    const matchedBrand = brands.find(b => b.id === productData.brandId) || brands.find(b => b.name === productData.brandName) || brands[0];
    const newSkuItem: ProductItem = {
      id: `p-${Date.now()}`,
      brandId: matchedBrand?.id || 'br-sumas',
      brandName: matchedBrand?.name || 'Sumas',
      sku: productData.sku.trim(),
      skuCode: productData.skuCode.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      category: productData.category.trim() || 'Umum',
      description: productData.description?.trim() || undefined,
      image: productData.image,
      createdAt: new Date().toISOString()
    };

    setProducts(prev => [newSkuItem, ...prev]);
    setIsSkuFormDirty(false);
    setSkuSubView('list');

    try {
      await api.createProduct(newSkuItem);
      const freshProducts = await api.getProducts();
      if (Array.isArray(freshProducts)) setProducts(freshProducts);
      triggerAlert(
        'SKU Berhasil Ditambahkan',
        `Produk "${newSkuItem.sku}" (${newSkuItem.brandName}) berhasil didaftarkan ke katalog master.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal membuat SKU di SQLite:', err);
      setProducts(prev => prev.filter(p => p.id !== newSkuItem.id));
      triggerAlert(
        'Gagal Menyimpan SKU',
        'Terjadi kesalahan sistem saat menyimpan data SKU ke database.',
        'error'
      );
    }
  };

  const handleCreateSku = async () => {
    if (!skuForm.sku.trim()) {
      triggerAlert('Nama SKU Wajib Diisi', 'Silakan masukkan nama atau kode SKU produk.', 'warning');
      return;
    }

    const matchedBrand = brands.find(b => b.id === skuForm.brandId) || brands.find(b => b.name === skuForm.brandName) || brands[0];
    const newSkuItem: ProductItem = {
      id: `p-${Date.now()}`,
      brandId: matchedBrand?.id || 'br-sumas',
      brandName: matchedBrand?.name || 'Sumas',
      sku: skuForm.sku.trim(),
      skuCode: skuForm.skuCode.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      category: skuForm.category.trim() || 'Umum',
      description: skuForm.description.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    setProducts(prev => [newSkuItem, ...prev]);
    setIsCreateSkuModalOpen(false);

    try {
      await api.createProduct(newSkuItem);
      const freshProducts = await api.getProducts();
      if (Array.isArray(freshProducts)) setProducts(freshProducts);
      triggerAlert(
        'SKU Berhasil Ditambahkan',
        `Produk "${newSkuItem.sku}" (${newSkuItem.brandName}) berhasil didaftarkan ke katalog master.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal membuat SKU di SQLite:', err);
      setProducts(prev => prev.filter(p => p.id !== newSkuItem.id));
      triggerAlert(
        'Gagal Menyimpan SKU',
        'Terjadi kesalahan sistem saat menyimpan data SKU ke database.',
        'error'
      );
    }
  };

  const handleOpenEditSku = (prod: ProductItem) => {
    setSkuToEdit(prod);
    setIsSkuFormDirty(false);
    setSkuSubView('edit');
    setOpenSkuDropdownId(null);
    setIsDetailSkuModalOpen(false);
  };

  const handleUpdateSkuFromPage = async (productData: {
    brandId: string;
    brandName: string;
    sku: string;
    skuCode: string;
    category: string;
    description?: string;
    image?: string;
  }) => {
    if (!skuToEdit) return;

    const editingId = skuToEdit.id;
    const updatedData: Partial<ProductItem> = {
      brandId: productData.brandId,
      brandName: productData.brandName,
      sku: productData.sku.trim(),
      skuCode: productData.skuCode.trim(),
      category: productData.category.trim() || 'Umum',
      description: productData.description?.trim(),
      image: productData.image
    };

    setProducts(prev => prev.map(p => p.id === editingId ? { ...p, ...updatedData } : p));
    setIsSkuFormDirty(false);
    setSkuSubView('list');
    setSkuToEdit(null);

    try {
      await api.updateProduct(editingId, updatedData);
      const freshProducts = await api.getProducts();
      if (Array.isArray(freshProducts)) setProducts(freshProducts);
      triggerAlert(
        'SKU Berhasil Diperbarui',
        `Data produk "${productData.sku.trim()}" telah diperbarui di katalog master.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal memperbarui SKU di SQLite:', err);
      triggerAlert(
        'Gagal Memperbarui SKU',
        'Terjadi kesalahan saat menyimpan perubahan ke database.',
        'error'
      );
    }
  };

  const handleUpdateSku = async () => {
    if (!skuForm.id || !skuForm.sku.trim()) {
      triggerAlert('Nama SKU Wajib Diisi', 'Silakan masukkan nama atau kode SKU produk.', 'warning');
      return;
    }

    const matchedBrand = brands.find(b => b.id === skuForm.brandId) || brands.find(b => b.name === skuForm.brandName) || brands[0];
    const updatedData: Partial<ProductItem> = {
      brandId: matchedBrand?.id || skuForm.brandId,
      brandName: matchedBrand?.name || skuForm.brandName,
      sku: skuForm.sku.trim(),
      skuCode: skuForm.skuCode.trim() || (skuToEdit?.skuCode || `SKU-${skuForm.id.toUpperCase()}`),
      category: skuForm.category.trim() || 'Umum',
      description: skuForm.description.trim()
    };

    setProducts(prev => prev.map(p => p.id === skuForm.id ? { ...p, ...updatedData } : p));
    setIsEditSkuModalOpen(false);
    setSkuToEdit(null);

    try {
      await api.updateProduct(skuForm.id, updatedData);
      const freshProducts = await api.getProducts();
      if (Array.isArray(freshProducts)) setProducts(freshProducts);
      triggerAlert(
        'SKU Berhasil Diperbarui',
        `Data produk "${skuForm.sku.trim()}" telah diperbarui di database.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal memperbarui SKU di SQLite:', err);
      triggerAlert(
        'Gagal Memperbarui SKU',
        'Terjadi kesalahan sistem saat memperbarui data SKU.',
        'error'
      );
    }
  };

  const handleOpenDeleteSku = (prod: ProductItem) => {
    setSkuToDelete(prod);
    setOpenSkuDropdownId(null);
    setIsDeleteSkuModalOpen(true);
  };

  const handleConfirmDeleteSku = async () => {
    if (!skuToDelete) return;
    const skuId = skuToDelete.id;
    const skuName = skuToDelete.sku;

    setProducts(prev => prev.filter(p => p.id !== skuId));
    setIsDeleteSkuModalOpen(false);
    setSkuToDelete(null);

    try {
      await api.deleteProduct(skuId);
      const freshProducts = await api.getProducts();
      if (Array.isArray(freshProducts)) setProducts(freshProducts);
      triggerAlert(
        'SKU Berhasil Dihapus',
        `Produk "${skuName}" berhasil dihapus dari master katalog.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal menghapus SKU di SQLite:', err);
      triggerAlert(
        'Gagal Menghapus SKU',
        'Terjadi kesalahan saat menghapus data SKU.',
        'error'
      );
    }
  };

  const handleOpenDetailSku = (prod: ProductItem) => {
    setSkuToView(prod);
    setOpenSkuDropdownId(null);
    setIsDetailSkuModalOpen(true);
  };

  const toggleTagSelection = (tagId: string) => {
    setSelectedTagsToAllocate(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const loadBatchDetailData = async (batchId: string, page = 1, search = '', filter = 'all') => {
    setIsTagsLoading(true);
    try {
      const statusParam = filter === 'available' ? 'Tersedia' : filter === 'used' ? 'Telah Digunakan' : 'all';
      const projectParam = (filter !== 'all' && filter !== 'available' && filter !== 'used') ? filter : 'all';

      const [summaryRes, tagsRes] = await Promise.all([
        api.getBatchSummary(batchId),
        api.getBatchTags(batchId, page, 96, search, statusParam, projectParam)
      ]);

      if (summaryRes) {
        setTagsTotalCount(summaryRes.totalTags);
        setTagsAvailableCount(summaryRes.availableCount);
        setTagsUsedCount(summaryRes.usedCount);
        setBatchProjectsList(summaryRes.projects || []);
      }

      if (tagsRes) {
        setCurrentTags(tagsRes.tags || []);
        setTagsPage(tagsRes.page || 1);
        setTagsTotalPages(tagsRes.totalPages || 1);
      }
    } catch (err) {
      console.error('Gagal memuat data batch:', err);
    } finally {
      setIsTagsLoading(false);
    }
  };

  const handleTagSearchChange = (val: string) => {
    setHoveredTagInfo(null);
    setTagSearch(val);
    setTagsPage(1);
    if (activeBatch) {
      loadBatchDetailData(activeBatch.id, 1, val, tagProjectFilter);
    }
  };

  const handleTagFilterChange = (filter: string) => {
    setHoveredTagInfo(null);
    setTagProjectFilter(filter);
    setTagsPage(1);
    if (activeBatch) {
      loadBatchDetailData(activeBatch.id, 1, tagSearch, filter);
    }
  };

  const handleTagPageChange = (newPage: number) => {
    if (newPage < 1 || newPage > tagsTotalPages) return;
    setHoveredTagInfo(null);
    setTagsPage(newPage);
    if (activeBatch) {
      loadBatchDetailData(activeBatch.id, newPage, tagSearch, tagProjectFilter);
    }
  };

  const handleQuickSelectAvailable = (count: number) => {
    const availableTagIds = currentTags
      .filter(t => t.status === 'Tersedia')
      .map(t => t.id);
    
    if (count === -1) {
      setSelectedTagsToAllocate(availableTagIds);
    } else {
      setSelectedTagsToAllocate(availableTagIds.slice(0, count));
    }
  };

  const handleSaveAllocation = async () => {
    if (!allocationForm.project.trim() || !allocationForm.specs.trim() || !activeBatch) return;
    if (selectedTagsToAllocate.length === 0) return;

    try {
      await api.allocateTags(activeBatch.id, {
        tagIds: selectedTagsToAllocate,
        project: allocationForm.project.trim(),
        specs: allocationForm.specs.trim(),
        codeType: allocationForm.codeType.trim() || '-',
        warranty: allocationForm.warranty.trim() || '-',
        prodCode: allocationForm.prodCode.trim() || '-',
        note: allocationForm.note.trim() || '-'
      });

      const newLog = {
        id: Date.now(),
        batchId: activeBatch.batchId,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        user: currentRole,
        reason: `Alokasi ${selectedTagsToAllocate.length} tag untuk proyek: ${allocationForm.project.trim()}`,
        changes: [
          { field: 'Alokasi Proyek', old: 'Tersedia', new: `${allocationForm.project.trim()} (${selectedTagsToAllocate.length} Tag)` }
        ]
      };
      await api.createAuditLog(newLog);

      const [freshBatches, freshLogs] = await Promise.all([api.getBatches(), api.getAuditLogs()]);
      if (Array.isArray(freshBatches)) setBatches(freshBatches);
      if (Array.isArray(freshLogs)) setAuditLogs(freshLogs);

      await loadBatchDetailData(activeBatch.id, tagsPage, tagSearch, tagProjectFilter);

      triggerAlert(
        'Alokasi Berhasil Disimpan',
        `${selectedTagsToAllocate.length} tag berhasil dialokasikan ke proyek "${allocationForm.project.trim()}".`,
        'success'
      );

      setSelectedTagsToAllocate([]);
      setIsAllocateModalOpen(false);
      setAllocationForm({ project: '', codeType: '', specs: '', warranty: '', prodCode: '', note: '' });
    } catch (err) {
      console.error('Gagal simpan alokasi ke database:', err);
      triggerAlert(
        'Gagal Menyimpan Alokasi',
        'Terjadi kesalahan saat menyimpan alokasi tag ke proyek.',
        'error'
      );
    }
  };

  const handleDeallocateProject = async (projectName: string) => {
    if (!activeBatch) return;

    try {
      await api.deallocateProject(activeBatch.id, projectName);
      
      const newLog = {
        id: Date.now(),
        batchId: activeBatch.batchId,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        user: currentRole,
        reason: `Membatalkan alokasi proyek: ${projectName}`,
        changes: [
          { field: 'Alokasi Proyek', old: projectName, new: 'Tersedia Kembali' }
        ]
      };
      await api.createAuditLog(newLog);

      const [freshBatches, freshLogs] = await Promise.all([api.getBatches(), api.getAuditLogs()]);
      if (Array.isArray(freshBatches)) setBatches(freshBatches);
      if (Array.isArray(freshLogs)) setAuditLogs(freshLogs);

      await loadBatchDetailData(activeBatch.id, 1, tagSearch, 'all');
      setTagProjectFilter('all');

      triggerAlert(
        'Alokasi Proyek Dibatalkan',
        `Seluruh tag proyek "${projectName}" berhasil dikembalikan ke status Tersedia.`,
        'success'
      );
    } catch (err) {
      console.error('Gagal membatalkan alokasi:', err);
      triggerAlert(
        'Gagal Membatalkan Alokasi',
        'Terjadi kesalahan saat mengembalikan tag proyek ke stok.',
        'error'
      );
    }
  };

  const generateAlphanumericPIN = (length: number) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Menghilangkan O, 0, I, 1 agar tidak membingungkan
    let pin = '';
    for (let i = 0; i < length; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
  };

  const handleGenerateBatch = () => {
    if (!selectedSku || !formQty) return; 

    const matchedProduct = products.find(p => p.id === selectedSku || p.sku === selectedSku);
        const brandName = matchedProduct ? matchedProduct.brandName : 'UMUM';
    const skuName = matchedProduct ? matchedProduct.sku : selectedSku;
    const newId = `b${Date.now()}`;
    const randCode = Math.floor(1000 + Math.random() * 9000); 
    
    // Batch murni untuk stok, data proyek di-set null/kosong.
    const newBatch = {
      id: newId,
      batchId: `${brandName}-BATCH-${randCode}-${formQty}`,
      date: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      createdAt: new Date().toISOString(),
      project: null, 
      sku: skuName,
      brand: brandName,
      qty: Number(formQty),
      specs: '-', 
      pinLength: Number(selectedPinLength),
      status: 'Aktif', // Status batch aktif normal
      redirectUrl: (formRedirectUrl && formRedirectUrl.trim()) || 'https://cek.sumas.id/',
      qrType: formQrType || 'dynamic',
      requirePin: Boolean(formRequirePin),
      enableGps: Boolean(formEnableGps),
      tags: null
    };

    setBatches([newBatch, ...batches]);
    setFormQty('');
    setIsCreateBatchModalOpen(false);
    setCurrentPage(1);

    // Simpan ke SQLite backend dan refresh data riwayat
    api.createBatch(newBatch)
      .then(async () => {
        const freshBatches = await api.getBatches();
        if (Array.isArray(freshBatches)) setBatches(freshBatches);
        triggerAlert(
          'Batch Berhasil Dibuat',
          `Batch "${newBatch.batchId}" (${newBatch.qty} tag) berhasil di-generate dengan QR Code Dinamis dan format ID 8 digit acak.`,
          'success'
        );
      })
      .catch(err => {
        console.error('Gagal simpan batch ke SQLite:', err);
        triggerAlert(
          'Gagal Membuat Batch',
          'Terjadi kesalahan saat menyimpan batch tag ke database.',
          'error'
        );
      });
  };

  const openEditUrlModal = (batch: any) => {
    setBatchToEditUrl(batch);
    setEditRedirectUrlInput(batch.redirectUrl || 'https://cek.sumas.id/');
    setEditQrTypeInput(batch.qrType || 'dynamic');
    setEditRequirePinInput(batch.requirePin !== false);
    setEditEnableGpsInput(batch.enableGps !== false);
    setIsEditUrlModalOpen(true);
  };

  const handleSaveRedirectUrl = async () => {
    if (!batchToEditUrl) return;
    if (!editRedirectUrlInput.trim()) {
      triggerAlert('URL Tidak Boleh Kosong', 'Harap masukkan alamat URL tujuan pemindaian yang valid.', 'error');
      return;
    }

    let formattedUrl = editRedirectUrlInput.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }

    try {
      setIsUpdatingUrl(true);
      await api.updateBatchRedirectUrl(batchToEditUrl.id, {
        redirectUrl: formattedUrl,
        qrType: editQrTypeInput,
        requirePin: editRequirePinInput,
        enableGps: editEnableGpsInput,
      });

      // Update local state
      setBatches(prev => prev.map(b => b.id === batchToEditUrl.id ? {
        ...b,
        redirectUrl: formattedUrl,
        qrType: editQrTypeInput,
        requirePin: editRequirePinInput,
        enableGps: editEnableGpsInput,
      } : b));

      if (activeBatch && activeBatch.id === batchToEditUrl.id) {
        setActiveBatch((prev: any) => prev ? {
          ...prev,
          redirectUrl: formattedUrl,
          qrType: editQrTypeInput,
          requirePin: editRequirePinInput,
          enableGps: editEnableGpsInput,
        } : null);
      }

      setIsEditUrlModalOpen(false);
      setBatchToEditUrl(null);

      triggerAlert(
        'URL Pengalihan Diperbarui',
        `Tautan QR Code batch "${batchToEditUrl.batchId}" kini otomatis dialihkan ke: ${formattedUrl}`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal memperbarui URL Pengalihan:', err);
      triggerAlert('Gagal Menyimpan URL', err.message || 'Terjadi kesalahan saat menyimpan URL.', 'error');
    } finally {
      setIsUpdatingUrl(false);
    }
  };

  const confirmDelete = (batchId: string) => {
    setOpenDropdownId(null);
    setBatchToDelete(batchId);
    setIsDeleteModalOpen(true);
  };

  const handleDeleteBatch = () => {
    if (!batchToDelete) return;
    const targetBatch = batches.find(b => b.id === batchToDelete);
    const batchName = targetBatch ? targetBatch.batchId : batchToDelete;
    setBatches(batches.filter(b => b.id !== batchToDelete));
    if (targetBatch) {
      setAuditLogs(auditLogs.filter(log => log.batchId !== targetBatch.batchId));
    }
    setIsDeleteModalOpen(false);
    setBatchToDelete(null);

    // Hapus dari SQLite backend
    api.deleteBatch(batchToDelete)
      .then(() => {
        triggerAlert(
          'Batch Berhasil Dihapus',
          `Batch "${batchName}" beserta seluruh nomor tag berhasil dihapus.`,
          'success'
        );
      })
      .catch(err => {
        console.error('Gagal hapus batch dari SQLite:', err);
        triggerAlert(
          'Gagal Menghapus Batch',
          'Terjadi kesalahan sistem saat menghapus data batch.',
          'error'
        );
      });
  };

  const openSuspendModal = (batch: any) => {
    setOpenDropdownId(null);
    setActiveBatch(batch);
    setSuspendForm({ reason: '' });
    setIsSuspendModalOpen(true);
  };

  const handleSuspendBatch = () => {
    if (!suspendForm.reason.trim() || !activeBatch) return;

    const newLog = {
      id: Date.now(),
      batchId: activeBatch.batchId,
      timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      user: currentRole,
      reason: suspendForm.reason,
      changes: [
        { field: 'Status Batch', old: activeBatch.status, new: 'Disuspend' }
      ]
    };
    
    setAuditLogs([newLog, ...auditLogs]);
    setBatches(batches.map(b => b.id === activeBatch.id ? { ...b, status: 'Disuspend' } : b));
    setActiveBatch((prev: any) => prev ? { ...prev, status: 'Disuspend' } : null);
    setIsSuspendModalOpen(false);

    // Sinkronkan ke SQLite
    api.updateBatch(activeBatch.id, { status: 'Disuspend' })
      .then(() => {
        triggerAlert(
          'Batch Disuspend',
          `Batch "${activeBatch.batchId}" berhasil dinonaktifkan sementara.`,
          'warning'
        );
      })
      .catch(err => {
        console.error(err);
        triggerAlert('Gagal Mengubah Status', 'Terjadi kesalahan saat suspend batch.', 'error');
      });
    api.createAuditLog(newLog).catch(err => console.error(err));
  };

  const openUnsuspendModal = (batch: any) => {
    setOpenDropdownId(null);
    setActiveBatch(batch);
    setUnsuspendForm({ reason: '' });
    setIsUnsuspendModalOpen(true);
  };

  const handleUnsuspendBatch = () => {
    if (!unsuspendForm.reason.trim() || !activeBatch) return;

    const newLog = {
      id: Date.now(),
      batchId: activeBatch.batchId,
      timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      user: currentRole,
      reason: unsuspendForm.reason,
      changes: [
        { field: 'Status Batch', old: activeBatch.status, new: 'Aktif' }
      ]
    };
    
    setAuditLogs([newLog, ...auditLogs]);
    setBatches(batches.map(b => b.id === activeBatch.id ? { ...b, status: 'Aktif' } : b));
    setActiveBatch((prev: any) => prev ? { ...prev, status: 'Aktif' } : null);
    setIsUnsuspendModalOpen(false);

    // Sinkronkan ke SQLite
    api.updateBatch(activeBatch.id, { status: 'Aktif' })
      .then(() => {
        triggerAlert(
          'Batch Diaktifkan Kembali',
          `Batch "${activeBatch.batchId}" telah aktif dan siap digunakan.`,
          'success'
        );
      })
      .catch(err => {
        console.error(err);
        triggerAlert('Gagal Mengaktifkan Batch', 'Terjadi kesalahan saat mengaktifkan batch.', 'error');
      });
    api.createAuditLog(newLog).catch(err => console.error(err));
  };

  const openEditProjectModal = (proj: any) => {
    setProjectToEdit(proj);
    setEditProjectError(null);
    setEditProjectForm({
      oldProjectName: proj.name,
      name: proj.name,
      specs: proj.specs && proj.specs !== '-' ? proj.specs : '',
      codeType: proj.codeType && proj.codeType !== '-' ? proj.codeType : '',
      warranty: proj.warranty && proj.warranty !== '-' ? proj.warranty : '',
      prodCode: proj.prodCode && proj.prodCode !== '-' ? proj.prodCode : '',
      note: proj.note && proj.note !== '-' ? proj.note : '',
      reason: ''
    });
    setIsEditProjectModalOpen(true);
  };

  const handleSaveEditProject = async () => {
    if (!editProjectForm.name.trim() || !editProjectForm.reason.trim() || !activeBatch) return;
    setEditProjectError(null);

    try {
      await api.updateProject(activeBatch.id, {
        oldProjectName: editProjectForm.oldProjectName,
        newProjectName: editProjectForm.name.trim(),
        specs: editProjectForm.specs.trim(),
        codeType: editProjectForm.codeType.trim(),
        warranty: editProjectForm.warranty.trim(),
        prodCode: editProjectForm.prodCode.trim(),
        note: editProjectForm.note.trim()
      });

      const changes: any[] = [];
      if (editProjectForm.oldProjectName !== editProjectForm.name.trim()) {
        changes.push({ field: 'Nama Proyek', old: editProjectForm.oldProjectName, new: editProjectForm.name.trim() });
      }
      if ((projectToEdit?.specs || '-') !== (editProjectForm.specs.trim() || '-')) {
        changes.push({ field: 'Spesifikasi Material', old: projectToEdit?.specs || '-', new: editProjectForm.specs.trim() || '-' });
      }
      if ((projectToEdit?.codeType || '-') !== (editProjectForm.codeType.trim() || '-')) {
        changes.push({ field: 'Kode + Type', old: projectToEdit?.codeType || '-', new: editProjectForm.codeType.trim() || '-' });
      }
      if ((projectToEdit?.warranty || '-') !== (editProjectForm.warranty.trim() || '-')) {
        changes.push({ field: 'Garansi Pemasangan', old: projectToEdit?.warranty || '-', new: editProjectForm.warranty.trim() || '-' });
      }

      if (changes.length === 0) {
        changes.push({ field: 'Pembaruan Data Proyek', old: editProjectForm.oldProjectName, new: editProjectForm.name.trim() });
      }

      const newLog = {
        id: Date.now(),
        batchId: activeBatch.batchId,
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        user: currentRole,
        reason: editProjectForm.reason.trim(),
        changes
      };
      await api.createAuditLog(newLog);

      const [freshBatches, freshLogs] = await Promise.all([api.getBatches(), api.getAuditLogs()]);
      if (Array.isArray(freshBatches)) {
        setBatches(freshBatches);
        const updated = freshBatches.find((b: any) => b.id === activeBatch.id);
        if (updated) setActiveBatch(updated);
      }
      if (Array.isArray(freshLogs)) setAuditLogs(freshLogs);

      const targetFilter = tagProjectFilter === editProjectForm.oldProjectName ? editProjectForm.name.trim() : tagProjectFilter;
      setTagProjectFilter(targetFilter);

      await loadBatchDetailData(
        activeBatch.id, 
        tagsPage, 
        tagSearch, 
        targetFilter
      );

      triggerAlert(
        'Data Proyek Diperbarui',
        `Informasi proyek "${editProjectForm.name.trim()}" berhasil disimpan.`,
        'success'
      );

      setIsEditProjectModalOpen(false);
      setProjectToEdit(null);
    } catch (err: any) {
      console.error('Gagal memperbarui data proyek:', err);
      setEditProjectError(err.message || 'Gagal menyimpan perubahan data proyek');
      triggerAlert(
        'Gagal Memperbarui Proyek',
        err.message || 'Terjadi kesalahan sistem saat menyimpan perubahan proyek.',
        'error'
      );
    }
  };


  const openDetailModal = async (batch: any, initialTab = 'tags') => {
    setHoveredTagInfo(null);
    setActiveBatch(batch);
    setActiveTab(initialTab);
    setTagSearch('');
    setSelectedTagsToAllocate([]);
    setTagProjectFilter('all');
    setTagsPage(1);
    setIsDetailModalOpen(true);
    
    // Load real summary and first page of tags from database
    await loadBatchDetailData(batch.id, 1, '', 'all');
  };

  const closeDetailModal = () => {
    setIsDetailModalOpen(false);
    setSelectedTagsToAllocate([]);
    setHoveredTagInfo(null);
    setActiveBatch(null);
  };

  const filteredTags = currentTags;

  const activeBatchProjects = React.useMemo(() => {
    if (Array.isArray(batchProjectsList) && batchProjectsList.length > 0) {
      return batchProjectsList;
    }
    if (Array.isArray(batchProjectsList) && batchProjectsList.length === 0 && !isTagsLoading) {
      return [];
    }
    if (!currentTags || currentTags.length === 0) return [];
    const projectsMap: { 
      [key: string]: { 
        name: string; 
        count: number; 
        specs: string; 
        warranty: string; 
        codeType: string; 
        prodCode: string; 
        note: string; 
        date: string; 
        tagNumbers: string[] 
      } 
    } = {};

    currentTags.forEach((t: any) => {
      if (t.project && t.status === 'Telah Digunakan') {
        if (!projectsMap[t.project]) {
          projectsMap[t.project] = {
            name: t.project,
            count: 0,
            specs: t.specs || '-',
            warranty: t.warranty || '-',
            codeType: t.codeType || '-',
            prodCode: t.prodCode || '-',
            note: t.note || '-',
            date: t.allocatedAt || activeBatch?.date || '-',
            tagNumbers: []
          };
        }
        projectsMap[t.project].count += 1;
        projectsMap[t.project].tagNumbers.push(t.tagNumber);
      }
    });

    const list = Object.values(projectsMap);
    return list.sort((a, b) => {
      const aRecent = isRecentlyCreated(a.date);
      const bRecent = isRecentlyCreated(b.date);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;
      return 0;
    });
  }, [batchProjectsList, isTagsLoading, currentTags, activeBatch]);

  // Handler Notifikasi Sistem (Scan, Pengeditan User, Reset Sandi)
  const loadNotifications = async () => {
    try {
      setIsNotifLoading(true);
      const data = await api.getNotifications();
      if (data && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
        setUnreadNotifCount(data.unreadCount || 0);
        setPendingResetCount(data.pendingResetCount || 0);
        setNotifCounts(data.counts || { all: 0, scan: 0, edit: 0, reset: 0 });
      }
    } catch (err) {
      console.error('Gagal memuat notifikasi:', err);
    } finally {
      setIsNotifLoading(false);
    }
  };

  const toggleNotificationPanel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isNotifOpen) {
      setIsNotifOpen(false);
      return;
    }
    if (notifButtonRef.current) {
      const rect = notifButtonRef.current.getBoundingClientRect();
      setNotifPos({
        top: rect.bottom + 8,
        right: Math.max(12, window.innerWidth - rect.right)
      });
    }
    setIsNotifOpen(true);
    loadNotifications();
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await api.markNotificationsRead({ all: true });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadNotifCount(0);
      setPendingResetCount(0);
      triggerAlert('Notifikasi Dibaca', 'Semua notifikasi telah ditandai sudah dibaca.', 'info');
    } catch (err) {
      console.error('Gagal menandai semua dibaca:', err);
      triggerAlert('Gagal Memperbarui Notifikasi', 'Terjadi kesalahan saat menandai notifikasi.', 'error');
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    try {
      await api.markNotificationsRead({ id });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadNotifCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Gagal menandai dibaca:', err);
    }
  };

  const handleRespondPasswordReset = async (requestId: string, action: 'approve' | 'reject') => {
    try {
      const res = await api.respondPasswordReset(requestId, action);
      if (res.success) {
        const title = action === 'approve' ? 'Permintaan Disetujui' : 'Permintaan Ditolak';
        const msg = action === 'approve'
          ? 'Tautan reset sandi berhasil dibuat dan dikirim ke email terdaftar.'
          : 'Permintaan reset sandi pengguna telah ditolak.';
        triggerAlert(title, msg, action === 'approve' ? 'success' : 'info');
        await loadNotifications();
      } else {
        triggerAlert('Gagal Memproses Permintaan', res.message || 'Terjadi kendala saat memproses reset sandi.', 'error');
      }
    } catch (err: any) {
      console.error('Gagal memproses reset password:', err);
      triggerAlert('Gagal Memproses Permintaan', 'Terjadi kesalahan sistem saat memproses permintaan.', 'error');
    }
  };

  const handleNotificationClick = (item: any) => {
    handleMarkNotificationRead(item.id);
    setIsNotifOpen(false);

    if (item.category === 'scan') {
      setActiveMenu('scan');
    } else if (item.category === 'edit') {
      const matchedBatch = batches.find(b => b.batchId === item.batchId || b.id === item.batchId);
      if (matchedBatch) {
        openDetailModal(matchedBatch, 'history');
      } else {
        setActiveMenu('tag-qr');
      }
    } else if (item.category === 'password_reset') {
      setActiveMenu('users');
    }
  };

  const toggleDropdownMenu = (e: React.MouseEvent<HTMLButtonElement>, batchId: string) => {
    e.stopPropagation();
    if (openDropdownId === batchId) {
      setOpenDropdownId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedDropdownHeight = 180; 
    
    if (spaceBelow < estimatedDropdownHeight) {
      setDropdownDirection('up');
      setDropdownPos({ top: rect.top - 4, left: rect.right }); 
    } else {
      setDropdownDirection('down');
      setDropdownPos({ top: rect.bottom + 4, left: rect.right }); 
    }
    
    setOpenDropdownId(batchId);
  };

  const activeDropdownBatch = batches.find(b => b.id === openDropdownId);

  const toggleBrandDropdownMenu = (e: React.MouseEvent<HTMLButtonElement>, brandId: string) => {
    e.stopPropagation();
    if (openBrandDropdownId === brandId) {
      setOpenBrandDropdownId(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedDropdownHeight = 180; 
    
    if (spaceBelow < estimatedDropdownHeight) {
      setBrandDropdownDirection('up');
      setBrandDropdownPos({ top: rect.top - 4, left: rect.right }); 
    } else {
      setBrandDropdownDirection('down');
      setBrandDropdownPos({ top: rect.bottom + 4, left: rect.right }); 
    }
    
    setOpenBrandDropdownId(brandId);
  };

  const activeDropdownBrand = brands.find(b => b.id === openBrandDropdownId);

  const filteredAndSortedBatches = React.useMemo(() => {
    let list = [...batches];

    // Filter pencarian: Batch ID, SKU, Brand, Proyek
    const q = batchSearch.toLowerCase().trim();
    if (q) {
      list = list.filter(b => {
        const matchId = (b.batchId || '').toLowerCase().includes(q);
        const matchSku = (b.sku || '').toLowerCase().includes(q);
        const matchBrand = (b.brand || '').toLowerCase().includes(q);
        const matchProject = (b.project || '').toLowerCase().includes(q);
        return matchId || matchSku || matchBrand || matchProject;
      });
    }

    // Filter status: all, Aktif, Disuspend
    if (batchFilterStatus !== 'all') {
      list = list.filter(b => b.status === batchFilterStatus);
    }

    // Pengurutan (Sort By)
    list.sort((a, b) => {
      // Prioritaskan data yang baru dibuat (< 5 menit) selalu di posisi paling atas tabel
      const aRecent = isRecentlyCreated(a.createdAt || a.date, a.id, 5);
      const bRecent = isRecentlyCreated(b.createdAt || b.date, b.id, 5);
      if (aRecent && !bRecent) return -1;
      if (!aRecent && bRecent) return 1;

      if (batchSortBy === 'newest') {
        const dateA = new Date(a.createdAt || a.date).getTime() || 0;
        const dateB = new Date(b.createdAt || b.date).getTime() || 0;
        if (dateA !== dateB) return dateB - dateA;
        return (b.id || '').localeCompare(a.id || '');
      }
      if (batchSortBy === 'oldest') {
        const dateA = new Date(a.createdAt || a.date).getTime() || 0;
        const dateB = new Date(b.createdAt || b.date).getTime() || 0;
        if (dateA !== dateB) return dateA - dateB;
        return (a.id || '').localeCompare(b.id || '');
      }
      if (batchSortBy === 'batchId-asc' || batchSortBy === 'id-asc') {
        return (a.batchId || '').localeCompare(b.batchId || '', undefined, { numeric: true });
      }
      if (batchSortBy === 'batchId-desc') {
        return (b.batchId || '').localeCompare(a.batchId || '', undefined, { numeric: true });
      }
      if (batchSortBy === 'sku-asc') {
        return (a.sku || '').localeCompare(b.sku || '');
      }
      if (batchSortBy === 'sku-desc') {
        return (b.sku || '').localeCompare(a.sku || '');
      }
      if (batchSortBy === 'brand-asc') {
        return (a.brand || '').localeCompare(b.brand || '');
      }
      if (batchSortBy === 'qty-desc') {
        return (Number(b.qty) || 0) - (Number(a.qty) || 0);
      }
      if (batchSortBy === 'qty-asc') {
        return (Number(a.qty) || 0) - (Number(b.qty) || 0);
      }
      return 0;
    });

    return list;
  }, [batches, batchSearch, batchFilterStatus, batchSortBy]);

  const currentBatches = React.useMemo(() => {
    const start = (currentPage - 1) * batchPerPage;
    return filteredAndSortedBatches.slice(start, start + batchPerPage);
  }, [filteredAndSortedBatches, currentPage, batchPerPage]);
  const totalPages = Math.ceil(filteredAndSortedBatches.length / batchPerPage) || 1;
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  // Memoized calculations for Brand Table (Top level to adhere to React Hook rules)
  const filteredBrands = React.useMemo(() => {
    const q = brandSearch.toLowerCase().trim();
    const matched = brands.filter(b => {
      const matchSearch = !q || 
        b.name.toLowerCase().includes(q) ||
        b.ownerName.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q)) ||
        (b.category && b.category.toLowerCase().includes(q));
      
      const matchStatus = brandFilterStatus === 'all' || b.status === brandFilterStatus;

      return matchSearch && matchStatus;
    });

    // Pengurutan brand sesuai pilihan
    return [...matched].sort((a, b) => {
      if (brandSortBy === 'newest') {
        const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
        const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
        if (aRecent && !bRecent) return -1;
        if (!aRecent && bRecent) return 1;
        const dtA = parseFlexibleDate(a.createdAt, a.id)?.getTime() || 0;
        const dtB = parseFlexibleDate(b.createdAt, b.id)?.getTime() || 0;
        return dtB - dtA;
      }
      if (brandSortBy === 'oldest') {
        const dtA = parseFlexibleDate(a.createdAt, a.id)?.getTime() || 0;
        const dtB = parseFlexibleDate(b.createdAt, b.id)?.getTime() || 0;
        return dtA - dtB;
      }
      if (brandSortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (brandSortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });
  }, [brands, brandSearch, brandFilterStatus, brandSortBy]);

  const totalBrandPages = Math.ceil(filteredBrands.length / brandPerPage) || 1;
  const currentBrands = React.useMemo(() => {
    const start = (brandPage - 1) * brandPerPage;
    return filteredBrands.slice(start, start + brandPerPage);
  }, [filteredBrands, brandPage, brandPerPage]);

  const availableCategories = React.useMemo(() => {
    return Array.from(new Set(brands.map(b => b.category))).filter(Boolean);
  }, [brands]);

  // Akun aktif yang sedang login / digunakan saat ini
  const currentUser = React.useMemo(() => {
    return users.find(u => u.role === currentRole && (u.username === 'admin' || u.name.toLowerCase().includes('admin'))) 
      || users.find(u => u.role === currentRole) 
      || users[0];
  }, [users, currentRole]);

  // Memoized calculations for Users Table (Top level to adhere to React Hook rules)
  const filteredUsers = React.useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    const matched = users.filter(u => {
      const matchSearch = !q || 
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q);
      
      const matchRole = userFilterRole === 'all' || u.role === userFilterRole;
      return matchSearch && matchRole;
    });

    return [...matched].sort((a, b) => {
      if (currentUser) {
        if (a.id === currentUser.id) return -1;
        if (b.id === currentUser.id) return 1;
      }
      if (userSortBy === 'newest') {
        const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
        const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
        if (aRecent && !bRecent) return -1;
        if (!aRecent && bRecent) return 1;
        const dtA = parseFlexibleDate(a.createdAt, a.id)?.getTime() || 0;
        const dtB = parseFlexibleDate(b.createdAt, b.id)?.getTime() || 0;
        return dtB - dtA;
      }
      if (userSortBy === 'oldest') {
        const dtA = parseFlexibleDate(a.createdAt, a.id)?.getTime() || 0;
        const dtB = parseFlexibleDate(b.createdAt, b.id)?.getTime() || 0;
        return dtA - dtB;
      }
      if (userSortBy === 'name-asc') {
        return a.name.localeCompare(b.name);
      }
      if (userSortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }
      if (userSortBy === 'role-asc') {
        return a.role.localeCompare(b.role);
      }
      return 0;
    });
  }, [users, userSearch, userFilterRole, userSortBy, currentUser]);

  const totalUserPages = Math.ceil(filteredUsers.length / userPerPage) || 1;
  const currentUsers = React.useMemo(() => {
    const start = (userPage - 1) * userPerPage;
    return filteredUsers.slice(start, start + userPerPage);
  }, [filteredUsers, userPage, userPerPage]);

  const rolesInUse = React.useMemo(() => {
    return Array.from(new Set(users.map(u => u.role))).filter(Boolean);
  }, [users]);

  // Memoized calculations for SKU / Produk Table
  const filteredProducts = React.useMemo(() => {
    const q = skuSearch.toLowerCase().trim();
    const matched = products.filter(p => {
      const matchSearch = !q ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.brandName && p.brandName.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q));

      const matchBrand = skuFilterBrand === 'all' || 
        p.brandId === skuFilterBrand || 
        (p.brandName && p.brandName.toLowerCase() === skuFilterBrand.toLowerCase());

      return matchSearch && matchBrand;
    });

    return [...matched].sort((a, b) => {
      if (skuSortBy === 'newest') {
        const aRecent = isRecentlyCreated(a.createdAt, a.id, 5);
        const bRecent = isRecentlyCreated(b.createdAt, b.id, 5);
        if (aRecent && !bRecent) return -1;
        if (!aRecent && bRecent) return 1;
        const dtA = parseFlexibleDate(a.createdAt, a.id)?.getTime() || 0;
        const dtB = parseFlexibleDate(b.createdAt, b.id)?.getTime() || 0;
        return dtB - dtA;
      }
      if (skuSortBy === 'oldest') {
        const dtA = parseFlexibleDate(a.createdAt, a.id)?.getTime() || 0;
        const dtB = parseFlexibleDate(b.createdAt, b.id)?.getTime() || 0;
        return dtA - dtB;
      }
      if (skuSortBy === 'name-asc') {
        return (a.sku || '').localeCompare(b.sku || '');
      }
      if (skuSortBy === 'name-desc') {
        return (b.sku || '').localeCompare(a.sku || '');
      }
      if (skuSortBy === 'brand-asc') {
        return (a.brandName || '').localeCompare(b.brandName || '');
      }
      return 0;
    });
  }, [products, skuSearch, skuFilterBrand, skuSortBy]);

  const totalSkuPages = Math.ceil(filteredProducts.length / skuPerPage) || 1;
  const currentProducts = React.useMemo(() => {
    const start = (skuPage - 1) * skuPerPage;
    return filteredProducts.slice(start, start + skuPerPage);
  }, [filteredProducts, skuPage, skuPerPage]);

  const activeDropdownSku = products.find(p => p.id === openSkuDropdownId);

  const openDownloadModal = (batch: any) => {
    setOpenDropdownId(null);
    setBatchToDownload(batch);
    setIsDownloadModalOpen(true);
  };

  const handleDownloadPDF = async () => {
    if (!batchToDownload) return;
    const batch = batchToDownload;
    setIsDownloadModalOpen(false);
    setIsDownloadingLayout(true);
    triggerAlert('Menyiapkan Lembar Cetak A3+', `Mengambil seluruh data tag untuk batch "${batch.batchId}"...`, 'info');

    try {
      // 1. Ambil seluruh data tag dari database
      const data = await api.getAllBatchTags(batch.id);
      const tags = (data && data.tags) ? data.tags : [];
      if (tags.length === 0) {
        triggerAlert('Data Tag Kosong', 'Tidak ada data tag yang ditemukan untuk batch ini.', 'error');
        setIsDownloadingLayout(false);
        return;
      }

      triggerAlert('Merender Layout PDF A3+', `Menata ${tags.length} label pada lembar A3+ (31x47 cm) dengan QR Code & PIN...`, 'info');

      // 2. Render PDF A3+ 31 x 47 cm dengan QR Code & PIN di bawahnya
      const pdfBlob = await generateA3PlusStickersPdf(batch, tags);

      // 3. Nama file default: diawali "Batch" dan dipisahkan underscore
      const cleanBatchId = String(batch.batchId).trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
      const defaultFileName = `Batch_${cleanBatchId}_Label_A3Plus.pdf`;

      // 4. Buka dialog native file picker OS untuk memilih lokasi folder dan nama file
      const result = await saveFileWithNativePicker(
        pdfBlob,
        defaultFileName,
        'application/pdf',
        'pdf'
      );

      if (result.aborted) {
        triggerAlert('Batal Menyimpan', 'Penyimpanan file dibatalkan pengguna.', 'info');
      } else {
        triggerAlert(
          'Unduh Layout Selesai',
          `File "${result.fileName}" berhasil disimpan. Siap dicetak di kertas A3+ (31x47 cm).`,
          'success'
        );
      }
    } catch (err) {
      console.error('Gagal membuat file PDF A3+:', err);
      triggerAlert('Gagal Mengunduh PDF', 'Terjadi kesalahan saat memproses layout PDF A3+.', 'error');
    } finally {
      setIsDownloadingLayout(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!batchToDownload) return;
    const batch = batchToDownload;
    setIsDownloadModalOpen(false);
    setIsDownloadingExcel(true);
    triggerAlert('Menyiapkan Data Spreadsheet', `Mengambil data tag batch "${batch.batchId}"...`, 'info');

    try {
      const data = await api.getAllBatchTags(batch.id);
      const tags = (data && data.tags) ? data.tags : [];
      if (tags.length === 0) {
        triggerAlert('Data Tag Kosong', 'Tidak ada data tag yang ditemukan untuk batch ini.', 'error');
        setIsDownloadingExcel(false);
        return;
      }

      const csvBlob = generateTagsCsv(batch, tags);
      const cleanBatchId = String(batch.batchId).trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
      const defaultFileName = `Batch_${cleanBatchId}_Data_Tag.csv`;

      const result = await saveFileWithNativePicker(
        csvBlob,
        defaultFileName,
        'text/csv',
        'csv'
      );

      if (result.aborted) {
        triggerAlert('Batal Menyimpan', 'Penyimpanan file dibatalkan pengguna.', 'info');
      } else {
        triggerAlert('Ekspor Berhasil', `File "${result.fileName}" berhasil disimpan.`, 'success');
      }
    } catch (err) {
      console.error('Gagal ekspor data tag:', err);
      triggerAlert('Gagal Ekspor Data', 'Terjadi kesalahan saat mengekspor data tag.', 'error');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const renderSidebarContent = (isMobile = false) => {
    // Komponen dinamis untuk menu item dengan dukungan sub-item menjorok
    const NavItem = ({ 
      id, 
      icon: Icon, 
      label 
    }: { 
      id: string; 
      icon: any; 
      label: string; 
    }) => {
      const isSelected = activeMenu === id;
      const isMin = isSidebarMinimized && !isMobile;

      return (
        <a 
          href="#" 
          onClick={(e) => { 
            e.preventDefault(); 
            requestLeaveSkuPage(() => {
              setActiveMenu(id); 
              if (id === 'sku') setSkuSubView('list');
              if (isMobile) setIsMobileMenuOpen(false); 
            });
          }} 
          className={`group flex items-center transition-all ${
            isMin 
              ? 'justify-center w-10 h-10 min-w-[40px] min-h-[40px] max-w-[40px] max-h-[40px] rounded-full aspect-square mx-auto p-0 shrink-0' 
              : 'gap-3 rounded-full w-full px-4 py-2.5 text-xs sm:text-sm'
          } ${
            isSelected 
              ? 'bg-[#fcf7f3] dark:bg-zinc-800 text-[#c28e62] font-semibold border border-[#cd9a6f]/30 dark:border-zinc-700' 
              : 'text-slate-600 dark:text-zinc-400 hover:bg-slate-100/80 dark:hover:bg-zinc-800/60 hover:text-slate-900 dark:hover:text-zinc-100 font-medium'
          }`} 
          {...(isMin ? { 'data-tooltip': label, 'data-tooltip-pos': 'right' } : {})}
        >
          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 transition-colors">
            <Icon size={18} className={isSelected ? 'text-[#c28e62]' : 'text-slate-400 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300'} />
          </div>
          {!isMin && (
            <span className="truncate">
              {label}
            </span>
          )}
        </a>
      );
    };

    return (
      <div className="flex flex-col justify-between h-full bg-white dark:bg-zinc-900">
        <div>
          <div className={`h-16 flex items-center border-b border-slate-100 dark:border-zinc-700 relative ${isSidebarMinimized && !isMobile ? 'justify-center px-0' : 'px-5'}`}>
            <div className={`flex items-center gap-2 overflow-hidden w-full ${isSidebarMinimized && !isMobile ? 'justify-center px-0' : ''}`}>
              {isSidebarMinimized && !isMobile ? (
                <div 
                  onClick={() => requestLeaveSkuPage(() => setActiveMenu('dashboard'))}
                  className="cursor-pointer flex items-center justify-center hover:opacity-80 transition-opacity py-1 select-none"
                >
                  <SumasEmblem className="h-7 w-auto object-contain" />
                </div>
              ) : (
                <div 
                  onClick={() => requestLeaveSkuPage(() => setActiveMenu('dashboard'))}
                  className="cursor-pointer py-1 flex items-center"
                >
                  <SumasLogo className="h-7 w-auto object-contain" />
                </div>
              )}
            </div>
          </div>

          {/* SIDEBAR NAVIGATION ITEMS (EQUAL WIDTH & EQUAL FONT SIZE FOR ALL ITEMS) */}
          <div className={`${isSidebarMinimized && !isMobile ? 'px-2 flex flex-col items-center' : 'px-3.5'} py-4 space-y-1.5`}>
            <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />

            {/* MASTER DATA SECTION */}
            {(!isSidebarMinimized || isMobile) && (
              <div className="pt-4 pb-1.5 px-3.5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-widest uppercase">
                  Master Data
                </span>
                <span className="w-8 h-px bg-slate-200 dark:bg-zinc-700/60"></span>
              </div>
            )}
            
            <div className={`space-y-1.5 ${isSidebarMinimized && !isMobile ? 'w-full flex flex-col items-center' : ''}`}>
              <NavItem id="brand" icon={Building2} label="Brand / Merk" />
              <NavItem id="category" icon={Layers} label="Kategori Produk" />
              <NavItem id="sku" icon={Box} label="SKU Produk" />
              <NavItem id="tag-qr" icon={QrCode} label="Tag / QRCode" />
            </div>

            {/* SISTEM & OPERASIONAL SECTION */}
            {(!isSidebarMinimized || isMobile) && (
              <div className="pt-4 pb-1.5 px-3.5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 tracking-widest uppercase">
                  Sistem & Log
                </span>
                <span className="w-8 h-px bg-slate-200 dark:bg-zinc-700/60"></span>
              </div>
            )}

            <div className={`space-y-1.5 ${isSidebarMinimized && !isMobile ? 'w-full flex flex-col items-center' : ''}`}>
              <NavItem id="scan" icon={Scan} label="Aktivitas Scan" />
              <NavItem id="users" icon={Users} label="Akun Pengguna" />
              <NavItem id="settings" icon={Settings} label="Pengaturan" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-zinc-700">
          <div className={`flex items-center gap-3 ${isSidebarMinimized && !isMobile ? 'justify-center px-0' : 'px-2'}`}>
            {currentUser?.avatar ? (
              <img 
                src={currentUser.avatar} 
                alt={currentUser.name} 
                onError={(e) => {
                  const el = e.currentTarget;
                  el.onerror = null;
                  el.src = getInitialsAvatar(currentUser.name);
                }}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0 border border-[#c28e62]/40" 
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#c28e62] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0 aspect-square overflow-hidden">
                {currentUser?.name ? currentUser.name.slice(0, 2).toUpperCase() : (currentRole === 'Administrator' ? 'AD' : 'OP')}
              </div>
            )}
            {(!isSidebarMinimized || isMobile) && (
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-bold text-slate-700 dark:text-zinc-200 truncate">
                  {currentUser ? currentUser.name : 'admin'}
                </p>
                <p className="text-xs italic text-slate-400 dark:text-zinc-500 truncate mt-0.5">
                  {currentRole}
                </p>
              </div>
            )}
            {(!isSidebarMinimized || isMobile) && (
              <button 
                type="button"
                onClick={() => setCurrentRole(prev => prev === 'Administrator' ? 'Operator' : 'Administrator')}
                className="text-slate-400 dark:text-zinc-500 hover:text-[#c28e62] dark:hover:text-[#c28e62] p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                data-tooltip="Ganti Role"
                data-tooltip-pos="top"
              >
                <RotateCcw size={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Helper mendapatkan properti menu aktif untuk header dan konten
  const getActiveMenuDetails = () => {
    switch (activeMenu) {
      case 'dashboard': 
        return { 
          title: 'Dashboard',
          pageTitle: 'Monitoring Geolokasi & Scan',
          subtitle: 'Live Telemetri Pemindaian & Sebaran Tag',
          icon: LayoutDashboard 
        };
      case 'brand': 
        return { 
          title: 'Brand / Merk',
          pageTitle: 'Katalog Brand & Kepemilikan Tag',
          subtitle: 'Profil Brand Mitra & Sertifikasi Hak Milik',
          icon: Building2 
        };
      case 'category': 
        return { 
          title: 'Kategori Produk',
          pageTitle: 'Struktur Kategori Produk 3 Level',
          subtitle: 'Kategori Utama, Sub Kategori & Varian',
          icon: Layers 
        };
      case 'sku': 
        return { 
          title: 'SKU Produk',
          pageTitle: 'Master Katalog SKU Produk',
          subtitle: 'Registrasi Kode Barang & Spesifikasi',
          icon: Box 
        };
      case 'tag-qr': 
        return { 
          title: 'Tag / QRCode',
          pageTitle: 'Penerbitan Batch Tag & Serial QR',
          subtitle: 'Generasi Batch, Alokasi & Verifikasi',
          icon: QrCode 
        };
      case 'scan': 
        return { 
          title: 'Aktivitas Scan',
          pageTitle: 'Log Pemantauan Aktivitas Scan',
          subtitle: 'Telemetri Scan & Deteksi Anomali',
          icon: Scan 
        };
      case 'users': 
        return { 
          title: 'Akun Pengguna',
          pageTitle: 'Kelola Akun & Hak Akses Pengguna',
          subtitle: 'Daftar Pengguna & Pembagian Peran',
          icon: Users 
        };
      case 'settings': 
        return { 
          title: 'Pengaturan',
          pageTitle: 'Konfigurasi Sistem & Keamanan',
          subtitle: 'Preferensi Aplikasi & Kebijakan Proteksi',
          icon: Settings 
        };
      default: 
        return { 
          title: 'Tag / QRCode',
          pageTitle: 'Penerbitan Batch Tag & Serial QR',
          subtitle: 'Manajemen Batch Tag Fisik & Serial QR',
          icon: QrCode 
        };
    }
  };

  const activeDetails = getActiveMenuDetails();
  const ActiveIcon = activeDetails.icon;

  const renderDashboardContent = () => {
    return (
      <div 
        className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300"
        onScroll={() => { if(openDropdownId) setOpenDropdownId(null); }}
      >
        <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">

          {/* 1. BAGIAN 1: 4 KOLOM CARD (KPI STATS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            {/* CARD 1: TOTAL TAG TERBIT */}
            <div 
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-600 transition-colors duration-150 min-w-0 cursor-default select-none outline-none"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">Total Tag Terbit</span>
                <div className="w-10 h-10 rounded-2xl bg-[#c28e62]/10 dark:bg-[#c28e62]/20 text-[#c28e62] flex items-center justify-center font-bold border border-[#c28e62]/20 group-hover:scale-110 transition-transform">
                  <QrCode size={20} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-zinc-50 tracking-tight">
                  {liveStats.totalTags.toLocaleString('id-ID')}
                </div>
              </div>
            </div>

            {/* CARD 2: TOTAL SCAN BERHASIL */}
            <div 
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-600 transition-colors duration-150 min-w-0 cursor-default select-none outline-none"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">Total Aktivitas Scan</span>
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold border border-emerald-200/60 dark:border-emerald-800/40 group-hover:scale-110 transition-transform">
                  <Scan size={20} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-zinc-50 tracking-tight">
                  18,492
                </div>
              </div>
            </div>

            {/* CARD 3: BRAND & PORTOFOLIO */}
            <div 
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-600 transition-colors duration-150 min-w-0 cursor-default select-none outline-none"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">Brand Terdaftar</span>
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold border border-indigo-200/60 dark:border-indigo-800/40 group-hover:scale-110 transition-transform">
                  <Building2 size={20} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-zinc-50 tracking-tight">
                  {brands.length} <span className="text-base font-normal text-slate-500 dark:text-zinc-400">Merk</span>
                </div>
              </div>
            </div>

            {/* CARD 4: SEBARAN TITIK SCAN (LEAFLET + OSM) */}
            <div 
              className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-3xl p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-600 transition-colors duration-150 min-w-0 cursor-default select-none outline-none"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 dark:text-zinc-400">Sebaran Wilayah Scan</span>
                <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold border border-amber-200/60 dark:border-amber-800/40 group-hover:scale-110 transition-transform">
                  <Globe size={20} />
                </div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-zinc-50 tracking-tight">
                  34 <span className="text-base font-normal text-slate-500 dark:text-zinc-400">Kota</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. BAGIAN 2: CHART GARIS AKTIVITAS SCAN */}
          <ScanActivityChart />

          {/* 3. BAGIAN 3: MAPS DENGAN POIN-POIN LOKASI SCAN (LEAFLET + OPENSTREETMAP) */}
          <ScanLocationMap />



        </div>
      </div>
    );
  };

  // ==========================================
  // RENDER HALAMAN BRAND (MASTER BRAND & OWNER CRUD)
  // ==========================================
  const renderBrandContent = () => {
    return (
      <div 
        className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300"
        onScroll={() => { 
          if(openDropdownId) setOpenDropdownId(null); 
          if(openBrandDropdownId) setOpenBrandDropdownId(null);
        }}
      >
        <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
          {/* TOP STATUS BAR / HEADER BRAND (SIMPLE) */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                <Building2 size={16} />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
                Katalog Brand & Kepemilikan Tag
              </span>
            </div>

            <button
              onClick={handleOpenCreateBrand}
              className="w-full sm:w-auto bg-[#c28e62] hover:bg-[#b07d53] text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
            >
              <span>Tambah Brand / Merk</span>
            </button>
          </div>

          {/* SEARCH & FILTER CONTROLS */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Cari merk, pemilik, deskripsi, atau kategori..."
                  value={brandSearch}
                  onChange={(e) => {
                    setBrandSearch(e.target.value);
                    setBrandPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#cd9a6f]"
                />
                {brandSearch && (
                  <button
                    onClick={() => {
                      setBrandSearch('');
                      setBrandPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Controls Pengurutan & Filter Brand */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Dropdown Sort By Brand (Tanpa Pencarian) */}
                <div className="w-full sm:w-auto min-w-[150px] sm:min-w-[170px]">
                  <CustomSelect
                    value={brandSortBy}
                    onChange={(val) => {
                      setBrandSortBy(val);
                      setBrandPage(1);
                    }}
                    placeholder="Urutkan Brand"
                    searchable={false}
                    buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={[
                      { value: 'newest', label: 'Terbaru' },
                      { value: 'oldest', label: 'Terlama' },
                      { value: 'name-asc', label: 'Nama Brand (A - Z)' },
                      { value: 'name-desc', label: 'Nama Brand (Z - A)' },
                    ]}
                  />
                </div>


                {/* Dropdown Custom Semua Status (Tanpa Pencarian) */}
                <div className="w-full sm:w-auto min-w-[130px] sm:min-w-[150px]">
                  <CustomSelect
                    value={brandFilterStatus}
                    onChange={(val) => {
                      setBrandFilterStatus(val);
                      setBrandPage(1);
                    }}
                    placeholder="Semua Status"
                    searchable={false}
                    buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={[
                      { value: 'all', label: 'Semua Status' },
                      { value: 'Aktif', label: 'Aktif' },
                      { value: 'Nonaktif', label: 'Nonaktif' }
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Reset filter button if active (seperti di halaman tag qrcode) */}
            {(brandSearch || brandFilterStatus !== 'all' || brandSortBy !== 'newest') && (
              <button
                type="button"
                onClick={() => {
                  setBrandSearch('');
                  setBrandFilterStatus('all');
                  setBrandSortBy('newest');
                  setBrandPage(1);
                }}
                className="text-xs text-[#c28e62] hover:underline font-semibold self-center sm:self-auto cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* BRAND TABLE DISPLAY */}
          {filteredBrands.length > 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap min-w-[700px]">
                <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] select-none">
                  <tr>
                    <th className="px-5 py-3.5">Brand / Merk</th>
                    <th className="px-5 py-3.5">Pemilik (Akun Pengguna)</th>
                    <th className="px-5 py-3.5">SKU Produk</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                  {currentBrands.map((brand) => (
                      <tr 
                        key={brand.id} 
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
                        className="group/brand hover:bg-slate-50/80 dark:hover:bg-zinc-800/60 transition-colors"
                      >
                      {/* KOLOM 1: LOGO & NAMA BRAND */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          {brand.logo ? (
                            <img 
                              src={brand.name.toLowerCase() === 'sumas' && (!brand.logo || brand.logo.includes('541888946425') || brand.logo.includes('logo_vertikal')) ? '/assets/brand/logo_horizontal.svg' : brand.logo} 
                              alt={brand.name} 
                              onError={(e) => {
                                const el = e.currentTarget;
                                el.onerror = null;
                                el.src = getBrandInitialsLogo(brand.name);
                              }}
                              className="w-10 h-10 rounded-xl object-contain p-0.5 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-shrink-0 group-hover:border-[#c28e62] transition-colors" 
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-[#c28e62] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                              {brand.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-zinc-100 text-sm group-hover:text-[#c28e62] transition-colors">{brand.name}</span>
                            <NewBadge date={brand.createdAt} id={brand.id} />
                          </div>
                        </div>
                      </td>

                      {/* KOLOM 2: PEMILIK / AKUN USER TERHUBUNG */}
                      <td className="px-5 py-3.5">
                        {(() => {
                          const linkedUser = users.find(u => u.id === brand.ownerId);
                          const ownerDisplayName = linkedUser ? linkedUser.name : brand.ownerName;
                          const ownerDisplayRole = linkedUser ? linkedUser.role : (brand.ownerRole || 'PIC Brand');
                          const ownerAvatar = linkedUser?.avatar;

                          return (
                            <div className="flex items-center gap-2.5">
                              {ownerAvatar ? (
                                <img 
                                  src={ownerAvatar} 
                                  alt={ownerDisplayName} 
                                  onError={(e) => {
                                    const el = e.currentTarget;
                                    el.onerror = null;
                                    el.src = getInitialsAvatar(ownerDisplayName);
                                  }}
                                  className="w-8 h-8 rounded-full object-cover border border-[#c28e62] flex-shrink-0" 
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-[#c28e62]/15 text-[#c28e62] flex items-center justify-center font-bold text-xs flex-shrink-0 border border-[#c28e62]/20">
                                  {ownerDisplayName ? ownerDisplayName.charAt(0).toUpperCase() : 'U'}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-800 dark:text-zinc-200 text-xs">
                                  {ownerDisplayName}
                                </div>
                                <div className="text-[11px] text-slate-400 dark:text-zinc-500">
                                  {ownerDisplayRole}
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </td>

                      {/* KOLOM 3: SKU PRODUK (JUMLAH PRODUK TERDAFTAR OLEH BRAND) */}
                      <td className="px-5 py-3.5">
                        {(() => {
                          const productList = getBrandProductList(brand.name);
                          return (
                            <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm">
                              <Box size={14} className="text-[#c28e62]" />
                              <span>{productList.length} <span className="font-normal text-slate-400 dark:text-zinc-500 text-xs">SKU Terdaftar</span></span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* KOLOM 4: STATUS OPERASIONAL (KONSISTEN: AKTIF / NONAKTIF) */}
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleToggleBrandStatus(brand)}
                          data-tooltip={brand.status === 'Nonaktif' ? 'Klik untuk Aktifkan Brand' : 'Klik untuk Nonaktifkan Brand'}
                          data-tooltip-pos="top"
                          className="relative inline-flex items-center cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
                        >
                          {brand.status === 'Nonaktif' ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors">
                              <Ban size={13} className="text-rose-600 dark:text-rose-400" />
                              <span>Nonaktif</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                              <span>Aktif</span>
                            </span>
                          )}
                        </button>
                      </td>

                      {/* KOLOM 5: AKSI (BUTTON 3-DOTS PERSIS SEPERTI DI HALAMAN TAG/QRCODE) */}
                      <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className={`relative inline-block transition-opacity duration-150 ${
                          openBrandDropdownId === brand.id 
                            ? 'opacity-100 pointer-events-auto' 
                            : 'opacity-0 pointer-events-none group-hover/brand:opacity-100 group-hover/brand:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
                        }`}>
                          <button 
                            onClick={(e) => toggleBrandDropdownMenu(e, brand.id)}
                            className={`p-2 rounded-full transition-colors relative z-20 cursor-pointer ${
                              openBrandDropdownId === brand.id 
                                ? 'bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-100' 
                                : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                            }`}
                            data-tooltip="Opsi Brand"
                            data-tooltip-pos="left"
                          >
                            <MoreVertical size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* HIGH-PERFORMANCE PAGINATION CONTROLS */}
            <TablePagination
              currentPage={brandPage}
              totalPages={totalBrandPages}
              totalItems={filteredBrands.length}
              itemsPerPage={brandPerPage}
              onPageChange={setBrandPage}
              onItemsPerPageChange={(val) => {
                setBrandPerPage(val);
                setBrandPage(1);
              }}
              itemName="brand"
            />
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-slate-300 dark:border-zinc-700 rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-[#fcf7f3] dark:bg-zinc-800 text-[#c28e62] flex items-center justify-center mb-4">
              <Building2 size={32} />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-200 mb-1">
              {(brandSearch || brandFilterStatus !== 'all' || brandSortBy !== 'newest') ? 'Tidak Ada Brand yang Cocok' : 'Belum Ada Brand Terdaftar'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 dark:text-zinc-500 max-w-sm mb-5">
              {(brandSearch || brandFilterStatus !== 'all' || brandSortBy !== 'newest')
                ? 'Tidak ditemukan merk dengan filter atau kata kunci saat ini. Coba ubah kata kunci atau reset filter.'
                : 'Mulai dengan menambahkan merk pertama Anda beserta foto logo dan PIC pemilik akun.'}
            </p>
            {(brandSearch || brandFilterStatus !== 'all' || brandSortBy !== 'newest') ? (
              <button
                type="button"
                onClick={() => { setBrandSearch(''); setBrandFilterStatus('all'); setBrandSortBy('newest'); setBrandPage(1); }}
                className="mt-1 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#c28e62] hover:underline text-xs font-semibold cursor-pointer"
              >
                Reset Filter
              </button>
            ) : (
              <button
                onClick={handleOpenCreateBrand}
                className="px-5 py-2.5 bg-[#c28e62] hover:bg-[#b37f54] text-white rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
              >
                <span>Tambah Brand / Merk Sekarang</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

  // ==========================================
  // RENDER HALAMAN USERS (USERS & ROLES CRUD)
  // ==========================================
  const renderUsersContent = () => {
    return (
      <div 
        className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300"
        onScroll={() => { 
          if(openDropdownId) setOpenDropdownId(null); 
          if(openBrandDropdownId) setOpenBrandDropdownId(null);
          if(openUserDropdownId) setOpenUserDropdownId(null);
        }}
      >
        <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
          {/* TOP STATUS BAR / HEADER USERS */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                <Users size={16} />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
                Kelola Akun & Hak Akses Pengguna
              </span>
            </div>

            {currentRole === 'Administrator' ? (
              <button
                onClick={handleOpenCreateUser}
                className="w-full sm:w-auto bg-[#c28e62] hover:bg-[#b07d53] text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
              >
                <span>Tambah Pengguna</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 text-xs">
                <CheckCircle2 size={13} className="text-[#c28e62]" />
                <span>Mode Operator (Hanya Administrator yang dapat mengelola user)</span>
              </div>
            )}
          </div>

          {/* SEARCH & FILTER CONTROLS */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Cari nama, email, atau peran pengguna..."
                  value={userSearch}
                  onChange={(e) => {
                    setUserSearch(e.target.value);
                    setUserPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#cd9a6f]"
                />
                {userSearch && (
                  <button
                    onClick={() => {
                      setUserSearch('');
                      setUserPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Controls Pengurutan & Filter Peran User */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Dropdown Sort By User (Tanpa Pencarian) */}
                <div className="w-full sm:w-auto min-w-[150px] sm:min-w-[170px]">
                  <CustomSelect
                    value={userSortBy}
                    onChange={(val) => {
                      setUserSortBy(val);
                      setUserPage(1);
                    }}
                    placeholder="Urutkan Pengguna"
                    searchable={false}
                    buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={[
                      { value: 'newest', label: 'Terbaru' },
                      { value: 'oldest', label: 'Terlama' },
                      { value: 'name-asc', label: 'Nama (A - Z)' },
                      { value: 'name-desc', label: 'Nama (Z - A)' },
                      { value: 'role-asc', label: 'Hak Akses (A - Z)' },
                    ]}
                  />
                </div>

                <div className="w-full sm:w-auto min-w-[160px] sm:min-w-[180px]">
                  <CustomSelect
                    value={userFilterRole}
                    onChange={(val) => {
                      setUserFilterRole(val);
                      setUserPage(1);
                    }}
                    placeholder="Semua Role"
                    searchable={false}
                    buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={[
                      { value: 'all', label: `Semua Role (${users.length})` },
                      ...rolesInUse.map(r => ({ value: r, label: r }))
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Reset filter button if active (seperti di halaman tag qrcode) */}
            {(userSearch || userFilterRole !== 'all' || userSortBy !== 'newest') && (
              <button
                type="button"
                onClick={() => {
                  setUserSearch('');
                  setUserFilterRole('all');
                  setUserSortBy('newest');
                  setUserPage(1);
                }}
                className="text-xs text-[#c28e62] hover:underline font-semibold self-center sm:self-auto cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* USERS TABLE */}
          {filteredUsers.length > 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap min-w-[640px]">
                <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] select-none">
                  <tr>
                    <th className="px-5 py-3.5">Pengguna</th>
                    <th className="px-5 py-3.5">Hak Akses</th>
                    <th className="px-5 py-3.5">Brand Dikelola</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                  {currentUsers.map((user) => {
                    return (
                      <tr 
                        key={user.id} 
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
                        className="group/user hover:bg-slate-50/80 dark:hover:bg-zinc-800/60 transition-colors"
                      >
                        {/* KOLOM 1: PENGGUNA (AVATAR, NAMA & EMAIL DI BAWAHNYA) */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {user.avatar ? (
                              <img 
                                src={user.avatar} 
                                alt={user.name} 
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  el.onerror = null;
                                  el.src = getInitialsAvatar(user.name);
                                }}
                                className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-zinc-700 flex-shrink-0" 
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-[#c28e62]/15 text-[#c28e62] flex items-center justify-center font-bold text-sm border border-[#c28e62]/25 flex-shrink-0">
                                {user.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm flex items-center gap-2 flex-wrap">
                                <span className="truncate">{user.name}</span>
                                {currentUser && user.id === currentUser.id ? (
                                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#c28e62]/15 text-[#c28e62] border border-[#c28e62]/30 flex-shrink-0">
                                    Anda
                                  </span>
                                ) : (
                                  <NewBadge date={user.createdAt} id={user.id} />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400 font-medium text-[11px] sm:text-xs mt-0.5 truncate">
                                <Mail size={12} className="text-slate-400 flex-shrink-0" />
                                <span className="truncate">{user.email}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* KOLOM 2: HAK AKSES */}
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            user.role === 'Administrator'
                              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                              : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                          }`}>
                            <UserCheck size={13} />
                            <span>{user.role}</span>
                          </span>
                        </td>

                        {/* KOLOM 3: BRAND DIKELOLA */}
                        <td className="px-5 py-3.5">
                          {(() => {
                            const userBrands = brands.filter(b => b.ownerId === user.id);
                            if (userBrands.length === 0) {
                              return (
                                <span className="inline-flex items-center gap-1 text-slate-400 dark:text-zinc-500 text-xs italic">
                                  <span>Tidak mengelola brand</span>
                                </span>
                              );
                            }
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 max-w-[320px]">
                                {userBrands.map((b) => (
                                  <span 
                                    key={b.id}
                                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700"
                                  >
                                    <span>{b.name}</span>
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </td>

                        {/* KOLOM 4: STATUS (KONSISTEN: AKTIF / NONAKTIF) */}
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => handleToggleUserStatus(user)}
                            data-tooltip={(user.status || 'Aktif') === 'Nonaktif' ? 'Klik untuk Aktifkan Akun' : 'Klik untuk Nonaktifkan Akun'}
                            data-tooltip-pos="top"
                            className="relative inline-flex items-center cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
                          >
                            {(user.status || 'Aktif') === 'Nonaktif' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors">
                                <Ban size={13} className="text-rose-600 dark:text-rose-400" />
                                <span>Nonaktif</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                                <span>Aktif</span>
                              </span>
                            )}
                          </button>
                        </td>

                        {/* KOLOM 5: AKSI (3-DOTS) */}
                        <td className="px-5 py-3.5 text-right">
                          <div className={`relative inline-block transition-opacity duration-150 ${
                            openUserDropdownId === user.id 
                              ? 'opacity-100 pointer-events-auto' 
                              : 'opacity-0 pointer-events-none group-hover/user:opacity-100 group-hover/user:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
                          }`}>
                            <button 
                              onClick={(e) => toggleUserDropdownMenu(e, user.id)}
                              className={`p-2 rounded-full transition-colors cursor-pointer ${
                                openUserDropdownId === user.id 
                                  ? 'bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-100' 
                                  : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                              }`}
                              data-tooltip="Opsi Pengguna"
                              data-tooltip-pos="left"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* HIGH-PERFORMANCE PAGINATION CONTROLS */}
            <TablePagination
              currentPage={userPage}
              totalPages={totalUserPages}
              totalItems={filteredUsers.length}
              itemsPerPage={userPerPage}
              onPageChange={setUserPage}
              onItemsPerPageChange={(val) => {
                setUserPerPage(val);
                setUserPage(1);
              }}
              itemName="pengguna"
            />
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="bg-white dark:bg-zinc-900 border border-dashed border-slate-300 dark:border-zinc-700 rounded-3xl p-8 sm:p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-[#fcf7f3] dark:bg-zinc-800 text-[#c28e62] flex items-center justify-center mb-4">
              <Users size={32} />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-200 mb-1">
              {(userSearch || userFilterRole !== 'all' || userSortBy !== 'newest') ? 'Tidak Ada Pengguna yang Cocok' : 'Belum Ada Pengguna'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 dark:text-zinc-500 max-w-sm mb-5">
              {(userSearch || userFilterRole !== 'all' || userSortBy !== 'newest')
                ? 'Tidak ditemukan akun dengan filter atau kata kunci saat ini. Coba ubah kata kunci atau reset filter.'
                : 'Mulai dengan menambahkan akun pengguna pertama untuk mengelola brand dan sistem.'}
            </p>
            {(userSearch || userFilterRole !== 'all' || userSortBy !== 'newest') ? (
              <button
                type="button"
                onClick={() => { setUserSearch(''); setUserFilterRole('all'); setUserSortBy('newest'); setUserPage(1); }}
                className="mt-1 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#c28e62] hover:underline text-xs font-semibold cursor-pointer"
              >
                Reset Filter
              </button>
            ) : (
              <button
                onClick={handleOpenCreateUser}
                className="w-full sm:w-auto bg-[#c28e62] hover:bg-[#b37f54] text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
              >
                <span>Daftarkan Akun Pengguna Sekarang</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

  // ==========================================
  // RENDER HALAMAN SKU PRODUK (KATALOG MASTER)
  // ==========================================
  const renderSkuContent = () => {
    if (skuSubView === 'create' || skuSubView === 'edit') {
      return (
        <CreateSkuPage
          mode={skuSubView}
          initialData={skuSubView === 'edit' ? skuToEdit : null}
          brands={brands}
          categories={categories}
          existingProducts={products}
          onBack={() => {
            requestLeaveSkuPage(() => {
              setIsSkuFormDirty(false);
              setSkuSubView('list');
              setSkuToEdit(null);
            });
          }}
          onSave={skuSubView === 'edit' ? handleUpdateSkuFromPage : handleSaveNewSkuFromPage}
          onAlert={triggerAlert}
          onDirtyChange={setIsSkuFormDirty}
        />
      );
    }

    const isFilterActive = skuSearch || skuFilterBrand !== 'all' || skuSortBy !== 'newest';

    const brandFilterOptions = [
      { value: 'all', label: 'Semua Brand' },
      ...brands.map(b => ({ value: b.id, label: b.name }))
    ];

    const sortOptions = [
      { value: 'newest', label: 'Terbaru' },
      { value: 'oldest', label: 'Terlama' },
      { value: 'name-asc', label: 'Nama SKU (A - Z)' },
      { value: 'name-desc', label: 'Nama SKU (Z - A)' },
      { value: 'brand-asc', label: 'Nama Brand (A - Z)' }
    ];

    const connectedBrandsCount = new Set(products.map(p => p.brandName)).size;
    const totalBatchesCount = batches.length;
    const totalPhysicalTagsCount = batches.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);

    return (
      <div 
        className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300"
        onScroll={() => { 
          if (openDropdownId) setOpenDropdownId(null); 
          if (openBrandDropdownId) setOpenBrandDropdownId(null);
          if (openUserDropdownId) setOpenUserDropdownId(null);
          if (openSkuDropdownId) setOpenSkuDropdownId(null);
        }}
      >
        <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
          {/* TOP STATUS BAR / HEADER SKU */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                <Box size={16} />
              </div>
              <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
                Master Katalog SKU Produk
              </span>
            </div>

            <button
              type="button"
              onClick={handleOpenCreateSku}
              className="w-full sm:w-auto bg-[#c28e62] hover:bg-[#b07d53] text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
            >
              Tambah SKU Produk
            </button>
          </div>

          {/* SEARCH & FILTER CONTROLS (CLEAN & MINIMAL) */}
          <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                <input
                  type="text"
                  placeholder="Cari SKU, brand, kategori, atau deskripsi..."
                  value={skuSearch}
                  onChange={(e) => {
                    setSkuSearch(e.target.value);
                    setSkuPage(1);
                  }}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#cd9a6f]"
                />
                {skuSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setSkuSearch('');
                      setSkuPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Controls Pengurutan & Filter Brand */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Filter Brand */}
                <div className="w-full sm:w-auto min-w-[140px] sm:min-w-[160px]">
                  <CustomSelect
                    value={skuFilterBrand}
                    onChange={(val) => {
                      setSkuFilterBrand(val);
                      setSkuPage(1);
                    }}
                    placeholder="Semua Brand"
                    searchable={false}
                    buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={brandFilterOptions}
                  />
                </div>

                {/* Urutkan SKU */}
                <div className="w-full sm:w-auto min-w-[140px] sm:min-w-[160px]">
                  <CustomSelect
                    value={skuSortBy}
                    onChange={(val) => {
                      setSkuSortBy(val);
                      setSkuPage(1);
                    }}
                    placeholder="Urutkan SKU"
                    searchable={false}
                    buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={sortOptions}
                  />
                </div>
              </div>
            </div>

            {/* Reset Filter Button */}
            {isFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setSkuSearch('');
                  setSkuFilterBrand('all');
                  setSkuSortBy('newest');
                  setSkuPage(1);
                }}
                className="text-xs text-[#c28e62] hover:underline font-semibold self-center sm:self-auto cursor-pointer"
              >
                Reset Filter
              </button>
            )}
          </div>

          {/* SKU TABLE DISPLAY (RINGKAS, DATA PENTING DI DEPAN, CLEAN) */}
          {currentProducts.length > 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs sm:text-sm min-w-[760px]">
                  <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] select-none">
                    <tr>
                      <th className="px-5 py-3.5 whitespace-nowrap">SKU &amp; Nama Produk</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">Brand / Merk</th>
                      <th className="px-5 py-3.5 min-w-[220px] max-w-[340px]">Kategori</th>
                      <th className="px-5 py-3.5 whitespace-nowrap">Batch &amp; Tag Fisik</th>
                      <th className="px-4 py-3.5 text-right whitespace-nowrap">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                    {currentProducts.map((prod) => {
                      const linkedBatches = getSkuBatches(prod.sku, prod.brandName);
                      const totalTags = linkedBatches.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);

                      return (
                        <tr 
                          key={prod.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/40 transition-colors group/sku"
                        >
                          {/* KOLOM 1: SKU & NAMA PRODUK (KLIK AREA NAMA PRODUK UNTUK DETAIL SKU) */}
                          <td className="px-5 py-3.5">
                            <div 
                              onClick={() => handleOpenDetailSku(prod)}
                              className="min-w-0 inline-block cursor-pointer group/sku-name text-left"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm group-hover/sku-name:text-[#c28e62] group-hover/sku-name:underline underline-offset-2 transition-colors">
                                  {prod.sku}
                                </span>
                                {isRecentlyCreated(prod.createdAt, prod.id, 5) && (
                                  <NewBadge date={prod.createdAt} id={prod.id} />
                                )}
                              </div>
                              <div className="text-[11px] sm:text-xs font-mono font-medium text-slate-500 dark:text-zinc-400 mt-0.5 tracking-tight group-hover/sku-name:text-slate-700 dark:group-hover/sku-name:text-zinc-300">
                                {prod.skuCode || `SKU-${prod.id.toUpperCase()}`}
                              </div>
                            </div>
                          </td>

                          {/* KOLOM 2: BRAND / MERK (MODEL BADGE SEPERTI DI TABEL PENGGUNA) */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                              <span>{prod.brandName}</span>
                            </span>
                          </td>

                          {/* KOLOM 3: KATEGORI (MENGAKOMODASI TEKS PANJANG & HIRARKI 3 LAYER) */}
                          <td className="px-5 py-3.5 min-w-[220px] max-w-[340px]">
                            {(() => {
                              const rawCat = prod.category || 'Umum';
                              const hierarchy = resolveCategoryHierarchy(rawCat, categories);

                              if (hierarchy && hierarchy.length >= 2) {
                                const topLevels = hierarchy.slice(0, hierarchy.length - 1);
                                const leafLevel = hierarchy[hierarchy.length - 1];

                                return (
                                  <div className="flex flex-col gap-0.5 whitespace-normal break-words">
                                    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-400 dark:text-zinc-500 font-medium flex-wrap leading-tight">
                                      {topLevels.map((lvl, idx) => (
                                        <React.Fragment key={idx}>
                                          {idx > 0 && <ChevronRight size={10} className="shrink-0 text-slate-300 dark:text-zinc-600" />}
                                          <span>{lvl}</span>
                                        </React.Fragment>
                                      ))}
                                    </div>
                                    <span className="font-semibold text-slate-800 dark:text-zinc-200 text-xs sm:text-sm leading-snug">
                                      {leafLevel}
                                    </span>
                                  </div>
                                );
                              }

                              return (
                                <span className="text-slate-700 dark:text-zinc-300 text-xs sm:text-sm font-medium whitespace-normal break-words leading-snug block">
                                  {rawCat}
                                </span>
                              );
                            })()}
                          </td>

                          {/* KOLOM 4: BATCH DAN TAG (1 KOLOM 2 BARIS DENGAN ICON QRCODE SEPERTI DI MENU TAG) */}
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
                                <QrCode size={15} />
                              </div>
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm">
                                  {linkedBatches.length} <span className="font-normal text-slate-500 dark:text-zinc-400 text-xs">Batch</span>
                                </span>
                                <span className="text-slate-500 dark:text-zinc-400 font-mono text-[11px] sm:text-xs mt-0.5">
                                  {totalTags.toLocaleString('id-ID')} <span className="font-sans">Tag Fisik</span>
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* KOLOM 5: AKSI */}
                          <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <div className={`relative inline-block transition-opacity duration-150 ${
                              openSkuDropdownId === prod.id 
                                ? 'opacity-100 pointer-events-auto' 
                                : 'opacity-0 pointer-events-none group-hover/sku:opacity-100 group-hover/sku:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'
                            }`}>
                              <button 
                                type="button"
                                onClick={(e) => toggleSkuDropdownMenu(e, prod.id)}
                                className={`p-1.5 rounded-full transition-colors relative z-20 cursor-pointer ${
                                  openSkuDropdownId === prod.id 
                                    ? 'bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-100' 
                                    : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                                }`}
                              >
                                <MoreVertical size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION CONTROLS */}
              <TablePagination
                currentPage={skuPage}
                totalPages={totalSkuPages}
                totalItems={filteredProducts.length}
                itemsPerPage={skuPerPage}
                onPageChange={setSkuPage}
                onItemsPerPageChange={(items) => {
                  setSkuPerPage(items);
                  setSkuPage(1);
                }}
                itemName="SKU Produk"
              />
            </div>
          ) : (
            <div className="p-8 sm:p-12 rounded-3xl border border-dashed border-slate-300 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/40 flex flex-col items-center justify-center text-center max-w-xl mx-auto my-8">
              <div className="w-16 h-16 mx-auto bg-slate-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-[#c28e62] border border-slate-200 dark:border-zinc-700">
                <Box size={28} />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100 mb-2">
                {isFilterActive ? 'Tidak Ada SKU yang Sesuai' : 'Belum Ada SKU Terdaftar'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-md mb-4">
                {isFilterActive
                  ? 'Tidak ditemukan SKU produk dengan kriteria pencarian atau filter saat ini. Coba ubah kata kunci atau klik tombol reset filter di bawah.'
                  : 'Mulai dengan mendaftarkan kode SKU produk pertama ke katalog master sistem untuk memulai registrasi batch dan pembuatan tag fisik.'}
              </p>
              {isFilterActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setSkuSearch('');
                    setSkuFilterBrand('all');
                    setSkuSortBy('newest');
                    setSkuPage(1);
                  }}
                  className="px-5 py-2 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#c28e62] hover:underline text-xs font-semibold cursor-pointer"
                >
                  Reset Filter
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOpenCreateSku}
                  className="px-5 py-2.5 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
                >
                  Daftarkan SKU Produk Sekarang
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const availableCount = tagsAvailableCount || (activeBatch?.availableCount ?? currentTags.filter((t: any) => t.status === 'Tersedia').length);
  const usedCount = tagsUsedCount || (activeBatch?.usedCount ?? currentTags.filter((t: any) => t.status === 'Telah Digunakan').length);

  return (
    <div className="flex h-screen bg-[#f8fafc] dark:bg-black font-sans text-slate-800 dark:text-zinc-200 antialiased overflow-hidden">
      <CustomTooltipProvider />
      
      {/* DESKTOP / TABLET SIDEBAR */}
      <aside className={`bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-700 hidden md:flex flex-col flex-shrink-0 z-30 transition-all duration-300 relative ${isSidebarMinimized ? 'w-[76px] lg:w-[80px]' : 'w-[230px] lg:w-[250px] xl:w-[260px]'}`}>
        {renderSidebarContent(false)}
      </aside>

      {/* MOBILE DRAWER SIDEBAR */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="relative bg-white dark:bg-zinc-900 w-72 h-full flex flex-col z-10 animate-in slide-in-from-left duration-300 border-r border-slate-200 dark:border-zinc-800">
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute right-4 top-5 text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
            >
              <X size={20} />
            </button>
            {renderSidebarContent(true)}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* TOP HEADER */}
        <header className="h-16 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-700 flex items-center justify-between px-3.5 sm:px-6 lg:px-8 flex-shrink-0 z-10 gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden text-slate-600 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 p-1.5 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <Menu size={22} />
            </button>

            {/* Laptop & Desktop Sidebar Toggle */}
            <button 
              onClick={() => setIsSidebarMinimized(prev => !prev)}
              className="hidden md:flex text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 p-1.5 -ml-1 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              data-tooltip={isSidebarMinimized ? "Perluas Sidebar" : "Persempit Sidebar"}
              data-tooltip-pos="bottom"
            >
              <Menu size={19} />
            </button>

            <h1 className="text-sm sm:text-lg font-bold text-slate-800 dark:text-zinc-100 truncate">{activeDetails.title}</h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* FITUR NOTIFIKASI (DI SEBELAH TOGGLE TEMA) */}
            <div className="relative">
              <button 
                ref={notifButtonRef}
                onClick={toggleNotificationPanel}
                className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full border transition-all duration-300 flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-400/30 ${
                  isNotifOpen
                    ? 'border-slate-400 dark:border-zinc-500 bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100'
                    : 'border-slate-200/90 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700/60 hover:text-slate-900 dark:hover:text-zinc-100'
                }`}
                data-tooltip="Notifikasi"
                data-tooltip-pos="bottom"
                aria-label="Buka notifikasi sistem"
              >
                <Bell size={18} className="text-slate-700 dark:text-zinc-200" />
                {unreadNotifCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[19px] h-[19px] px-1 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center border-2 border-white dark:border-zinc-900 animate-in zoom-in-75 duration-200">
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>
            </div>

            {/* TOGGLE TEMA SIANG & MALAM */}
            <button 
              onClick={(e) => toggleTheme(e)}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-slate-200/90 dark:border-zinc-700 bg-slate-50/80 dark:bg-zinc-800/80 hover:bg-slate-100 dark:hover:bg-zinc-700/60 flex items-center justify-center overflow-hidden transition-all duration-500 focus:outline-none focus:ring-2 focus:ring-[#cd9a6f]/30 cursor-pointer"
              data-tooltip={isDarkMode ? "Mode Terang" : "Mode Gelap"}
              data-tooltip-pos="bottom"
              aria-label="Toggle tema siang dan malam"
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                {/* Ikon Matahari (Siang) */}
                <div 
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${
                    isDarkMode 
                      ? 'rotate-90 scale-0 opacity-0 text-amber-400' 
                      : 'rotate-0 scale-100 opacity-100 text-amber-500-[0_0_6px_rgba(245,158,11,0.35)]'
                  }`}
                >
                  <Sun size={19} className="stroke-[2.2]" />
                </div>

                {/* Ikon Bulan (Malam) */}
                <div 
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${
                    isDarkMode 
                      ? 'rotate-0 scale-100 opacity-100 text-indigo-300-[0_0_8px_rgba(165,180,252,0.4)]' 
                      : '-rotate-90 scale-0 opacity-0 text-slate-400'
                  }`}
                >
                  <Moon size={18} className="stroke-[2.2]" />
                </div>
              </div>
            </button>
          </div>
        </header>

        {/* SCROLLABLE CONTENT */}
        {activeMenu === 'tag-qr' ? (
          <div 
            className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300"
            onScroll={() => { if(openDropdownId) setOpenDropdownId(null) }}
          >
            <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
            
            {/* TOP STATUS BAR / HEADER TAG / QRCODE */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                  <QrCode size={16} />
                </div>
                <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
                  Penerbitan Batch Tag & Serial QR
                </span>
              </div>

              <button
                type="button"
                onClick={() => setIsCreateBatchModalOpen(true)}
                className="w-full sm:w-auto bg-[#c28e62] hover:bg-[#b07d53] text-white px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
              >
                <span>Generate Batch Baru</span>
              </button>
            </div>

            {/* SEARCH & SORT BY CONTROLS */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                {/* Search Input */}
                <div className="relative flex-1 max-w-md">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Cari Batch ID, SKU produk, brand, atau proyek..."
                    value={batchSearch}
                    onChange={(e) => {
                      setBatchSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-xs sm:text-sm text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                  />
                  {batchSearch && (
                    <button
                      onClick={() => {
                        setBatchSearch('');
                        setCurrentPage(1);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Sort By & Filter Status Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Dropdown Sort By (Tanpa Pencarian) */}
                  <div className="w-full sm:w-auto min-w-[170px] sm:min-w-[195px]">
                    <CustomSelect
                      value={batchSortBy}
                      onChange={(val) => {
                        setBatchSortBy(val);
                        setCurrentPage(1);
                      }}
                      placeholder="Urutkan Batch"
                      searchable={false}
                      buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] dark:hover:border-[#cd9a6f] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                      options={[
                        { value: 'newest', label: 'Terbaru (Tanggal Dibuat)' },
                        { value: 'oldest', label: 'Terlama (Tanggal Dibuat)' },
                        { value: 'batchId-asc', label: 'Batch ID (A - Z)' },
                        { value: 'batchId-desc', label: 'Batch ID (Z - A)' },
                        { value: 'sku-asc', label: 'Produk SKU (A - Z)' },
                        { value: 'sku-desc', label: 'Produk SKU (Z - A)' },
                        { value: 'brand-asc', label: 'Brand / Merk (A - Z)' },
                        { value: 'qty-desc', label: 'Jumlah Tag (Terbanyak)' },
                        { value: 'qty-asc', label: 'Jumlah Tag (Tersedikit)' }
                      ]}
                    />
                  </div>

                  {/* Dropdown Filter Status (Tanpa Pencarian) */}
                  <div className="w-full sm:w-auto min-w-[130px] sm:min-w-[150px]">
                    <CustomSelect
                      value={batchFilterStatus}
                      onChange={(val) => {
                        setBatchFilterStatus(val);
                        setCurrentPage(1);
                      }}
                      placeholder="Semua Status"
                      searchable={false}
                      buttonClassName="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] dark:hover:border-[#c28e62] rounded-full px-3.5 py-2 text-xs text-slate-700 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                      options={[
                        { value: 'all', label: `Semua Status (${batches.length})` },
                        { value: 'Aktif', label: `Aktif (${batches.filter(b => b.status === 'Aktif').length})` },
                        { value: 'Disuspend', label: `Disuspend (${batches.filter(b => b.status === 'Disuspend').length})` }
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* Reset filter button if active */}
              {(batchSearch || batchFilterStatus !== 'all' || batchSortBy !== 'newest') && (
                <button
                  type="button"
                  onClick={() => {
                    setBatchSearch('');
                    setBatchFilterStatus('all');
                    setBatchSortBy('newest');
                    setCurrentPage(1);
                  }}
                  className="text-xs text-[#c28e62] hover:underline font-semibold self-center sm:self-auto cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {/* TABEL RIWAYAT BATCH */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 overflow-hidden">
              {batchSearch && (
                <div className="px-4 sm:px-6 py-2.5 border-b border-slate-100 dark:border-zinc-700 text-xs text-[#c28e62] font-medium bg-slate-50/60 dark:bg-zinc-800/40">
                  Hasil pencarian untuk "{batchSearch}"
                </div>
              )}
              
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-left text-xs sm:text-sm whitespace-nowrap min-w-[760px]">
                  <thead className="bg-slate-50 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700 font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[11px] select-none">
                    <tr>
                      <th className="px-5 py-3.5">Batch ID &amp; Info</th>
                      <th className="px-5 py-3.5">Produk SKU</th>
                      <th className="px-5 py-3.5">Jumlah Tag</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="px-5 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 text-slate-700 dark:text-zinc-300">
                    {currentBatches.map((batch) => (
                      <tr 
                        key={batch.id} 
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 56px' }}
                        className="group/row hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-zinc-100">{batch.batchId}</span>
                            <NewBadge date={batch.createdAt || batch.date} id={batch.id} />
                          </div>
                          <div className="text-[11px] sm:text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{batch.date}</div>
                          <div className="mt-1.5 flex items-center">
                            {batch.qrType === 'static' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                QR Statis
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-800/60 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-500"></span>
                                QR Dinamis
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-semibold">{batch.sku}</div>
                          <div className="text-xs text-[#c28e62] font-medium mt-0.5">{batch.brand}</div>
                          {(() => {
                            const distinctProjects = batch.tags 
                              ? Array.from(new Set(batch.tags.filter((t: any) => t.project).map((t: any) => t.project)))
                              : (batch.project ? batch.project.split(',').map((p: string) => p.trim()) : []);
                            
                            if (distinctProjects.length === 0) return null;
                            return (
                              <div className="flex items-center gap-1 mt-1 flex-wrap max-w-xs">
                                {distinctProjects.slice(0, 2).map((proj: any, pIdx: number) => (
                                  <span key={pIdx} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700">
                                    {proj}
                                  </span>
                                ))}
                                {distinctProjects.length > 2 && (
                                  <span className="text-[10px] text-slate-400">+{distinctProjects.length - 2} lagi</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-3.5">
                          {(() => {
                            const used = typeof batch.usedCount === 'number' 
                              ? batch.usedCount 
                              : (batch.tags ? batch.tags.filter((t: any) => t.status === 'Telah Digunakan').length : 0);
                            const qtyNum = Number(batch.qty) || 0;
                            const remaining = typeof batch.availableCount === 'number'
                              ? batch.availableCount
                              : Math.max(0, qtyNum - used);
                            return (
                              <div
                                onClick={() => openDetailModal(batch, 'tags')}
                                className="group/tag inline-block text-left cursor-pointer select-none"
                              >
                                <div className="inline-flex items-baseline gap-1">
                                  <span className="font-semibold text-slate-800 dark:text-zinc-100 group-hover/tag:text-[#c28e62] group-hover/tag:underline underline-offset-2 transition-colors">
                                    {qtyNum.toLocaleString('id-ID')}
                                  </span>
                                  <span className="font-normal text-slate-400 dark:text-zinc-500 group-hover/tag:text-[#c28e62] transition-colors">
                                    Tag
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                  <span className="px-2 py-0.5 rounded-full bg-zinc-50 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 text-[10px] font-medium">
                                    PIN: {batch.pinLength} Digit
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                      used === 0 
                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
                                        : remaining > 0
                                          ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
                                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
                                    }`}>
                                      {used === 0 ? `${qtyNum} Siap Pakai` : `${used} Terpakai • ${remaining} Sisa`}
                                    </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        {/* KOLOM 4: STATUS BATCH (MODAL ALASAN: AKTIF / DISUSPEND) */}
                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              if (batch.status === 'Disuspend') {
                                openUnsuspendModal(batch);
                              } else {
                                openSuspendModal(batch);
                              }
                            }}
                            data-tooltip={batch.status === 'Disuspend' ? 'Klik untuk Pulihkan / Aktifkan Batch' : 'Klik untuk Suspend Batch'}
                            data-tooltip-pos="top"
                            className="relative inline-flex items-center cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
                          >
                            {batch.status === 'Disuspend' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                                <Ban size={13} className="text-amber-600 dark:text-amber-400" />
                                <span>Disuspend</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                                <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                                <span>Aktif</span>
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className={`relative inline-block transition-opacity duration-150 ${openDropdownId === batch.id ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto'}`}>
                            <button 
                              onClick={(e) => toggleDropdownMenu(e, batch.id)}
                              className={`p-2 rounded-full transition-colors relative z-20 cursor-pointer ${openDropdownId === batch.id ? 'bg-slate-200 dark:bg-zinc-700 text-slate-800 dark:text-zinc-100' : 'text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'}`}
                              data-tooltip="Opsi Batch"
                              data-tooltip-pos="left"
                            >
                              <MoreVertical size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {currentBatches.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 dark:text-zinc-500 text-xs sm:text-sm">
                          {batchSearch || batchFilterStatus !== 'all' ? (
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Search size={24} className="text-slate-300 dark:text-zinc-600" />
                              <p className="font-semibold text-slate-700 dark:text-zinc-300">
                                Tidak ada batch yang cocok dengan filter
                              </p>
                              <p className="text-xs text-slate-400">
                                Coba gunakan kata kunci lain atau reset filter pencarian.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setBatchSearch('');
                                  setBatchFilterStatus('all');
                                  setBatchSortBy('newest');
                                  setCurrentPage(1);
                                }}
                                className="mt-1 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#c28e62] hover:underline text-xs font-semibold cursor-pointer"
                              >
                                Reset Filter
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Layers size={24} className="text-slate-300 dark:text-zinc-600" />
                              <p className="font-semibold text-slate-700 dark:text-zinc-300">Belum ada data batch yang digenerate</p>
                              <button
                                type="button"
                                onClick={() => setIsCreateBatchModalOpen(true)}
                                className="mt-1 px-4 py-2 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-full text-xs font-semibold cursor-pointer"
                              >
                                + Generate Batch Pertama
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* HIGH-PERFORMANCE PAGINATION CONTROLS */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredAndSortedBatches.length}
                itemsPerPage={batchPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(val) => {
                  setBatchPerPage(val);
                  setCurrentPage(1);
                }}
                itemName="batch"
              />
            </div>
          </div>
        </div>
      ) : activeMenu === 'dashboard' ? (
          renderDashboardContent()
        ) : activeMenu === 'brand' ? (
          renderBrandContent()
        ) : activeMenu === 'category' ? (
          <CategoryManager currentRole={currentRole} onAlert={triggerAlert} onCategoriesUpdated={(updatedCats) => setCategories(updatedCats)} />
        ) : activeMenu === 'sku' ? (
          renderSkuContent()
        ) : activeMenu === 'users' ? (
          renderUsersContent()
        ) : (
          /* KONTEN KOSONG (PLACEHOLDER) UNTUK MENU LAIN */
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 md:p-6 lg:p-7 xl:p-8 pb-16 sm:pb-24 animate-in fade-in duration-300">
            <div className="w-full max-w-[1720px] mx-auto space-y-5 sm:space-y-6 pb-8 sm:pb-12">
              {/* TOP STATUS BAR DI BAWAH HEADER */}
              <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-2xl px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                    <ActiveIcon size={16} />
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-zinc-200">
                    {activeDetails.pageTitle}
                  </span>
                </div>
              </div>

              <div className="p-8 sm:p-12 rounded-3xl border border-dashed border-slate-300 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/40 flex flex-col items-center justify-center text-center max-w-xl mx-auto my-8">
                <div className="w-16 h-16 mx-auto bg-slate-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-[#c28e62] border border-slate-200 dark:border-zinc-700">
                  <ActiveIcon size={28} />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100 mb-2">
                  {activeDetails.pageTitle}
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 max-w-md">
                  {activeDetails.subtitle}. Modul ini terhubung secara terpusat dengan sistem manajemen tag fisik & otentikasi Sumas.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ============================================================== */}
      {/* SELURUH MODAL & DROPDOWN PORTAL DIKEMBALIKAN UTUH DI SINI */}
      {/* ============================================================== */}

      {/* PANEL NOTIFIKASI & AKTIVITAS SISTEM (SCAN, PENGEDITAN, RESET PASSWORD) */}
      {isNotifOpen && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[99998]" 
            onClick={() => setIsNotifOpen(false)}
          />
          <div 
            className="fixed z-[99999] w-[350px] min-[440px]:w-[420px] sm:w-[460px] max-w-[calc(100vw-20px)] bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/90 dark:border-zinc-700 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
            style={{
              top: Math.min(notifPos.top, window.innerHeight - 400),
              right: Math.max(8, notifPos.right),
              maxHeight: 'min(580px, calc(100vh - 84px))'
            }}
          >
            {/* PANEL HEADER */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200/80 dark:border-zinc-700 flex items-center justify-center font-bold">
                  <Bell size={15} />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm">
                    Notifikasi & Aktivitas
                  </h3>
                  {unreadNotifCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200/80 dark:border-blue-900/40">
                      {unreadNotifCount} Belum Dibaca
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500">
                      Semua Terbaca
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {unreadNotifCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllNotificationsRead}
                    className="p-1.5 rounded-full text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    data-tooltip="Tandai semua dibaca"
                    data-tooltip-pos="bottom"
                  >
                    <CheckCheck size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsNotifOpen(false)}
                  className="p-1.5 rounded-full text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* TOAST FEEDBACK IF PRESENT */}
            {notifToast && (
              <div className="mx-3 mt-2 px-3 py-2 rounded-xl bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs flex items-center gap-2 animate-in fade-in duration-200 flex-shrink-0">
                <CheckCircle2 size={14} className="flex-shrink-0 text-emerald-400 dark:text-emerald-600" />
                <span className="truncate">{notifToast}</span>
              </div>
            )}

            {/* NOTIFICATION LIST ITEMS */}
            <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-zinc-800/70 p-2 space-y-1.5">
              {notifications.length === 0 ? (
                <div className="py-12 px-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 flex items-center justify-center mx-auto mb-3">
                    <Bell size={22} />
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-zinc-300">
                    Tidak ada notifikasi
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                    Belum ada aktivitas yang tercatat.
                  </p>
                </div>
              ) : (
                notifications.map((item) => {
                  const isReset = item.category === 'password_reset';
                  const isScan = item.category === 'scan';
                  const isEdit = item.category === 'edit';
                  const isSuspicious = isScan && item.status === 'suspicious';
                  const isPendingReset = isReset && item.status === 'Menunggu';

                  return (
                    <div
                      key={item.id}
                      onClick={() => !isReset && handleNotificationClick(item)}
                      className={`p-3 rounded-2xl transition-all relative ${
                        !item.isRead
                          ? 'bg-slate-50 dark:bg-zinc-800/90 border border-slate-200 dark:border-zinc-700'
                          : 'bg-transparent hover:bg-slate-50/60 dark:hover:bg-zinc-800/40 border border-transparent hover:border-slate-100 dark:hover:border-zinc-800 opacity-60 hover:opacity-90'
                      } ${!isReset ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* CATEGORY ICON - HANYA WARNA PADA YANG PENTING */}
                        <div className={`flex-shrink-0 mt-0.5 transition-opacity ${!item.isRead ? 'opacity-100' : 'opacity-70'}`}>
                          {isSuspicious ? (
                            /* Peringatan Anomali / Suspicious: WARNA PENTING (ROSE/RED) */
                            <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center">
                              <AlertTriangle size={15} />
                            </div>
                          ) : isPendingReset ? (
                            /* Permintaan Reset Menunggu Tindakan: WARNA PENTING (AMBER) */
                            <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50 flex items-center justify-center">
                              <KeyRound size={15} />
                            </div>
                          ) : isScan ? (
                            /* Scan Rutin Normal: NETRAL */
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-center">
                              <Scan size={15} />
                            </div>
                          ) : isEdit ? (
                            /* Audit Log Pengeditan: NETRAL */
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-center">
                              <FileEdit size={15} />
                            </div>
                          ) : (
                            /* Reset Sandi Selesai: NETRAL */
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60 flex items-center justify-center">
                              <KeyRound size={15} />
                            </div>
                          )}
                        </div>

                        {/* CONTENT BODY */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {/* TITIK INDIKATOR BELUM DIBACA */}
                              {!item.isRead && (
                                <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 flex-shrink-0 animate-pulse" />
                              )}
                              <span className={`text-xs truncate ${
                                !item.isRead
                                  ? 'font-bold text-slate-900 dark:text-zinc-50'
                                  : 'font-normal text-slate-500 dark:text-zinc-400'
                              }`}>
                                {item.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <span className="text-[10px] text-slate-400 dark:text-zinc-500 whitespace-nowrap">
                                {item.timeAgo}
                              </span>
                              {!item.isRead && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkNotificationRead(item.id);
                                  }}
                                  className="text-[10px] font-medium text-slate-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-200/60 dark:hover:bg-zinc-700 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                >
                                  Tandai baca
                                </button>
                              )}
                            </div>
                          </div>

                          <p className={`text-[11px] mb-1 leading-relaxed ${
                            !item.isRead
                              ? 'text-slate-600 dark:text-zinc-300 font-medium'
                              : 'text-slate-400 dark:text-zinc-500'
                          }`}>
                            {item.subtitle}
                          </p>

                          {item.description && (
                            <p className={`text-[11px] mb-1.5 leading-snug line-clamp-2 ${
                              !item.isRead
                                ? 'text-slate-700 dark:text-zinc-200 font-medium'
                                : 'text-slate-400 dark:text-zinc-500'
                            }`}>
                              {item.description}
                            </p>
                          )}

                          {/* KHUSUS PERMINTAAN RESET PASSWORD */}
                          {isReset && (
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  item.status === 'Menunggu'
                                    ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-700/60'
                                }`}>
                                  {item.status === 'Menunggu' ? 'Menunggu Tindakan' : item.status === 'Disetujui' ? 'Tautan Terkirim' : 'Ditolak'}
                                </span>
                              </div>

                              {item.status === 'Menunggu' ? (
                                currentRole === 'Administrator' ? (
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRespondPasswordReset(item.sourceId, 'reject');
                                      }}
                                      className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                                    >
                                      Tolak
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRespondPasswordReset(item.sourceId, 'approve');
                                      }}
                                      className="px-3 py-1 text-[11px] font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white rounded-full transition-all cursor-pointer flex items-center gap-1"
                                    >
                                      <Send size={11} />
                                      <span>Setujui & Kirim Link</span>
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-slate-400 italic">
                                    Otorisasi Administrator diperlukan
                                  </span>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleNotificationClick(item);
                                  }}
                                  className="text-[11px] font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:underline cursor-pointer"
                                >
                                  Buka Akun Pengguna →
                                </button>
                              )}
                            </div>
                          )}

                          {/* KHUSUS AKTIVITAS SCAN */}
                          {isScan && (
                            <div className="mt-1 flex items-center justify-between text-[11px]">
                              <span className="text-slate-400 dark:text-zinc-500 font-mono text-[10px]">
                                {item.deviceInfo || 'Mobile Scanner'}
                              </span>
                              <span className="font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:underline flex items-center gap-0.5">
                                Lihat di Peta →
                              </span>
                            </div>
                          )}

                          {/* KHUSUS PENGEDITAN DATA */}
                          {isEdit && (
                            <div className="mt-1 flex items-center justify-between text-[11px]">
                              <span className="text-slate-400 dark:text-zinc-500 text-[10px]">
                                Batch: <span className="font-mono font-medium">{item.batchId}</span>
                              </span>
                              <span className="font-medium text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 hover:underline flex items-center gap-0.5">
                                Lihat Riwayat Batch →
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* PANEL FOOTER NAVIGATION (NEUTRAL) */}
            <div className="p-3 bg-slate-50 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen(false);
                  setActiveMenu('scan');
                }}
                className="text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 font-medium transition-colors cursor-pointer"
              >
                Aktivitas Scan Lengkap →
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsNotifOpen(false);
                  setActiveMenu('users');
                }}
                className="text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 font-medium transition-colors cursor-pointer"
              >
                Kelola Akun Pengguna →
              </button>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* MODAL GENERATE BATCH BARU (CLEAN, KONSISTEN DENGAN MODAL LAINNYA) */}
      {isCreateBatchModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsCreateBatchModalOpen(false); }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <QrCode size={19} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                    Generate Batch Baru
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setIsCreateBatchModalOpen(false)} 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                title="Tutup (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs sm:text-sm">
              {/* BARIS 1: PILIH PRODUK (SKU) - 1 KOLOM UTUH */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Pilih Produk (SKU)
                </label>
                <CustomSelect 
                  value={selectedSku}
                  onChange={setSelectedSku}
                  placeholder="-- Pilih Produk --"
                  options={products.map(p => ({
                    value: p.id,
                    label: `${p.sku} (${p.brandName})`
                  }))}
                />
              </div>

              {/* BARIS 2: DIBUAT DUA KOLOM - JUMLAH TAG (KIRI) & PANJANG PIN ACAK (KANAN) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Jumlah Tag (Quantity)
                  </label>
                  <input 
                    type="number" 
                    placeholder="Contoh: 100" 
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Panjang PIN Acak</span>
                    <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-medium">
                      Default: 8 Digit
                    </span>
                  </label>
                  <CustomSelect
                    value={selectedPinLength}
                    onChange={setSelectedPinLength}
                    placeholder="Pilih Panjang PIN"
                    searchable={false}
                    buttonClassName="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] rounded-full px-4 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 cursor-pointer flex justify-between items-center gap-2 transition-colors select-none"
                    options={[
                      { value: '8', label: '8 Digit (Default)' },
                      { value: '7', label: '7 Digit' },
                      { value: '6', label: '6 Digit' },
                      { value: '5', label: '5 Digit' },
                      { value: '4', label: '4 Digit' },
                    ]}
                  />
                </div>
              </div>

              {/* BARIS 3: TIPE QR CODE - 1 KOLOM UTUH */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Tipe QR Code
                </label>
                <div className="grid grid-cols-2 gap-2 h-[42px] p-1 bg-slate-100 dark:bg-zinc-800 rounded-full">
                  <button
                    type="button"
                    onClick={() => setFormQrType('dynamic')}
                    className={`text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                      formQrType === 'dynamic'
                        ? 'bg-white dark:bg-zinc-900 text-[#c28e62] '
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    Dinamis
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormQrType('static')}
                    className={`text-xs font-semibold rounded-full transition-colors cursor-pointer ${
                      formQrType === 'static'
                        ? 'bg-white dark:bg-zinc-900 text-[#c28e62] '
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
                    }`}
                  >
                    Statis
                  </button>
                </div>
              </div>

              {/* BARIS 4: URL PENGALIHAN - 1 KOLOM UTUH */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  URL Pengalihan (Target Redirect URL)
                </label>
                <input 
                  type="url"
                  placeholder="https://cek.sumas.id/"
                  value={formRedirectUrl}
                  onChange={(e) => setFormRedirectUrl(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-100 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] transition-colors font-mono"
                />
              </div>

              {/* INFO FORMAT ID TAG & PIN OTOMATIS */}
              <div className="px-5 py-2.5 bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/80 dark:border-zinc-700/70 rounded-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Format ID & PIN:</span>
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-zinc-200 bg-white dark:bg-zinc-900 px-3 py-1 rounded-full border border-slate-200 dark:border-zinc-700">
                  ID: 8 Karakter Alfanumerik • PIN: {selectedPinLength} Digit Angka
                </span>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2.5 flex-shrink-0">
              <button 
                type="button"
                onClick={() => setIsCreateBatchModalOpen(false)} 
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleGenerateBatch}
                disabled={!selectedSku || !formQty} 
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                Generate Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT URL PENGALIHAN QR CODE DINAMIS */}
      {isEditUrlModalOpen && batchToEditUrl && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsEditUrlModalOpen(false); }}
          className="fixed inset-0 bg-black/65 z-[10006] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Globe size={19} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                    Edit URL QR Dinamis
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setIsEditUrlModalOpen(false)} 
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Perubahan URL pengalihan akan langsung berlaku saat QR Code fisik batch ini dipindai oleh publik, tanpa perlu mencetak ulang stiker tag QR.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 uppercase tracking-wider mb-1.5">
                  URL Pengalihan Tujuan (Redirect URL)
                </label>
                <div className="relative">
                  <Globe size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={editRedirectUrlInput}
                    onChange={(e) => setEditRedirectUrlInput(e.target.value)}
                    placeholder="https://cek.sumas.id/"
                    className="w-full pl-10 pr-5 py-2.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 text-xs sm:text-sm focus:outline-none focus:border-[#c28e62]"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Masukkan URL landing page verifikasi resmi atau URL kustom bebas.
                </p>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5 bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsEditUrlModalOpen(false)}
                className="px-5 py-2.5 rounded-full border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveRedirectUrl}
                disabled={isUpdatingUrl || !editRedirectUrlInput.trim()}
                className="px-5 py-2.5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center"
              >
                {isUpdatingUrl ? (
                  <span>Menyimpan...</span>
                ) : (
                  <span>Simpan Perubahan</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDIT DATA PROYEK (DI AKSES DARI HALAMAN/TAB ALOKASI PROYEK) */}
      {isEditProjectModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsEditProjectModalOpen(false); }}
          className="fixed inset-0 bg-black/65 z-[10006] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl max-h-[92vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Edit3 size={19} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  Edit Data Proyek
                </h3>
              </div>
              <button 
                onClick={() => setIsEditProjectModalOpen(false)} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL FORM BODY */}
            <div className="p-5 sm:p-6 space-y-3.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-700 flex-1">
              {/* SUMMARY INFO CARD */}
              <div className="bg-slate-50 dark:bg-zinc-800/70 p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 dark:border-zinc-700 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center flex-shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="min-w-0">
                    <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Proyek yang Diedit</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm truncate block">{projectToEdit?.name || '-'}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Alokasi</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] border border-[#c28e62]/30 inline-block">
                    {projectToEdit?.count || 0} Tag
                  </span>
                </div>
              </div>
              
              {/* ROW 1: NAMA PROYEK */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Nama Proyek <span className="text-red-500">*</span>
                </label>
                <input 
                  type="text" 
                  value={editProjectForm.name} 
                  onChange={(e) => setEditProjectForm({ ...editProjectForm, name: e.target.value })}
                  placeholder="Contoh: RSUD Kediri / RS Islam Surabaya"
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                />
              </div>

              {/* ROW 2: SPESIFIKASI MATERIAL & KODE + TYPE */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Spesifikasi Material
                  </label>
                  <input 
                    type="text" 
                    value={editProjectForm.specs} 
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, specs: e.target.value })}
                    placeholder="Contoh: Phenolic Board 12mm Standard"
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Kode + Type
                  </label>
                  <input 
                    type="text" 
                    value={editProjectForm.codeType} 
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, codeType: e.target.value })}
                    placeholder="Contoh: SUMAS-CUB-2026"
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
              </div>

              {/* ROW 3: GARANSI PEMASANGAN & KODE PRODUKSI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Garansi Pemasangan
                  </label>
                  <input 
                    type="text" 
                    value={editProjectForm.warranty} 
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, warranty: e.target.value })}
                    placeholder="Contoh: 5 Tahun / 10 Tahun"
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Kode Produksi
                  </label>
                  <input 
                    type="text" 
                    value={editProjectForm.prodCode} 
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, prodCode: e.target.value })}
                    placeholder="Contoh: PRD-SBY-002"
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
              </div>

              {/* ROW 4: CATATAN TAMBAHAN & ALASAN PERUBAHAN (SIDE-BY-SIDE RAPI) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Catatan Tambahan Proyek
                  </label>
                  <textarea 
                    rows={2}
                    value={editProjectForm.note} 
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, note: e.target.value })}
                    placeholder="Contoh: Gedung Rawat Inap Baru Lt 4, PIC Pak Rahmat..."
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all resize-none" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1">
                    <AlertCircle size={13} className="text-amber-500" />
                    <span>Alasan Perubahan <span className="text-red-500">*</span></span>
                  </label>
                  <textarea 
                    rows={2}
                    placeholder="Jelaskan alasan perubahan untuk audit log..."
                    value={editProjectForm.reason}
                    onChange={(e) => setEditProjectForm({ ...editProjectForm, reason: e.target.value })}
                    className="w-full bg-amber-50/20 dark:bg-amber-950/20 border border-amber-300/80 dark:border-amber-900/50 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none resize-none font-medium placeholder:font-normal transition-all"
                  />
                </div>
              </div>

              {editProjectError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{editProjectError}</span>
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-zinc-800/90 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-2.5 flex-shrink-0">
              <div className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1.5 self-start sm:self-auto">
                {!editProjectForm.reason.trim() ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    <AlertCircle size={12} />
                    <span>Mohon isi Alasan Perubahan</span>
                  </span>
                ) : (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    <span>Data lengkap & siap disimpan</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button 
                  type="button"
                  onClick={() => setIsEditProjectModalOpen(false)} 
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="button"
                  onClick={handleSaveEditProject}
                  disabled={!editProjectForm.name.trim() || !editProjectForm.reason.trim()}
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL KONFIRMASI LEPAS ALOKASI PROYEK */}
      {deallocatingProject && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setDeallocatingProject(null); }}
          className="fixed inset-0 bg-black/65 z-[10010] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-md overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200 p-5 sm:p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 mx-auto flex items-center justify-center mb-4">
              <RotateCcw size={22} />
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-zinc-100 mb-2">
              Lepas Alokasi Proyek?
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mb-6 leading-relaxed">
              Anda akan melepas alokasi <span className="font-bold text-slate-800 dark:text-zinc-200">{deallocatingProject.count} tag</span> dari proyek <span className="font-bold text-[#c28e62]">"{deallocatingProject.name}"</span> dan mengembalikan status seluruh tag tersebut menjadi <span className="font-bold text-emerald-600">Tersedia</span>.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeallocatingProject(null)}
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const projName = deallocatingProject.name;
                  setDeallocatingProject(null);
                  await handleDeallocateProject(projName);
                }}
                className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-full transition-colors cursor-pointer"
              >
                Ya, Lepas Alokasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ALOKASI PROYEK (MUNCUL DI ATAS MODAL DETAIL) */}
      {isAllocateModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsAllocateModalOpen(false); }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden mx-4 border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Building2 size={19} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  Alokasikan Tag ke Proyek
                </h3>
              </div>
              <button 
                onClick={() => setIsAllocateModalOpen(false)} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* MODAL FORM BODY */}
            <div className="p-5 sm:p-6 space-y-4 sm:space-y-4.5 overflow-y-auto flex-1">
              <div className="p-3.5 sm:p-4 rounded-2xl bg-[#fcf7f3] dark:bg-[#c28e62]/10 border border-[#c28e62]/30 flex items-center justify-between gap-3 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-600 dark:text-zinc-400 text-xs">Total Tag Terpilih:</span>
                  <div className="font-bold text-[#c28e62] text-base sm:text-lg">
                    {selectedTagsToAllocate.length} Tag Fisik
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 dark:text-zinc-500 text-[11px] block">Batch ID Sumber:</span>
                  <span className="font-mono font-bold text-slate-700 dark:text-zinc-200 text-xs">
                    {activeBatch?.batchId}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Nama Proyek <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="Contoh: RSUD Kediri, Hotel Aston" 
                    value={allocationForm.project}
                    onChange={(e) => setAllocationForm({...allocationForm, project: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Spesifikasi Material <span className="text-red-500">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="Contoh: Phenolic Board 12mm" 
                    value={allocationForm.specs}
                    onChange={(e) => setAllocationForm({...allocationForm, specs: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Kode + Type
                  </label>
                  <input 
                    type="text" 
                    placeholder="Contoh: PVC-12mm-T2" 
                    value={allocationForm.codeType}
                    onChange={(e) => setAllocationForm({...allocationForm, codeType: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Masa Garansi
                  </label>
                  <input 
                    type="text" 
                    placeholder="Contoh: 1 Tahun Pemasangan" 
                    value={allocationForm.warranty}
                    onChange={(e) => setAllocationForm({...allocationForm, warranty: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    No. Kode Produksi
                  </label>
                  <input 
                    type="text" 
                    placeholder="Contoh: PRD-2026-10-A" 
                    value={allocationForm.prodCode}
                    onChange={(e) => setAllocationForm({...allocationForm, prodCode: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Catatan / Note Khusus
                  </label>
                  <input 
                    type="text" 
                    placeholder="Catatan pengerjaan lapangan..." 
                    value={allocationForm.note}
                    onChange={(e) => setAllocationForm({...allocationForm, note: e.target.value})}
                    className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                  />
                </div>
              </div>
            </div>
            
            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <button 
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)} 
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="button"
                  onClick={handleSaveAllocation}
                  disabled={!allocationForm.project || !allocationForm.specs}
                  className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-[#c28e62] to-[#b37f54] hover:opacity-95 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed-[#c28e62]/20 cursor-pointer"
                >
                  <span>Simpan & Alokasikan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DETAIL TAG & RIWAYAT */}
      {isDetailModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) { closeDetailModal(); } }}
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-4xl lg:max-w-5xl overflow-hidden flex flex-col max-h-[90vh] mx-1 sm:mx-4 border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            
            <div className="pt-3.5 sm:pt-4 px-4 sm:px-6 border-b border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 flex-shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <Layers size={18} className="text-[#c28e62]" />
                  <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">Detail Batch ID</h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeBatch) return;
                      if (activeBatch.status === 'Disuspend') {
                        openUnsuspendModal(activeBatch);
                      } else {
                        openSuspendModal(activeBatch);
                      }
                    }}
                    data-tooltip={activeBatch?.status === 'Disuspend' ? 'Klik untuk Pulihkan / Aktifkan Batch' : 'Klik untuk Suspend Batch'}
                    data-tooltip-pos="top"
                    className="relative inline-flex items-center cursor-pointer select-none transition-transform hover:scale-105 active:scale-95"
                  >
                    {activeBatch?.status === 'Disuspend' ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                        <Ban size={13} className="text-amber-600 dark:text-amber-400" />
                        <span>Disuspend</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-colors">
                        <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                        <span>Aktif</span>
                      </span>
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={closeDetailModal} 
                    data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                    className="text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 bg-white dark:bg-zinc-900 rounded-full p-1.5 border border-slate-200 dark:border-zinc-600 cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="flex gap-4 sm:gap-6 text-xs sm:text-sm font-medium -mb-[1px] overflow-x-auto">
                <button 
                  onClick={() => { setActiveTab('tags'); setHoveredTagInfo(null); }}
                  className={`pb-3 px-1 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'tags' ? 'border-[#c28e62] text-[#c28e62] font-bold' : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'}`}
                >
                  <QrCode size={15} />
                  <span>Daftar Tag ({(tagsTotalCount || activeBatch?.actualTagCount || activeBatch?.qty || currentTags.length).toLocaleString('id-ID')})</span>
                </button>
                <button 
                    onClick={() => { setActiveTab('projects'); setHoveredTagInfo(null); }}
                    className={`pb-3 px-1 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'projects' ? 'border-[#c28e62] text-[#c28e62] font-bold' : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'}`}
                  >
                    <Building2 size={15} />
                    <span>Alokasi Proyek ({activeBatchProjects.length})</span>
                  </button>
                <button 
                  onClick={() => { setActiveTab('history'); setHoveredTagInfo(null); }}
                  className={`pb-3 px-1 border-b-2 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${activeTab === 'history' ? 'border-[#c28e62] text-[#c28e62] font-bold' : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200'}`}
                >
                  <Clock size={15} />
                  <span>Riwayat Perubahan</span>
                </button>
              </div>
            </div>
            
            <div className="p-4 sm:p-5 pb-6 sm:pb-8 flex-1 flex flex-col min-h-0 bg-white dark:bg-zinc-900 overflow-y-auto">
              {/* STATS BREADCRUMB / SUMMARY */}
              {(() => {
                if (true) {
                  return (
                    <div className="bg-slate-50 dark:bg-zinc-800 p-3 sm:p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-700 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 flex-shrink-0 text-xs sm:text-sm">
                      <div>
                        <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Batch ID</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-100 truncate block">{activeBatch?.batchId}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Total Tag</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-100">{activeBatch?.qty} Tag</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Tersedia (Sisa)</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{availableCount} Tag</span>
                      </div>
                      <div>
                        <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Telah Teralokasi</span>
                        <span className="font-bold text-[#c28e62]">{usedCount} Tag ({activeBatchProjects.length} Proyek)</span>
                      </div>
                    </div>
                  );
                }

                // NON-SUMAS (ASSC / BLIMEY!)
                return (
                  <div className="bg-slate-50 dark:bg-zinc-800 p-3 sm:p-3.5 rounded-2xl border border-slate-100 dark:border-zinc-700 mb-3 grid grid-cols-2 sm:grid-cols-3 gap-3 flex-shrink-0 text-xs sm:text-sm">
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Batch ID</span>
                      <span className="font-bold text-slate-800 dark:text-zinc-100 truncate block">{activeBatch?.batchId}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Brand / SKU</span>
                      <span className="font-bold text-slate-800 dark:text-zinc-100 truncate block">{activeBatch?.brand} - {activeBatch?.sku}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-zinc-500 block text-[10px] uppercase font-semibold">Total Tag</span>
                      <span className="font-bold text-slate-800 dark:text-zinc-100">{activeBatch?.qty} Tag</span>
                    </div>
                  </div>
                );
              })()}

              {/* QR CONFIGURATION & MODE BANNER (CLEAN & MINIMALIS) */}
              <div className="bg-slate-50 dark:bg-zinc-800/70 p-3 sm:p-3.5 rounded-2xl border border-slate-200/80 dark:border-zinc-700/80 mb-3 flex items-center justify-between gap-3 text-xs flex-shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                    activeBatch?.qrType === 'static'
                      ? 'bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                      : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800/60'
                  }`}>
                    {activeBatch?.qrType === 'static' ? 'QR Statis' : 'QR Dinamis'}
                  </span>
                  <span className="font-mono text-xs text-slate-600 dark:text-zinc-300 truncate">
                    {activeBatch?.redirectUrl || 'https://cek.sumas.id/'}
                  </span>
                </div>

                {activeBatch?.qrType !== 'static' && (
                  <button
                    type="button"
                    onClick={() => openEditUrlModal(activeBatch)}
                    className="px-4 py-1.5 rounded-full bg-white dark:bg-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-600 border border-slate-200 dark:border-zinc-600 text-[#c28e62] dark:text-[#cd9a6f] font-semibold text-xs transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Globe size={13} />
                    <span>Edit URL</span>
                  </button>
                )}
              </div>

              {/* TAB 1: DAFTAR TAG & PIN */}
              {activeTab === 'tags' && (
                <div className="flex flex-col min-h-0 relative space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 flex-shrink-0">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
                      <input 
                        type="text" 
                        placeholder="Cari Digit PIN, No. Tag, atau Nama Proyek..." 
                        value={tagSearch}
                        onChange={(e) => handleTagSearchChange(e.target.value)}
                        className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-zinc-800 border border-slate-300 dark:border-zinc-600 rounded-full text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-[#cd9a6f]/20 focus:border-[#cd9a6f] dark:focus:border-[#cd9a6f] transition-all"
                      />
                      {tagSearch && (
                        <button
                          type="button"
                          onClick={() => handleTagSearchChange('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {(tagSearch || tagProjectFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setTagSearch('');
                          setTagProjectFilter('all');
                          if (activeBatch) loadBatchDetailData(activeBatch.id, 1, '', 'all');
                        }}
                        className="text-xs text-[#c28e62] hover:underline font-semibold cursor-pointer whitespace-nowrap self-center"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>

                  {/* FILTER PILLS STATUS TAG */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-2.5 mb-2 flex-shrink-0">
                      <span className="text-xs text-slate-400 font-medium whitespace-nowrap mr-1">Filter:</span>
                      <button
                        onClick={() => handleTagFilterChange('all')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          tagProjectFilter === 'all'
                            ? 'bg-[#c28e62] text-white'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                        }`}
                      >
                        Semua ({tagsTotalCount})
                      </button>
                      <button
                        onClick={() => handleTagFilterChange('available')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          tagProjectFilter === 'available'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100'
                        }`}
                      >
                        Tersedia ({tagsAvailableCount})
                      </button>
                      <button
                        onClick={() => handleTagFilterChange('used')}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          tagProjectFilter === 'used'
                            ? 'bg-zinc-700 text-white'
                            : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200'
                        }`}
                      >
                        Terpakai ({tagsUsedCount})
                      </button>
                      {activeBatchProjects.map((p: any) => (
                        <button
                          key={p.name}
                          onClick={() => handleTagFilterChange(p.name)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                            tagProjectFilter === p.name
                              ? 'bg-[#c28e62] text-white'
                              : 'bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 border border-slate-200 dark:border-zinc-700 hover:bg-slate-200'
                          }`}
                        >
                          {p.name} ({p.count})
                        </button>
                      ))}
                    </div>


                  {/* ACTIVE PROJECT FILTER INFO BANNER */}
                  {tagProjectFilter !== 'all' && tagProjectFilter !== 'available' && (
                    <div className="bg-slate-100 dark:bg-zinc-800/80 border border-slate-200 dark:border-zinc-700 rounded-xl px-3.5 py-2 mb-3 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 size={15} className="text-[#c28e62]" />
                        <span className="text-slate-600 dark:text-zinc-400">
                          Memfilter proyek: <strong className="text-slate-800 dark:text-zinc-200">{tagProjectFilter}</strong> (Menampilkan PIN yang sudah dialokasikan ke proyek ini).
                        </span>
                      </div>
                      <button 
                        onClick={() => setTagProjectFilter('available')} 
                        className="text-xs text-[#c28e62] font-semibold hover:underline whitespace-nowrap cursor-pointer"
                      >
                        Beralih ke PIN Tersedia →
                      </button>
                    </div>
                  )}

                  {/* SUSPENDED STATUS ALERT BANNER */}
                  {activeBatch?.status === 'Disuspend' && (
                    <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3.5 sm:p-4 mb-3 text-xs text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Ban size={17} />
                        </div>
                        <div className="leading-relaxed">
                          <strong className="font-bold text-amber-800 dark:text-amber-300 block text-xs sm:text-sm">
                            Batch Sedang Disuspend (Tag Dibekukan Sementara)
                          </strong>
                          <p className="text-amber-700 dark:text-amber-400 mt-0.5 text-[11px] sm:text-xs">
                            Seluruh tag fisik di dalam batch ini sedang ditangguhkan sementara demi kendali mutu. Tag tidak dapat dialokasikan ke proyek baru.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => openUnsuspendModal(activeBatch)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-bold text-xs transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer flex items-center gap-1.5 shrink-0"
                      >
                        <RotateCcw size={13} />
                        <span>Pulihkan Batch</span>
                      </button>
                    </div>
                  )}

                  {/* QUICK SELECTION BAR / ALLOCATED STATUS */}
                  {activeBatch?.status !== 'Disuspend' && (
                    availableCount > 0 ? (
                      <div className="bg-[#fcf7f3] dark:bg-zinc-800/60 border border-[#cd9a6f]/30 rounded-xl px-3 py-2 mb-3 flex flex-wrap items-center justify-between gap-2 flex-shrink-0 text-xs">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-600 dark:text-zinc-400 font-semibold">Pilih Cepat Tag Tersedia:</span>
                          {[5, 10, 20].filter(qty => qty <= availableCount).map(qty => (
                            <button
                              key={qty}
                              onClick={() => handleQuickSelectAvailable(qty)}
                              className="px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-[#c28e62] hover:text-white text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-full font-medium transition-colors cursor-pointer"
                            >
                              +{qty} Tag
                            </button>
                          ))}
                          <button
                            onClick={() => handleQuickSelectAvailable(-1)}
                            className="px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-[#c28e62] hover:text-white text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 rounded-full font-medium transition-colors cursor-pointer"
                          >
                            Pilih Semua Sisa ({availableCount})
                          </button>
                        </div>

                        {selectedTagsToAllocate.length > 0 && (
                          <button
                            onClick={() => setSelectedTagsToAllocate([])}
                            className="text-red-600 dark:text-red-400 hover:underline font-medium cursor-pointer"
                          >
                            Batal Pilih ({selectedTagsToAllocate.length})
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl px-3.5 py-2.5 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300">
                          <CheckCircle2 size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                          <span><strong>Semua Tag Telah Teralokasi:</strong> Seluruh {currentTags.length} PIN pada batch ini sudah dialokasikan ke proyek. PIN abu-abu tidak dapat dipilih ulang agar tidak terjadi duplikasi tag fisik di lapangan.</span>
                        </div>
                        <button 
                          onClick={() => setActiveTab('projects')} 
                          className="text-xs font-semibold text-[#c28e62] hover:underline whitespace-nowrap self-start sm:self-auto cursor-pointer"
                        >
                          Kelola di Tab Proyek →
                        </button>
                      </div>
                    )
                  )}
                  
                  {/* LEGENDA STATUS TAG */}
                  <div className="flex items-center gap-4 text-xs font-semibold mb-2.5 px-1 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 dark:border-emerald-400"></div>
                        <span className="text-emerald-700 dark:text-emerald-300 font-bold">Tersedia (Siap Alokasi)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded border border-[#8a5b35] dark:border-amber-400 bg-[#c28e62]"></div>
                        <span className="text-[#c28e62] dark:text-amber-300 font-bold">Terpilih (Diproses)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded border border-slate-300 dark:border-zinc-800 bg-slate-200/90 dark:bg-zinc-950/90"></div>
                        <span className="text-slate-400 dark:text-zinc-500 font-medium">Terpakai (Teralokasi)</span>
                      </div>
                    </div>

                  {/* GRID PIN TAG PAS 8 KOLOM (SIMETRIS & IMBANG KIRI-KANAN) */}
                  <div 
                    className="border border-slate-200 dark:border-zinc-700/80 rounded-2xl bg-slate-50/60 dark:bg-zinc-900/60 p-3 sm:p-4 relative transition-all flex-shrink-0 w-full overflow-x-hidden"
                    style={{
                      maxHeight: filteredTags.length <= 16 ? 'none' : '480px',
                      overflowY: filteredTags.length <= 16 ? 'hidden' : 'auto',
                      overflowX: 'hidden'
                    }}
                    onScroll={() => setHoveredTagInfo(null)}
                  >
                    {isTagsLoading ? (
                      <div className="py-10 px-8 flex flex-col items-center justify-center text-slate-400 dark:text-zinc-500 text-xs sm:text-sm">
                        <div className="w-7 h-7 border-2 border-[#c28e62] border-t-transparent rounded-full animate-spin mb-2"></div>
                        <span>Memuat data tag dari database...</span>
                      </div>
                    ) : filteredTags.length > 0 ? (
                      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 sm:gap-2.5 w-full">
                        {filteredTags.map((tag) => {
                          const isAvailable = tag.status === 'Tersedia';
                          const isSelected = selectedTagsToAllocate.includes(tag.id);
                          const isInteractive = activeBatch?.status !== 'Disuspend' && isAvailable;

                          return (
                            <div 
                              key={tag.id}
                              onClick={() => {
                                setHoveredTagInfo(null);
                                if (isInteractive) toggleTagSelection(tag.id);
                              }}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setHoveredTagInfo({ tag, rect });
                              }}
                              onMouseLeave={() => setHoveredTagInfo(null)}
                              className={`
                                relative flex flex-col items-center justify-center py-2 px-1 rounded-xl border text-center font-mono select-none transition-all w-full
                                ${isInteractive ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'}
                                ${
                                  !isAvailable 
                                    ? 'bg-slate-200/90 dark:bg-zinc-950/90 border-slate-300/80 dark:border-zinc-800 text-slate-400 dark:text-zinc-600 opacity-70 cursor-not-allowed' 
                                    : isSelected
                                      ? 'bg-[#c28e62] dark:bg-[#c28e62] border-[#8a5b35] dark:border-amber-400 text-white scale-[1.02] z-10 ' 
                                      : 'bg-emerald-50/70 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-500/60 text-emerald-800 dark:text-emerald-300 hover:border-emerald-500 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/60'
                                }
                              `}
                            >
                              <span className="font-kode-mono font-bold text-xs sm:text-[13px] tracking-normal truncate w-full">{tag.pin}</span>
                              <span className={`text-[10px] font-mono font-medium truncate w-full mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-400 dark:text-zinc-500'}`}>{tag.tagNumber}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-8 px-6 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-zinc-500 text-xs sm:text-sm">
                        <span>Tidak ada PIN yang cocok dengan filter atau pencarian "{tagSearch}".</span>
                        <button
                          type="button"
                          onClick={() => {
                            setTagSearch('');
                            setTagProjectFilter('all');
                            if (activeBatch) loadBatchDetailData(activeBatch.id, 1, '', 'all');
                          }}
                          className="mt-1 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-[#c28e62] hover:underline text-xs font-semibold cursor-pointer"
                        >
                          Reset Filter
                        </button>
                      </div>
                    )}
                  </div>

                  {/* PAGINASI SERVER-SIDE: RINGAN UNTUK RIBUAN DATA */}
                  {tagsTotalPages > 1 && (
                    <div className="pt-4 pb-4 sm:pb-5 mt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 dark:border-zinc-800 flex-shrink-0 text-xs">
                      <div className="text-slate-500 dark:text-zinc-400 text-[11px]">
                        Halaman <strong className="text-slate-800 dark:text-zinc-200">{tagsPage}</strong> dari <strong className="text-slate-800 dark:text-zinc-200">{tagsTotalPages}</strong> ({tagsTotalCount} Total Tag)
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTagPageChange(tagsPage - 1)}
                          disabled={tagsPage === 1 || isTagsLoading}
                          className="px-3 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Sebelumnya
                        </button>
                        
                        <div className="flex items-center gap-1 px-1">
                          {Array.from({ length: Math.min(5, tagsTotalPages) }, (_, i) => {
                            let p = i + 1;
                            if (tagsTotalPages > 5) {
                              if (tagsPage > 3) {
                                p = Math.min(tagsPage - 2 + i, tagsTotalPages - (4 - i));
                              }
                            }
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => handleTagPageChange(p)}
                                className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
                                  tagsPage === p
                                    ? 'bg-[#c28e62] text-white'
                                    : 'bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300'
                                }`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>

                        <button
                          type="button"
                          onClick={() => handleTagPageChange(tagsPage + 1)}
                          disabled={tagsPage === tagsTotalPages || isTagsLoading}
                          className="px-3 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-full font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: RINGKASAN PROYEK */}
              {activeTab === 'projects' && (
                <div className="flex-1 overflow-y-auto space-y-4">
                  {activeBatchProjects.length > 0 ? (
                    activeBatchProjects.map((proj: any, idx: number) => (
                      <div key={idx} className="group/proj bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62]/40 rounded-2xl p-4 sm:p-5 transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-zinc-700">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#fcf7f3] dark:bg-zinc-700 flex items-center justify-center text-[#c28e62]">
                              <Building2 size={16} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">{proj.name}</h4>
                                <NewBadge date={proj.date} />
                              </div>
                              <p className="text-[11px] text-slate-400 dark:text-zinc-500">Dialokasikan pada: {proj.date}</p>
                            </div>
                          </div>
                          <span className="px-3 py-1 bg-[#c28e62]/10 text-[#c28e62] font-bold rounded-full text-xs self-start sm:self-auto border border-[#c28e62]/30">
                            {proj.count} Tag Dialokasikan
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 my-3 text-xs">
                          <div className="bg-slate-50 dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700/50">
                            <span className="text-slate-400 block text-[10px]">Spesifikasi Material:</span>
                            <span className="font-semibold text-slate-700 dark:text-zinc-200">{proj.specs}</span>
                          </div>
                          <div className="bg-slate-50 dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700/50">
                            <span className="text-slate-400 block text-[10px]">Kode + Type:</span>
                            <span className="font-semibold text-slate-700 dark:text-zinc-200">{proj.codeType}</span>
                          </div>
                          <div className="bg-slate-50 dark:bg-zinc-900 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700/50">
                            <span className="text-slate-400 block text-[10px]">Garansi Pemasangan:</span>
                            <span className="font-semibold text-slate-700 dark:text-zinc-200">{proj.warranty}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-zinc-700/60 mt-2 flex-wrap transition-opacity duration-150 opacity-90 group-hover/proj:opacity-100">
                          <button
                            type="button"
                            onClick={() => openEditProjectModal(proj)}
                            className="text-xs font-semibold text-slate-700 dark:text-zinc-200 hover:text-[#c28e62] dark:hover:text-[#c28e62] flex items-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Edit3 size={13} className="text-[#c28e62]" />
                            <span>Edit Data Proyek</span>
                          </button>
                          <span className="text-slate-300 dark:text-zinc-600">|</span>
                          <button
                            onClick={() => {
                              setTagProjectFilter(proj.name);
                              setActiveTab('tags');
                            }}
                            className="text-xs font-semibold text-[#c28e62] hover:underline cursor-pointer"
                          >
                            Lihat di Grid PIN →
                          </button>
                          <span className="text-slate-300 dark:text-zinc-600">|</span>
                          <button
                            type="button"
                            onClick={() => setDeallocatingProject(proj)}
                            className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <Trash2 size={13} className="text-red-500" />
                            <span>Lepas Alokasi (Kembalikan ke Stok)</span>
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-400 dark:text-zinc-500 text-sm flex flex-col items-center">
                      <Building2 size={36} className="mb-2 text-slate-300 dark:text-zinc-700" />
                      <p className="font-semibold text-slate-700 dark:text-zinc-300">Belum Ada Proyek Teralokasi</p>
                      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1 max-w-sm">
                        Seluruh PIN pada batch ini masih tersedia sebagai stok. Buka tab "Daftar Tag", pilih beberapa PIN yang ingin dipakai, lalu klik "Alokasikan ke Proyek".
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: RIWAYAT PERUBAHAN */}
              {activeTab === 'history' && (
                <div className="flex-1 overflow-y-auto pr-2">
                  {auditLogs.filter(log => log.batchId === activeBatch?.batchId).length > 0 ? (
                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-slate-200 dark:before:bg-zinc-700">
                      {auditLogs.filter(log => log.batchId === activeBatch?.batchId).map(log => (
                        <div key={log.id} className="relative flex items-start gap-4">
                          <div className="absolute left-0 w-10 h-10 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-slate-500 dark:text-zinc-400 z-10">
                              <Edit3 size={14} />
                            </div>
                          </div>
                          <div className="ml-12 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-700 rounded-xl p-3 sm:p-4 flex-1 text-xs sm:text-sm">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-slate-700 dark:text-zinc-200">{log.user}</span>
                              <span className="text-[10px] sm:text-xs text-slate-400 dark:text-zinc-500">{log.timestamp}</span>
                            </div>
                            <div className="mb-3">
                              <span className="text-[10px] sm:text-xs font-semibold text-slate-500 dark:text-zinc-400 block mb-1">Alasan Perubahan:</span>
                              <p className="text-slate-700 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-800 p-2.5 rounded-xl border border-transparent dark:border-zinc-700">{log.reason}</p>
                            </div>
                            <div className="space-y-2">
                              {log.changes.map((change: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 bg-slate-50/50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-700 text-xs">
                                  <span className="font-semibold text-slate-600 dark:text-zinc-400 min-w-[70px]">{change.field}:</span>
                                  <span className="text-red-500 dark:text-red-400 line-through text-[11px]">{change.old}</span>
                                  <span className="text-slate-400 dark:text-zinc-500">→</span>
                                  <span className="text-green-600 dark:text-green-400 font-medium text-[11px]">{change.new}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 dark:text-zinc-500 text-sm flex flex-col items-center">
                      <Clock size={32} className="mb-2 text-slate-300 dark:text-zinc-700" />
                      Belum ada riwayat perubahan untuk batch ini.
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="px-4 sm:px-6 py-3 bg-slate-50/90 dark:bg-zinc-800/90 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
              <div className="text-xs sm:text-sm font-medium text-slate-500 dark:text-zinc-400 self-start sm:self-center">
                {activeTab === 'tags' && selectedTagsToAllocate.length > 0 ? (
                  <span><span className="font-bold text-[#c28e62]">{selectedTagsToAllocate.length}</span> Tag Terpilih</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2.5 sm:gap-3 w-full sm:w-auto justify-end">
                <button 
                  onClick={() => { setIsDetailModalOpen(false); setSelectedTagsToAllocate([]); }} 
                  className="px-5 py-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                >
                  Tutup
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    if (activeBatch) {
                      openDownloadModal(activeBatch);
                    }
                  }}
                  className="px-4 sm:px-5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] dark:bg-[#c28e62] dark:hover:bg-[#b07d53] rounded-full transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  data-tooltip="Unduh Lembar Cetak PDF A3+ / File CSV"
                  data-tooltip-pos="top"
                >
                  <Download size={15} />
                  <span>Unduh</span>
                </button>
                {activeTab === 'tags' && selectedTagsToAllocate.length > 0 && (
                  <button 
                    onClick={() => setIsAllocateModalOpen(true)}
                    className="bg-slate-800 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-900 dark:hover:bg-white px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-colors flex items-center cursor-pointer"
                  >
                    Alokasikan ke Proyek
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DROPDOWN PORTAL KEMBALI DI SINI (UNBLOCKED SCROLLING & NATIVE BEHAVIOR) */}
      {openDropdownId && activeDropdownBatch && createPortal(
        <>
          <div className="fixed inset-0 z-[999990]" onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }} />
          <div 
            data-dropdown-menu="true"
            className={`fixed z-[999991] w-48 bg-white dark:bg-zinc-800 rounded-2xl border border-[#cd9a6f]/30 dark:border-zinc-600 p-1.5 animate-in fade-in zoom-in-95 duration-200  ${
              dropdownDirection === 'up' ? '-translate-y-full origin-bottom-right' : 'origin-top-right'
            }`}
            style={{ 
              top: dropdownPos.top, 
              left: Math.max(12, Math.min(dropdownPos.left - 192, window.innerWidth - 204)), 
            }}
          >
            <button 
              onClick={() => { setOpenDropdownId(null); openDetailModal(activeDropdownBatch, 'tags'); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <List size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Detail Batch ID
            </button>
            
            <button 
              onClick={() => openDownloadModal(activeDropdownBatch)}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Download size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Unduh
            </button>

            <button 
              onClick={() => {
                const b = activeDropdownBatch;
                setOpenDropdownId(null);
                openEditUrlModal(b);
              }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Globe size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Edit URL Dinamis
            </button>
            {activeDropdownBatch.status !== 'Disuspend' ? (
              <button 
                onClick={() => openSuspendModal(activeDropdownBatch)}
                className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
              >
                <Ban size={16} className="text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors" /> Suspend Batch
              </button>
            ) : (
              <button 
                onClick={() => openUnsuspendModal(activeDropdownBatch)}
                className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
              >
                <RotateCcw size={16} className="text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors" /> Pulihkan Batch
              </button>
            )}

            <div className="h-px bg-slate-100 dark:bg-zinc-700 my-1.5 mx-2"></div>
            
            <button 
              onClick={() => confirmDelete(activeDropdownBatch.id)}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Trash2 size={16} className="text-red-400 dark:text-red-500 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" /> Hapus Batch
            </button>
          </div>
        </>,
        document.body
      )}

      {/* BRAND DROPDOWN MENU PORTAL (SAMA SEPERTI DI HALAMAN TAG/QRCODE) */}
      {openBrandDropdownId && activeDropdownBrand && createPortal(
        <>
          <div className="fixed inset-0 z-[999990]" onClick={(e) => { e.stopPropagation(); setOpenBrandDropdownId(null); }} />
          <div 
            data-dropdown-menu="true"
            className={`fixed z-[999991] w-48 bg-white dark:bg-zinc-800 rounded-2xl border border-[#cd9a6f]/30 dark:border-zinc-600 p-1.5 animate-in fade-in zoom-in-95 duration-200  ${
              brandDropdownDirection === 'up' ? '-translate-y-full origin-bottom-right' : 'origin-top-right'
            }`}
            style={{ 
              top: brandDropdownPos.top, 
              left: Math.max(12, Math.min(brandDropdownPos.left - 192, window.innerWidth - 204)), 
            }}
          >
            <button 
              onClick={() => { setOpenBrandDropdownId(null); handleOpenDetailBrand(activeDropdownBrand); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Eye size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Detail Brand
            </button>
            
            <button 
              onClick={() => { setOpenBrandDropdownId(null); handleOpenEditBrand(activeDropdownBrand); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Edit3 size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Edit Data Brand
            </button>

            <button 
              onClick={() => { setOpenBrandDropdownId(null); handleToggleBrandStatus(activeDropdownBrand); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700/60"
            >
              {(activeDropdownBrand.status || 'Aktif') === 'Aktif' ? (
                <>
                  <Ban size={16} className="text-rose-500 dark:text-rose-400 group-hover:text-rose-600 transition-colors" />
                  <span className="text-rose-600 dark:text-rose-400">Nonaktifkan Brand</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                  <span className="text-emerald-600 dark:text-emerald-400">Aktifkan Brand</span>
                </>
              )}
            </button>

            <div className="h-px bg-slate-100 dark:bg-zinc-700 my-1.5 mx-2"></div>
            
            <button 
              onClick={() => { setOpenBrandDropdownId(null); handleOpenDeleteBrand(activeDropdownBrand); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Trash2 size={16} className="text-red-400 dark:text-red-500 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" /> Hapus Brand
            </button>
          </div>
        </>,
        document.body
      )}

      {/* PORTAL DROPDOWN MENU AKSI USER */}
      {openUserDropdownId && activeDropdownUser && createPortal(
        <>
          <div className="fixed inset-0 z-[999990]" onClick={(e) => { e.stopPropagation(); setOpenUserDropdownId(null); }} />
          <div 
            data-dropdown-menu="true"
            className={`fixed z-[999991] w-48 bg-white dark:bg-zinc-800 rounded-2xl border border-[#cd9a6f]/30 dark:border-zinc-600 p-1.5 animate-in fade-in zoom-in-95 duration-200  ${
              userDropdownDirection === 'up' ? '-translate-y-full origin-bottom-right' : 'origin-top-right'
            }`}
            style={{ 
              top: userDropdownPos.top, 
              left: Math.max(12, Math.min(userDropdownPos.left - 192, window.innerWidth - 204)), 
            }}
          >
          {currentRole === 'Administrator' ? (
            <>
              <button 
                onClick={() => { setOpenUserDropdownId(null); handleOpenEditUser(activeDropdownUser); }}
                className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
              >
                <Edit3 size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Edit Pengguna
              </button>

              <button 
                onClick={() => { setOpenUserDropdownId(null); handleOpenEditUser(activeDropdownUser, true); }}
                className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
              >
                <KeyRound size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Reset Password
              </button>

              <button 
                onClick={() => { setOpenUserDropdownId(null); handleToggleUserStatus(activeDropdownUser); }}
                className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-700/60"
              >
                {(activeDropdownUser.status || 'Aktif') === 'Aktif' ? (
                  <>
                    <Ban size={16} className="text-rose-500 dark:text-rose-400 group-hover:text-rose-600 transition-colors" />
                    <span className="text-rose-600 dark:text-rose-400">Nonaktifkan Akun</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                    <span className="text-emerald-600 dark:text-emerald-400">Aktifkan Akun</span>
                  </>
                )}
              </button>

              <div className="h-px bg-slate-100 dark:bg-zinc-700 my-1.5 mx-2"></div>
              
              <button 
                onClick={() => { setOpenUserDropdownId(null); handleOpenDeleteUser(activeDropdownUser); }}
                className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
              >
                <Trash2 size={16} className="text-red-400 dark:text-red-500 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" /> Hapus Pengguna
              </button>
            </>
          ) : (
            <div className="px-4 py-2.5 text-xs text-slate-400 dark:text-zinc-500 italic text-center">
              Akses terbatas Administrator
            </div>
          )}
        </div>
      </>,
      document.body
    )}

      {/* MODAL KONFIRMASI HAPUS */}
      {isDeleteModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) { setIsDeleteModalOpen(false); setBatchToDelete(null); } }}
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 w-full max-w-sm overflow-hidden text-center p-6 mx-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
              <AlertCircle size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base sm:text-lg mb-2">Hapus Batch Ini?</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mb-6">
              Apakah Anda yakin ingin menghapus data batch ini? Seluruh data Tag, PIN, dan Riwayat Perubahan akan ikut terhapus secara permanen.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => { setIsDeleteModalOpen(false); setBatchToDelete(null); }} 
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                onClick={handleDeleteBatch} 
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-full transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SUSPEND / RECALL */}
      {isSuspendModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsSuspendModalOpen(false); }}
          className="fixed inset-0 bg-black/50 z-[10050] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/90 dark:border-zinc-700/80 w-full max-w-md max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden mx-4 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                  <Ban size={19} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  Suspend Batch
                </h3>
              </div>
              <button 
                onClick={() => setIsSuspendModalOpen(false)} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm border border-amber-200 dark:border-amber-800/60 leading-relaxed">
                Tindakan ini akan menangguhkan seluruh tag di dalam batch <strong>{activeBatch?.batchId}</strong>. Gunakan jika terdapat masalah kendali mutu, cacat produksi masal, atau anomali verifikasi.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  Alasan Suspend <span className="text-rose-500">*</span>
                </label>
                <textarea 
                  rows={4}
                  placeholder="Contoh: Penangguhan batch karena tidak lolos Quality Control (QC), cacat produksi masal, atau investigasi material..."
                  value={suspendForm.reason}
                  onChange={(e) => setSuspendForm({ reason: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none resize-none font-medium transition-all"
                ></textarea>
              </div>
            </div>
            
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2.5 flex-shrink-0">
              <button 
                onClick={() => setIsSuspendModalOpen(false)} 
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                onClick={handleSuspendBatch}
                disabled={!suspendForm.reason.trim()}
                className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center cursor-pointer"
              >
                Suspend Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PULIHKAN BATCH (UNSUSPEND) */}
      {isUnsuspendModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsUnsuspendModalOpen(false); }}
          className="fixed inset-0 bg-black/60 z-[10050] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/90 dark:border-zinc-700/80 w-full max-w-md max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden mx-4 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <RotateCcw size={19} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  Pulihkan Batch
                </h3>
              </div>
              <button 
                onClick={() => setIsUnsuspendModalOpen(false)} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm border border-emerald-200 dark:border-emerald-800/60 leading-relaxed">
                Tindakan ini akan mengaktifkan kembali seluruh tag di dalam batch <strong>{activeBatch?.batchId}</strong> ke status Aktif sehingga dapat dialokasikan dan diverifikasi normal.
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center gap-1">
                  Alasan Pemulihan <span className="text-rose-500">*</span>
                </label>
                <textarea 
                  rows={4}
                  placeholder="Contoh: Kesalahan klik saat melakukan suspend, atau batch telah diverifikasi ulang lolos kendali mutu dan aman digunakan..."
                  value={unsuspendForm.reason}
                  onChange={(e) => setUnsuspendForm({ reason: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none resize-none font-medium transition-all"
                ></textarea>
              </div>
            </div>
            
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-2.5 flex-shrink-0">
              <button 
                onClick={() => setIsUnsuspendModalOpen(false)} 
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                onClick={handleUnsuspendBatch}
                disabled={!unsuspendForm.reason.trim()}
                className="px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center cursor-pointer"
              >
                Pulihkan Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PILIHAN DOWNLOAD (SIMPEL & ELEGAN) */}
      {isDownloadModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsDownloadModalOpen(false); }}
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 w-full max-w-lg overflow-hidden mx-4">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#fcf7f3] dark:bg-zinc-800 flex items-center justify-center text-[#c28e62]">
                  <Download size={18} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">Unduh Data Batch</h3>
              </div>
              <button 
                onClick={() => setIsDownloadModalOpen(false)} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 sm:p-6">
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mb-4">
                Pilih format unduhan untuk batch <span className="font-bold text-slate-700 dark:text-zinc-200">{batchToDownload?.batchId}</span>:
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Opsi 1: PDF */}
                <button 
                  onClick={handleDownloadPDF}
                  className="group flex flex-col text-left p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-[#c28e62] dark:hover:border-[#c28e62] hover:bg-[#fcf7f3] dark:hover:bg-zinc-800/60 transition-all bg-white dark:bg-zinc-900 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#fcf7f3] dark:bg-zinc-800 text-[#c28e62] flex items-center justify-center mb-3 group-hover:bg-[#c28e62] group-hover:text-white transition-colors">
                    <Printer size={18} />
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm mb-1 group-hover:text-[#c28e62] transition-colors">
                    Cetak Stiker (PDF A3+)
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Layout cetak A3+ siap produksi (60 label per lembar).
                  </p>
                </button>

                {/* Opsi 2: Excel */}
                <button 
                  onClick={handleDownloadExcel}
                  className="group flex flex-col text-left p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-zinc-800/60 transition-all bg-white dark:bg-zinc-900 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    <FileSpreadsheet size={18} />
                  </div>
                  <h4 className="font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm mb-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    Data Tag (Excel / CSV)
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                    Rekap nomor seri, PIN autentikasi, dan tautan verifikasi.
                  </p>
                </button>
              </div>

              {/* Panduan Ukuran & Pratinjau Desain Label Tag (25 x 60 mm) */}
              <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowLabelGuide(!showLabelGuide)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800/50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Tag size={14} className="text-[#c28e62]" />
                    <span>Panduan Ukuran & Pratinjau Label Tag (25 x 60 mm)</span>
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                    {showLabelGuide ? 'Sembunyikan' : 'Lihat Desain'}
                    <ChevronDown size={14} className={`transform transition-transform ${showLabelGuide ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {showLabelGuide && (
                  <div className="mt-3 p-3.5 bg-slate-50 dark:bg-zinc-950/60 rounded-xl border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center gap-4">
                    {/* Visual Tag Mockup at 25:60 aspect ratio */}
                    <div className="relative shrink-0 flex items-center justify-center p-2 bg-slate-100 dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800">
                      <div className="relative w-[105px] h-[252px] bg-white rounded-[6px] border-2 border-red-500 flex flex-col items-center justify-between overflow-hidden select-none">
                        {/* Section 1: Top 25mm x 23mm (23/60 = 38.3% -> ~96px) - Vertically Centered */}
                        <div className="w-full h-[96px] flex flex-col items-center justify-center px-1.5 py-1 border-b border-dashed border-red-200 bg-white">
                          <div className="w-6 h-6 rounded-full border border-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-900 font-serif mb-1">
                            S
                          </div>
                          <span className="font-serif font-black text-[11px] tracking-wider text-slate-900 uppercase">
                            {batchToDownload?.brand || 'SUMAS'}
                          </span>
                          <div className="flex flex-col items-center justify-center mt-1 space-y-[0.5px]">
                            <span className="font-sans font-black text-[7.5px] tracking-wider text-slate-900 leading-tight">
                              ORIGINAL PRODUCT
                            </span>
                            <span className="font-sans font-bold text-[6.5px] tracking-wider text-slate-600 leading-tight">
                              PRODUK ASLI
                            </span>
                          </div>
                        </div>

                        {/* Section 2: QR Code 25mm x 25mm (25/60 = 41.7% -> ~105px) - Vertically Centered */}
                        <div className="w-full h-[105px] flex items-center justify-center p-1 border-b border-dashed border-red-200 bg-white">
                          <div className="w-[90px] h-[90px] flex items-center justify-center bg-white">
                            <QrCode size={86} className="text-black" />
                          </div>
                        </div>

                        {/* Section 3: PIN Area 25mm x 12mm / slot 9.6mm (~51px) - Vertically Centered */}
                        <div className="w-full h-[51px] flex flex-col items-center justify-center bg-white px-1">
                          <div className="font-kode-mono font-bold text-[17px] leading-[1.0] text-slate-900 text-center tracking-normal">
                            <div>0123</div>
                            <div className="mt-[1px]">4567</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Specifications List */}
                    <div className="flex-1 text-left space-y-2">
                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0"></span>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">Total Ukuran Label: 25 mm x 60 mm</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">Background full putih, sudut rounded R2 mm, dan garis potong die-cut merah. Semua objek center vertikal.</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0"></span>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">Bagian Atas: 25 mm x 23 mm (Center Vertikal)</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">Emblem Wreath, brand SUMAS, dan tulisan <span className="font-semibold">ORIGINAL PRODUCT & PRODUK ASLI</span> lebih besar dengan jarak rapat.</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0"></span>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">Bagian Tengah: 25 mm x 25 mm (Center Vertikal)</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">QR Code presisi 25x25 mm terpusat sempurna.</div>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></span>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">Bagian Bawah: 25 mm x 12 mm / slot 9.6 mm (Center Vertikal)</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">PIN 2 baris (4 digit atas & 4 digit bawah) <span className="font-semibold">tanpa spasi antar digit</span> (misal: 0123 / 4567) dengan font <span className="font-kode-mono font-bold">Kode Mono Bold (18 pt)</span> dan gap rapat.</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-zinc-800/50 border-t border-slate-100 dark:border-zinc-800 flex justify-end">
              <button 
                onClick={() => setIsDownloadModalOpen(false)} 
                className="px-4 py-1.5 text-xs sm:text-sm font-medium text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL LOADING PDF */}
      {isDownloadingLayout && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 w-full max-w-sm overflow-hidden text-center p-6 sm:p-7 flex flex-col items-center mx-4">
            <div className="relative w-14 h-14 mb-3.5">
              <div className="absolute inset-0 border-4 border-slate-100 dark:border-zinc-800 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#c28e62] rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-[#c28e62]">
                <Printer size={20} />
              </div>
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base mb-1">Memproses Layout A3+</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Menyusun tag ke format vektor presisi...</p>
          </div>
        </div>
      )}

      {/* MODAL LOADING EXCEL */}
      {isDownloadingExcel && (
        <div className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 w-full max-w-sm overflow-hidden text-center p-6 sm:p-7 flex flex-col items-center mx-4">
            <div className="relative w-14 h-14 mb-3.5">
              <div className="absolute inset-0 border-4 border-slate-100 dark:border-zinc-800 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-emerald-500 rounded-full border-t-transparent animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center text-emerald-600">
                <FileSpreadsheet size={20} />
              </div>
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base mb-1">Menyiapkan File Excel</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">Mengekspor daftar tag dan PIN (.xlsx)...</p>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL BRAND MANAGEMENT (CRUD & LINKED OWNER) */}
      {/* ============================================================== */}

      {/* MODAL 1: TAMBAH / EDIT BRAND */}
      {(isCreateBrandModalOpen || isEditBrandModalOpen) && (
        <div 
          onClick={(e) => { 
            if (e.target === e.currentTarget) { 
              setIsCreateBrandModalOpen(false); 
              setIsEditBrandModalOpen(false); 
            } 
          }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Building2 size={20} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  {isEditBrandModalOpen ? 'Edit Data Brand' : 'Tambah Brand / Merk'}
                </h3>
              </div>
              <button 
                onClick={() => { setIsCreateBrandModalOpen(false); setIsEditBrandModalOpen(false); }} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* MODAL FORM BODY */}
            <div className="p-5 sm:p-6 overflow-y-auto overflow-x-hidden scrollbar-thin space-y-4 sm:space-y-4.5 flex-1">
              {/* TOP ROW: KOLOM KIRI (UPLOAD LOGO 1:1) & KOLOM KANAN (NAMA BRAND & PENANGGUNG JAWAB) */}
              <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5 w-full">
                {/* KOLOM KIRI: UPLOAD LOGO BRAND (1:1 KOTAK) */}
                <div className="w-full sm:w-auto flex flex-col items-center sm:items-start flex-shrink-0">
                  <div className="relative w-32 h-32 sm:w-36 sm:h-36">
                    <input 
                      type="file" 
                      id="brand-logo-file-input" 
                      accept="image/*" 
                      onChange={handleLogoFileUpload} 
                      className="hidden" 
                    />
                    <label
                      htmlFor="brand-logo-file-input"
                      className={`w-full h-full aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group ${
                        brandForm.logo 
                          ? 'border-[#c28e62] bg-slate-50 dark:bg-zinc-800' 
                          : 'border-slate-300 dark:border-zinc-700 hover:border-[#c28e62] bg-slate-50/50 dark:bg-zinc-800/50 hover:bg-[#fcf7f3] dark:hover:bg-zinc-800'
                      }`}
                    >
                      {brandForm.logo ? (
                        <>
                          <img 
                            src={brandForm.logo} 
                            alt="" 
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.onerror = null;
                              el.src = getBrandInitialsLogo(brandForm.name || 'Brand');
                            }}
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-semibold gap-1">
                            <Upload size={16} />
                            <span>Ganti Logo</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center text-slate-400 dark:text-zinc-500">
                          <div className="w-9 h-9 rounded-full bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                            <Upload size={18} />
                          </div>
                          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                            Upload Logo
                          </span>
                          <span className="text-[9px] text-slate-400 dark:text-zinc-500">
                            Kotak (1:1)
                          </span>
                        </div>
                      )}
                    </label>

                    {brandForm.logo && (
                      <button
                        type="button"
                        onClick={() => setBrandForm(prev => ({ ...prev, logo: '' }))}
                        className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 transition-colors cursor-pointer z-10"
                        data-tooltip="Hapus logo brand"
                        data-tooltip-pos="top"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* KOLOM KANAN: NAMA BRAND & PENANGGUNG JAWAB */}
                <div className="flex-1 w-full min-w-0 space-y-3.5">
                  {/* NAMA BRAND */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                      Nama Brand / Merk
                    </label>
                    <input 
                      type="text" 
                      placeholder="Contoh: SUMAS, ASSC, BLIMEY!" 
                      value={brandForm.name}
                      onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                      className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-semibold transition-all" 
                    />
                  </div>

                  {/* PENANGGUNG JAWAB (HANYA NAMA PENGGUNA & FOTO) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                        Penanggung Jawab
                      </label>
                      <button
                        type="button"
                        onClick={handleOpenCreateUser}
                        className="text-[11px] font-semibold text-[#c28e62] hover:underline cursor-pointer"
                      >
                        <span>+ Akun Baru</span>
                      </button>
                    </div>
                    
                    <CustomSelect
                      value={brandForm.ownerId}
                      onChange={(val) => setBrandForm({ ...brandForm, ownerId: val })}
                      placeholder="-- Pilih Akun Pengguna --"
                      searchable={true}
                      buttonClassName="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 cursor-pointer flex justify-between items-center transition-colors select-none font-medium truncate"
                      options={users.map((u) => ({
                        value: u.id,
                        label: u.name,
                        avatar: u.avatar
                      }))}
                    />
                  </div>
                </div>
              </div>

              {/* DESKRIPSI BRAND (PALING BAWAH) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Deskripsi Brand
                </label>
                <textarea 
                  rows={3}
                  placeholder="Tuliskan catatan profil merk, katalog produk, atau keterangan..." 
                  value={brandForm.description}
                  onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                  className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl px-4 py-3 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none resize-none transition-all font-medium placeholder:font-normal" 
                ></textarea>
              </div>
            </div>
            
            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <button 
                  type="button"
                  onClick={() => { setIsCreateBrandModalOpen(false); setIsEditBrandModalOpen(false); }} 
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="button"
                  onClick={isEditBrandModalOpen ? handleUpdateBrand : handleCreateBrand}
                  disabled={!brandForm.name.trim()}
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  {isEditBrandModalOpen ? 'Simpan Perubahan' : 'Buat Brand Sekarang'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL USER MANAGEMENT: DAFTAR / EDIT PENGGUNA LOGIN */}
      {(isCreateUserModalOpen || isEditUserModalOpen) && (
        <div 
          onClick={(e) => { 
            if (e.target === e.currentTarget) { 
              setIsCreateUserModalOpen(false); 
              setIsEditUserModalOpen(false); 
              setIsResetPasswordMode(false);
            } 
          }}
          className="fixed inset-0 bg-black/60 z-[10010] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-xl max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  {isEditUserModalOpen ? <Users size={18} /> : <UserPlus size={18} />}
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  {isEditUserModalOpen ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
                </h3>
              </div>
              <button 
                onClick={() => { setIsCreateUserModalOpen(false); setIsEditUserModalOpen(false); setIsResetPasswordMode(false); }} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* MODAL FORM BODY */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-3.5 sm:space-y-4 flex-1">
              {/* TOP ROW: KOLOM KIRI (FOTO PROFIL 1:1) & KOLOM KANAN (NAMA PENGGUNA & EMAIL) */}
              <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
                {/* KOLOM KIRI: UPLOAD FOTO PROFIL (1:1 KOTAK) */}
                <div className="w-full sm:w-auto flex flex-col items-center sm:items-start flex-shrink-0">
                  <div className="relative w-32 h-32 sm:w-36 sm:h-36">
                    <input 
                      type="file" 
                      id="user-avatar-file-input" 
                      accept="image/*" 
                      onChange={handleUserAvatarUpload} 
                      className="hidden" 
                    />
                    <label
                      htmlFor="user-avatar-file-input"
                      className={`w-full h-full aspect-square rounded-2xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden relative group ${
                        userForm.avatar 
                          ? 'border-[#c28e62] bg-slate-50 dark:bg-zinc-800' 
                          : 'border-slate-300 dark:border-zinc-700 hover:border-[#c28e62] bg-slate-50/50 dark:bg-zinc-800/50 hover:bg-[#fcf7f3] dark:hover:bg-zinc-800'
                      }`}
                    >
                      {userForm.avatar ? (
                        <>
                          <img 
                            src={userForm.avatar} 
                            alt="Foto Profil" 
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.onerror = null;
                              el.src = getInitialsAvatar(userForm.name || 'Pengguna');
                            }}
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-semibold gap-1">
                            <Upload size={16} />
                            <span>Ganti Foto</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-1.5 p-3 text-center text-slate-400 dark:text-zinc-500">
                          <div className="w-9 h-9 rounded-full bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center">
                            <Upload size={18} />
                          </div>
                          <span className="text-[11px] font-bold text-slate-700 dark:text-zinc-300">
                            Upload Foto
                          </span>
                          <span className="text-[9px] text-slate-400 dark:text-zinc-500">
                            Kotak (1:1)
                          </span>
                        </div>
                      )}
                    </label>

                    {userForm.avatar && (
                      <button
                        type="button"
                        onClick={() => setUserForm(prev => ({ ...prev, avatar: '' }))}
                        className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 transition-colors cursor-pointer z-10"
                        data-tooltip="Hapus foto"
                        data-tooltip-pos="top"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* KOLOM KANAN: NAMA PENGGUNA & EMAIL */}
                <div className="flex-1 w-full space-y-3.5">
                  {/* Nama Pengguna */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                      Nama Pengguna <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="Nama pengguna" 
                        value={userForm.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setUserForm(prev => ({
                            ...prev,
                            name: val,
                            username: slugifyUsername(val)
                          }));
                        }}
                        className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-10 pr-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none transition-all" 
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                      <span>Email <span className="text-rose-500">*</span></span>
                      {userForm.email.trim().length > 0 && !isValidEmail(userForm.email) && (
                        <span className="text-[10px] text-rose-500 font-medium">Format email tidak valid</span>
                      )}
                    </label>
                    <div className="relative">
                      <Mail size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${userForm.email.trim().length > 0 && !isValidEmail(userForm.email) ? 'text-rose-500' : 'text-slate-400'}`} />
                      <input 
                        type="email" 
                        placeholder="email@perusahaan.com" 
                        value={userForm.email}
                        onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                        className={`w-full bg-white dark:bg-zinc-800 border rounded-full pl-10 pr-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 outline-none transition-all ${
                          userForm.email.trim().length > 0 && !isValidEmail(userForm.email)
                            ? 'border-rose-400 dark:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                            : 'border-slate-200 dark:border-zinc-700 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20'
                        }`} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* BARIS BAWAH (1 KOLOM PENUH): HAK AKSES & KATA SANDI / FITUR RESET PASSWORD */}
              <div className="space-y-3.5 pt-1">
                {/* Hak Akses */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Hak Akses <span className="text-rose-500">*</span>
                  </label>
                  <CustomSelect
                    value={userForm.role}
                    onChange={(val) => setUserForm({ ...userForm, role: val })}
                    placeholder="Pilih Peran"
                    buttonClassName="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 cursor-pointer flex justify-between items-center transition-colors select-none font-medium"
                    options={userRolesList.map(r => ({
                      value: r,
                      label: r
                    }))}
                  />
                </div>

                {/* Brand yang Dikelola (Hanya Menampilkan Nama Brand / Read-Only) */}
                {isEditUserModalOpen ? (
                  <div>
                    {(() => {
                      const userManagedBrands = brands.filter(b => b.ownerId === userForm.id || (userForm.brandIds || []).includes(b.id));
                      return (
                        <>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5">
                              <Briefcase size={13} className="text-[#c28e62]" />
                              <span>Brand yang Dikelola</span>
                            </label>
                            <span className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium">
                              {userManagedBrands.length} Brand Terhubung
                            </span>
                          </div>

                          {userManagedBrands.length === 0 ? (
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-800/40 text-xs text-slate-500 dark:text-zinc-400 italic">
                              Pengguna ini saat ini tidak mengelola brand apapun.
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-800/40">
                              {userManagedBrands.map((b) => (
                                <span 
                                  key={b.id}
                                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700"
                                >
                                  {b.name}
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1.5">
                            * Pengaturan kepemilikan brand dikelola melalui menu <strong className="text-slate-600 dark:text-zinc-400">Brand / Merk</strong>.
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-300 flex items-center gap-1.5 mb-1.5">
                      <Briefcase size={13} className="text-[#c28e62]" />
                      <span>Brand yang Dikelola</span>
                    </label>
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-800/40 text-xs text-slate-500 dark:text-zinc-400">
                      Brand dapat dihubungkan ke akun ini setelah didaftarkan melalui menu <strong className="text-slate-700 dark:text-zinc-300">Brand / Merk</strong>.
                    </div>
                  </div>
                )}

                {isEditUserModalOpen && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                      Status Akun
                    </label>
                    <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50/60 dark:bg-zinc-800/50">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${userForm.status === 'Aktif' ? 'bg-emerald-500 ring-4 ring-emerald-500/20' : 'bg-rose-500 ring-4 ring-rose-500/20'}`} />
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                            {userForm.status === 'Aktif' ? 'Akun Aktif' : 'Akun Dinonaktifkan'}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">
                            {userForm.status === 'Aktif' ? 'Pengguna dapat masuk dan mengakses sistem' : 'Pengguna diblokir sementara dari akses login'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setUserForm(prev => ({ ...prev, status: prev.status === 'Aktif' ? 'Nonaktif' : 'Aktif' }))}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          userForm.status === 'Aktif'
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                        }`}
                      >
                        {userForm.status === 'Aktif' ? (
                          <>
                            <Ban size={13} />
                            <span>Nonaktifkan</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={13} />
                            <span>Aktifkan</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {isEditUserModalOpen ? (
                  /* MODE EDIT PENGGUNA: FITUR RESET PASSWORD */
                  !isResetPasswordMode ? (
                    <div className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-zinc-700 bg-slate-50/70 dark:bg-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center shrink-0">
                          <KeyRound size={17} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-800 dark:text-zinc-200">Reset Kata Sandi</div>
                          <div className="text-[11px] text-slate-500 dark:text-zinc-400">Atur ulang kata sandi pengguna ini jika lupa atau perlu diperbarui</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsResetPasswordMode(true);
                          generateRandomPassword();
                          setShowPassword(true);
                          setShowConfirmPassword(true);
                        }}
                        className="px-4 py-2 text-xs font-bold text-[#c28e62] hover:text-[#a87449] bg-white dark:bg-zinc-800 border border-[#c28e62]/30 hover:border-[#c28e62] rounded-full transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw size={13} />
                        <span>Reset Password</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl border border-[#c28e62]/40 bg-[#fcf7f3]/70 dark:bg-zinc-800/80 space-y-3.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between pb-2 border-b border-[#c28e62]/20">
                        <div className="flex items-center gap-2 text-[#c28e62] font-bold text-xs">
                          <KeyRound size={16} />
                          <span>Form Reset Kata Sandi</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsResetPasswordMode(false);
                            setUserForm(prev => ({ ...prev, password: '', confirmPassword: '' }));
                          }}
                          className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline cursor-pointer"
                        >
                          Batalkan Reset
                        </button>
                      </div>

                      {/* Sandi Baru */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                            Kata Sandi Baru <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={generateRandomPassword}
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#c28e62] hover:underline cursor-pointer"
                          >
                            <Sparkles size={11} />
                            <span>Acak Sandi</span>
                          </button>
                        </div>
                        <div className="relative">
                          <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Masukkan kata sandi baru" 
                            value={userForm.password}
                            onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                            className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-mono transition-all" 
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                          >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>

                      {/* Tulis Ulang Sandi */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                            Tulis Ulang Kata Sandi Baru <span className="text-rose-500">*</span>
                          </label>
                          {userForm.password && userForm.confirmPassword && (
                            userForm.password === userForm.confirmPassword ? (
                              <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">Cocok</span>
                            ) : (
                              <span className="text-rose-500 text-[11px] font-medium">Tidak cocok</span>
                            )
                          )}
                        </div>
                        <div className="relative">
                          <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input 
                            type={showConfirmPassword ? 'text' : 'password'}
                            placeholder="Konfirmasi kata sandi baru" 
                            value={userForm.confirmPassword}
                            onChange={(e) => setUserForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            className={`w-full bg-white dark:bg-zinc-800 border rounded-full pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 outline-none font-mono transition-all ${
                              userForm.password && userForm.confirmPassword && userForm.password !== userForm.confirmPassword
                                ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                                : 'border-slate-200 dark:border-zinc-700 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20'
                            }`} 
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                          >
                            {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  /* MODE TAMBAH PENGGUNA BARU: SANDI & KONFIRMASI */
                  <>
                    {/* Sandi Baru */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                          Sandi Baru <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={generateRandomPassword}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#c28e62] hover:underline cursor-pointer"
                        >
                          <Sparkles size={11} />
                          <span>Acak Sandi</span>
                        </button>
                      </div>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Masukkan sandi" 
                          value={userForm.password}
                          onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-mono transition-all" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>

                    {/* Tulis Ulang Sandi */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                          Tulis Ulang Sandi <span className="text-rose-500">*</span>
                        </label>
                        {userForm.password && userForm.confirmPassword && (
                          userForm.password === userForm.confirmPassword ? (
                            <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-medium">Cocok</span>
                          ) : (
                            <span className="text-rose-500 text-[11px] font-medium">Tidak cocok</span>
                          )
                        )}
                      </div>
                      <div className="relative">
                        <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Tulis ulang sandi" 
                          value={userForm.confirmPassword}
                          onChange={(e) => setUserForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                          className={`w-full bg-white dark:bg-zinc-800 border rounded-full pl-10 pr-10 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 outline-none font-mono transition-all ${
                            userForm.password && userForm.confirmPassword && userForm.password !== userForm.confirmPassword
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                              : 'border-slate-200 dark:border-zinc-700 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20'
                          }`} 
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer p-0.5"
                        >
                          {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5 flex-shrink-0">
              <button 
                type="button"
                onClick={() => { setIsCreateUserModalOpen(false); setIsEditUserModalOpen(false); setIsResetPasswordMode(false); }} 
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={isEditUserModalOpen ? handleUpdateUser : handleCreateUser}
                disabled={
                  !userForm.name.trim() || 
                  !userForm.email.trim() || 
                  !isValidEmail(userForm.email) ||
                  (!isEditUserModalOpen && (!userForm.password.trim() || userForm.password !== userForm.confirmPassword)) ||
                  (isEditUserModalOpen && isResetPasswordMode && (!userForm.password.trim() || userForm.password !== userForm.confirmPassword))
                }
                className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                {isEditUserModalOpen ? (
                  <span>Simpan Perubahan</span>
                ) : (
                  <span>Tambah Pengguna</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* MODAL KONFIRMASI HAPUS PENGGUNA */}
      {isDeleteUserModalOpen && userToDelete && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) { setIsDeleteUserModalOpen(false); setUserToDelete(null); } }}
          className="fixed inset-0 bg-black/60 z-[10010] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-700 w-full max-w-sm overflow-hidden text-center p-6 mx-4">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
              <AlertCircle size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base sm:text-lg mb-2">Hapus Pengguna Ini?</h3>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mb-4">
              Apakah Anda yakin ingin menghapus akun pengguna <strong>{userToDelete.name}</strong> ({userToDelete.email})?
            </p>
            {(() => {
              const ownedCount = brands.filter(b => b.ownerId === userToDelete.id).length;
              return ownedCount > 0 ? (
                <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-xl p-3 mb-5 text-[11px] text-left leading-relaxed">
                  ⚠️ Perhatian: Pengguna ini tercatat sebagai pemilik dari {ownedCount} brand.
                </div>
              ) : null;
            })()}
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => { setIsDeleteUserModalOpen(false); setUserToDelete(null); }} 
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                onClick={handleConfirmDeleteUser} 
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-full transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: DAFTARKAN AKUN USER BARU (QUICK ADD FROM BRAND MODAL) */}
      {isAddUserModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsAddUserModalOpen(false); }}
          className="fixed inset-0 bg-black/60 z-[10010] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200/90 dark:border-zinc-700/80 w-full max-w-lg max-h-[92vh] sm:max-h-[88vh] overflow-hidden mx-4 animate-in zoom-in-95 duration-200 flex flex-col">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <UserPlus size={19} />
                </div>
                <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                  Daftarkan Akun User Baru
                </h3>
              </div>
              <button 
                onClick={() => setIsAddUserModalOpen(false)} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* MODAL FORM BODY */}
            <div className="p-5 sm:p-6 space-y-4 sm:space-y-4.5 overflow-y-auto flex-1">
              {/* UPLOAD FOTO PROFIL CEPAT (1:1 CARD) */}
              <div className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-zinc-800/40 rounded-2xl border border-slate-200/70 dark:border-zinc-700/60 flex items-center gap-3.5">
                <div className="relative flex-shrink-0">
                  <input 
                    type="file" 
                    id="user-quick-avatar-file"
                    accept="image/*"
                    onChange={handleUserAvatarUpload}
                    className="hidden" 
                  />
                  <label 
                    htmlFor="user-quick-avatar-file"
                    className={`w-16 h-16 sm:w-18 sm:h-18 rounded-full border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all aspect-square overflow-hidden relative ${
                      userForm.avatar 
                        ? 'border-[#c28e62] bg-white dark:bg-zinc-800' 
                        : 'border-slate-300 dark:border-zinc-600 hover:border-[#c28e62] bg-white dark:bg-zinc-800/80 hover:bg-[#fcf7f3]'
                    }`}
                  >
                    {userForm.avatar ? (
                      <img 
                        src={userForm.avatar} 
                        alt="Avatar Preview" 
                        onError={(e) => {
                          const el = e.currentTarget;
                          el.onerror = null;
                          el.src = getInitialsAvatar(userForm.name || 'Pengguna');
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-0.5 text-slate-400 dark:text-zinc-500">
                        <Upload size={15} className="text-[#c28e62]" />
                        <span className="text-[9px] font-semibold text-slate-600 dark:text-zinc-300">
                          1:1 Foto
                        </span>
                      </div>
                    )}
                  </label>
                  {userForm.avatar && (
                    <button
                      type="button"
                      onClick={() => setUserForm(prev => ({ ...prev, avatar: '' }))}
                      className="absolute -top-1 -right-1 bg-red-600 hover:bg-red-700 text-white rounded-full p-0.5 transition-colors cursor-pointer"
                      data-tooltip="Hapus foto profil"
                      data-tooltip-pos="top"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-zinc-200">
                      Foto Profil Pengguna (1:1)
                    </label>
                    <span className="text-[10px] text-slate-400">Opsional</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      htmlFor="user-quick-avatar-file"
                      className="px-3 py-1 rounded-full bg-white dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 transition-colors"
                    >
                      <Upload size={12} className="text-[#c28e62]" />
                      <span>{userForm.avatar ? 'Ganti Foto' : 'Upload Foto'}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* NAMA LENGKAP & EMAIL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                    Nama Lengkap Pemilik / PIC
                  </label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Cth: Kalingga Jeandy" 
                      value={userForm.name}
                      onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                      className="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full pl-10 pr-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20 outline-none font-medium transition-all" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Alamat Email <span className="text-rose-500">*</span></span>
                    {userForm.email.trim().length > 0 && !isValidEmail(userForm.email) && (
                      <span className="text-[10px] text-rose-500 font-medium">Format email tidak valid</span>
                    )}
                  </label>
                  <div className="relative">
                    <Mail size={15} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${userForm.email.trim().length > 0 && !isValidEmail(userForm.email) ? 'text-rose-500' : 'text-slate-400'}`} />
                    <input 
                      type="email" 
                      placeholder="Cth: kalingga@sumas.id" 
                      value={userForm.email}
                      onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                      className={`w-full bg-white dark:bg-zinc-800 border rounded-full pl-10 pr-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 outline-none font-medium transition-all ${
                        userForm.email.trim().length > 0 && !isValidEmail(userForm.email)
                          ? 'border-rose-400 dark:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                          : 'border-slate-200 dark:border-zinc-700 focus:border-[#cd9a6f] focus:ring-2 focus:ring-[#cd9a6f]/20'
                      }`} 
                    />
                  </div>
                </div>
              </div>

              {/* PERAN / HAK AKSES */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <UserCheck size={14} className="text-[#c28e62]" />
                    <span>Peran & Hak Akses (Role)</span>
                  </span>
                  <span className="text-[11px] font-normal text-slate-400">Pilihan: Administrator / Operator</span>
                </label>
                <CustomSelect
                  value={userForm.role}
                  onChange={(val) => setUserForm({ ...userForm, role: val })}
                  placeholder="Pilih Hak Akses"
                  buttonClassName="w-full bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 hover:border-[#cd9a6f] dark:hover:border-[#cd9a6f] rounded-full px-5 py-2.5 text-xs sm:text-sm text-slate-800 dark:text-zinc-200 cursor-pointer flex justify-between items-center transition-colors select-none font-medium"
                  options={userRolesList.map(r => ({
                    value: r,
                    label: r,
                    sublabel: r === 'Administrator' 
                      ? 'Akses penuh sistem, kelola user & reset password, master brand' 
                      : 'Penerbitan batch, download cetak QR, alokasi proyek & pantau scan',
                    badge: r === 'Administrator' ? 'Akses Penuh' : 'Operasional'
                  }))}
                />
              </div>
            </div>
            
            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-4 bg-slate-50/90 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <button 
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)} 
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200/80 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button 
                  type="button"
                  onClick={handleQuickCreateUser}
                  disabled={!userForm.name.trim() || !userForm.email.trim() || !isValidEmail(userForm.email)}
                  className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-[#c28e62] hover:bg-[#b07d53] rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Simpan & Pilih Pemilik</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: DETAIL BRAND (CLEAN, DATABASE-RELATIONAL & PROFESSIONAL) */}
      {isDetailBrandModalOpen && brandToView && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) { setIsDetailBrandModalOpen(false); setBrandToView(null); } }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 w-full max-w-2xl overflow-hidden mx-4 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* CLEAN BRAND HEADER */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-4 bg-white dark:bg-zinc-900 flex-shrink-0">
              <div className="flex items-center gap-4">
                {/* BRAND LOGO */}
                <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 p-2 flex items-center justify-center shrink-0">
                  {brandToView.logo ? (
                    <img 
                      src={brandToView.name.toLowerCase() === 'sumas' && (!brandToView.logo || brandToView.logo.includes('541888946425') || brandToView.logo.includes('logo_vertikal')) ? '/assets/brand/logo_horizontal.svg' : brandToView.logo} 
                      alt={brandToView.name} 
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.onerror = null;
                        el.src = getBrandInitialsLogo(brandToView.name);
                      }}
                      className="w-full h-full object-contain" 
                    />
                  ) : (
                    <span className="font-bold text-lg text-[#c28e62]">
                      {brandToView.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* BRAND IDENTIFIERS */}
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-zinc-100">
                      {brandToView.name}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
                      brandToView.status === 'Aktif'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                    }`}>
                      {brandToView.status === 'Aktif' ? <CheckCircle2 size={11} /> : <Ban size={11} />}
                      <span>{brandToView.status}</span>
                    </span>

                  </div>
                  <p className="text-xs text-slate-400 dark:text-zinc-500 font-mono">
                    ID Brand: {brandToView.id}
                  </p>
                </div>
              </div>

              {/* CLOSE BUTTON */}
              <button 
                onClick={() => { setIsDetailBrandModalOpen(false); setBrandToView(null); }} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* DETAIL MODAL BODY */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* METRIC STRIP (RELASI DATABASE: PRODUCTS & BATCHES) */}
              {(() => {
                const brandProducts = products.filter(p => (p.brandId && p.brandId === brandToView.id) || (p.brandName && p.brandName.toLowerCase() === brandToView.name.toLowerCase()));
                const brandBatches = batches.filter(b => (b.brand || '').toLowerCase() === brandToView.name.toLowerCase());
                const totalTags = brandBatches.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);
                const activeBatches = brandBatches.filter(b => b.status === 'Aktif').length;

                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500 text-xs mb-1">
                        <Box size={14} className="text-[#c28e62]" />
                        <span>Katalog Produk</span>
                      </div>
                      <div className="text-lg font-bold text-slate-800 dark:text-zinc-100">
                        {brandProducts.length} <span className="text-xs font-normal text-slate-400">SKU Terdaftar</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500 text-xs mb-1">
                        <Layers size={14} className="text-indigo-500" />
                        <span>Batch Produksi</span>
                      </div>
                      <div className="text-lg font-bold text-slate-800 dark:text-zinc-100">
                        {brandBatches.length} <span className="text-xs font-normal text-slate-400">Batch ({activeBatches} Aktif)</span>
                      </div>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-zinc-800/60 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-500 text-xs mb-1">
                        <Tag size={14} className="text-emerald-500" />
                        <span>Total Tag Fisik</span>
                      </div>
                      <div className="text-lg font-bold text-slate-800 dark:text-zinc-100">
                        {totalTags.toLocaleString()} <span className="text-xs font-normal text-slate-400">Tag Diterbitkan</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SEKSI 1: PIC / PEMILIK AKUN TERHUBUNG (RELASI TABEL USERS) */}
              {(() => {
                const linkedUser = users.find(u => u.id === brandToView.ownerId);
                const ownerDisplayName = linkedUser ? linkedUser.name : brandToView.ownerName;
                const ownerDisplayRole = linkedUser ? linkedUser.role : (brandToView.ownerRole || 'PIC Brand');
                const ownerDisplayEmail = linkedUser ? linkedUser.email : (brandToView.ownerEmail || '-');
                const ownerDisplayStatus = linkedUser?.status || 'Aktif';
                const ownerAvatar = linkedUser?.avatar;

                return (
                  <div className="p-4 bg-slate-50 dark:bg-zinc-800/50 rounded-2xl border border-slate-200/80 dark:border-zinc-800">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span>Pemilik Akun / PIC Otorisasi (Tabel Users)</span>
                      <span className="font-mono text-[10px] text-slate-400">ID: {brandToView.ownerId}</span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {ownerAvatar ? (
                          <img 
                            src={ownerAvatar} 
                            alt={ownerDisplayName} 
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.onerror = null;
                              el.src = getInitialsAvatar(ownerDisplayName);
                            }}
                            className="w-11 h-11 rounded-full object-cover border-2 border-white dark:border-zinc-700 shrink-0" 
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-full bg-[#c28e62] text-white flex items-center justify-center font-bold text-sm shrink-0">
                            {ownerDisplayName ? ownerDisplayName.charAt(0).toUpperCase() : 'U'}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-zinc-100 text-sm">
                              {ownerDisplayName}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-300">
                              {ownerDisplayRole}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              {ownerDisplayStatus}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                            <span className="flex items-center gap-1.5">
                              <Mail size={12} className="text-slate-400" />
                              <span>{ownerDisplayEmail}</span>
                            </span>

                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* SEKSI 2: DESKRIPSI & PROFIL BISNIS */}
              {brandToView.description && (
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Deskripsi & Profil Brand
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed bg-slate-50 dark:bg-zinc-800/40 p-3.5 rounded-xl border border-slate-200/80 dark:border-zinc-800">
                    {brandToView.description}
                  </p>
                </div>
              )}

              {/* SEKSI 3: KATALOG PRODUK & SKU (RELASI TABEL PRODUCTS) */}
              {(() => {
                const brandProducts = products.filter(p => (p.brandId && p.brandId === brandToView.id) || (p.brandName && p.brandName.toLowerCase() === brandToView.name.toLowerCase()));

                return (
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Katalog Produk Terdaftar ({brandProducts.length})</span>
                      </div>
                    </div>

                    {brandProducts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {brandProducts.map((p) => (
                          <div 
                            key={p.id}
                            className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs hover:border-[#c28e62] transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-zinc-700 flex items-center justify-center text-[#c28e62] shrink-0 font-bold text-[11px]">
                                <Box size={14} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 dark:text-zinc-200 truncate">
                                  {p.sku}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {p.category || brandToView.category || 'Umum'}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 text-center text-xs text-slate-400">
                        Belum ada SKU produk yang terhubung untuk merk ini.
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* SEKSI 4: RIWAYAT BATCH PRODUKSI (RELASI TABEL BATCHES) */}
              {(() => {
                const brandBatches = batches.filter(b => (b.brand || '').toLowerCase() === brandToView.name.toLowerCase());

                return (
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Riwayat Batch Produksi ({brandBatches.length})</span>
                      </div>
                      {brandBatches.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDetailBrandModalOpen(false);
                            setActiveMenu('tag-qr');
                          }}
                          className="text-[11px] text-[#c28e62] hover:underline font-semibold cursor-pointer"
                        >
                          Buka di Menu Tag / QR Code →
                        </button>
                      )}
                    </div>

                    {brandBatches.length > 0 ? (
                      <div className="space-y-2">
                        {brandBatches.map(b => (
                          <div 
                            key={b.id} 
                            className="p-3 bg-slate-50 dark:bg-zinc-800/50 rounded-xl border border-slate-200/80 dark:border-zinc-800 flex items-center justify-between text-xs"
                          >
                            <div>
                              <div className="font-mono font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-2">
                                <span>{b.batchId}</span>
                                {b.project && (
                                  <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    {b.project}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                SKU: {b.sku} • {b.qty?.toLocaleString()} Tag • {b.date}
                              </div>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 shrink-0 ${
                              b.status === 'Disuspend'
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                            }`}>
                              {b.status === 'Disuspend' ? <Ban size={10} /> : <CheckCircle2 size={10} />}
                              <span>{b.status}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 text-center text-xs text-slate-400">
                        Belum ada batch produksi yang digenerate untuk merk ini.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* DETAIL MODAL FOOTER */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-800/80 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
              <span className="text-xs text-slate-400 dark:text-zinc-500">
                Terdaftar sejak: <span className="font-semibold text-slate-600 dark:text-zinc-300">{brandToView.createdAt}</span>
              </span>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailBrandModalOpen(false);
                    handleOpenEditBrand(brandToView);
                  }}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-[#c28e62] hover:bg-[#b07d53] text-white rounded-full text-xs font-semibold transition-colors cursor-pointer"
                >
                  Edit Data Brand
                </button>
                <button
                  type="button"
                  onClick={() => { setIsDetailBrandModalOpen(false); setBrandToView(null); }}
                  className="flex-1 sm:flex-initial px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-slate-700 dark:text-zinc-200 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: KONFIRMASI HAPUS BRAND */}
      {isDeleteBrandModalOpen && brandToDelete && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) { setIsDeleteBrandModalOpen(false); setBrandToDelete(null); } }}
          className="fixed inset-0 bg-black/60 z-[10010] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-700 w-full max-w-sm overflow-hidden text-center p-6 mx-4 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4 text-red-600 dark:text-red-400">
              <Trash2 size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base sm:text-lg mb-2">
              Hapus Brand {brandToDelete.name}?
            </h3>
            
            {(() => {
              const batchCount = batches.filter(b => b.brand.toLowerCase() === brandToDelete.name.toLowerCase()).length;
              return (
                <div>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mb-3">
                    Apakah Anda yakin ingin menghapus data brand ini? Tindakan ini akan menghapus katalog merk dari sistem database SQLite.
                  </p>
                  {batchCount > 0 && (
                    <div className="mb-5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 text-xs text-left">
                      <strong>Perhatian:</strong> Terdapat <strong>{batchCount} batch</strong> yang saat ini menggunakan merk ini. Riwayat batch tetap ada namun katalog brand akan dihapus.
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="flex gap-3 justify-center">
              <button 
                type="button"
                onClick={() => { setIsDeleteBrandModalOpen(false); setBrandToDelete(null); }} 
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 rounded-full transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="button"
                onClick={handleConfirmDeleteBrand} 
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 rounded-full transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {isDetailModalOpen && activeBatch && hoveredTagInfo && createPortal(
        (() => {
          const isFlipped = hoveredTagInfo.rect.top < 140;
          const leftPos = Math.max(120, Math.min(window.innerWidth - 120, hoveredTagInfo.rect.left + hoveredTagInfo.rect.width / 2));
          const topPos = isFlipped ? hoveredTagInfo.rect.bottom + 8 : hoveredTagInfo.rect.top - 8;

          return (
            <div 
              className={`pointer-events-none fixed z-[999999] -translate-x-1/2 w-52 p-3 bg-slate-900/95 dark:bg-zinc-900/95 backdrop-blur-md text-white rounded-xl border border-slate-700/80 text-left font-sans normal-case tracking-normal animate-in fade-in zoom-in-95 duration-150 ${
                isFlipped ? '' : '-translate-y-full'
              }`}
              style={{
                top: topPos,
                left: leftPos
              }}
            >
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-700/80 text-[10px]">
                <span className="font-mono text-[#cd9a6f] font-bold">{hoveredTagInfo.tag.tagNumber}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                  hoveredTagInfo.tag.status === 'Tersedia' 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  {hoveredTagInfo.tag.status}
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Digit PIN:</span>
                  <span className="font-kode-mono font-bold text-white tracking-widest">{hoveredTagInfo.tag.pin}</span>
                </div>
                {hoveredTagInfo.tag.project ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[11px]">Proyek:</span>
                      <span className="font-semibold text-emerald-300 text-right truncate max-w-[120px]">{hoveredTagInfo.tag.project}</span>
                    </div>
                    {hoveredTagInfo.tag.specs && hoveredTagInfo.tag.specs !== '-' && (
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-[11px]">Spesifikasi:</span>
                        <span className="text-slate-300 text-right truncate max-w-[120px] text-[10px]">{hoveredTagInfo.tag.specs}</span>
                      </div>
                    )}
                    <div className="text-[10px] text-amber-300/90 font-medium pt-1 border-t border-slate-700/60 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      Sudah dialokasikan (Terkunci)
                    </div>
                  </>
                ) : activeBatch?.status === 'Disuspend' ? (
                  <div className="text-[10px] text-amber-300 font-medium pt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                    Batch disuspend (Terkunci)
                  </div>
                ) : (
                  <div className="text-[10px] text-emerald-400 font-medium pt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                    Siap dialokasikan ke proyek
                  </div>
                )}
              </div>
              {/* Tooltip Arrow */}
              <div className={`absolute left-1/2 -translate-x-1/2 border-[5px] border-transparent ${
                isFlipped 
                  ? 'bottom-full border-b-slate-900/95' 
                  : 'top-full border-t-slate-900/95'
              }`}></div>
            </div>
          );
        })(),
        document.body
      )}

      {/* ============================================================== */}
      {/* SKU DROPDOWN MENU PORTAL (3-DOTS ACTION) */}
      {/* ============================================================== */}
      {openSkuDropdownId && activeDropdownSku && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[999990]" 
            onClick={(e) => { e.stopPropagation(); setOpenSkuDropdownId(null); }} 
          />
          <div 
            data-dropdown-menu="true"
            className={`fixed z-[999991] w-48 bg-white dark:bg-zinc-800 rounded-2xl border border-[#cd9a6f]/30 dark:border-zinc-600 p-1.5 animate-in fade-in zoom-in-95 duration-200 ${
              skuDropdownDirection === 'up' ? '-translate-y-full origin-bottom-right' : 'origin-top-right'
            }`}
            style={{
              top: `${skuDropdownPos.top}px`,
              left: `${Math.max(12, Math.min(skuDropdownPos.left - 192, window.innerWidth - 204))}px`
            }}
          >
            <button 
              type="button"
              onClick={() => { setOpenSkuDropdownId(null); handleOpenDetailSku(activeDropdownSku); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Eye size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Detail SKU Produk
            </button>
            
            <button 
              type="button"
              onClick={() => { setOpenSkuDropdownId(null); handleOpenEditSku(activeDropdownSku); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-700 dark:text-zinc-300 hover:bg-[#fcf7f3] dark:hover:bg-zinc-700 hover:text-[#c28e62] dark:hover:text-[#c28e62] rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Edit3 size={16} className="text-slate-400 dark:text-zinc-500 group-hover:text-[#c28e62] dark:group-hover:text-[#c28e62] transition-colors" /> Edit Data SKU
            </button>

            <div className="h-px bg-slate-100 dark:bg-zinc-700 my-1.5 mx-2"></div>
            
            <button 
              type="button"
              onClick={() => { setOpenSkuDropdownId(null); handleOpenDeleteSku(activeDropdownSku); }}
              className="w-full text-left px-4 py-2.5 text-xs sm:text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors flex items-center gap-2 group my-0.5 cursor-pointer"
            >
              <Trash2 size={16} className="text-red-400 dark:text-red-500 group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors" /> Hapus SKU
            </button>
          </div>
        </>,
        document.body
      )}

      {/* ============================================================== */}
      {/* MODAL TAMBAH / EDIT SKU PRODUK */}
      {/* ============================================================== */}
      {(isCreateSkuModalOpen || isEditSkuModalOpen) && createPortal(
        <div 
          onClick={(e) => { 
            if (e.target === e.currentTarget) { 
              setIsCreateSkuModalOpen(false); 
              setIsEditSkuModalOpen(false); 
            } 
          }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* MODAL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Box size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                    {isEditSkuModalOpen ? 'Edit SKU Produk' : 'Tambah SKU Produk Baru'}
                  </h3>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                    {isEditSkuModalOpen ? 'Perbarui data spesifikasi dan relasi katalog produk' : 'Daftarkan SKU baru ke master katalog brand'}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => { setIsCreateSkuModalOpen(false); setIsEditSkuModalOpen(false); }} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 text-xs sm:text-sm">
              {/* Brand Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Brand / Merk Pemilik SKU <span className="text-rose-500">*</span>
                </label>
                <select
                  value={skuForm.brandId}
                  onChange={(e) => {
                    const bId = e.target.value;
                    const b = brands.find(brand => brand.id === bId);
                    setSkuForm(prev => ({
                      ...prev,
                      brandId: bId,
                      brandName: b ? b.name : prev.brandName,
                      category: b?.category || prev.category,
                    }));
                  }}
                  className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-[#c28e62] cursor-pointer"
                >
                  {brands.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} — ({b.category})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-1">
                  SKU akan terhubung langsung dengan profil dan izin kepemilikan brand ini.
                </p>
              </div>

              {/* SKU Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Nama SKU Produk <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pintu Cubicle Toilet, Dew Drops, dll."
                  value={skuForm.sku}
                  onChange={(e) => setSkuForm(prev => ({ ...prev, sku: e.target.value }))}
                  className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
              </div>

              {/* SKU Code Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Kode SKU <span className="text-slate-400 font-normal">(Contoh: SMS-CUB-01, ASC-TOP-01)</span>
                </label>
                <input
                  type="text"
                  placeholder="Kode identifikasi barang unik (otomatis jika kosong)"
                  value={skuForm.skuCode}
                  onChange={(e) => setSkuForm(prev => ({ ...prev, skuCode: e.target.value.toUpperCase() }))}
                  className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] font-mono uppercase"
                />
              </div>

              {/* Category Input (Terkoneksi dengan Database Kategori - Mendukung Hirarki 3 Layer) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
                  <span>Kategori Produk</span>
                  <span className="text-[11px] font-normal text-slate-400">Format 3 layer didukung</span>
                </label>
                <input
                  type="text"
                  list="category-suggestions"
                  placeholder="Contoh: Material &amp; Konstruksi &gt; Partisi Cubicle Toilet &gt; Phenolic Board 12mm Standard"
                  value={skuForm.category}
                  onChange={(e) => setSkuForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-5 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-full text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62]"
                />
                <datalist id="category-suggestions">
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
                      <option value="Material & Konstruksi > Wall Cladding & Plafon > Exterior Architectural Cladding" />
                      <option value="Pakaian & Fashion > Atasan & T-Shirt > Oversized Boxy Cut Tee" />
                      <option value="Pakaian & Fashion > Outerwear & Jaket > Heavyweight Fleece Hoodie" />
                      <option value="Aksesoris & Merchandise > Topi & Headwear > 6-Panel Curved Dad Cap" />
                      <option value="Aksesoris & Merchandise > Tas & Pouch > Utility Cordura Sling Bag" />
                    </>
                  )}
                </datalist>
              </div>

              {/* Description Textarea */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Deskripsi &amp; Spesifikasi Produk
                </label>
                <textarea
                  rows={3}
                  placeholder="Tuliskan spesifikasi produk, dimensi, ketahanan, atau catatan registrasi..."
                  value={skuForm.description}
                  onChange={(e) => setSkuForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-5 py-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-slate-700 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-500 focus:outline-none focus:border-[#c28e62] resize-none"
                />
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-zinc-850 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-end gap-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setIsCreateSkuModalOpen(false); setIsEditSkuModalOpen(false); }}
                className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-200/60 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={isEditSkuModalOpen ? handleUpdateSku : handleCreateSku}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-[#c28e62] hover:bg-[#b07d53] text-white transition-colors cursor-pointer flex items-center justify-center"
              >
                <span>{isEditSkuModalOpen ? 'Perbarui SKU' : 'Simpan SKU'}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ============================================================== */}
      {/* MODAL DETAIL SKU PRODUK (RELATIONAL VIEW) */}
      {/* ============================================================== */}
      {isDetailSkuModalOpen && skuToView && createPortal(
        <div 
          onClick={(e) => { 
            if (e.target === e.currentTarget) { 
              setIsDetailSkuModalOpen(false); 
              setSkuToView(null); 
            } 
          }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200">
            {/* DETAIL HEADER */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-800/80 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold">
                  <Box size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-sm sm:text-base">
                      {skuToView.sku}
                    </h3>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-slate-200 dark:bg-zinc-700 text-slate-700 dark:text-zinc-200 font-bold">
                      {skuToView.skuCode || `SKU-${skuToView.id.toUpperCase()}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                    Master Katalog Produk &amp; Riwayat Tag Fisik
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => { setIsDetailSkuModalOpen(false); setSkuToView(null); }} 
                data-tooltip="Tutup" data-tooltip-shortcut="Esc" data-tooltip-pos="bottom" 
                className="text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-200 p-1.5 rounded-full hover:bg-slate-200/70 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* DETAIL CONTENT BODY */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs sm:text-sm">
              {/* RELATIONAL GRID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Brand Info Card */}
                {(() => {
                  const bObj = brands.find(b => b.id === skuToView.brandId || b.name.toLowerCase() === skuToView.brandName.toLowerCase());
                  return (
                    <div className="bg-slate-50 dark:bg-zinc-800/70 p-4 rounded-2xl border border-slate-200/70 dark:border-zinc-700/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider block mb-2">
                        Brand Pemilik
                      </span>
                      <div className="flex items-center gap-3">
                        {bObj?.logo ? (
                          <img
                            src={bObj.logo}
                            alt={skuToView.brandName}
                            onError={(e) => {
                              const el = e.currentTarget;
                              el.onerror = null;
                              el.src = getBrandInitialsLogo(skuToView.brandName);
                            }}
                            className="w-10 h-10 rounded-xl object-contain bg-white dark:bg-zinc-800 p-1 border border-slate-200 dark:border-zinc-700 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-[#c28e62]/20 text-[#c28e62] flex items-center justify-center font-bold text-sm shrink-0">
                            {skuToView.brandName.slice(0, 1)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-800 dark:text-zinc-100 text-sm truncate">
                            {skuToView.brandName}
                          </h4>
                          <p className="text-[11px] text-slate-400 dark:text-zinc-500 truncate">
                            {bObj?.ownerName ? `PIC: ${bObj.ownerName}` : 'Brand Terverifikasi'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Production & Category Card */}
                {(() => {
                  const linkedBatches = getSkuBatches(skuToView.sku, skuToView.brandName);
                  const totalProducedTags = linkedBatches.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);
                  return (
                    <div className="bg-slate-50 dark:bg-zinc-800/70 p-4 rounded-2xl border border-slate-200/70 dark:border-zinc-700/60">
                      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider block mb-2">
                        Kategori &amp; Ringkasan Produksi
                      </span>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-zinc-400 text-xs">Kategori:</span>
                          <span className="font-semibold text-slate-700 dark:text-zinc-200 text-xs truncate max-w-[170px]">
                            {skuToView.category || 'Umum'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-zinc-400 text-xs">Tag Fisik Tercetak:</span>
                          <span className="font-mono font-bold text-[#c28e62] text-xs">
                            {totalProducedTags.toLocaleString('id-ID')} Tag ({linkedBatches.length} Batch)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Description Box */}
              <div className="bg-white dark:bg-zinc-800/40 p-4 rounded-2xl border border-slate-200 dark:border-zinc-700/70">
                <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-zinc-500 tracking-wider block mb-1">
                  Deskripsi &amp; Catatan Produk
                </span>
                <p className="text-slate-700 dark:text-zinc-300 leading-relaxed text-xs">
                  {skuToView.description || 'Tidak ada deskripsi tambahan untuk produk ini dalam katalog master.'}
                </p>
              </div>

              {/* LINKED PRODUCTION BATCHES */}
              {(() => {
                const linkedBatches = getSkuBatches(skuToView.sku, skuToView.brandName);
                const totalProducedTags = linkedBatches.reduce((acc, b) => acc + (Number(b.qty) || 0), 0);

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 dark:text-zinc-100 text-xs sm:text-sm">
                          Riwayat Batch &amp; Tag Fisik Terhubung
                        </h4>
                      </div>
                      <span className="text-xs font-semibold text-[#c28e62] font-mono">
                        {linkedBatches.length} Batch • {totalProducedTags.toLocaleString('id-ID')} Tag
                      </span>
                    </div>

                    {linkedBatches.length > 0 ? (
                      <div className="border border-slate-200 dark:border-zinc-700/80 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-zinc-800">
                        {linkedBatches.map(b => (
                          <div 
                            key={b.id}
                            className="p-3 sm:p-3.5 bg-slate-50/50 dark:bg-zinc-800/30 flex items-center justify-between gap-3 hover:bg-slate-100/60 dark:hover:bg-zinc-800/60 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-800 dark:text-zinc-100 font-mono">
                                  {b.batchId}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                  b.status === 'Disuspend' 
                                    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' 
                                    : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'
                                }`}>
                                  {b.status || 'Aktif'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">
                                Rilis: {b.date} • PIN {b.pinLength} Digit • Format {b.qrType || 'dynamic'}
                              </p>
                            </div>

                            <div className="flex items-center gap-3 shrink-0">
                              <div className="text-right">
                                <span className="text-xs font-bold text-slate-700 dark:text-zinc-200 font-mono block">
                                  {Number(b.qty).toLocaleString('id-ID')} Tag
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsDetailSkuModalOpen(false);
                                  setSkuToView(null);
                                  setActiveBatch(b);
                                  setActiveMenu('tag-qr');
                                  openDetailModal(b);
                                }}
                                className="px-3 py-1.5 rounded-full bg-[#c28e62]/10 hover:bg-[#c28e62]/20 text-[#c28e62] text-xs font-semibold transition-colors cursor-pointer"
                              >
                                Buka Tag →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-700 text-center text-slate-400 dark:text-zinc-500 text-xs">
                        Belum ada batch produksi yang didaftarkan menggunakan SKU ini.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* DETAIL FOOTER */}
            <div className="px-5 sm:px-6 py-3.5 bg-slate-50 dark:bg-zinc-850 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between flex-shrink-0">
              <span className="text-[11px] text-slate-400 dark:text-zinc-500">
                Terdaftar: {skuToView.createdAt ? formatDateTimeDisplay(skuToView.createdAt) : 'Katalog Master Sumas'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const toEdit = skuToView;
                    setIsDetailSkuModalOpen(false);
                    setSkuToView(null);
                    handleOpenEditSku(toEdit);
                  }}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-[#c28e62] hover:bg-[#b07d53] text-white transition-colors cursor-pointer flex items-center justify-center"
                >
                  <span>Edit SKU Ini</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setIsDetailSkuModalOpen(false); setSkuToView(null); }}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-slate-200/70 dark:bg-zinc-750 text-slate-700 dark:text-zinc-300 hover:bg-slate-300/70 transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ============================================================== */}
      {/* MODAL KONFIRMASI HAPUS SKU */}
      {/* ============================================================== */}
      {isDeleteSkuModalOpen && skuToDelete && createPortal(
        <div 
          onClick={(e) => { 
            if (e.target === e.currentTarget) { 
              setIsDeleteSkuModalOpen(false); 
              setSkuToDelete(null); 
            } 
          }}
          className="fixed inset-0 bg-black/60 z-[10005] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-md overflow-hidden border border-slate-200/90 dark:border-zinc-700/80 animate-in zoom-in-95 duration-200 p-5 sm:p-6 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
              <Trash2 size={24} />
            </div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base mb-1">
              Hapus SKU Produk?
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mb-4">
              Anda akan menghapus SKU <span className="font-semibold text-slate-700 dark:text-zinc-200">"{skuToDelete.sku}"</span> ({skuToDelete.brandName}) dari master katalog.
            </p>

            {(() => {
              const linkedBatches = getSkuBatches(skuToDelete.sku, skuToDelete.brandName);
              if (linkedBatches.length > 0) {
                return (
                  <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3 text-left mb-4 text-xs text-amber-800 dark:text-amber-300">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={14} /> Perhatian Relasi Data
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      SKU ini memiliki <span className="font-bold">{linkedBatches.length} batch produksi</span> yang terhubung di sistem. Menghapus SKU akan memutus tautan katalog master namun data fisik batch tetap tersimpan di arsip log.
                    </p>
                  </div>
                );
              }
              return null;
            })()}

            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => { setIsDeleteSkuModalOpen(false); setSkuToDelete(null); }}
                className="px-5 py-2.5 rounded-full text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSku}
                className="px-5 py-2.5 rounded-full text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
              >
                Ya, Hapus SKU
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL KONFIRMASI TINGGALKAN HALAMAN SKU (MODERN, CLEAN, SINGKAT & PADAT) */}
      {showSkuLeaveModal && createPortal(
        <div 
          className="fixed inset-0 z-[10006] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            setShowSkuLeaveModal(false);
            setPendingSkuLeaveNav(null);
          }}
        >
          <div 
            className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-7 max-w-sm w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-800 dark:text-zinc-100">
                Tinggalkan Halaman?
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Perubahan yang belum disimpan akan hilang.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowSkuLeaveModal(false);
                  setPendingSkuLeaveNav(null);
                }}
                className="flex-1 py-2.5 rounded-full border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                Lanjut Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSkuLeaveModal(false);
                  setIsSkuFormDirty(false);
                  if (pendingSkuLeaveNav) {
                    const nav = pendingSkuLeaveNav;
                    setPendingSkuLeaveNav(null);
                    nav();
                  } else {
                    setSkuSubView('list');
                  }
                }}
                className="flex-1 py-2.5 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Tinggalkan
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* BLUEPRINT STANDARD: FLOATING ALERT NOTIFICATION TOASTS (TOP-RIGHT CORNER) */}
      {alerts.length > 0 && createPortal(
        <div 
          aria-live="polite"
          aria-atomic="true"
          className="fixed top-5 right-5 z-[100100] flex flex-col gap-2.5 max-w-[380px] w-[calc(100vw-2.5rem)] pointer-events-none"
        >
          {alerts.map((alert) => {
            const isSuccess = alert.type === 'success';
            const isWarning = alert.type === 'warning';
            const isError = alert.type === 'error';
            // Default to info

            return (
              <div
                key={alert.id}
                role="alert"
                className="pointer-events-auto w-full bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-zinc-800 dark: p-3.5 sm:p-4 flex items-start gap-3 transition-all duration-300 animate-in fade-in slide-in-from-top-3"
              >
                {/* ICON INDICATOR */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  isSuccess 
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                    : isWarning
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      : isError
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                        : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                }`}>
                  {isSuccess ? (
                    <CheckCircle2 size={17} className="stroke-[2.2]" />
                  ) : isWarning ? (
                    <AlertTriangle size={17} className="stroke-[2.2]" />
                  ) : isError ? (
                    <Ban size={17} className="stroke-[2.2]" />
                  ) : (
                    <Info size={17} className="stroke-[2.2]" />
                  )}
                </div>

                {/* CONTENT TEXT */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="text-xs sm:text-[13px] font-bold text-slate-800 dark:text-zinc-100 tracking-tight leading-snug">
                    {alert.title}
                  </div>
                  <div className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-0.5 leading-relaxed break-words font-normal">
                    {alert.message}
                  </div>
                </div>

                {/* DISMISS BUTTON */}
                <button
                  type="button"
                  onClick={() => dismissAlert(alert.id)}
                  aria-label="Tutup notifikasi"
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 p-1 -mr-1 -mt-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
