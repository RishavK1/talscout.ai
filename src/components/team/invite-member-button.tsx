"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
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
      <Button type="button" variant="gradient" size="lg" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined text-[18px]">person_add</span>
        Invite member
      </Button>

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
