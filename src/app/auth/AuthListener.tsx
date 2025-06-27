'use client';
import { useEffect } from 'react';
import { supabase } from '../../utils/supabaseClient';

export default function AuthListener() {
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  return null;
}
