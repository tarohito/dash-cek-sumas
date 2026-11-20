import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const message =
      error instanceof Error
        ? error.message
        : 'Terjadi kesalahan rendering yang tidak terduga.';
    return { hasError: true, errorMessage: message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Uncaught UI ErrorBoundary:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleRecover = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-50 dark:bg-zinc-950 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-7 space-y-4 text-center shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                Terjadi Gangguan Tampilan
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                Sistem mengalami kendala saat menampilkan halaman ini. Data di server tetap aman.
              </p>
              {this.state.errorMessage && (
                <p className="text-[11px] font-mono text-rose-600 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 rounded-xl px-3 py-2 mt-2 break-words">
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={this.handleRecover}
                className="w-full sm:w-auto h-10 px-5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 text-xs sm:text-sm font-semibold transition-all cursor-pointer"
              >
                Coba Lanjutkan
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto h-10 px-5 rounded-full bg-[#c28e62] hover:bg-[#b07d53] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw size={14} />
                <span>Muat Ulang Halaman</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
