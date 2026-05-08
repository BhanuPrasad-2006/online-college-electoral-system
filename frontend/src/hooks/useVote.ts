import { useState } from 'react';
import type { VoteSubmission, VoteReceipt } from '@/types';

export function useVote() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitVote = async (voteData: VoteSubmission) => {
    setIsSubmitting(true);
    setError(null);
    try {
      // TODO: Integrate with vote service
      console.log('Submitting vote:', voteData);
      setReceipt({
        receipt_hash: 'mock-hash-' + Date.now(),
        timestamp: new Date().toISOString(),
        position: voteData.position,
      });
    } catch (err) {
      setError('Failed to submit vote. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return { submitVote, isSubmitting, receipt, error };
}
