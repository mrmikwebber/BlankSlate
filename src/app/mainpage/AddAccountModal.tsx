import { useState } from "react";
import { createPortal } from "react-dom";

const AddAccountModal = ({ onAddAccount, onClose }) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("debit");
  const [issuer, setIssuer] = useState("visa");
  const [balance, setBalance] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || isNaN(parseFloat(balance))) return;

    const newAccount = {
      name,
      type,
      issuer,
      balance: type === 'credit' ? -1 * parseFloat(balance) : parseFloat(balance),
    };

    onAddAccount(newAccount);
    onClose(); 
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Add New Account</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Account Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm"
          >
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
          <select
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm"
          >
            <option value="visa">Visa</option>
            <option value="amex">American Express</option>
            <option value="discover">Discover</option>
            <option value="mastercard">Mastercard</option>
          </select>
          <input
            type="number"
            placeholder="Initial Balance"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 w-full text-sm"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-teal-600 transition"
            >
              Add Account
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default AddAccountModal;
