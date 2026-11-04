import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

interface TooltipData {
  text: string;
  shortcut?: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  x: number;
  y: number;
}

export const CustomTooltipProvider: React.FC = () => {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<any>(null);
  const currentTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('[data-tooltip], [title]') as HTMLElement;
      if (!target) {
        if (currentTargetRef.current) {
          currentTargetRef.current = null;
          setIsVisible(false);
          clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => setTooltip(null), 120);
        }
        return;
      }

      // Hapus & alihkan title bawaan browser agar tooltip jelek default tidak pernah muncul
      if (target.hasAttribute('title')) {
        const titleVal = target.getAttribute('title') || '';
        if (titleVal.trim()) {
          target.setAttribute('data-tooltip', titleVal);
        }
        target.removeAttribute('title');
      }

      if (currentTargetRef.current === target) return;
      currentTargetRef.current = target;

      const text = target.getAttribute('data-tooltip');
      if (!text || !text.trim()) {
        setIsVisible(false);
        return;
      }

      const shortcut = target.getAttribute('data-tooltip-shortcut') || undefined;
      const requestedPos = (target.getAttribute('data-tooltip-pos') || 'auto') as TooltipPosition;

      const rect = target.getBoundingClientRect();
      let finalPos: 'top' | 'bottom' | 'left' | 'right' = 'top';

      if (requestedPos === 'auto') {
        if (rect.top < 45) {
          finalPos = 'bottom';
        } else {
          finalPos = 'top';
        }
      } else {
        finalPos = requestedPos;
      }

      let x = 0;
      let y = 0;

      if (finalPos === 'top') {
        x = rect.left + rect.width / 2;
        y = rect.top - 8;
      } else if (finalPos === 'bottom') {
        x = rect.left + rect.width / 2;
        y = rect.bottom + 8;
      } else if (finalPos === 'left') {
        x = rect.left - 8;
        y = rect.top + rect.height / 2;
      } else if (finalPos === 'right') {
        x = rect.right + 8;
        y = rect.top + rect.height / 2;
      }

      // Menjaga agar posisi x tidak keluar tepi layar kanan/kiri
      const clampedX = Math.max(30, Math.min(x, window.innerWidth - 30));

      clearTimeout(timeoutRef.current);
      setTooltip({
        text,
        shortcut,
        position: finalPos,
        x: clampedX,
        y
      });
      setIsVisible(true);
    };

    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement;
      if (!related || !related.closest('[data-tooltip], [title]')) {
        currentTargetRef.current = null;
        setIsVisible(false);
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setTooltip(null), 120);
      }
    };

    const handleScrollOrClick = () => {
      currentTargetRef.current = null;
      setIsVisible(false);
      clearTimeout(timeoutRef.current);
      setTooltip(null);
    };

    document.addEventListener('mouseover', handleMouseOver, { passive: true });
    document.addEventListener('mouseout', handleMouseOut, { passive: true });
    window.addEventListener('scroll', handleScrollOrClick, { passive: true, capture: true });
    document.addEventListener('click', handleScrollOrClick, { passive: true });

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('scroll', handleScrollOrClick, { capture: true });
      document.removeEventListener('click', handleScrollOrClick);
      clearTimeout(timeoutRef.current);
    };
  }, []);

  if (!tooltip || !tooltip.text) return null;

  let transform = 'translate(-50%, -100%)';
  if (tooltip.position === 'bottom') transform = 'translate(-50%, 0)';
  if (tooltip.position === 'left') transform = 'translate(-100%, -50%)';
  if (tooltip.position === 'right') transform = 'translate(0, -50%)';

  return createPortal(
    <div
      className={`fixed z-[999999] pointer-events-none transition-all duration-150 ease-out select-none ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
        transform
      }}
      role="tooltip"
    >
      <div className="relative bg-slate-900/95 dark:bg-zinc-800/95 text-white dark:text-zinc-100 text-[11px] font-medium px-2.5 py-1.5 rounded-xl border border-slate-700/60 dark:border-zinc-700 backdrop-blur-xs flex items-center gap-1.5 whitespace-nowrap">
        <span>{tooltip.text}</span>
        {tooltip.shortcut && (
          <kbd className="px-1.5 py-0.5 text-[9px] font-mono font-semibold bg-white/20 dark:bg-zinc-700 text-slate-200 dark:text-zinc-200 rounded border border-white/10 uppercase">
            {tooltip.shortcut}
          </kbd>
        )}

        {/* Panah Tooltip Penunjuk */}
        {tooltip.position === 'top' && (
          <div 
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 dark:bg-zinc-800/95 border-b border-r border-slate-700/60 dark:border-zinc-700 rotate-45"
          />
        )}
        {tooltip.position === 'bottom' && (
          <div 
            className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900/95 dark:bg-zinc-800/95 border-t border-l border-slate-700/60 dark:border-zinc-700 rotate-45"
          />
        )}
        {tooltip.position === 'left' && (
          <div 
            className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900/95 dark:bg-zinc-800/95 border-t border-r border-slate-700/60 dark:border-zinc-700 rotate-45"
          />
        )}
        {tooltip.position === 'right' && (
          <div 
            className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-slate-900/95 dark:bg-zinc-800/95 border-b border-l border-slate-700/60 dark:border-zinc-700 rotate-45"
          />
        )}
      </div>
    </div>,
    document.body
  );
};
