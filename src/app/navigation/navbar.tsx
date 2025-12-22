"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useDarkMode } from "../context/DarkModeContext";
import { supabase } from "../../utils/supabaseClient";
import { createPortal } from "react-dom";
import { Moon, Sun } from "lucide-react";

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape" && showResetModal) {
        setShowResetModal(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [showResetModal]);
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  
  const { user, signOut } = useAuth();
  const name = user?.user_metadata?.first_name;

  const handleResetAccount = async () => {
    if (!user) return;
    
    setIsResetting(true);
    
    try {
      // Delete in order: transactions first, then budget_data, then accounts
      const userId = user.id;
      
      // Delete transactions
      const { error: txError } = await supabase
        .from('transactions')
        .delete()
        .eq('user_id', userId);
      
      if (txError) throw txError;
      
      // Delete transaction payees
      const { error: payeesError } = await supabase
        .from('transaction_payees')
        .delete()
        .eq('user_id', userId);
      
      if (payeesError) throw payeesError;
      
      // Delete budget data
      const { error: budgetError } = await supabase
        .from('budget_data')
        .delete()
        .eq('user_id', userId);
      
      if (budgetError) throw budgetError;
      
      // Delete accounts
      const { error: accountsError } = await supabase
        .from('accounts')
        .delete()
        .eq('user_id', userId);
      
      if (accountsError) throw accountsError;
      
      // Close modal and refresh the page to show clean state
      setShowResetModal(false);
      setIsResetting(false);
      window.location.reload();
      
    } catch (error) {
      console.error('Error resetting account:', error);
      alert('Failed to reset account. Please try again.');
      setIsResetting(false);
    }
  };

  return (
    <div>
      <nav className="block w-full px-3 py-2 mx-auto bg-white dark:bg-slate-900 sticky top-0 shadow-sm dark:shadow lg:px-4 z-[9999]">
        <div className="flex flex-wrap items-center justify-between w-full text-slate-800 dark:text-slate-100">
          <Link
            href="/"
            className="mr-4 block cursor-pointer py-0.5 text-teal-600 font-bold text-lg"
          >
            blankslate
          </Link>

          <div className="lg:hidden">
            <button
              className="relative ml-auto h-6 max-h-[40px] w-6 max-w-[40px] select-none rounded-lg text-center align-middle text-xs font-medium uppercase text-inherit transition-all hover:bg-transparent focus:bg-transparent active:bg-transparent disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
              onClick={toggleMobileMenu}
              type="button"
            >
              <span className="absolute transform -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  ></path>
                </svg>
              </span>
            </button>
          </div>

          <div className="hidden lg:block">
            {/* Compact links + user actions */}
            <ul className="flex flex-row items-center gap-3 m-0">
              <li>
                <Link href="/legal" className="text-xs text-slate-700 dark:text-slate-300 hover:underline">Legal</Link>
              </li>
              <li>
                {user && (
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-600 dark:text-slate-400">Hello, {name || "User"}</p>
                    <button
                      onClick={toggleDarkMode}
                      className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                    >
                      {isDarkMode ? (
                        <Sun className="h-4 w-4 text-yellow-500" />
                      ) : (
                        <Moon className="h-4 w-4 text-slate-600" />
                      )}
                    </button>
                    <button 
                      onClick={() => setShowResetModal(true)} 
                      className="px-3 py-1.5 rounded-md text-xs border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      Reset Account
                    </button>
                    <button onClick={signOut} className="bg-teal-600 dark:bg-teal-700 hover:bg-teal-500 dark:hover:bg-teal-600 text-white px-5 py-1.5 rounded-md text-xs transition-colors">
                      Sign Out
                    </button>
                  </div>
                )}
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {/* Reset Account Confirmation Modal */}
      {showResetModal && createPortal(
        <div 
          className="fixed inset-0 bg-black/30 dark:bg-black/60 z-[10000] flex items-center justify-center"
          onClick={() => setShowResetModal(false)}
        >
          <div 
            className="bg-white dark:bg-slate-900 p-6 rounded-lg shadow-lg dark:shadow-xl w-full max-w-md space-y-4 border dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">
              Reset Your Account?
            </h2>
            <p className="text-sm text-gray-700 dark:text-slate-300">
              This will permanently delete:
            </p>
            <ul className="text-sm text-gray-700 dark:text-slate-300 list-disc list-inside space-y-1">
              <li>All accounts</li>
              <li>All transactions</li>
              <li>All budget data</li>
              <li>All payees</li>
            </ul>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              This action cannot be undone!
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-slate-700 hover:bg-gray-100 dark:hover:bg-slate-800 dark:text-slate-300 transition-colors"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm rounded-md bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600 disabled:opacity-50 transition-colors"
                onClick={handleResetAccount}
                disabled={isResetting}
              >
                {isResetting ? 'Resetting...' : 'Yes, Reset Everything'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}