'use client';

import { cn } from '@/lib/helpers';

interface VoteStepperProps {
  currentStep: number;
  onStepChange: (step: number) => void;
}

const steps = [
  { label: 'Verify Identity', icon: '🔐' },
  { label: 'Select Candidate', icon: '👤' },
  { label: 'Confirm Vote', icon: '✅' },
  { label: 'Receipt', icon: '🧾' },
];

export default function VoteStepper({ currentStep, onStepChange }: VoteStepperProps) {
  return (
    <div>
      {/* Step Indicators */}
      <div className="flex items-center justify-between mb-12">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center text-xl transition-all',
                  i <= currentStep
                    ? 'gradient-primary text-white shadow-lg shadow-primary-500/30'
                    : 'bg-surface-800 text-surface-500'
                )}
              >
                {step.icon}
              </div>
              <p className={cn('text-xs mt-2', i <= currentStep ? 'text-surface-200' : 'text-surface-600')}>
                {step.label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-4', i < currentStep ? 'gradient-primary' : 'bg-surface-800')} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="glass-card animate-fade-in">
        {currentStep === 0 && (
          <div className="text-center space-y-6">
            <div className="text-5xl">🔐</div>
            <h2 className="text-2xl font-semibold text-surface-100">Identity Verification</h2>
            <p className="text-surface-400">We need to verify your identity before voting.</p>
            <button className="btn-primary" onClick={() => onStepChange(1)}>
              Verify with OTP
            </button>
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold text-surface-100">Select Your Candidate</h2>
            <p className="text-surface-400">Choose a candidate for President position.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['Ananya Sharma', 'Rahul Verma', 'Priya Patel'].map((name) => (
                <button
                  key={name}
                  className="p-4 rounded-xl border border-surface-700 hover:border-primary-500 text-left transition-all hover:bg-primary-500/5"
                  onClick={() => onStepChange(2)}
                >
                  <p className="font-semibold text-surface-200">{name}</p>
                  <p className="text-xs text-surface-500">President Candidate</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="text-center space-y-6">
            <div className="text-5xl">✅</div>
            <h2 className="text-2xl font-semibold text-surface-100">Confirm Your Vote</h2>
            <p className="text-surface-400">You are voting for <strong className="text-surface-200">Ananya Sharma</strong> as President.</p>
            <p className="text-xs text-surface-600">This action cannot be undone.</p>
            <div className="flex gap-4 justify-center">
              <button className="btn-secondary" onClick={() => onStepChange(1)}>Go Back</button>
              <button className="btn-primary" onClick={() => onStepChange(3)}>Confirm Vote</button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="text-center space-y-6">
            <div className="text-5xl">🧾</div>
            <h2 className="text-2xl font-semibold text-surface-100">Vote Submitted!</h2>
            <p className="text-surface-400">Your vote has been recorded securely.</p>
            <div className="p-4 rounded-xl bg-surface-900 border border-surface-700">
              <p className="text-xs text-surface-500 mb-1">Receipt Hash</p>
              <p className="font-mono text-sm text-surface-300 break-all">a7b3c9f2e4d8...hash1234567890</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
