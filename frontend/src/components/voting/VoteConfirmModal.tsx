'use client';

import Modal from '@/components/ui/Modal';
import { useState } from 'react';

interface VoteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  candidateName: string;
  position: string;
}

export default function VoteConfirmModal({ isOpen, onClose, onConfirm, candidateName, position }: VoteConfirmModalProps) {
  const [agreed, setAgreed] = useState(false);

  const handleConfirm = () => {
    if (!agreed) return;
    onConfirm();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Your Vote">
      <div className="space-y-6">
        <div className="p-4 rounded-xl bg-surface-900 border border-surface-700">
          <p className="text-sm text-surface-400 mb-1">You are voting for</p>
          <p className="text-lg font-semibold text-surface-100">{candidateName}</p>
          <p className="text-sm text-primary-400 mt-1">Position: {position}</p>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm text-amber-300">
            ⚠️ This action cannot be undone. Once submitted, your vote is final and anonymous.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-surface-600"
            id="vote-confirm-checkbox"
          />
          <span className="text-sm text-surface-300">
            I confirm this is my intended vote and understand it cannot be changed after submission.
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleConfirm} disabled={!agreed} id="vote-confirm-btn">
            Cast Vote
          </button>
        </div>
      </div>
    </Modal>
  );
}
