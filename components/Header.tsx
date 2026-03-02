'use client';

import Link from 'next/link';
import { Logo } from './Logo';

export function Header() {
  return (
    <header className="h-12 flex items-center px-4 border-b border-[#2a2a2a] bg-[#0a0a0a] shrink-0">
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <Logo color="white" size={22} />
        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-[2px] rounded bg-[#f3ff97]/15 text-[#f3ff97]">
          beta
        </span>
      </Link>
    </header>
  );
}
