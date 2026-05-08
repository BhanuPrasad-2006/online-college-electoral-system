'use client';

import Sidebar from '@/components/shared/Sidebar';

export default function AdminDashboard() {
  return (
    <div className="flex min-h-screen">
      <Sidebar role="admin" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Admin Dashboard</h1>
          <p className="text-surface-400">System overview and election management.</p>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[
            { label: 'Total Users', value: '2,450', icon: '👥', color: 'text-blue-400' },
            { label: 'Active Elections', value: '1', icon: '🗳️', color: 'text-green-400' },
            { label: 'Fraud Alerts', value: '3', icon: '🚨', color: 'text-red-400' },
            { label: 'Pending Approvals', value: '7', icon: '⏳', color: 'text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="glass-card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{stat.icon}</span>
                <span className={`text-xs font-medium ${stat.color}`}>●</span>
              </div>
              <p className="text-3xl font-bold text-surface-100">{stat.value}</p>
              <p className="text-sm text-surface-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* System Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card">
            <h2 className="text-xl font-semibold text-surface-100 mb-4">System Health</h2>
            <div className="space-y-3">
              {[
                { service: 'Backend API', status: 'Healthy', uptime: '99.9%' },
                { service: 'AI Service', status: 'Healthy', uptime: '99.7%' },
                { service: 'Database', status: 'Healthy', uptime: '100%' },
                { service: 'Redis Cache', status: 'Healthy', uptime: '99.9%' },
              ].map((svc) => (
                <div key={svc.service} className="flex items-center justify-between p-3 rounded-xl bg-surface-900/50">
                  <span className="text-surface-200">{svc.service}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-surface-400">{svc.uptime}</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card">
            <h2 className="text-xl font-semibold text-surface-100 mb-4">Recent Audit Logs</h2>
            <div className="space-y-3">
              {[
                { action: 'Election started', actor: 'Admin', time: '5 min ago' },
                { action: 'Candidate approved: Ananya S.', actor: 'Admin', time: '1 hour ago' },
                { action: 'Fraud alert resolved', actor: 'Admin', time: '2 hours ago' },
                { action: 'User registered: Rahul V.', actor: 'System', time: '3 hours ago' },
              ].map((log, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-surface-900/50">
                  <div className="w-2 h-2 rounded-full bg-primary-500" />
                  <div className="flex-1">
                    <p className="text-sm text-surface-200">{log.action}</p>
                    <p className="text-xs text-surface-500">{log.actor} • {log.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
