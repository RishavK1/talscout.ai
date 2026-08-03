import type {
  OutreachMailer,
  OutreachSendArgs,
  OutreachSendResult,
  SenderAccountCredentials,
} from "@/server/ports";

/** Captures bulk-fire sends in memory so tests can assert on them. Nothing
 *  leaves the process — dev/test never emails real leads. */
export class MockOutreachMailer implements OutreachMailer {
  readonly sent: { creds: SenderAccountCredentials; message: OutreachSendArgs }[] = [];
  /** What `threadHasReply` answers — tests flip this to exercise the
   *  follow-up reply-stop paths. Defaults to "no_reply" so cascaded sends
   *  proceed unless a test says otherwise. */
  threadReplyState: "replied" | "no_reply" | "unknown" = "no_reply";
  /** What `getThreadReplyContent` returns — tests set this to exercise the
   *  automated-outreach reply-drafting pipeline. Null by default (nothing to
   *  draft), independent of `threadReplyState` so tests can drive them
   *  separately. `from` is optional here (defaulted on read below) so
   *  existing tests that only care about subject/body don't need updating —
   *  set it explicitly to exercise bounce/auto-reply detection. */
  threadReplyContent: { from?: string; subject: string; body: string } | null = null;

  async send(
    creds: SenderAccountCredentials,
    message: OutreachSendArgs,
  ): Promise<OutreachSendResult> {
    this.sent.push({ creds, message });
    // Deterministic fake thread id so follow-up tests can assert the Day 0
    // thread is carried through — mirrors the real adapter returning
    // Gmail's threadId (SMTP creds get one too; harmless, tests only read
    // it for gmail-flavored assertions).
    return { gmailThreadId: `mock-thread-${this.sent.length}` };
  }

  async threadHasReply(): Promise<"replied" | "no_reply" | "unknown"> {
    return this.threadReplyState;
  }

  async getThreadReplyContent(): Promise<{ from: string; subject: string; body: string } | null> {
    if (!this.threadReplyContent) return null;
    return { from: "lead@example.com", ...this.threadReplyContent };
  }
}
