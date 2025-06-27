"use client";
import { useState, useEffect, useMemo, Fragment, useRef } from "react";
import { formatToUSD } from "../utils/formatToUSD";
import AddCategoryButton from "./AddCategoryButton";
import EditableAssigned from "./EditableAssigned";
import MonthNav from "./MonthNav";
import { useBudgetContext } from "../context/BudgetContext";
import { getTargetStatus } from "../utils/getTargetStatus";
import { createPortal } from "react-dom";
import InlineTargetEditor from "./TargetInlineEditor";

export default function BudgetTable() {
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
    renameCategory,
    renameCategoryGroup,
    setRecentChanges,
  } = useBudgetContext();

  const FILTERS = [
    "All",
    "Money Available",
    "Overspent",
    "Overfunded",
    "Underfunded",
  ];
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [inlineEditorCategory, setInlineEditorCategory] = useState<
    string | null
  >(null);
  const [selectedTargetCategory, setSelectedTargetCategory] = useState("");
  const [dropUp, setDropUp] = useState(false);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [editingItem, setEditingItem] = useState<{
    category: string;
    item: string;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

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
  const [categoryContext, setCategoryContext] = useState<{
    x: number;
    y: number;
    groupName: string;
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
    const closeMenu = () => {
      setGroupContext(null);
      setCategoryContext(null);
    };
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const filteredCategories = useMemo(() => {
    if (!budgetData || !currentMonth) return [];

    const allCategories = budgetData[currentMonth]?.categories || [];

    const sortedCategories = [...allCategories].sort((a, b) => {
      if (a.name === "Credit Card Payments") return -1;
      if (b.name === "Credit Card Payments") return 1;
      return 0;
    });

    return sortedCategories
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

      const updatedCategories = updated[currentMonth]?.categories.map(
        (category) => {
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
        }
      );

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

    setRecentChanges((prev) => [
      ...prev.slice(-9),
      {
        description: `Assigned $${value} to '${itemName}' in '${categoryName}'`,
        timestamp: new Date().toISOString(),
      },
    ]);
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

  return (
    <>
      {groupContext &&
        createPortal(
          <div
            className="fixed z-50 w-[160px] bg-white border shadow rounded text-sm"
            style={{ top: groupContext.y, left: groupContext.x }}
            onClick={() => setGroupContext(null)}
          >
            <button
              onClick={() => {
                setEditingGroup(groupContext.categoryName);
                setNewGroupName(groupContext.categoryName);
                setGroupContext(null);
              }}
              className="px-4 py-2 hover:bg-blue-100 text-blue-600 w-full text-left"
            >
              Rename Group
            </button>
            {groupContext.itemCount === 0 ? (
              <>
                <button
                  onClick={() => {
                    deleteCategoryGroup(groupContext.categoryName);
                    setGroupContext(null);
                  }}
                  className="px-4 py-2 hover:bg-red-100 text-red-600 w-full text-left"
                >
                  Delete Group
                </button>
              </>
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

      {categoryContext &&
        createPortal(
          <div
            className="fixed z-50 bg-white border rounded shadow-md text-sm"
            style={{ top: categoryContext.y, left: categoryContext.x }}
            onClick={() => setCategoryContext(null)}
          >
            <button
              onClick={() => {
                setEditingItem({
                  category: categoryContext.groupName,
                  item: categoryContext.itemName,
                });
                setNewCategoryName(categoryContext.itemName);
                setCategoryContext(null);
              }}
              className="px-4 py-2 hover:bg-blue-100 text-blue-600 w-full text-left"
            >
              Rename Category
            </button>

            {/* Optional: Hide delete if it's a special group or has assigned value */}
            {categoryContext.groupName !== "Credit Card Payments" ? (
              <button
                onClick={() => {
                  setCategoryDeleteContext({
                    categoryName: categoryContext.groupName,
                    itemName: categoryContext.itemName,
                    assigned: categoryContext.assigned,
                    activity: categoryContext.activity,
                    available: categoryContext.available,
                  });
                  setCategoryContext(null);
                }}
                className="px-4 py-2 hover:bg-red-100 text-red-600 w-full text-left"
              >
                Delete Category
              </button>
            ) : (
              <div className="px-4 py-2 text-gray-400">
                Cannot delete (Credit Credit Category)
              </div>
            )}
          </div>,
          document.body
        )}

      <div className="flex flex-col h-full rounded-2xl bg-white border shadow p-3 space-y-2 overflow-hidden">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="w-full">
            <MonthNav />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-t pt-4">
          <div className="flex flex-wrap gap-2">
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

          <div className="ml-auto">
            <AddCategoryButton handleSubmit={addCategoryGroup} />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          <table className="w-full border border-gray-300 rounded-md bg-white shadow-sm min-w-full table-auto">
            <thead>
              <tr className="bg-gray-100 text-xs text-gray-700 uppercase">
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
                    className="bg-slate-100 text-sm font-semibold text-gray-800 border-b border-gray-200"
                    onMouseEnter={() => setHoveredCategory(group.name)}
                    onMouseLeave={() => setHoveredCategory(null)}
                  >
                    <td
                      colSpan={0}
                      className="p-3 w-full border-y"
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
                        {editingGroup === group.name ? (
                          <input
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onBlur={async () => {
                              await renameCategoryGroup(
                                editingGroup,
                                newGroupName
                              );
                              setEditingGroup(null);
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                await renameCategoryGroup(
                                  editingGroup,
                                  newGroupName
                                );
                                setEditingGroup(null);
                              }
                            }}
                            className="text-black font-bold w-full"
                            autoFocus
                          />
                        ) : (
                          <span className="text-sm font-semibold leading-tight">
                            {group.name}
                          </span>
                        )}
                        <div className="ms-2 w-6 h-6 flex items-center justify-center">
                          {hoveredCategory === group.name && (
                            <button
                              onClick={() => setActiveCategory(group.name)}
                              className="text-sm bg-blue-500 text-white px-2 py-1 rounded-full hover:bg-teal-500 transition"
                            >
                              +
                            </button>
                          )}
                        </div>
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
                  <tr>
                    <td colSpan={4} className="relative p-0">
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
                    </td>
                  </tr>
                  {openCategories[group.name] &&
                    group.categoryItems.map((item, itemIndex) => (
                      <Fragment>
                        <tr
                          key={itemIndex}
                          className="hover:bg-slate-50 border-b transition"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setCategoryContext({
                              x: e.clientX,
                              y: e.clientY,
                              groupName: group.name,
                              itemName: item.name,
                              assigned: item.assigned,
                              activity: item.activity,
                              available: item.available,
                            });
                          }}
                        >
                          <td
                            className="p-2 border relative"
                            onClick={() => {
                              setInlineEditorCategory((prev) =>
                                prev === item.name ? null : item.name
                              );
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setCategoryContext({
                                x: e.clientX,
                                y: e.clientY,
                                groupName: group.name,
                                itemName: item.name,
                                assigned: item.assigned,
                                activity: item.activity,
                                available: item.available,
                              });
                            }}
                          >
                            {editingItem?.category === group.name &&
                            editingItem?.item === item.name ? (
                              <input
                                value={newCategoryName}
                                onChange={(e) =>
                                  setNewCategoryName(e.target.value)
                                }
                                onBlur={async () => {
                                  await renameCategory(
                                    group.name,
                                    editingItem.item,
                                    newCategoryName
                                  );
                                  setEditingItem(null);
                                }}
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter") {
                                    await renameCategory(
                                      group.name,
                                      editingItem.item,
                                      newCategoryName
                                    );
                                    setEditingItem(null);
                                  }
                                }}
                                className="w-full"
                                autoFocus
                              />
                            ) : (
                              <div className="relative h-6 rounded overflow-hidden bg-gray-50">
                                {item.target && (
                                  <div
                                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-300 rounded"
                                    style={{
                                      width: `${Math.min(
                                        (item.assigned /
                                          item.target.amountNeeded) *
                                          100,
                                        100
                                      )}%`,
                                    }}
                                  />
                                )}
                                <div className="relative z-10 px-2 text-sm flex justify-between items-center h-full">
                                  <span className="font-medium truncate">
                                    {item.name}
                                  </span>
                                  {getTargetStatus(item).message && (
                                    <span
                                      className={`text-xs ml-2 ${
                                        getTargetStatus(item).color
                                      }`}
                                    >
                                      {getTargetStatus(item).message}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
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
                        {inlineEditorCategory === item.name && (
                          <InlineTargetEditor
                            itemName={item.name}
                            onClose={() => setInlineEditorCategory(null)}
                          />
                        )}
                      </Fragment>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
