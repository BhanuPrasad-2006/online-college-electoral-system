'use client';

import Sidebar from '@/components/shared/Sidebar';
import ConcernReport from '@/components/candidate/ConcernReport';

export default function ReportsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="candidate" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Concern Reports</h1>
          <p className="text-surface-400">View aggregated student concerns by category and sentiment.</p>
        </div>

        <ConcernReport />
      </main>
    </div>
  );
}
