import { describe, expect, it } from "vitest";
import { isBounceNotification, isAutoReply } from "../../src/server/lib/bounce-detection";

describe("isBounceNotification", () => {
  it("recognizes the exact production case: Gmail's own delivery-failure notification", () => {
    // The real message that landed in Reply Review and got treated as a
    // lead reply — this is the incident this whole feature exists to fix.
    expect(
      isBounceNotification({
        from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
        subject: "Delivery Status Notification (Failure)",
      }),
    ).toBe(true);
  });

  it("recognizes common MTA bounce senders regardless of subject", () => {
    expect(isBounceNotification({ from: "MAILER-DAEMON@example.com", subject: "hi" })).toBe(true);
    expect(isBounceNotification({ from: "postmaster@example.com", subject: "hi" })).toBe(true);
  });

  it("recognizes standard bounce subjects regardless of sender address", () => {
    expect(
      isBounceNotification({ from: "someone@example.com", subject: "Undelivered Mail Returned to Sender" }),
    ).toBe(true);
    expect(isBounceNotification({ from: "someone@example.com", subject: "Undeliverable: Re: intro" })).toBe(
      true,
    );
  });

  it("does not flag a genuine business reply", () => {
    expect(
      isBounceNotification({
        from: "Team Kilmora <info@kgu.org.in>",
        subject: "Re: Enhancing Kamala's Digital Presence",
      }),
    ).toBe(false);
  });

  it("does not flag a reply that merely mentions delivery in a business context", () => {
    expect(
      isBounceNotification({
        from: "ops@example.com",
        subject: "Re: intro — question about delivery timelines",
      }),
    ).toBe(false);
  });
});

describe("isAutoReply", () => {
  it("recognizes standard out-of-office subjects", () => {
    expect(isAutoReply({ subject: "Out of Office: Re: intro" })).toBe(true);
    expect(isAutoReply({ subject: "Automatic reply: Re: intro" })).toBe(true);
    expect(isAutoReply({ subject: "Auto-Reply: Re: intro" })).toBe(true);
    expect(isAutoReply({ subject: "Vacation response: Re: intro" })).toBe(true);
  });

  it("does not flag a genuine reply", () => {
    expect(isAutoReply({ subject: "Re: intro — tell me more" })).toBe(false);
  });
});
