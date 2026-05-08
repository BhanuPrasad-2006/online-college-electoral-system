'use client';

import Sidebar from '@/components/shared/Sidebar';
import ConcernForm from '@/components/concerns/ConcernForm';
import ConcernList from '@/components/concerns/ConcernList';

export default function ConcernsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="student" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Student Concerns</h1>
          <p className="text-surface-400">Raise your concerns and help improve the campus.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <ConcernForm />
          </div>
          <div className="lg:col-span-2">
            <ConcernList />
          </div>
        </div>
      </main>
    </div>
  );
}
