'use client';

import Modal from '@/components/ui/Modal';

interface JITModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (token: string) => void;
}

export default function JITModal({ isOpen, onClose, onVerify }: JITModalProps) {
  const handleVerify = () => {
    // TODO: Integrate with JIT verification service
    onVerify('jit-token-placeholder');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Just-In-Time Verification">
      <div className="space-y-6">
        <p className="text-surface-400">
          For security, we need to verify your identity one more time before casting your vote.
        </p>

        <div className="p-4 rounded-xl bg-surface-900 border border-surface-700">
          <p className="text-sm text-surface-300 mb-2">Verification Method</p>
          <div className="space-y-2">
            <button className="w-full p-3 rounded-xl border border-surface-700 text-left hover:border-primary-500 transition-colors">
              <p className="text-sm font-medium text-surface-200">📱 OTP via Email</p>
              <p className="text-xs text-surface-500">Send a one-time code to your registered email</p>
            </button>
            <button className="w-full p-3 rounded-xl border border-surface-700 text-left hover:border-primary-500 transition-colors">
              <p className="text-sm font-medium text-surface-200">🔑 TOTP Authenticator</p>
              <p className="text-xs text-surface-500">Use your authenticator app code</p>
            </button>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleVerify}>Verify & Proceed</button>
        </div>
      </div>
    </Modal>
  );
}
