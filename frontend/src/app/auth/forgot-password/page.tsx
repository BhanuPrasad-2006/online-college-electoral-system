'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Integrate with auth service
    console.log('Forgot password:', email);
    setIsSubmitted(true);
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">Reset Password</h1>
          <p className="text-surface-400">We&apos;ll send you a verification code</p>
        </div>

        <div className="glass-card">
          {isSubmitted ? (
            <div className="text-center space-y-4">
              <div className="text-5xl">📧</div>
              <h2 className="text-xl font-semibold text-surface-100">Check Your Email</h2>
              <p className="text-surface-400">
                We&apos;ve sent a password reset OTP to <strong className="text-surface-200">{email}</strong>
              </p>
              <Link href={ROUTES.AUTH.VERIFY_OTP} className="btn-primary inline-block">
                Enter OTP
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="forgot-email" className="block text-sm font-medium text-surface-300 mb-2">
                  Email Address
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="your.email@college.edu"
                  required
                />
              </div>

              <button type="submit" className="btn-primary w-full" disabled={isLoading}>
                {isLoading ? 'Sending...' : 'Send Reset Code'}
              </button>

              <p className="text-center text-sm text-surface-400">
                Remember your password?{' '}
                <Link href={ROUTES.AUTH.LOGIN} className="text-primary-400 hover:text-primary-300 font-medium">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
