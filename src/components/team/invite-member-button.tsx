"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { InviteMemberForm } from "./invite-member-form";

export function InviteMemberButton({
  remainingSeats,
  plan,
  onSuccess,
}: {
  remainingSeats: number;
  plan: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-8 py-4 bg-primary text-on-primary rounded-lg font-headline-md text-[16px] font-semibold hover:shadow-lg transition-all active:scale-95 flex items-center gap-2"
      >
        <span className="material-symbols-outlined">person_add</span>
        Invite member
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Invite a member"
        subtitle="Add a recruiter to your workspace."
      >
        <InviteMemberForm
          remainingSeats={remainingSeats}
          plan={plan}
          onSent={onSuccess}
          onDone={close}
        />
      </Modal>
    </>
  );
}
