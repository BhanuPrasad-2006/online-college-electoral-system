'use client';

import Sidebar from '@/components/shared/Sidebar';

export default function StatisticsPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="student" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Election Statistics</h1>
          <p className="text-surface-400">Live election data and participation metrics.</p>
        </div>

        {/* Participation Rate */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[
            { label: 'Total Eligible Voters', value: '2,450', change: '+0%' },
            { label: 'Votes Cast', value: '1,832', change: '+12%' },
            { label: 'Participation Rate', value: '74.8%', change: '+5.2%' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card">
              <p className="text-sm text-surface-400 mb-1">{stat.label}</p>
              <p className="text-3xl font-bold text-surface-100">{stat.value}</p>
              <p className="text-xs text-green-400 mt-1">{stat.change} from last election</p>
            </div>
          ))}
        </div>

        {/* Department Breakdown */}
        <div className="glass-card mb-8">
          <h2 className="text-xl font-semibold text-surface-100 mb-6">Department Participation</h2>
          <div className="space-y-4">
            {[
              { dept: 'Computer Science', total: 450, voted: 380, pct: 84 },
              { dept: 'Electronics', total: 380, voted: 290, pct: 76 },
              { dept: 'Mechanical', total: 420, voted: 310, pct: 74 },
              { dept: 'Civil', total: 350, voted: 245, pct: 70 },
              { dept: 'Electrical', total: 400, voted: 268, pct: 67 },
            ].map((d) => (
              <div key={d.dept} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-300">{d.dept}</span>
                  <span className="text-surface-400">{d.voted}/{d.total} ({d.pct}%)</span>
                </div>
                <div className="w-full h-2 bg-surface-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full gradient-primary" style={{ width: `${d.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Hourly Votes Chart placeholder */}
        <div className="glass-card">
          <h2 className="text-xl font-semibold text-surface-100 mb-4">Votes Over Time</h2>
          <p className="text-surface-500 text-sm">Chart component will render here using Recharts.</p>
          <div className="h-64 flex items-center justify-center text-surface-600">
            📊 Hourly voting trend chart
          </div>
        </div>
      </main>
    </div>
  );
}
