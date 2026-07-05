"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface ResumeFile {
  filename: string;
  mimeType: string;
  base64: string;
}

function triggerDownload(file: ResumeFile) {
  const byteChars = atob(file.base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: file.mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DownloadPdfButton({ candidateId }: { candidateId: string }) {
  const [downloading, setDownloading] = useState(false);

  const handleClick = async () => {
    setDownloading(true);
    try {
      const file = await api.get<ResumeFile>(`/api/candidates/${candidateId}/resume`);
      triggerDownload(file);
      toast.success("Résumé downloaded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download résumé";
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={downloading}
      className="flex-1 py-2 bg-transparent border border-outline-variant text-on-surface-variant rounded-lg font-label-md text-[13px] hover:bg-surface-container-low transition-colors disabled:opacity-50"
    >
      {downloading ? "Downloading…" : "Download résumé"}
    </button>
  );
}
