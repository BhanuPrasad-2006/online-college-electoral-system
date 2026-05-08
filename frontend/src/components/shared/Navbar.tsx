'use client';

import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-40 w-full border-b border-surface-800 bg-surface-950/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href={ROUTES.HOME} className="flex items-center gap-2">
          <span className="text-2xl">🗳️</span>
          <span className="text-lg font-display font-bold gradient-text">ElectSys</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link href={ROUTES.AUTH.LOGIN} className="text-sm text-surface-400 hover:text-surface-200 transition-colors">
            Sign In
          </Link>
          <Link href={ROUTES.AUTH.REGISTER} className="btn-primary text-sm !py-2 !px-4">
            Register
          </Link>
        </div>
      </div>
    </nav>
  );
}
