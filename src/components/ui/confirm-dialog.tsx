"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * Shared destructive/generic confirm pattern, built on the existing `Modal`
 * (not shadcn's Dialog — Modal already handles portal/Escape/scroll-lock and
 * is brand-styled; adding a second dialog primitive would be pure risk for
 * no gain). Replaces ad hoc native `confirm()` usage (e.g. Team's
 * remove-member action) with a consistent, accessible confirm step.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-sm">
      {description ? (
        <p className="mb-6 font-body-md text-body-md text-on-surface-variant">{description}</p>
      ) : null}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "gradient"}
          onClick={handleConfirm}
          disabled={busy}
        >
          {busy ? "…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
