"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

export default function InterstitialPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    console.log(user)
    if (user) {
      router.push("/");
    }
  }, [user]);

  return (
    <div className="p-10 text-center">
      <h2 className="text-xl font-semibold">Checking your session...</h2>
      <p className="text-gray-600 mt-2">Hang tight while we log you in!</p>
    </div>
  );
}
