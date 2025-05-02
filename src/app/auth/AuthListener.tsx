'use client';
import { useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthListener] Auth event:', event, session);

      if (event === 'SIGNED_OUT') {
        router.push('/auth');
      }

      if (event === 'SIGNED_IN' && session) {
        console.log('[AuthListener] Forcing reload after login');
        window.location.href = '/dashboard';
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  return null;
}
