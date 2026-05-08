'use client';

import Sidebar from '@/components/shared/Sidebar';
import ElectionControl from '@/components/admin/ElectionControl';

export default function ElectionControlPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="admin" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Election Control</h1>
          <p className="text-surface-400">Start, stop, and manage elections.</p>
        </div>

        <ElectionControl />
      </main>
    </div>
  );
}
