import { useEffect, useId, useState } from 'react';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface StartupLoaderProps {
  onFinish?: () => void;
  durationMs?: number;
}

export function StartupLoader({ onFinish, durationMs = 1850 }: StartupLoaderProps) {
  const { lang } = useI18n();
  const uid = useId().replace(/:/g, '');
  const gradId = `startupGoldGrad-${uid}`;
  const ringGradId = `startupRingGrad-${uid}`;

  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const start = performance.now();
    let frameId: number;

    const tick = (now: number) => {
      const elapsed = now - start;
      // Ease-out cubic curve for smooth, natural progress bar motion
      const rawRatio = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - rawRatio, 2.6);
      setProgress(Math.round(eased * 100));

      if (rawRatio < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        setExiting(true);
        window.setTimeout(() => {
          onFinish?.();
        }, 420);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [durationMs, onFinish]);

  const stepLabel = (() => {
    if (lang === 'sw') {
      if (progress < 30) return 'Inaanzisha Mfumo wa Lucentia...';
      if (progress < 65) return 'Inapakia Stoo, Bidhaa na Manunuzi...';
      if (progress < 92) return 'Inaoanisha Mauzo, Matumizi na Ripoti za Faida...';
      return 'Tayari — Karibu Lucentia Beauty & Salon!';
    }
    if (progress < 30) return 'Initializing Lucentia Executive Portal...';
    if (progress < 65) return 'Loading Inventory, Stock & Supplier Records...';
    if (progress < 92) return 'Syncing Services, Daily Sales & Profit Analytics...';
    return 'Ready — Welcome to Lucentia Beauty & Salon!';
  })();

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between p-6 sm:p-10 sidebar-dotted text-white select-none overflow-hidden transition-all duration-500 ${
        exiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Ambient Royal Purple & Warm Gold Glows */}
      <div className="pointer-events-none absolute -top-28 -left-28 w-80 h-80 rounded-full bg-[#6D28D9]/30 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute -bottom-28 -right-28 w-96 h-96 rounded-full bg-[#D4A24C]/20 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] rounded-full bg-[#7C3AED]/15 blur-3xl" />

      {/* Top Pill Badge */}
      <div className="relative z-10 inline-flex items-center gap-2 rounded-full bg-white/[0.07] border border-white/15 px-4 py-1.5 text-xs font-semibold text-[#FAE29C] shadow-lg">
        <Sparkles size={13} className="text-[#F5D68A]" />
        <span>Lucentia Beauty &amp; Salon Management v1.0</span>
      </div>

      {/* Center Animated Emblem, Title & Progress Bar */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-sm w-full my-auto">
        {/* Emblem Container with Rotating Outer Golden Ring */}
        <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center">
          {/* Soft golden halo */}
          <div className="absolute inset-2 rounded-full bg-gradient-to-tr from-[#6D28D9]/35 to-[#D4A24C]/25 blur-xl" />

          {/* Rotating progress / shimmer ring */}
          <svg viewBox="0 0 120 120" className="absolute inset-0 w-full h-full -rotate-90">
            <defs>
              <linearGradient id={ringGradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#FAE29C" />
                <stop offset="50%" stopColor="#D4A24C" />
                <stop offset="100%" stopColor="#7C3AED" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={`url(#${ringGradId})`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 54}
              strokeDashoffset={2 * Math.PI * 54 * (1 - progress / 100)}
              className="transition-[stroke-dashoffset] duration-150 ease-out"
            />
          </svg>

          {/* Crowned Salon Woman SVG Emblem */}
          <svg
            viewBox="0 0 96 96"
            className="relative w-24 h-24 sm:w-28 sm:h-28 drop-shadow-[0_6px_18px_rgba(212,162,76,0.45)]"
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fae29c" />
                <stop offset="50%" stopColor="#d4a24c" />
                <stop offset="100%" stopColor="#9c6b1c" />
              </linearGradient>
            </defs>
            {/* Crown */}
            <path d="M34 22 L40 13 L48 20 L56 13 L62 22 Z" fill={`url(#${gradId})`} />
            <circle cx="40" cy="11" r="2" fill="#fae29c" />
            <circle cx="48" cy="10" r="2.4" fill="#fae29c" />
            <circle cx="56" cy="11" r="2" fill="#fae29c" />
            {/* Inner golden ring */}
            <circle cx="48" cy="54" r="30" fill="none" stroke={`url(#${gradId})`} strokeWidth="2.4" />
            {/* Stylized salon woman profile & flowing hair */}
            <path
              d="M34 44 C34 33, 52 30, 58 40 C64 50, 59 66, 48 74 C53 65, 54 55, 48 50 C43 46, 39 51, 40 57 C35 53, 34 48, 34 44 Z"
              fill={`url(#${gradId})`}
            />
            <path
              d="M44 37 C52 37, 58 45, 55 56 C53 63, 46 69, 39 72 C45 66, 49 58, 47 51 C45 45, 41 42, 44 37 Z"
              fill="#fae29c"
              opacity="0.88"
            />
          </svg>
        </div>

        {/* Brand Typography */}
        <h1 className="mt-5 font-display text-3xl sm:text-4xl font-bold tracking-[0.22em] bg-gradient-to-r from-[#fae29c] via-[#e2b45a] to-[#c58e2d] bg-clip-text text-transparent">
          LUCENTIA
        </h1>
        <p className="mt-1 text-xs sm:text-sm font-semibold tracking-[0.18em] uppercase text-white/80">
          Beauty &amp; Salon
        </p>
        <p className="mt-1.5 font-display italic text-sm text-[#F5D68A]">
          {lang === 'sw' ? 'Kuza Biashara Yako ya Saluni' : 'Grow Your Salon Business'}
        </p>

        {/* Progress Bar */}
        <div className="w-full mt-8 space-y-2.5">
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#A78BFA] to-[#F5D68A] transition-all duration-150 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-white/75 truncate pr-2">{stepLabel}</span>
            <span className="font-extrabold text-[#FAE29C] shrink-0">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Bottom Security / Footer Badge */}
      <div className="relative z-10 flex items-center gap-2 text-[11px] text-white/55">
        <ShieldCheck size={14} className="text-[#D4A24C]" />
        <span>
          {lang === 'sw'
            ? 'Mfumo Salama wa Usimamizi wa Fedha na Stoo ya Saluni'
            : 'Secure Salon Inventory, Sales & Financial Analytics'}
        </span>
      </div>
    </div>
  );
}

