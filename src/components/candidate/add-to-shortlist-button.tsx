"use client";

import { useState } from "react";
import { toast } from "sonner";

export function AddToShortlistButton({ name }: { name: string }) {
  const [added, setAdded] = useState(false);

  const handleClick = () => {
    if (added) return;
    setAdded(true);
    toast.success(`Added ${name} to shortlist`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full py-3 bg-primary text-on-primary rounded-lg font-label-md text-label-md shadow-sm hover:bg-primary-container transition-colors flex justify-center items-center"
    >
      <span className="material-symbols-outlined mr-2 text-[18px]" data-icon="star">
        star
      </span>
      {added ? "Added ✓" : "Add to Shortlist"}
    </button>
  );
}
