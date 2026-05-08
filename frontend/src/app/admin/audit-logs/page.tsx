'use client';

import { useState } from 'react';
import Sidebar from '@/components/shared/Sidebar';

export default function AuditLogsPage() {
  const [filter, setFilter] = useState('all');

  const logs = [
    { id: '1', action: 'ELECTION_STARTED', actor: 'admin@college.edu', resource: 'Election #1', ip: '192.168.1.10', time: '2025-05-08 10:00:00' },
    { id: '2', action: 'CANDIDATE_APPROVED', actor: 'admin@college.edu', resource: 'User: Ananya S.', ip: '192.168.1.10', time: '2025-05-08 09:45:00' },
    { id: '3', action: 'VOTE_CAST', actor: 'System', resource: 'Vote Hash: abc123...', ip: '10.0.0.5', time: '2025-05-08 10:15:00' },
    { id: '4', action: 'FRAUD_ALERT_CREATED', actor: 'AI Service', resource: 'Alert #3', ip: 'internal', time: '2025-05-08 10:20:00' },
    { id: '5', action: 'USER_REGISTERED', actor: 'System', resource: 'User: Rahul V.', ip: '10.0.0.12', time: '2025-05-08 08:30:00' },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar role="admin" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Audit Logs</h1>
          <p className="text-surface-400">Complete trail of all system actions for transparency.</p>
        </div>

        {/* Filter */}
        <div className="flex gap-4 mb-6">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="input-field max-w-[200px]" id="audit-filter">
            <option value="all">All Actions</option>
            <option value="auth">Authentication</option>
            <option value="vote">Voting</option>
            <option value="admin">Admin Actions</option>
            <option value="fraud">Fraud Alerts</option>
          </select>
        </div>

        {/* Logs */}
        <div className="glass-card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-700">
                <th className="text-left p-4 text-sm font-medium text-surface-400">Action</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Actor</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Resource</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">IP Address</th>
                <th className="text-left p-4 text-sm font-medium text-surface-400">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-surface-800 hover:bg-surface-900/50 transition-colors">
                  <td className="p-4">
                    <span className="px-2 py-1 rounded text-xs font-mono bg-surface-800 text-surface-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-4 text-surface-300 text-sm">{log.actor}</td>
                  <td className="p-4 text-surface-400 text-sm">{log.resource}</td>
                  <td className="p-4 text-surface-500 text-sm font-mono">{log.ip}</td>
                  <td className="p-4 text-surface-500 text-sm">{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
