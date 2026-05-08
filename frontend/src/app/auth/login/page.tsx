'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: Integrate with auth service
    console.log('Login:', { email, password });
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold gradient-text mb-2">Welcome Back</h1>
          <p className="text-surface-400">Sign in to your election account</p>
        </div>

        <form onSubmit={handleSubmit} className="glass-card space-y-6">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-surface-300 mb-2">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="your.email@college.edu"
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-surface-300 mb-2">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-surface-400">
              <input type="checkbox" className="rounded border-surface-600" />
              Remember me
            </label>
            <Link href={ROUTES.AUTH.FORGOT_PASSWORD} className="text-sm text-primary-400 hover:text-primary-300">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="btn-primary w-full" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-surface-400">
            Don&apos;t have an account?{' '}
            <Link href={ROUTES.AUTH.REGISTER} className="text-primary-400 hover:text-primary-300 font-medium">
              Register here
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
