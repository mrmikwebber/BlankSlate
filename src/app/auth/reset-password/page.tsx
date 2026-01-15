'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../utils/supabaseClient';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setValidSession(true);
      } else {
        setError('Invalid or expired reset link. Please request a new password reset.');
      }
      setCheckingSession(false);
    };
    
    checkSession();
  }, []);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      // Invalidate all sessions after password change
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) {
        console.error('Error signing out after password change:', signOutError.message);
      }

      setSuccess('Password updated. Please sign in again.');
      setTimeout(() => {
        router.push('/auth');
      }, 1500);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-teal-50 dark:bg-slate-950 text-teal-600 dark:text-teal-400">
        <h1 className="text-3xl font-bold mb-4">BlankSlate</h1>
        <p className="text-lg animate-pulse">Verifying reset link...</p>
      </div>
    );
  }

  if (!validSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-teal-50 dark:bg-slate-950">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-lg shadow-md dark:shadow-2xl max-w-md w-full border border-transparent dark:border-slate-700">
          <h1 className="text-2xl font-bold text-teal-600 dark:text-teal-400 mb-4 text-center">Invalid Reset Link</h1>
          <p className="text-red-500 dark:text-red-400 text-center mb-6">{error}</p>
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-teal-600 dark:bg-teal-700 text-white p-2 rounded hover:bg-teal-500 dark:hover:bg-teal-600 transition"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left Section */}
      <div className="flex flex-col justify-center items-center px-8 py-12 bg-white dark:bg-slate-950">
        <h1 className="text-4xl font-bold text-teal-600 dark:text-teal-400 mb-4 text-center">
          Set New Password
        </h1>
        <p className="text-gray-600 dark:text-slate-400 mb-6 text-center max-w-md">
          Enter your new password below.
        </p>

        <form onSubmit={handlePasswordReset} className="w-full max-w-sm space-y-4">
          <input
            type="password"
            placeholder="New Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500"
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-2 border border-gray-300 dark:border-slate-700 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500"
          />
          {error && (
            <p className="text-red-500 dark:text-red-400 text-sm text-center">{error}</p>
          )}
          {success && (
            <p className="text-green-600 dark:text-green-400 text-sm text-center">{success}</p>
          )}
          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full bg-teal-600 dark:bg-teal-700 text-white p-2 rounded hover:bg-teal-500 dark:hover:bg-teal-600 transition disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-700 dark:text-slate-400">
          Remember your password?{' '}
          <button
            onClick={() => router.push('/auth')}
            className="text-teal-600 dark:text-teal-400 underline hover:text-teal-500 dark:hover:text-teal-300"
            disabled={loading}
          >
            Sign In
          </button>
        </p>
      </div>

      {/* Right Section */}
      <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-teal-500 to-green-400 dark:from-teal-700 dark:to-green-600 text-white p-12">
        <h2 className="text-4xl font-bold mb-4">BlankSlate</h2>
        <p className="text-lg max-w-md text-center">
          A fresh start for your finances. Budget smarter. Plan confidently.
        </p>
      </div>
    </div>
  );
}
