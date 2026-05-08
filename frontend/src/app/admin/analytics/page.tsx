'use client';

import Sidebar from '@/components/shared/Sidebar';
import AnalyticsChart from '@/components/admin/AnalyticsChart';

export default function AnalyticsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="admin" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Analytics</h1>
          <p className="text-surface-400">Comprehensive election analytics and voter demographics.</p>
        </div>

        <AnalyticsChart />
      </main>
    </div>
  );
}
