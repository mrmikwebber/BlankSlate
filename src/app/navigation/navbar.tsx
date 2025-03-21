"use client";
import Link from "next/link";
import { useState } from "react";
import AuthenticationModal from "../mainpage/AuthenticationModal";
import { useAuth } from "../context/AuthContext";
export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  const { user, signOut } = useAuth();
  const name = user?.user_metadata?.first_name;

  return (
    <div>
      <nav className="block w-full px-4 py-4 mx-auto bg-white bg-opacity-90 sticky top-3 shadow lg:px-8 backdrop-blur-lg backdrop-saturate-150 z-[9999]">
        <div className="flex flex-wrap items-center justify-between w-full text-slate-800">
          <Link
            href="/"
            className="mr-4 block cursor-pointer py-1.5 text-teal-600 font-bold text-2xl"
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
            <ul className="flex flex-col gap-2 mt-2 mb-4 lg:mb-0 lg:mt-0 lg:flex-row lg:items-center lg:gap-6">
              <li>
                {user ? (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-600">Hello, {name || "User"}</p>
                    <button onClick={signOut} className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-2 rounded-md">
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setIsAuthModalOpen(true)} className="bg-teal-600 hover:bg-teal-500 text-white px-8 py-2 rounded-md">
                    Login
                  </button>
                )}
              </li>
            </ul>
          </div>
        </div>
      </nav>
      {isAuthModalOpen && <AuthenticationModal onClose={() => setIsAuthModalOpen(false)} />}
    </div>
  );
}