import { describe, expect, it } from "vitest";
import {
  isBounceNotification,
  isSenderRateLimited,
  isAutoReply,
} from "../../src/server/lib/bounce-detection";

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

describe("isSenderRateLimited", () => {
  it("recognizes the exact production case: Gmail's own sending-limit notice", () => {
    // The real message that got 33 perfectly good leads (principal@vit.edu.in,
    // contact@kohinoorcollege.com, ...) permanently marked "bounced" before
    // this check existed — nothing was wrong with any of them, the SENDING
    // account had hit Gmail's daily cap.
    expect(
      isSenderRateLimited({
        from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
        body: "You have reached a limit for sending mail. Your message was not sent.",
      }),
    ).toBe(true);
  });

  it("is NOT flagged as a genuine bounce by isBounceNotification's subject check alone — callers must check isSenderRateLimited first", () => {
    // Real Gmail throttle notices often carry no standardized bounce subject
    // (unlike RFC 3464 DSNs) — from-address is the only reliable signal, and
    // it's identical to a real bounce's. This is exactly why ordering matters
    // at the call site (see poll-automated-replies.ts).
    const msg = {
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Delivery Status Notification (Failure)",
      body: "You have reached a limit for sending mail. Your message was not sent.",
    };
    expect(isSenderRateLimited(msg)).toBe(true);
    expect(isBounceNotification(msg)).toBe(true); // same from/subject — confirms the ordering hazard is real
  });

  it("does not flag a genuine recipient-side bounce as a sender rate limit", () => {
    expect(
      isSenderRateLimited({
        from: "mailer-daemon@googlemail.com",
        body: "The email account that you tried to reach does not exist. 550 5.1.1",
      }),
    ).toBe(false);
  });

  it("does not flag a genuine business reply that happens to mention limits", () => {
    expect(
      isSenderRateLimited({
        from: "ops@example.com",
        body: "We've reached our budget limit for this quarter, but let's talk next month.",
      }),
    ).toBe(false);
  });

  it("requires a mailer-daemon-shaped sender — a human can't trigger this by wording alone", () => {
    expect(
      isSenderRateLimited({
        from: "someone@example.com",
        body: "You have reached a limit for sending mail. Your message was not sent.",
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
