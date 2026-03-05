"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../../utils/supabaseClient";
import { Session, User } from "@supabase/supabase-js";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getInitialSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    };

    getInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription?.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    // Use global scope to revoke the session on Supabase (invalidates refresh tokens)
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      console.error('Error signing out:', error.message);
    } else {
      setTimeout(() => {
        window.location.href = '/auth';
      }, 200);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
