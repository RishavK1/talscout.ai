"use client";

import { toast } from "sonner";

export function DownloadPdfButton() {
  const handleClick = () => {
    toast.success("Downloading résumé…");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex-1 py-2 bg-transparent border border-outline-variant text-on-surface-variant rounded-lg font-label-md text-[13px] hover:bg-surface-container-low transition-colors"
    >
      Download PDF
    </button>
  );
}
