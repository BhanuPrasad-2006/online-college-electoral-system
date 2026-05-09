'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

export default function VerifyMobileOTPPage() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSendOTP = async () => {
    if (!phone.trim()) return;
    setIsLoading(true);
    // TODO: Integrate with SMS service to send OTP
    console.log('Sending mobile OTP to:', phone);
    setStep('otp');
    setIsLoading(false);
    setResendCooldown(60);
    startCooldown();
  };

  const startCooldown = () => {
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const otpCode = otp.join('');
    // TODO: Integrate with SMS OTP verification service
    console.log('Verify Mobile OTP:', otpCode);
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">
            Verify Mobile Number
          </h1>
          <p className="text-surface-400">
            {step === 'phone'
              ? 'Enter your mobile number for candidate verification'
              : `Enter the 6-digit code sent to ${phone}`}
          </p>
        </div>

        {step === 'phone' ? (
          <div className="glass-card space-y-6">
            <div>
              <label htmlFor="phone-input" className="block text-sm font-medium text-surface-300 mb-2">
                Mobile Number
              </label>
              <input
                id="phone-input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 XXXXX XXXXX"
                className="input-field w-full"
              />
            </div>
            <button
              onClick={handleSendOTP}
              className="btn-primary w-full"
              disabled={!phone.trim() || isLoading}
            >
              {isLoading ? 'Sending...' : 'Send OTP'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="glass-card space-y-8">
            <div className="flex justify-center gap-3" onPaste={handlePaste}>
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
                  id={`mobile-otp-input-${index}`}
                />
              ))}
            </div>

            <button
              type="submit"
              className="btn-primary w-full"
              disabled={isLoading || otp.some((d) => !d)}
            >
              {isLoading ? 'Verifying...' : 'Verify Mobile'}
            </button>

            <div className="text-center space-y-2">
              <button
                type="button"
                className="text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50"
                onClick={() => { handleSendOTP(); }}
                disabled={resendCooldown > 0}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </button>
              <p className="text-sm text-surface-500">
                <button
                  type="button"
                  onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); }}
                  className="text-surface-400 hover:text-surface-300"
                >
                  Change Number
                </button>
              </p>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-surface-500 mt-4">
          <Link href="/candidate/dashboard" className="text-surface-400 hover:text-surface-300">
            Back to Dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
