import { useState } from "react";
import AuthModal from "./AuthenticationModal";

export const LandingCoverPage = () => {

    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-br from-teal-50 to-white">
        <h1 className="text-4xl font-bold text-teal-600 mb-4 text-center">
          Welcome to blankslate
        </h1>
        <p className="text-gray-700 text-lg text-center max-w-xl mb-6">
          Take control of your finances. Budget smarter, set goals, and grow your money.
        </p>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="bg-teal-600 text-white px-6 py-3 rounded-md hover:bg-teal-500 transition"
        >
          Sign In / Create Account
        </button>
        {isAuthModalOpen && <AuthModal onClose={() => setIsAuthModalOpen(false)} />}
      </div>
    );
  };
  
  