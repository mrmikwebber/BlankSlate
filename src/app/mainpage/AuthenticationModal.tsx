import { useState } from "react";
import { supabase } from "../../utils/supabaseClient";
import { createPortal } from 'react-dom'
import { X } from "lucide-react";

const AuthModal = ({ onClose }: { onClose: () => void }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuth = async () => {
    setError("");
  
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
  
    const { error, data } = result;
    setLoading(false);
  
    if (error) {
      setError(error.message);
    } else if (data?.session) {
      onClose();
    } else {
      setError("Check your email to confirm your account.");
    }
  };
  

  return createPortal(
    <div id='auth-modal' className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-2 right-2">
          <X />
        </button>

        <h2 className="text-xl font-semibold mb-4 text-center">
          {isSignUp ? "Create Account" : "Sign In"}
        </h2>

        {isSignUp && (
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
        required
          type="email"
          placeholder="Email"
          className="w-full border p-2 rounded mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          required
          type="password"
          placeholder="Password"
          className="w-full border p-2 rounded mb-4"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <button
          onClick={handleAuth}
          className="bg-teal-600 text-white w-full py-2 rounded hover:bg-teal-500 transition"
          disabled={loading}
        >
          {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
        </button>

        <p className="text-sm text-gray-600 mt-4 text-center">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-500 underline"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>,
    document.body
  );
};

export default AuthModal;
