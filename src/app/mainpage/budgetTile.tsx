"use client";
import { useState, useEffect, useMemo, Fragment, useRef } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import MonthNav from "./MonthNav";
import { useBudgetContext } from "../context/BudgetContext";
import { TargetSidebar } from "./TargetSidebar";
import { LandingCoverPage } from "./LandingCoverPage";
import { useAuth } from "../context/AuthContext";
import { createPortal } from "react-dom";

export default function CollapsibleTable() {
  const {
    currentMonth,
    budgetData,
    setBudgetData,
    setIsDirty,
    addCategoryGroup,
    addItemToCategory,
    deleteCategoryGroup,
    deleteCategoryWithReassignment,
    deleteCategoryItem,
    refreshAllReadyToAssign,
    getCumulativeAvailable,
  } = useBudgetContext();
  const { user } = useAuth();

  const FILTERS = [
    "All",
    "Money Available",
    "Overspent",
    "Overfunded",
    "Underfunded",
  ];
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTargetCategory, setSelectedTargetCategory] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const [targetSidebarOpen, setTargetSidebarOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    name: "",
    assigned: 0,
    activity: 0,
    available: 0,
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    {}
  );
  const [groupContext, setGroupContext] = useState<{
    x: number;
    y: number;
    categoryName: string;
    itemCount: number;
  } | null>(null);
  const [categoryDeleteContext, setCategoryDeleteContext] = useState<{
    categoryName: string;
    itemName: string;
    assigned: number;
    activity: number;
    available: number;
  } | null>(null);

  const addItemRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (addItemRef.current && !addItemRef.current.contains(e.target)) {
        setActiveCategory(null);
      }
    };

    if (activeCategory) {
      document.addEventListener("mousedown", handleClickOutside);

      const rect = addItemRef.current?.getBoundingClientRect();
      if (rect && rect.bottom + 120 > window.innerHeight) {
        setDropUp(true);
      } else {
        setDropUp(false);
      }
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [activeCategory]);

  useEffect(() => {
    if (!budgetData || !currentMonth || !budgetData[currentMonth]?.categories)
      return;

    setOpenCategories((prev) => {
      const updated = { ...prev };

      for (const category of budgetData[currentMonth].categories) {
        if (!(category.name in updated)) {
          updated[category.name] = true;
        }
      }

      return updated;
    });
  }, [budgetData, currentMonth]);

  useEffect(() => {
    const closeMenu = () => setGroupContext(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const filteredCategories = useMemo(() => {
    if (!budgetData || !currentMonth) return [];

    const allCategories = budgetData[currentMonth]?.categories || [];

    return allCategories
      .map((category) => {
        const filteredItems = category.categoryItems.filter((item) => {
          switch (selectedFilter) {
            case "Money Available":
              return item.available > 0;
            case "Overspent":
              return item.available < 0;
            case "Overfunded":
              return item.target && item.assigned > item.target.amountNeeded;
            case "Underfunded":
              return item.target && item.assigned < item.target.amountNeeded;
            case "All":
            default:
              return true;
          }
        });

        return { ...category, categoryItems: filteredItems };
      })
      .filter(Boolean);
  }, [budgetData, currentMonth, selectedFilter]);

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  const handleInputChange = (categoryName, itemName, value) => {
    setBudgetData((prev) => {
      const updated = { ...prev };
  
      const updatedCategories = updated[currentMonth]?.categories.map((category) => {
        if (category.name !== categoryName) return category;
  
        return {
          ...category,
          categoryItems: category.categoryItems.map((item) => {
            if (item.name !== itemName) return item;
  
            const isCreditCard = category.name === "Credit Card Payments";
            const activity = item.activity || 0;
            const cumulative = getCumulativeAvailable(updated, item.name);
  
            return {
              ...item,
              assigned: value,
              available: isCreditCard
                ? item.available
                : value + activity + Math.max(cumulative, 0),
            };
          }),
        };
      });

      updated[currentMonth] = {
        ...updated[currentMonth],
        categories: updatedCategories,
      };
  
      setTimeout(() => {
        refreshAllReadyToAssign(updated);
      }, 0);
  
      return updated;
    });
  
    setIsDirty(true);
  };
  

  const handleAddItem = (category: string) => {
    if (newItem.name.trim() !== "") {
      addItemToCategory(category, {
        name: newItem.name,
        assigned: newItem.assigned,
        activity: newItem.activity,
        available: newItem.assigned + newItem.activity,
      });
      setNewItem({ name: "", assigned: 0, activity: 0, available: 0 });
      setActiveCategory(null);
    }
  };

  const toggleTargetSideBar = (item) => {
    setSelectedCategory(item.name);
    setTargetSidebarOpen(true);
  };

  const isDeletingRef = useRef(false);

  const handleReassignDelete = () => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;

    deleteCategoryWithReassignment(
      categoryDeleteContext,
      selectedTargetCategory
    );
    setCategoryDeleteContext(null);

    setTimeout(() => {
      isDeletingRef.current = false;
    }, 100);
  };

  const getTargetStatus = (item) => {
    if (!item.target) return { message: "", color: "" };

    const assigned = item.assigned || 0;
    const needed = item.target.amountNeeded;
    const activity = Math.abs(item.activity || 0);
    const available = item.available || 0;
    const overspent = available < 0;
    const fullyFunded = assigned === needed;
    const overFunded = assigned > needed;
    const partiallyFunded = assigned < needed && assigned >= activity;
    const stillNeeded = needed - assigned;

    if (overspent && assigned < activity) {
      return {
        message: `Overspent ${formatToUSD(available * -1)} of ${formatToUSD(
          assigned
        )}`,
        color: "text-red-600 font-semibold",
      };
    }
    if (
      ((fullyFunded || overFunded) && available === 0) ||
      (fullyFunded && available > 0)
    ) {
      return { message: "Fully Funded", color: "text-green-600 font-semibold" };
    }
    if (overFunded) {
      return {
        message: `Funded ${formatToUSD(needed)} of ${formatToUSD(assigned)}`,
        color: "text-blue-600 font-semibold",
      };
    }
    if (partiallyFunded) {
      return {
        message: `${formatToUSD(stillNeeded)} more needed to fulfill target`,
        color: "text-yellow-600 font-semibold",
      };
    }
    return {
      message: `${formatToUSD(assigned)} / ${formatToUSD(needed)}`,
      color: "text-gray-600",
    };
  };

  if (!user) {
    return <LandingCoverPage />;
  }

  return (
    <>
      {groupContext &&
        createPortal(
          <div
            className="fixed z-50 w-[160px] bg-white border shadow rounded text-sm"
            style={{ top: groupContext.y, left: groupContext.x }}
            onClick={() => setGroupContext(null)}
          >
            {groupContext.itemCount === 0 ? (
              <button
                onClick={() => {
                  deleteCategoryGroup(groupContext.categoryName);
                  setGroupContext(null);
                }}
                className="px-4 py-2 hover:bg-red-100 text-red-600 w-full text-left"
              >
                Delete Group
              </button>
            ) : (
              <div className="px-4 py-2 text-gray-500">
                Cannot delete: Group not empty
              </div>
            )}
          </div>,
          document.body
        )}

      {categoryDeleteContext &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded shadow-lg w-96">
              <h2 className="text-lg font-bold mb-4">
                Delete “{categoryDeleteContext.itemName}”?
              </h2>

              {categoryDeleteContext.assigned !== 0 ||
              categoryDeleteContext.activity !== 0 ? (
                <>
                  <p className="mb-2 text-sm text-gray-600">
                    This category has existing funds or activity. Where should
                    they be moved?
                  </p>

                  <select
                    className="w-full border p-2 mb-4 rounded"
                    value={selectedTargetCategory}
                    onChange={(e) => setSelectedTargetCategory(e.target.value)}
                  >
                    <option value="">Select a target category</option>
                    {budgetData[currentMonth]?.categories
                      .flatMap((cat) =>
                        cat.categoryItems
                          .filter(
                            (i) => i.name !== categoryDeleteContext.itemName
                          )
                          .map((i) => i.name)
                      )
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setCategoryDeleteContext(null)}
                      className="px-4 py-2 text-gray-600 hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handleReassignDelete();
                        setCategoryDeleteContext(null);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                      disabled={!selectedTargetCategory}
                    >
                      Confirm & Reassign
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-gray-600">
                    This category has no funds or activity. Are you sure you
                    want to delete it?
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setCategoryDeleteContext(null)}
                      className="px-4 py-2 text-gray-600 hover:underline"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        deleteCategoryItem(categoryDeleteContext);
                        setCategoryDeleteContext(null);
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      <div className="mx-auto mt-8 rounded-md">
        <MonthNav />
        <div className="flex mt-2 mb-2">
          <AddCategoryButton handleSubmit={addCategoryGroup} />
        </div>
        <div className="flex gap-2 mb-4">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              className={`px-4 py-2 rounded-md ${
                selectedFilter === filter
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
              onClick={() => setSelectedFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="flex">
          <table className="w-full border border-gray-300 rounded-md">
            <thead>
              <tr className="bg-gray-200 text-left">
                <th className="p-2 border">Category</th>
                <th className="p-2 border">Assigned</th>
                <th className="p-2 border">Activity</th>
                <th className="p-2 border">Available</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.map((group) => (
                <Fragment key={group.name}>
                  <tr
                    className="bg-gray-400 text-white"
                    onMouseEnter={() => setHoveredCategory(group.name)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  >
                    <td
                      colSpan={0}
                      className="p-3 font-bold text-lg w-full"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setGroupContext({
                          x: Math.min(e.clientX, window.innerWidth - 160),
                          y: Math.min(e.clientY, window.innerHeight - 50),
                          categoryName: group.name,
                          itemCount: group.categoryItems.length,
                        });
                      }}
                    >
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleCategory(group.name)}
                          className="mr-2"
                        >
                          {openCategories[group.name] ? "▼" : "▶"}
                        </button>
                        {group.name}
                        {hoveredCategory === group.name && (
                          <button
                            onClick={() => setActiveCategory(group.name)}
                            className="ms-2 text-sm bg-blue-500 text-white px-2 py-1 rounded-full hover:bg-teal-500 transition"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-2 border">
                      {formatToUSD(
                        group.categoryItems.reduce(
                          (sum, item) => sum + item.assigned,
                          0
                        )
                      )}
                    </td>
                    <td className="p-2 border">
                      {formatToUSD(
                        group.categoryItems.reduce(
                          (sum, item) => sum + item.activity,
                          0
                        )
                      )}
                    </td>
                    <td className="p-2 border">
                      {group.name === "Credit Card Payments"
                        ? "Payment - " +
                          formatToUSD(
                            group.categoryItems.reduce(
                              (sum, item) => sum + item.available,
                              0
                            ) || 0
                          )
                        : formatToUSD(
                            group.categoryItems.reduce(
                              (sum, item) => sum + item.available,
                              0
                            )
                          )}
                    </td>
                  </tr>
                  <div className="relative">
                    {activeCategory === group.name && (
                      <div
                        ref={addItemRef}
                        className={`${
                          dropUp ? "bottom-full mb-2" : "top-full mt-2"
                        } absolute left-0 mt-2 w-64 bg-white p-4 shadow-lg rounded-lg border z-50`}
                      >
                        <input
                          type="text"
                          placeholder="Item Name"
                          value={newItem.name}
                          onChange={(e) =>
                            setNewItem({ ...newItem, name: e.target.value })
                          }
                          className="w-full border rounded px-2 py-1"
                        />
                        <button
                          onClick={() => handleAddItem(group.name)}
                          className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-500 transition"
                        >
                          Submit
                        </button>
                      </div>
                    )}
                  </div>
                  {openCategories[group.name] &&
                    group.categoryItems.map((item, itemIndex) => (
                      <tr
                        key={itemIndex}
                        className="border-t"
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (group.name !== "Credit Card Payments") {
                            setCategoryDeleteContext({
                              categoryName: group.name,
                              itemName: item.name,
                              assigned: item.assigned,
                              activity: item.activity,
                              available: item.available,
                            });
                          }
                        }}
                      >
                        <td
                          onClick={() => {
                            toggleTargetSideBar(item);
                          }}
                          className="p-2 border relative"
                        >
                          {item.target && (
                            <div className="absolute top-0 left-0 w-full h-full bg-gray-200 rounded">
                              <div
                                className="h-full bg-teal-500 transition-all duration-300 rounded"
                                style={{
                                  width: `${Math.min(
                                    (item.assigned / item.target.amountNeeded) *
                                      100,
                                    100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                          )}
                          <span className="relative z-10 font-medium">
                            {item.name}{" "}
                            {item.target && (
                              <span className={getTargetStatus(item).color}>
                                {getTargetStatus(item).message}
                              </span>
                            )}
                          </span>
                        </td>
                        <EditableAssigned
                          categoryName={group.name}
                          itemName={item.name}
                          item={item}
                          handleInputChange={handleInputChange}
                        />
                        <td className="p-2 border">
                          {formatToUSD(item.activity || 0)}
                        </td>
                        <td className="p-2 border">
                          {formatToUSD(item.available || 0)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          {targetSidebarOpen && (
            <TargetSidebar
              itemName={selectedCategory}
              onClose={() => {
                setTargetSidebarOpen(false);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
