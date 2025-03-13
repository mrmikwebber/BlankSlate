import { useState } from "react";

const AddAccountModal = ({ onAddAccount, onClose }) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("debit");
  const [issuer, setIssuer] = useState("visa");
  const [balance, setBalance] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name || isNaN(parseFloat(balance))) return;

    const newAccount = {
      id: Date.now(),
      name,
      type,
      issuer,
      balance: type === 'credit' ? -1 * parseFloat(balance) : parseFloat(balance),
      transactions: [
        {
          id: Date.now(),
          date: new Date(),
          payee: "Initial Balance",
          category: type === 'credit' ? "Inital Starting Balance" : "Ready to Assign",
          categoryGroup: "Starting Balance",
          outflow: type === 'credit' ? true : false,
          balance: type === 'credit' ? -1 * parseFloat(balance) : parseFloat(balance),
        },
      ],
    };

    onAddAccount(newAccount);
    onClose(); 
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-40">
      <div className="bg-white p-6 rounded-lg shadow-lg w-96">
        <h2 className="text-xl font-bold mb-4">Add New Account</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Account Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-2 rounded w-full mb-2"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="border p-2 rounded w-full mb-2"
          >
            <option value="debit">Debit</option>
            <option value="credit">Credit</option>
          </select>
          <select
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            className="border p-2 rounded w-full mb-2"
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
            className="border p-2 rounded w-full mb-2"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 rounded">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded">
              Add Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddAccountModal;
