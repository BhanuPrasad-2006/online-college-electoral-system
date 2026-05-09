'use client';

import { useState, useEffect } from 'react';
import Badge from '@/components/ui/Badge';

type ApplicationStatus = 'pending' | 'approved' | 'rejected';

interface StatusStep {
  label: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming';
  timestamp?: string;
}

export default function CandidateStatusPage() {
  const [steps, setSteps] = useState<StatusStep[]>([]);
  const [applicationStatus] = useState<ApplicationStatus>('pending');

  useEffect(() => {
    // TODO: Fetch candidate application status from API
    setSteps([
      { label: 'Application Submitted', description: 'Your candidacy application has been received', status: 'completed', timestamp: '2026-05-08T10:00:00Z' },
      { label: 'Document Verification', description: 'Admin is reviewing your eligibility', status: 'current' },
      { label: 'Mobile OTP Verified', description: 'Phone number verified', status: 'upcoming' },
      { label: 'Manifesto Submitted', description: 'Your election manifesto has been submitted', status: 'upcoming' },
      { label: 'Final Approval', description: 'Admin approves your candidacy', status: 'upcoming' },
    ]);
  }, []);

  const cfg = { pending: { label: 'Pending Review', variant: 'warning' as const }, approved: { label: 'Approved', variant: 'success' as const }, rejected: { label: 'Rejected', variant: 'error' as const } };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold gradient-text mb-2">Application Status</h1>
        <p className="text-surface-400">Track your candidacy application progress</p>
      </div>
      <div className="glass-card mb-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-surface-400">Current Status</p>
            <p className="text-xl font-semibold text-surface-100 mt-1">{cfg[applicationStatus].label}</p>
          </div>
          <Badge variant={cfg[applicationStatus].variant}>{cfg[applicationStatus].label}</Badge>
        </div>
      </div>
      <div className="glass-card">
        <h2 className="text-lg font-semibold text-surface-100 mb-6">Application Timeline</h2>
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-4 h-4 rounded-full border-2 ${step.status === 'completed' ? 'bg-green-500 border-green-500' : step.status === 'current' ? 'bg-primary-500 border-primary-500 animate-pulse' : 'bg-surface-800 border-surface-600'}`} />
                {i < steps.length - 1 && <div className={`w-0.5 h-16 ${step.status === 'completed' ? 'bg-green-500' : 'bg-surface-700'}`} />}
              </div>
              <div className="pb-8">
                <p className={`font-medium ${step.status === 'upcoming' ? 'text-surface-500' : 'text-surface-200'}`}>{step.label}</p>
                <p className="text-sm text-surface-400 mt-1">{step.description}</p>
                {step.timestamp && <p className="text-xs text-surface-500 mt-1">{new Date(step.timestamp).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
