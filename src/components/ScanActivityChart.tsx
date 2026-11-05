import React, { useState, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { TrendingUp, CheckCircle2 } from 'lucide-react';

interface DataPoint {
  label: string;
  fullDate: string;
  scans: number;
  valid: number;
  topBrand: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data: DataPoint = payload[0].payload;
    return (
      <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/90 rounded-2xl p-3 backdrop-blur-md">
        <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 mb-1 flex items-center justify-between gap-4">
          <span>{data.fullDate}</span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#c28e62]/10 text-[#c28e62] border border-[#c28e62]/20">
            {data.topBrand}
          </span>
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-zinc-400">Total Scan:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {data.scans.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500 dark:text-zinc-400">Validitas PIN:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
              <CheckCircle2 size={12} /> {data.valid.toLocaleString('id-ID')} (99.8%)
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const ScanActivityChart: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '12m'>('7d');
  const [currentData, setCurrentData] = useState<DataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Fetch real scan activity from SQLite backend
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetch(`/api/scans/activity?range=${timeRange}`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setCurrentData(data);
        }
      })
      .catch(err => {
        console.error('Gagal memuat aktivitas scan dari database:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [timeRange]);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700/80 rounded-3xl p-5 sm:p-6 lg:p-7 space-y-4">
      {/* HEADER WITH SIMPLE, CLEAR IMPORTANT INFO (NO EXTRA CARDS) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-3.5 border-b border-slate-100 dark:border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-[#c28e62]/10 text-[#c28e62] flex items-center justify-center font-bold flex-shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 dark:text-zinc-100 text-base sm:text-lg">
              Aktivitas & Tren Scan
            </h3>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
              Statistik verifikasi tag & scan QR produk konsumen di lapangan
            </p>
          </div>
        </div>

        {/* Time Range Selector (7 Hari, 30 Hari, 12 Bulan) */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center p-1 bg-slate-100 dark:bg-zinc-800 rounded-full text-xs font-semibold">
            <button
              onClick={() => setTimeRange('7d')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                timeRange === '7d' 
                  ? 'bg-white dark:bg-zinc-700 text-[#c28e62] dark:text-zinc-100 font-bold' 
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              7 Hari
            </button>
            <button
              onClick={() => setTimeRange('30d')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                timeRange === '30d' 
                  ? 'bg-white dark:bg-zinc-700 text-[#c28e62] dark:text-zinc-100 font-bold' 
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              30 Hari
            </button>
            <button
              onClick={() => setTimeRange('12m')}
              className={`px-3.5 py-1.5 rounded-full transition-all cursor-pointer ${
                timeRange === '12m' 
                  ? 'bg-white dark:bg-zinc-700 text-[#c28e62] dark:text-zinc-100 font-bold' 
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200'
              }`}
            >
              12 Bulan
            </button>
          </div>
        </div>
      </div>

      {/* RECHARTS NATIVE REACT DIAGRAM */}
      <div className="w-full h-64 sm:h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={50}>
          <AreaChart data={currentData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="scanBronzeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c28e62" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#c28e62" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid 
              strokeDasharray="3 3" 
              vertical={false} 
              stroke="currentColor" 
              className="text-slate-100 dark:text-zinc-800/80" 
            />
            <XAxis 
              dataKey="label" 
              tickLine={false} 
              axisLine={false} 
              tick={{ fontSize: 11, fill: '#94a3b8' }} 
              dy={6}
            />
            <YAxis 
              tickLine={false} 
              axisLine={false} 
              tick={{ fontSize: 11, fill: '#94a3b8' }} 
              tickFormatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="scans" 
              stroke="#c28e62" 
              strokeWidth={1.5} 
              fillOpacity={1} 
              fill="url(#scanBronzeGradient)" 
              activeDot={{ r: 4.5, fill: '#c28e62', stroke: '#fff', strokeWidth: 1.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
