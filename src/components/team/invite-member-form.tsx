"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * The actual invite form — shared by the /team page's InviteMemberButton and
 * AppShell's sidebar "Invite Team" shortcut, so there's exactly one place that
 * calls the real API instead of two invite UIs (one real, one that faked
 * success locally). Only rendered while its parent <Modal> is open, so its
 * state resets naturally on close — no manual timers needed.
 */
export function InviteMemberForm({
  remainingSeats,
  plan,
  onSent,
  onDone,
}: {
  remainingSeats: number;
  plan: string;
  /** Called once the invite actually succeeds (e.g. to refresh a member list). */
  onSent?: () => void;
  /** Called when the user is done — Cancel, or "Done" after success. */
  onDone: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "recruiter" | "viewer">("recruiter");
  const [inviting, setInviting] = useState(false);
  /** What the server actually managed to do — the success screen used to
   *  claim an email was sent unconditionally, including when none was. */
  const [result, setResult] = useState<{ emailSent: boolean; signupUrl: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      setInviting(true);
      const res = await api.post<{ emailSent: boolean; signupUrl: string }>("/api/team", {
        email,
        role,
      });
      setResult({ emailSent: res.emailSent, signupUrl: res.signupUrl });
      setSent(true);
      setEmail("");
      onSent?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send invitation";
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  };

  if (sent) {
    const emailSent = result?.emailSent ?? false;
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-tertiary-fixed/20 text-tertiary">
          <span className="material-symbols-outlined">{emailSent ? "check_circle" : "link"}</span>
        </div>
        <p className="font-headline-md text-[18px] text-primary serif-text">
          {emailSent ? "Invitation sent" : "Member added — share this link"}
        </p>
        <p className="mt-1 font-body-md text-[14px] text-on-surface-variant">
          {emailSent
            ? "They'll get an email to join your workspace. They must sign up with the same email address."
            : "We couldn't send the invitation email. Send them this link — they need to sign up with the invited email address."}
        </p>
        {!emailSent && result?.signupUrl && (
          <Button
            type="button"
            variant="outline"
            className="mx-auto mt-3"
            onClick={() => {
              navigator.clipboard.writeText(result.signupUrl);
              toast.success("Signup link copied");
            }}
          >
            <span className="material-symbols-outlined text-[18px]">content_copy</span>
            Copy signup link
          </Button>
        )}
        <Button type="button" variant="gradient" className="mt-5" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@company.com"
          className="flex-1 min-w-0 rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "recruiter" | "viewer")}
          className="rounded-xl border border-border-low-alpha bg-bg-cream/30 px-4 py-3 font-body-md focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="admin">Admin</option>
          <option value="recruiter">Recruiter</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <p className="font-body-md text-[13px] text-on-surface-variant">
        You have {remainingSeats} {remainingSeats === 1 ? "seat" : "seats"} remaining on your {plan} plan.
      </p>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={inviting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="gradient"
          loading={inviting}
          disabled={remainingSeats <= 0}
          title={remainingSeats <= 0 ? "No seats available — upgrade your plan" : undefined}
        >
          {inviting ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
