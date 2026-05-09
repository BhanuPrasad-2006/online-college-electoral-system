'use client';

import { useState, useEffect } from 'react';

interface PositionResult {
  position: string;
  candidates: { id: string; name: string; votes: number; percentage: number }[];
  totalVotes: number;
  winner: string;
}

export default function AdminResultsPage() {
  const [results, setResults] = useState<PositionResult[]>([]);
  const [resultHash, setResultHash] = useState('');
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  useEffect(() => {
    // TODO: Fetch results from result_service API
    setResults([
      {
        position: 'President',
        totalVotes: 450,
        winner: 'Rahul Sharma',
        candidates: [
          { id: '1', name: 'Rahul Sharma', votes: 280, percentage: 62.2 },
          { id: '2', name: 'Sneha Gupta', votes: 170, percentage: 37.8 },
        ],
      },
      {
        position: 'Vice President',
        totalVotes: 430,
        winner: 'Priya Patel',
        candidates: [
          { id: '3', name: 'Priya Patel', votes: 250, percentage: 58.1 },
          { id: '4', name: 'Vikram Singh', votes: 180, percentage: 41.9 },
        ],
      },
    ]);
    setResultHash('a3f2b9c1e8d7...4f6a');
  }, []);

  const handleVerifyHash = () => {
    // TODO: Call generate_result_hash SQL function via API
    setIsVerified(true);
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold gradient-text mb-2">Election Results</h1>
        <p className="text-surface-400">Final results with integrity verification</p>
      </div>

      {/* Result Hash Verification */}
      <div className="glass-card mb-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-surface-400">Result Hash</p>
            <p className="text-sm font-mono text-surface-300 mt-1">{resultHash}</p>
          </div>
          <div className="flex items-center gap-3">
            {isVerified !== null && (
              <span className={`text-sm font-medium ${isVerified ? 'text-green-400' : 'text-red-400'}`}>
                {isVerified ? '✓ Integrity Verified' : '✗ Hash Mismatch'}
              </span>
            )}
            <button onClick={handleVerifyHash} className="btn-primary text-sm px-4 py-2" id="verify-hash-btn">
              Verify Integrity
            </button>
          </div>
        </div>
      </div>

      {/* Results by Position */}
      <div className="space-y-6">
        {results.map((pos) => (
          <div key={pos.position} className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-surface-100">{pos.position}</h2>
              <span className="text-sm text-surface-400">{pos.totalVotes} total votes</span>
            </div>
            <div className="space-y-3">
              {pos.candidates.map((c, i) => (
                <div key={c.id} className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className={`text-sm font-medium ${i === 0 ? 'text-primary-400' : 'text-surface-300'}`}>
                        {c.name} {i === 0 && '👑'}
                      </span>
                      <span className="text-sm text-surface-400">{c.votes} ({c.percentage}%)</span>
                    </div>
                    <div className="h-2 bg-surface-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${i === 0 ? 'bg-primary-500' : 'bg-surface-600'}`}
                        style={{ width: `${c.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
