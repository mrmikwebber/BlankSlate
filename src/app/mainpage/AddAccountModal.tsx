import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AddAccountModal = ({ onAddAccount, onClose, isOpen = true }) => {
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

  const handleOpenChange = (open) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Add New Account</DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Create a new debit or credit account to track your finances.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="account-name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Account Name
            </label>
            <Input
              id="account-name"
              type="text"
              placeholder="e.g., Checking, Savings, Amex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="account-type" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Account Type
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="account-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debit">Debit</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="account-issuer" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Card Issuer
            </label>
            <Select value={issuer} onValueChange={setIssuer}>
              <SelectTrigger id="account-issuer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visa">Visa</SelectItem>
                <SelectItem value="amex">American Express</SelectItem>
                <SelectItem value="discover">Discover</SelectItem>
                <SelectItem value="mastercard">Mastercard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label htmlFor="initial-balance" className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Initial Balance
            </label>
            <Input
              id="initial-balance"
              type="number"
              placeholder="0.00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              step="0.01"
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700"
            >
              Add Account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddAccountModal;
