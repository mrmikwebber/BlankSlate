"use client";

import { useBudgetContext } from "@/app/context/BudgetContext";
import { formatToUSD } from "@/app/utils/formatToUSD";
import { getTargetStatus } from "@/app/utils/getTargetStatus";
import { useAccountContext } from "@/app/context/AccountContext";
import MonthNav from "../MonthNav";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function MobileBudgetTab() {
  const {
    currentMonth,
    budgetData,
    addItemToCategory,
    getCumulativeAvailable,
  } = useBudgetContext();

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const budgetMonth = budgetData[currentMonth];
  if (!budgetMonth) {
    return (
      <div className="text-center py-8 text-slate-400">
        <p>No budget data for this month</p>
      </div>
    );
  }

  const getStatusColor = (statusType?: string) => {
    if (statusType === "overspent") return "destructive";
    if (statusType === "overfunded") return "secondary";
    if (statusType === "underfunded") return "outline";
    return "default";
  };

  const cumulativeAvailable = getCumulativeAvailable(currentMonth);

  return (
    <div className="space-y-4 pb-20">
      {/* Month Navigation */}
      <MonthNav />

      {/* Ready to Assign */}
      <Card className="shadow-none border-0 bg-gradient-to-r from-teal-500 to-teal-600 text-white">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-teal-100 mb-2">Ready to Assign</p>
          <p className="text-3xl font-bold">
            {formatToUSD(cumulativeAvailable)}
          </p>
        </CardContent>
      </Card>

      {/* Category Groups */}
      {budgetMonth.categories.map((group) => (
        <div key={group.name} className="space-y-2">
          {/* Group Header */}
          <button
            onClick={() => toggleGroup(group.name)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors font-semibold text-slate-900"
          >
            <span>{group.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700">
                {formatToUSD(
                  group.categoryItems.reduce((sum, item) => sum + item.assigned, 0)
                )}
              </span>
              {expandedGroups.has(group.name) ? (
                <ChevronDown className="w-5 h-5 text-slate-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-slate-600" />
              )}
            </div>
          </button>

          {/* Category Items */}
          {expandedGroups.has(group.name) && (
            <div className="space-y-3 px-1">
              {group.categoryItems.map((item) => {
                const status = getTargetStatus(item);
                return (
                  <Card key={item.name} className="shadow-none border-slate-200">
                    <CardContent className="pt-3">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.name}
                          </p>
                          {status && status.type && (
                            <Badge 
                              variant={getStatusColor(status.type)} 
                              className="mt-2 text-xs"
                            >
                              {status.message}
                            </Badge>
                          )}
                        </div>
                        <div className="text-right ml-3">
                          <p className="text-xs text-slate-500 mb-1 font-medium">Available</p>
                          <p className={`text-base font-bold ${
                            item.available > 0 ? 'text-teal-600' : 'text-red-600'
                          }`}>
                            {formatToUSD(item.available)}
                          </p>
                        </div>
                      </div>

                      {/* Mini Progress Bar */}
                      <div className="space-y-2 bg-slate-50 rounded p-2">
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>Assigned: {formatToUSD(item.assigned)}</span>
                          <span>Activity: {formatToUSD(item.activity)}</span>
                        </div>
                        <div className="w-full bg-slate-300 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.available < 0 ? 'bg-red-500' : 'bg-teal-500'
                            }`}
                            style={{
                              width: `${Math.min(
                                (Math.abs(item.activity) / (item.assigned || 1)) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Add Category Button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-slate-300 text-slate-800 hover:bg-slate-50"
                onClick={() => addItemToCategory(group.name, "")}
              >
                <Plus className="h-4 w-4" />
                Add to {group.name}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
