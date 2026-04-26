"use client";

import { cn } from "@/lib/utils";

export function TradingHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label="TradingHub"
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <defs>
        <linearGradient id="tradinghub-mark-surface" x1="7" y1="4" x2="57" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#202022" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id="tradinghub-mark-heat" x1="16" y1="40" x2="48" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10B981" />
          <stop offset="0.58" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15" fill="url(#tradinghub-mark-surface)" />
      <rect x="3" y="3" width="58" height="58" rx="15" fill="none" stroke="#3F3F46" strokeWidth="3" />
      <path d="M15 44H50" stroke="#3F3F46" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 20V43" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
      <rect x="18" y="27" width="8" height="11" rx="2.5" fill="#10B981" />
      <path d="M33 17V44" stroke="#F8FAFC" strokeWidth="3" strokeLinecap="round" />
      <rect x="29" y="24" width="8" height="15" rx="2.5" fill="#F8FAFC" />
      <path d="M44 18V42" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
      <rect x="40" y="23" width="8" height="10" rx="2.5" fill="#F97316" />
      <polyline points="14 42 25 31 31 35 40 22 50 17" fill="none" stroke="#050505" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 42 25 31 31 35 40 22 50 17" fill="none" stroke="#FAFAFA" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="14 42 25 31 31 35 40 22 50 17" fill="none" stroke="url(#tradinghub-mark-heat)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="48" cy="19" r="3.8" fill="#09090B" stroke="#F97316" strokeWidth="2" />
    </svg>
  );
}
