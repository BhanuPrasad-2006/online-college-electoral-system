'use client';

import Sidebar from '@/components/shared/Sidebar';

export default function CandidateDashboard() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="candidate" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Candidate Dashboard</h1>
          <p className="text-surface-400">Manage your campaign and track your progress.</p>
        </div>

        {/* Campaign Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Current Position', value: 'President', icon: '🏆' },
            { label: 'Application Status', value: 'Approved', icon: '✅' },
            { label: 'Manifesto Views', value: '342', icon: '👁️' },
            { label: 'Concern Matches', value: '28', icon: '🎯' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card">
              <span className="text-2xl mb-3 block">{stat.icon}</span>
              <p className="text-2xl font-bold text-surface-100">{stat.value}</p>
              <p className="text-sm text-surface-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Concern Summary */}
        <div className="glass-card">
          <h2 className="text-xl font-semibold text-surface-100 mb-4">Top Student Concerns</h2>
          <div className="space-y-3">
            {[
              { category: 'Academic', count: 45, trend: 'up' },
              { category: 'Infrastructure', count: 32, trend: 'up' },
              { category: 'Campus Life', count: 28, trend: 'down' },
              { category: 'Administration', count: 15, trend: 'stable' },
            ].map((concern) => (
              <div key={concern.category} className="flex items-center justify-between p-3 rounded-xl bg-surface-900/50">
                <span className="text-surface-200">{concern.category}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-surface-400">{concern.count} concerns</span>
                  <span className="text-xs">{concern.trend === 'up' ? '📈' : concern.trend === 'down' ? '📉' : '➡️'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
