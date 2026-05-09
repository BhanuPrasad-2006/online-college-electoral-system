'use client';

import { useState, useEffect } from 'react';
import Badge from '@/components/ui/Badge';
import Table from '@/components/ui/Table';

interface CandidateEntry {
  id: string;
  name: string;
  department: string;
  position: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: string;
}

export default function AdminCandidatesPage() {
  const [candidates, setCandidates] = useState<CandidateEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  useEffect(() => {
    // TODO: Fetch candidates from API
    setCandidates([
      { id: '1', name: 'Rahul Sharma', department: 'CSE', position: 'President', status: 'pending', appliedAt: '2026-05-07T09:00:00Z' },
      { id: '2', name: 'Priya Patel', department: 'ECE', position: 'Vice President', status: 'approved', appliedAt: '2026-05-06T14:30:00Z' },
      { id: '3', name: 'Amit Kumar', department: 'ME', position: 'Secretary', status: 'rejected', appliedAt: '2026-05-05T11:15:00Z' },
    ]);
  }, []);

  const filtered = filter === 'all' ? candidates : candidates.filter((c) => c.status === filter);
  const badgeVariant = { pending: 'warning' as const, approved: 'success' as const, rejected: 'error' as const };

  const handleAction = (id: string, action: 'approved' | 'rejected') => {
    // TODO: Call API to update candidate status
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, status: action } : c)));
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold gradient-text mb-2">Candidate Management</h1>
        <p className="text-surface-400">Review and manage candidate applications</p>
      </div>

      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2 rounded-lg text-sm capitalize transition-colors ${filter === f ? 'bg-primary-600 text-white' : 'bg-surface-800 text-surface-400 hover:bg-surface-700'}`}>
            {f}
          </button>
        ))}
      </div>

      <div className="glass-card overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-surface-700">
              <th className="pb-3 text-sm font-medium text-surface-400">Name</th>
              <th className="pb-3 text-sm font-medium text-surface-400">Department</th>
              <th className="pb-3 text-sm font-medium text-surface-400">Position</th>
              <th className="pb-3 text-sm font-medium text-surface-400">Status</th>
              <th className="pb-3 text-sm font-medium text-surface-400">Applied</th>
              <th className="pb-3 text-sm font-medium text-surface-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-surface-800">
                <td className="py-4 text-surface-200">{c.name}</td>
                <td className="py-4 text-surface-300">{c.department}</td>
                <td className="py-4 text-surface-300">{c.position}</td>
                <td className="py-4"><Badge variant={badgeVariant[c.status]}>{c.status}</Badge></td>
                <td className="py-4 text-surface-400 text-sm">{new Date(c.appliedAt).toLocaleDateString()}</td>
                <td className="py-4">
                  {c.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleAction(c.id, 'approved')} className="px-3 py-1 text-xs rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30">Approve</button>
                      <button onClick={() => handleAction(c.id, 'rejected')} className="px-3 py-1 text-xs rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30">Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
