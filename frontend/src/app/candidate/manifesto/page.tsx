'use client';

import Sidebar from '@/components/shared/Sidebar';
import ManifestoEditor from '@/components/candidate/ManifestoEditor';

export default function ManifestoPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="candidate" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Manifesto Editor</h1>
          <p className="text-surface-400">Create and edit your campaign manifesto with AI analysis.</p>
        </div>

        <ManifestoEditor />
      </main>
    </div>
  );
}
