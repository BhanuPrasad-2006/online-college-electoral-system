'use client';

import { useState } from 'react';
import Sidebar from '@/components/shared/Sidebar';
import VoteStepper from '@/components/voting/VoteStepper';

export default function VotePage() {
  const [currentStep, setCurrentStep] = useState(0);

  return (
    <div className="flex min-h-screen">
      <Sidebar role="student" />
      <main className="flex-1 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-surface-100 mb-2">Cast Your Vote</h1>
          <p className="text-surface-400">Follow the steps below to cast your vote securely.</p>
        </div>

        <VoteStepper currentStep={currentStep} onStepChange={setCurrentStep} />
      </main>
    </div>
  );
}
