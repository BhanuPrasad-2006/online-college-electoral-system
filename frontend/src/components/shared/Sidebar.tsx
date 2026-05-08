'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/helpers';

interface SidebarProps {
  role: 'student' | 'candidate' | 'admin';
}

const menuItems = {
  student: [
    { label: 'Dashboard', href: ROUTES.STUDENT.DASHBOARD, icon: '📊' },
    { label: 'Vote', href: ROUTES.STUDENT.VOTE, icon: '🗳️' },
    { label: 'Concerns', href: ROUTES.STUDENT.CONCERNS, icon: '📝' },
    { label: 'Recommendations', href: ROUTES.STUDENT.RECOMMENDATIONS, icon: '🤖' },
    { label: 'Statistics', href: ROUTES.STUDENT.STATISTICS, icon: '📈' },
  ],
  candidate: [
    { label: 'Dashboard', href: ROUTES.CANDIDATE.DASHBOARD, icon: '📊' },
    { label: 'Manifesto', href: ROUTES.CANDIDATE.MANIFESTO, icon: '📄' },
    { label: 'Reports', href: ROUTES.CANDIDATE.REPORTS, icon: '📋' },
    { label: 'Application', href: ROUTES.CANDIDATE.APPLICATION, icon: '📨' },
  ],
  admin: [
    { label: 'Dashboard', href: ROUTES.ADMIN.DASHBOARD, icon: '📊' },
    { label: 'Users', href: ROUTES.ADMIN.USERS, icon: '👥' },
    { label: 'Analytics', href: ROUTES.ADMIN.ANALYTICS, icon: '📈' },
    { label: 'Election Control', href: ROUTES.ADMIN.ELECTION_CONTROL, icon: '⚙️' },
    { label: 'Fraud Alerts', href: ROUTES.ADMIN.FRAUD_ALERTS, icon: '🚨' },
    { label: 'Audit Logs', href: ROUTES.ADMIN.AUDIT_LOGS, icon: '📜' },
  ],
};

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const items = menuItems[role];

  return (
    <aside className="w-64 min-h-screen border-r border-surface-800 bg-surface-950/50 backdrop-blur-xl p-6">
      {/* Brand */}
      <Link href="/" className="flex items-center gap-2 mb-10">
        <span className="text-2xl">🗳️</span>
        <span className="text-lg font-display font-bold gradient-text">ElectSys</span>
      </Link>

      {/* Role Badge */}
      <div className="mb-6">
        <span className="px-3 py-1 rounded-full text-xs font-medium capitalize bg-primary-500/10 text-primary-300 border border-primary-500/20">
          {role}
        </span>
      </div>

      {/* Navigation */}
      <nav className="space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              pathname === item.href ? 'sidebar-link-active' : 'sidebar-link'
            )}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Logout */}
      <div className="mt-auto pt-8">
        <button className="sidebar-link w-full text-red-400 hover:text-red-300" id="sidebar-logout">
          <span className="text-lg">🚪</span>
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>
    </aside>
  );
}
