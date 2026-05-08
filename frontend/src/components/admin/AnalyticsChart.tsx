'use client';

export default function AnalyticsChart() {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card">
          <p className="text-sm text-surface-400 mb-1">Voter Turnout</p>
          <p className="text-3xl font-bold gradient-text">74.8%</p>
          <p className="text-xs text-green-400 mt-1">↑ 5.2% vs last election</p>
        </div>
        <div className="glass-card">
          <p className="text-sm text-surface-400 mb-1">Total Votes</p>
          <p className="text-3xl font-bold text-surface-100">1,832</p>
          <p className="text-xs text-surface-500 mt-1">of 2,450 eligible</p>
        </div>
        <div className="glass-card">
          <p className="text-sm text-surface-400 mb-1">Avg. Voting Time</p>
          <p className="text-3xl font-bold text-surface-100">2.4m</p>
          <p className="text-xs text-surface-500 mt-1">per voter session</p>
        </div>
      </div>

      {/* Chart Placeholder */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-surface-100 mb-4">Voting Trends</h3>
        <div className="h-80 flex items-center justify-center text-surface-600 border border-dashed border-surface-700 rounded-xl">
          📊 Recharts analytics visualization will render here
        </div>
      </div>

      {/* Department Stats */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-surface-100 mb-4">Department Breakdown</h3>
        <div className="space-y-3">
          {[
            { dept: 'Computer Science', pct: 84 },
            { dept: 'Electronics', pct: 76 },
            { dept: 'Mechanical', pct: 74 },
            { dept: 'Civil', pct: 70 },
            { dept: 'Electrical', pct: 67 },
          ].map((d) => (
            <div key={d.dept} className="flex items-center gap-4">
              <span className="text-sm text-surface-300 w-40">{d.dept}</span>
              <div className="flex-1 h-3 bg-surface-800 rounded-full overflow-hidden">
                <div className="h-full gradient-primary rounded-full transition-all" style={{ width: `${d.pct}%` }} />
              </div>
              <span className="text-sm font-mono text-surface-400 w-12 text-right">{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
