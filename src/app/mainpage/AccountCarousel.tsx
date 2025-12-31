"use client";

import { useState, useRef, useEffect } from "react";
import { useAccountContext } from "@/app/context/AccountContext";
import AccountCardCompact from "./AccountCardCompact";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  selectedAccountId?: number | null;
  onSelect?: (accountId: number) => void;
}

export default function AccountCarousel({ selectedAccountId, onSelect }: Props) {
  const { accounts } = useAccountContext();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScroll);
      return () => container.removeEventListener("scroll", checkScroll);
    }
  }, [accounts]);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  if (!accounts || accounts.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p>No accounts yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Account Selector + Prev/Next */}
      <div className="flex items-center gap-2 px-2">
        <div className="relative flex-1">
          <button
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
            className="w-full text-left px-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600"
          >
            {selectedAccountId ? accounts.find((a) => a.id === selectedAccountId)?.name || "All accounts" : "All accounts"}
          </button>
          {accountDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg max-h-48 overflow-y-auto">
              <button
                onClick={() => {
                  onSelect?.(0);
                  setAccountDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 dark:hover:bg-teal-900/20 text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700"
              >
                All accounts
              </button>
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    onSelect?.(acc.id);
                    setAccountDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm text-slate-800 dark:text-slate-200 ${
                    selectedAccountId === acc.id
                      ? "bg-teal-50 dark:bg-teal-900/20"
                      : "hover:bg-teal-50 dark:hover:bg-teal-900/20"
                  }`}
                >
                  {acc.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll("left")}
          className="h-10 w-10 md:hidden"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => scroll("right")}
          className="h-10 w-10 md:hidden"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Carousel Container */}
      <div className="relative">
        {/* Left Arrow - Hidden on Mobile */}
        {canScrollLeft && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white shadow-sm hidden md:flex"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
        )}

      {/* Carousel Container */}
      <div
        ref={scrollContainerRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory px-2"
        style={{ scrollBehavior: "smooth" }}
      >
        {accounts.map((account) => (
          <div
            key={account.id}
            className={`flex-shrink-0 w-72 snap-start transition ring-offset-2 ${
              selectedAccountId === account.id
                ? "ring-2 ring-teal-500 shadow-md"
                : "hover:ring-1 hover:ring-slate-200"
            }`}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(account.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(account.id);
              }
            }}
          >
            <AccountCardCompact account={account} disableNavigate />
          </div>
        ))}
      </div>

        {/* Right Arrow - Hidden on Mobile */}
        {canScrollRight && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/80 hover:bg-white shadow-sm hidden md:flex"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}

        {/* Scrollbar hiding CSS */}
        <style jsx>{`
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
    </div>
  );
}
