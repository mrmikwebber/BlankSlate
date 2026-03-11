"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../../utils/supabaseClient";
import { Session, User } from "@supabase/supabase-js";

export type UserPlan = "free" | "paid";

type AuthContextType = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isRecoverySession: boolean;
  plan: UserPlan;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoverySession, setIsRecoverySession] = useState(false);
  const [plan, setPlan] = useState<UserPlan>("free");

  const fetchPlan = async (userId: string) => {
    const { data } = await supabase
      .from("user_profiles")
      .select("plan")
      .eq("id", userId)
      .single();
    if (data?.plan === "paid") setPlan("paid");
    else setPlan("free");
  };

  useEffect(() => {
    const getInitialSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) await fetchPlan(data.session.user.id);
      setLoading(false);
    };

    getInitialSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsRecoverySession(event === "PASSWORD_RECOVERY");
      if (session?.user) await fetchPlan(session.user.id);
      else setPlan("free");
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
    <AuthContext.Provider value={{ session, user, loading, isRecoverySession, plan, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
