'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../utils/supabaseClient';

export default function AuthPage() {
  const [isSignUp, setIsSignup] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      } else {
        setCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Check your email for a password reset link.");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
  
    if (!email || !password || (isSignUp && (!firstName || !lastName))) {
      setError("Please fill in all required fields.");
      return;
    }
  
    setLoading(true);
  
    let result;
  
    if (isSignUp) {
      result = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }
  
    const { error } = result;
    setLoading(false);
  
    if (error) {
      setError(error.message);
    } else {
      router.push('/dashboard');
      setError("Check your email to confirm your account.");
    }
  };
  

  if (checkingSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-teal-50 text-teal-600">
        <h1 className="text-3xl font-bold mb-4">BlankSlate</h1>
        <p className="text-lg animate-pulse">Checking your account...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left Section */}
      <div className="flex flex-col justify-center items-center px-8 py-12 bg-white">
        <h1 className="text-4xl font-bold text-teal-600 mb-4 text-center">
          {isForgotPassword ? 'Reset your password' : isSignUp ? 'Create your account' : 'Welcome to blankslate'}
        </h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">
          {isForgotPassword
            ? 'Enter your email and we\'ll send you a reset link.'
            : isSignUp
            ? 'Start managing your money smarter today.'
            : 'Log in to continue budgeting your way.'}
        </p>

        <form onSubmit={isForgotPassword ? handlePasswordReset : handleAuth} className="w-full max-w-sm space-y-4">

        {isSignUp && !isForgotPassword && (
          <>
            <input
              required
              type="text"
              placeholder="First Name"
              className="w-full border p-2 rounded mb-3"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
            required
              type="text"
              placeholder="Last Name"
              className="w-full border p-2 rounded mb-3"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </>
        )}
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 border rounded"
          />
          {!isForgotPassword && (
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded"
            />
          )}
          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}
          {success && (
            <p className="text-green-600 text-sm text-center">{success}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 text-white p-2 rounded hover:bg-teal-500 transition disabled:opacity-50"
          >
            {loading ? 'Loading...' : isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Sign Up' : 'Login'}
          </button>
        </form>

        {!isForgotPassword && (
          <button
            onClick={() => setIsForgotPassword(true)}
            className="text-sm text-teal-600 underline mt-2"
            disabled={loading}
          >
            Forgot password?
          </button>
        )}

        <p className="mt-4 text-sm text-gray-700">
          {isForgotPassword ? 'Remember your password?' : isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsForgotPassword(false);
              setIsSignup(isForgotPassword ? false : !isSignUp);
              setError("");
              setSuccess("");
            }}
            className="text-teal-600 underline"
            disabled={loading}
          >
            {loading ? "Loading..." : isForgotPassword ? "Sign In" : isSignUp ? "Sign In" : "Sign Up"}
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
