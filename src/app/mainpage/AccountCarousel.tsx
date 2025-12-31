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
  );
}
