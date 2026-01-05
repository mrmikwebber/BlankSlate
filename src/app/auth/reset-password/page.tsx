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
      <div className="min-h-screen flex flex-col items-center justify-center bg-teal-50 text-teal-600">
        <h1 className="text-3xl font-bold mb-4">BlankSlate</h1>
        <p className="text-lg animate-pulse">Verifying reset link...</p>
      </div>
    );
  }

  if (!validSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-teal-50">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <h1 className="text-2xl font-bold text-teal-600 mb-4 text-center">Invalid Reset Link</h1>
          <p className="text-red-500 text-center mb-6">{error}</p>
          <button
            onClick={() => router.push('/auth')}
            className="w-full bg-teal-600 text-white p-2 rounded hover:bg-teal-500 transition"
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
      <div className="flex flex-col justify-center items-center px-8 py-12 bg-white">
        <h1 className="text-4xl font-bold text-teal-600 mb-4 text-center">
          Set New Password
        </h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">
          Enter your new password below.
        </p>

        <form onSubmit={handlePasswordReset} className="w-full max-w-sm space-y-4">
          <input
            type="password"
            placeholder="New Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 border rounded"
          />
          <input
            type="password"
            placeholder="Confirm New Password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full p-2 border rounded"
          />
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}
          {success && (
            <p className="text-green-600 text-sm text-center">{success}</p>
          )}
          <button
            type="submit"
            disabled={loading || !!success}
            className="w-full bg-teal-600 text-white p-2 rounded hover:bg-teal-500 transition disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-700">
          Remember your password?{' '}
          <button
            onClick={() => router.push('/auth')}
            className="text-teal-600 underline"
            disabled={loading}
          >
            Sign In
          </button>
        </p>
      </div>

      {/* Right Section */}
      <div className="hidden md:flex flex-col justify-center items-center bg-gradient-to-br from-teal-500 to-green-400 text-white p-12">
        <h2 className="text-4xl font-bold mb-4">BlankSlate</h2>
        <p className="text-lg max-w-md text-center">
          A fresh start for your finances. Budget smarter. Plan confidently.
        </p>
      </div>
    </div>
  );
}
