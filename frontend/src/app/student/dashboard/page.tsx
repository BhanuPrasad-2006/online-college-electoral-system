'use client';

import Sidebar from '@/components/shared/Sidebar';
import TimerBanner from '@/components/shared/TimerBanner';

export default function StudentDashboard() {
  const stats = [
    { label: 'Active Elections', value: '1', icon: '🗳️', color: 'from-blue-500 to-cyan-500' },
    { label: 'Concerns Raised', value: '3', icon: '📝', color: 'from-purple-500 to-pink-500' },
    { label: 'Votes Cast', value: '1', icon: '✅', color: 'from-green-500 to-emerald-500' },
    { label: 'Recommendations', value: '5', icon: '🤖', color: 'from-amber-500 to-orange-500' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar role="student" />
      <main className="flex-1 p-8">
        <TimerBanner />

        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Student Dashboard</h1>
          <p className="text-surface-400">Welcome back! Here&apos;s your election overview.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card group hover:scale-[1.02] transition-transform">
              <div className="flex items-center justify-between mb-4">
                <span className="text-3xl">{stat.icon}</span>
                <span className={`text-xs px-2 py-1 rounded-full bg-gradient-to-r ${stat.color} text-white font-medium`}>
                  Live
                </span>
              </div>
              <p className="text-3xl font-bold text-surface-100 mb-1">{stat.value}</p>
              <p className="text-sm text-surface-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="glass-card">
          <h2 className="text-xl font-semibold text-surface-100 mb-4">Recent Activity</h2>
          <div className="space-y-4">
            {[
              { action: 'Vote cast for President position', time: '2 hours ago', type: 'vote' },
              { action: 'Concern submitted: Library Hours', time: '1 day ago', type: 'concern' },
              { action: 'Account verified successfully', time: '3 days ago', type: 'auth' },
            ].map((activity, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-surface-900/50">
                <div className="w-2 h-2 rounded-full bg-primary-500" />
                <div className="flex-1">
                  <p className="text-sm text-surface-200">{activity.action}</p>
                  <p className="text-xs text-surface-500">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
