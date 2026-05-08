'use client';

import { useState } from 'react';

export default function ElectionControl() {
  const [electionData, setElectionData] = useState({
    title: 'Student Council Election 2025',
    status: 'active',
    startTime: '2025-05-08T09:00',
    endTime: '2025-05-08T18:00',
  });

  return (
    <div className="space-y-6">
      {/* Current Election Status */}
      <div className="glass-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-surface-100">{electionData.title}</h2>
            <p className="text-sm text-surface-400">Current election status and controls</p>
          </div>
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-500/10 text-green-400 border border-green-500/20 animate-pulse-soft">
            ● {electionData.status.toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label htmlFor="election-start" className="block text-sm font-medium text-surface-300 mb-2">Start Time</label>
            <input
              id="election-start"
              type="datetime-local"
              value={electionData.startTime}
              onChange={(e) => setElectionData({ ...electionData, startTime: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label htmlFor="election-end" className="block text-sm font-medium text-surface-300 mb-2">End Time</label>
            <input
              id="election-end"
              type="datetime-local"
              value={electionData.endTime}
              onChange={(e) => setElectionData({ ...electionData, endTime: e.target.value })}
              className="input-field"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button className="px-6 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 transition-all">
            🛑 Stop Election
          </button>
          <button className="btn-secondary">
            ⏸️ Pause Election
          </button>
          <button className="btn-primary">
            💾 Save Changes
          </button>
        </div>
      </div>

      {/* Create New Election */}
      <div className="glass-card">
        <h3 className="text-lg font-semibold text-surface-100 mb-4">Create New Election</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="new-election-title" className="block text-sm font-medium text-surface-300 mb-2">Election Title</label>
            <input id="new-election-title" type="text" className="input-field" placeholder="e.g., Student Council Election 2025" />
          </div>
          <div>
            <label htmlFor="new-election-desc" className="block text-sm font-medium text-surface-300 mb-2">Description</label>
            <textarea id="new-election-desc" className="input-field min-h-[100px]" placeholder="Election description..." />
          </div>
          <button className="btn-primary">Create Election</button>
        </div>
      </div>
    </div>
  );
}
