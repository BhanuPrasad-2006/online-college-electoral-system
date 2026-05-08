'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export default function VerifyOTPPage() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const otpCode = otp.join('');
    // TODO: Integrate with auth service
    console.log('Verify OTP:', otpCode);
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">Verify OTP</h1>
          <p className="text-surface-400">Enter the 6-digit code sent to your email</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-8">
          <div className="flex justify-center gap-3">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => { inputRefs.current[index] = el; }}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 text-center text-2xl font-bold input-field"
                id={`otp-input-${index}`}
              />
            ))}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={isLoading || otp.some((d) => !d)}>
            {isLoading ? 'Verifying...' : 'Verify Code'}
          </button>

          <div className="text-center space-y-2">
            <button type="button" className="text-sm text-primary-400 hover:text-primary-300">
              Resend Code
            </button>
            <p className="text-sm text-surface-500">
              <Link href={ROUTES.AUTH.LOGIN} className="text-surface-400 hover:text-surface-300">
                Back to Login
              </Link>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
