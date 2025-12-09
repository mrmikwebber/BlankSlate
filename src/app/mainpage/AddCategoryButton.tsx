import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const AddCategoryButton = ({
  handleSubmit,
}: {
  handleSubmit: (categoryName: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categoryGroupName, setCategoryGroupName] = useState("");

  const popupRef = useRef<HTMLDivElement>(null);


  const onSubmit = () => {
    if (categoryGroupName.trim() !== "") {
      handleSubmit(categoryGroupName);
      setCategoryGroupName("");
      setIsOpen(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          data-cy="add-category-group-button"
          variant="outline"
          size="sm"
          className="gap-1 border-slate-300 text-slate-800"
        >
          <Plus className="h-4 w-4" />
          Add group
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 p-3 space-y-2"
      >
        <div className="space-y-2">
          <Label
            htmlFor="add-category-group-input"
            className="text-xs font-medium text-slate-700"
          >
            Category group name
          </Label>
          <Input
            id="add-category-group-input"
            data-cy="add-category-group-input"
            type="text"
            value={categoryGroupName}
            onChange={(e) => setCategoryGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            className="h-8 text-sm"
            placeholder="e.g. Monthly Bills"
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsOpen(false);
                setCategoryGroupName("");
              }}
            >
              Cancel
            </Button>
            <Button
              data-cy="add-category-group-submit"
              size="sm"
              onClick={onSubmit}
              disabled={!categoryGroupName.trim()}
            >
              Add
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default AddCategoryButton;
