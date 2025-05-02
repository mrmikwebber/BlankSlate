'use client';
import { useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('Auth state changed:', event, session);
      if (event === 'SIGNED_OUT') {
        router.push('/auth');
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  return null;
}
