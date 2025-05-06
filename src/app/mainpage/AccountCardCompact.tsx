import { Account } from "@/app/context/AccountContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { redirect } from "next/navigation";
import clsx from "clsx";

interface Props {
  account: Account;
  onClick?: (id: string) => void;
}

export default function AccountCardCompact({ account, onClick }: Props) {
  const openAccount = () => {
    redirect(`/accounts/${account?.id}`);
  };

  return (
    <div
      onClick={openAccount}
      className={clsx(
        "cursor-pointer p-3 rounded-lg border w-full max-w-[150px]",
        "bg-gray-50 hover:bg-gray-100 transition-colors duration-150",
        account.balance < 0
          ? "border-red-200"
          : "border-gray-200"
      )}
    >
      <div className="font-medium text-sm text-gray-800 truncate mb-0.5">
        {account.name}
      </div>
      <div
        className={clsx(
          "text-xs font-medium",
          account.balance < 0 ? "text-red-500" : "text-gray-700"
        )}
      >
        {formatToUSD(account.balance)}
      </div>
    </div>
  );
}
