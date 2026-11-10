'use client';

import React from 'react';

export type AccentTheme = 'coral' | 'blue' | 'yellow' | 'pink' | 'sage';

export const THEME_PALETTE: Record<
  AccentTheme,
  {
    name: string;
    bg: string;
    softBg: string;
    accent: string;
    text: string;
  }
> = {
  coral: {
    name: 'Muted Coral',
    bg: '#E86D52',
    softBg: '#FDECE8',
    accent: '#D4573B',
    text: '#FFFFFF',
  },
  yellow: {
    name: 'Buttery Yellow',
    bg: '#F6D97A',
    softBg: '#FDF7E2',
    accent: '#E0BC4B',
    text: '#2A2623',
  },
  blue: {
    name: 'Pastel Sky',
    bg: '#B8D8EB',
    softBg: '#EDF5FA',
    accent: '#7FB3D3',
    text: '#2A2623',
  },
  pink: {
    name: 'Soft Blossom',
    bg: '#F5C4CB',
    softBg: '#FDF0F2',
    accent: '#E09AA4',
    text: '#2A2623',
  },
  sage: {
    name: 'Pressed Sage',
    bg: '#C5DFC9',
    softBg: '#EFF7F0',
    accent: '#8FBC96',
    text: '#2A2623',
  },
};

interface PaperButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'coral' | 'ivory' | 'yellow' | 'blue' | 'pink' | 'sage' | 'charcoal' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function PaperButton({
  variant = 'ivory',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}: PaperButtonProps) {
  const variantClasses: Record<NonNullable<PaperButtonProps['variant']>, string> = {
    coral:
      'bg-[#E86D52] text-white border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] hover:bg-[#df6044]',
    ivory:
      'bg-[#FFFDF9] text-[#2A2623] border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] hover:bg-[#F5EFE6]',
    yellow:
      'bg-[#F6D97A] text-[#2A2623] border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] hover:bg-[#f2d063]',
    blue:
      'bg-[#B8D8EB] text-[#2A2623] border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] hover:bg-[#a6cce3]',
    pink:
      'bg-[#F5C4CB] text-[#2A2623] border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] hover:bg-[#efb3bc]',
    sage:
      'bg-[#C5DFC9] text-[#2A2623] border-2 border-[#2A2623] shadow-[3px_3px_0px_#2A2623] hover:bg-[#b3d4b8]',
    charcoal:
      'bg-[#2A2623] text-[#FAF6F0] border-2 border-[#2A2623] shadow-[3px_3px_0px_#E86D52] hover:bg-[#3b3632]',
    ghost:
      'bg-transparent text-[#2A2623] border-2 border-transparent hover:border-[#2A2623]/20 hover:bg-[#F2ECE1]',
  };

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3 text-base rounded-2xl gap-2.5',
  };

  const interactiveClasses =
    variant === 'ghost'
      ? 'transition-colors duration-150'
      : 'transition-all duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_#2A2623]';

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center font-semibold whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A2623] disabled:opacity-50 disabled:pointer-events-none ${variantClasses[variant]} ${sizeClasses[size]} ${interactiveClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function SketchUnderline({
  color = '#E86D52',
  className = 'w-full h-2.5',
}: {
  color?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 220 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d="M3 8.5C48 2.5 96 10.5 145 4.5C175 1.8 198 6.8 217 4.2"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SketchNotebookGraphic({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="18" y="14" width="48" height="56" rx="8" fill="#2A2623" />
      <rect
        x="14"
        y="10"
        width="48"
        height="56"
        rx="8"
        fill="#FFFDF9"
        stroke="#2A2623"
        strokeWidth="2.5"
      />
      <path
        d="M14 18C14 13.5817 17.5817 10 22 10H54C58.4183 10 62 13.5817 62 18V23H14V18Z"
        fill="#E86D52"
        stroke="#2A2623"
        strokeWidth="2.5"
      />
      <path
        d="M10 22H18M10 34H18M10 46H18M10 58H18"
        stroke="#2A2623"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect
        x="22"
        y="31"
        width="8"
        height="8"
        rx="2"
        fill="#F6D97A"
        stroke="#2A2623"
        strokeWidth="2"
      />
      <path
        d="M35 35H52M22 47H52M22 55H42"
        stroke="#2A2623"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SketchStampBadge({ className = 'w-20 h-20' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 88"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="46" cy="46" r="34" fill="#2A2623" />
      <circle
        cx="42"
        cy="42"
        r="34"
        fill="#F6D97A"
        stroke="#2A2623"
        strokeWidth="2.5"
      />
      <circle
        cx="42"
        cy="42"
        r="27"
        fill="#FFFDF9"
        stroke="#2A2623"
        strokeWidth="2"
        strokeDasharray="4 4"
      />
      <path
        d="M31 43L38.5 50.5L54 34"
        stroke="#E86D52"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SketchEmptyFolderGraphic({ className = 'w-24 h-24' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 110 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="18" y="26" width="78" height="54" rx="10" fill="#2A2623" />
      <path
        d="M14 28C14 22.4772 18.4772 18 24 18H42L49 26H82C87.5228 26 92 30.4772 92 36V66C92 71.5228 87.5228 76 82 76H24C18.4772 76 14 71.5228 14 66V28Z"
        fill="#B8D8EB"
        stroke="#2A2623"
        strokeWidth="2.5"
      />
      <rect
        x="26"
        y="34"
        width="54"
        height="34"
        rx="6"
        fill="#FFFDF9"
        stroke="#2A2623"
        strokeWidth="2"
      />
      <path
        d="M36 46H70M36 55H56"
        stroke="#2A2623"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle
        cx="84"
        cy="22"
        r="9"
        fill="#F6D97A"
        stroke="#2A2623"
        strokeWidth="2"
      />
    </svg>
  );
}
