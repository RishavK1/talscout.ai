import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { POST as createCampaignPOST } from "../../src/app/api/automated-campaigns/route";
import { POST as resumeCampaignPOST } from "../../src/app/api/automated-campaigns/[id]/resume/route";
import {
  GET as listRepliesGET,
} from "../../src/app/api/automated-replies/route";
import { POST as approveReplyPOST } from "../../src/app/api/automated-replies/[id]/approve/route";
import { POST as rejectReplyPOST } from "../../src/app/api/automated-replies/[id]/reject/route";
import { POST as regenerateReplyPOST } from "../../src/app/api/automated-replies/[id]/regenerate/route";
import { resetDb } from "../helpers/seed";
import { makeUser } from "../helpers/auth-fixtures";
import { call } from "../helpers/http";
import { adminDb, closePools } from "../../src/server/db/client";
import {
  blueprints,
  senderAccounts,
  automatedReplyDrafts,
  automatedSends,
  automatedLeads,
} from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { withTenantTx } from "../../src/server/db/tx";
import { sendAutomatedEmail } from "../../src/server/jobs/send-automated-email";
import { pollAutomatedReplies } from "../../src/server/jobs/poll-automated-replies";
import { getServices } from "../../src/server/container";
import type { MockOutreachMailer } from "../../src/server/adapters/mock.outreach-mailer";
import type { BlueprintSections } from "../../src/server/ports";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const MINIMAL_SECTIONS: BlueprintSections = {
  whoWeAre: "Acme Co.",
  whatWeOffer: "A scheduling tool",
  whoItsFor: "Small agencies",
  differentiator: "Faster onboarding",
  painWeSolve: "Manual scheduling",
  proof: [{ label: "100+ customers" }],
  personas: [{ name: "Owner" }],
  voice: "Friendly and direct",
  objections: ["Too expensive"],
  rules: ["Never invent facts", "Keep it short"],
};

async function seedActiveBlueprint(tenantId: string) {
  const [row] = await adminDb()
    .insert(blueprints)
    .values({ tenantId, name: "Acme Offer", status: "active", sections: MINIMAL_SECTIONS })
    .returning();
  return row;
}

async function seedGmailSender(tenantId: string, email = "a@test.local") {
  const [row] = await adminDb()
    .insert(senderAccounts)
    .values({
      tenantId,
      type: "gmail",
      label: email,
      email,
      gmailRefreshTokenEnc: encryptSecret("fake-refresh-token"),
      gmailHasReadScope: true,
      isActive: true,
    })
    .returning();
  return row;
}

async function createActiveReplyPollingCampaign(
  token: string,
  blueprintId: string,
  senderAccountId: string,
) {
  const created = await call(createCampaignPOST, {
    token,
    body: {
      name: "Dentists",
      blueprintId,
      senderAccountId,
      discoveryQuery: { category: "dentist", location: { text: "Austin, TX" } },
      signatureName: "Jane Doe",
      replyPollingEnabled: true,
    },
  });
  const id = created.json.data.id as string;
  await call(resumeCampaignPOST, { token, method: "POST", routeCtx: params(id) });
  return id;
}

function mockMailer(): MockOutreachMailer {
  return getServices().outreachMailer as MockOutreachMailer;
}

/** Drains every scheduled row through the send job itself rather than
 *  waiting on real wall-clock pacing delays. These reply-flow tests care
 *  about what happens once a send has gone out, not about pacing.
 *
 *  Deliberately does NOT call runAutomatedCampaigns itself — every caller
 *  activates the campaign immediately beforehand via
 *  createActiveReplyPollingCampaign, whose resumeCampaign call already
 *  triggers one full discover→enrich→generate→schedule run synchronously
 *  (see run-automated-campaign.ts's afterCommit hook, executed inline by
 *  InProcessQueue in test mode). A second explicit call here used to be a
 *  silent no-op only because discovery couldn't tell a repeat run from a
 *  fresh one — now that it pages past what it's already found (see
 *  automated-outreach-pipeline.test.ts's "repeated tick" regression test),
 *  a redundant call here would pull in a second page of leads these tests
 *  aren't about. */
async function runCampaignAndCompleteSends(tenantId: string) {
  const scheduled = await withTenantTx({ tenantId }, (ctx) =>
    ctx.tx.select().from(automatedSends).where(eq(automatedSends.tenantId, tenantId)),
  );
  for (const send of scheduled) {
    if (send.status === "scheduled") {
      await sendAutomatedEmail({ tenantId, sendId: send.id }, getServices());
    }
  }
}

async function draftsForTenant() {
  return await adminDb().select().from(automatedReplyDrafts);
}

beforeEach(async () => {
  await resetDb();
  mockMailer().threadReplyState = "no_reply";
  mockMailer().threadReplyContent = null;
});
afterAll(async () => {
  await closePools();
});

describe("pollAutomatedReplies — drafts replies for human review", () => {
  it("creates a pending draft per replied thread, never sends anything itself", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    const campaignId = await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);

    await runCampaignAndCompleteSends(tenant.id);

    mockMailer().threadReplyState = "replied";
    mockMailer().threadReplyContent = { subject: "Re: intro", body: "Tell me more" };
    const sentBefore = mockMailer().sent.length;

    await pollAutomatedReplies(getServices());

    const drafts = await draftsForTenant();
    expect(drafts).toHaveLength(5);
    expect(drafts.every((d) => d.status === "pending")).toBe(true);
    expect(drafts.every((d) => d.inboundBody === "Tell me more")).toBe(true);
    expect(drafts.every((d) => d.draftBody.length > 0)).toBe(true);
    // The poll job itself never calls mailer.send — only approve does.
    expect(mockMailer().sent.length).toBe(sentBefore);
    void campaignId;
  });

  it("does not re-poll or duplicate a draft on a repeat tick", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);
    await runCampaignAndCompleteSends(tenant.id);
    mockMailer().threadReplyState = "replied";
    mockMailer().threadReplyContent = { subject: "Re: intro", body: "Tell me more" };

    await pollAutomatedReplies(getServices());
    await pollAutomatedReplies(getServices());

    const drafts = await draftsForTenant();
    expect(drafts).toHaveLength(5); // not 10 — one draft per send (unique on sendId)
  });

  it("a reply cancels the lead's remaining scheduled follow-ups immediately", async () => {
    // Production incident this covers: a lead replied "not interested" on
    // the Day 3 follow-up, but its Day 7 kept showing "Scheduled" for days
    // afterward — technically safe (sendAutomatedEmail's own send-time
    // reply-check would have skipped it), but alarming and only defended by
    // that one late check. This proves the follow-up is cancelled the
    // moment the reply is detected, not left pending on a future self-check.
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);
    // Activation already ran discover→enrich→generate→schedule once — send
    // ONLY the Day 0 step (mirrors the real timeline: Day 3/Day 7 haven't
    // reached their scheduled time yet), leaving steps 1 and 2 "scheduled".
    const day0Sends = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx
        .select()
        .from(automatedSends)
        .where(and(eq(automatedSends.tenantId, tenant.id), eq(automatedSends.stepIndex, 0))),
    );
    for (const send of day0Sends) {
      await sendAutomatedEmail({ tenantId: tenant.id, sendId: send.id }, getServices());
    }

    mockMailer().threadReplyState = "replied";
    mockMailer().threadReplyContent = { subject: "Re: intro", body: "Not interested, thanks." };
    await pollAutomatedReplies(getServices());

    const allSends = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx.select().from(automatedSends).where(eq(automatedSends.tenantId, tenant.id)),
    );
    const byStep = (i: number) => allSends.filter((s) => s.stepIndex === i);
    expect(byStep(0).every((s) => s.status === "sent")).toBe(true); // untouched
    expect(byStep(1).every((s) => s.status === "skipped")).toBe(true); // cancelled
    expect(byStep(2).every((s) => s.status === "skipped")).toBe(true); // cancelled
    expect(byStep(1).every((s) => s.errorReason === "lead_replied")).toBe(true);
  });

  it("recognizes a bounce notification as a bounce, not a reply — no draft, lead marked bounced, sequence stopped", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);
    // Only send Day 0 — Day 3/7 stay "scheduled", mirroring the real
    // timeline (see the "cancels the lead's remaining follow-ups" test
    // above for why runCampaignAndCompleteSends isn't used here).
    const day0Sends = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx
        .select()
        .from(automatedSends)
        .where(and(eq(automatedSends.tenantId, tenant.id), eq(automatedSends.stepIndex, 0))),
    );
    for (const send of day0Sends) {
      await sendAutomatedEmail({ tenantId: tenant.id, sendId: send.id }, getServices());
    }

    mockMailer().threadReplyState = "replied"; // a bounce IS "someone other than us sent a message"
    mockMailer().threadReplyContent = {
      from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      subject: "Delivery Status Notification (Failure)",
      body: "Address not found",
    };

    await pollAutomatedReplies(getServices());

    // No draft — a bounce is never something to draft an AI reply to.
    expect(await draftsForTenant()).toHaveLength(0);

    const leads = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx.select().from(automatedLeads).where(eq(automatedLeads.tenantId, tenant.id)),
    );
    expect(leads.every((l) => l.status === "bounced")).toBe(true);

    // Same "stop the sequence now" treatment as a real reply.
    const followUps = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx
        .select()
        .from(automatedSends)
        .where(and(eq(automatedSends.tenantId, tenant.id), eq(automatedSends.stepIndex, 1))),
    );
    expect(followUps.every((s) => s.status === "skipped" && s.errorReason === "bounced")).toBe(true);
  });

  it("recognizes an out-of-office auto-reply — no draft, but the sequence is NOT stopped", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);
    const day0Sends = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx
        .select()
        .from(automatedSends)
        .where(and(eq(automatedSends.tenantId, tenant.id), eq(automatedSends.stepIndex, 0))),
    );
    for (const send of day0Sends) {
      await sendAutomatedEmail({ tenantId: tenant.id, sendId: send.id }, getServices());
    }

    mockMailer().threadReplyState = "replied";
    mockMailer().threadReplyContent = {
      from: "prospect@example.com",
      subject: "Out of Office: Re: intro",
      body: "I am currently out of the office, back Monday.",
    };

    await pollAutomatedReplies(getServices());

    expect(await draftsForTenant()).toHaveLength(0);

    // An auto-responder is not a human decision — the lead stays wherever it
    // was (not "bounced", not "replied") and the Day 3/7 follow-ups stay
    // scheduled, unlike the bounce/real-reply cases above.
    const leads = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx.select().from(automatedLeads).where(eq(automatedLeads.tenantId, tenant.id)),
    );
    expect(leads.every((l) => l.status !== "bounced" && l.status !== "replied")).toBe(true);
    const followUps = await withTenantTx({ tenantId: tenant.id }, (ctx) =>
      ctx.tx
        .select()
        .from(automatedSends)
        .where(and(eq(automatedSends.tenantId, tenant.id), eq(automatedSends.stepIndex, 1))),
    );
    expect(followUps.every((s) => s.status === "scheduled")).toBe(true);
  });

  it("persists the AI-classified intent on a genuine reply's draft", async () => {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);
    await runCampaignAndCompleteSends(tenant.id);

    mockMailer().threadReplyState = "replied";
    mockMailer().threadReplyContent = {
      from: "prospect@example.com",
      subject: "Re: intro",
      body: "Tell me more",
    };

    await pollAutomatedReplies(getServices());

    const drafts = await draftsForTenant();
    expect(drafts.length).toBeGreaterThan(0);
    // MockReplyDrafter always returns intent: "interested" — see
    // mock.reply-drafter.ts.
    expect(drafts.every((d) => d.intent === "interested")).toBe(true);
  });
});

describe("reply review actions", () => {
  async function seedOnePendingDraft() {
    const { tenant, token } = await makeUser("recruiter");
    const blueprint = await seedActiveBlueprint(tenant.id);
    const sender = await seedGmailSender(tenant.id);
    await createActiveReplyPollingCampaign(token, blueprint.id, sender.id);
    await runCampaignAndCompleteSends(tenant.id);
    mockMailer().threadReplyState = "replied";
    mockMailer().threadReplyContent = { subject: "Re: intro", body: "Tell me more" };
    await pollAutomatedReplies(getServices());

    const drafts = await draftsForTenant();
    return { token, draftId: drafts[0].id, allDraftIds: drafts.map((d) => d.id) };
  }

  it("approve sends the reply via the mailer and marks the draft sent", async () => {
    const { token, draftId } = await seedOnePendingDraft();
    const sentBefore = mockMailer().sent.length;

    const res = await call(approveReplyPOST, {
      token,
      method: "POST",
      body: {},
      routeCtx: params(draftId),
    });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("approved");

    const [row] = await adminDb()
      .select()
      .from(automatedReplyDrafts)
      .where(eq(automatedReplyDrafts.id, draftId));
    expect(row.status).toBe("sent");
    expect(row.sentAt).not.toBeNull();
    expect(mockMailer().sent.length).toBe(sentBefore + 1);
  });

  it("approve with an edited body sends the edited text, not the original draft", async () => {
    const { token, draftId } = await seedOnePendingDraft();

    const res = await call(approveReplyPOST, {
      token,
      method: "POST",
      body: { draftBody: "A completely different, human-edited reply." },
      routeCtx: params(draftId),
    });
    expect(res.status).toBe(200);

    const lastSent = mockMailer().sent[mockMailer().sent.length - 1];
    expect(lastSent.message.text).toBe("A completely different, human-edited reply.");
  });

  it("reject dismisses the draft with no send", async () => {
    const { token, draftId } = await seedOnePendingDraft();
    const sentBefore = mockMailer().sent.length;

    const res = await call(rejectReplyPOST, { token, method: "POST", routeCtx: params(draftId) });
    expect(res.status).toBe(200);

    const [row] = await adminDb()
      .select()
      .from(automatedReplyDrafts)
      .where(eq(automatedReplyDrafts.id, draftId));
    expect(row.status).toBe("rejected");
    expect(mockMailer().sent.length).toBe(sentBefore);
  });

  it("regenerate re-runs the AI drafter and keeps the draft pending", async () => {
    const { token, draftId } = await seedOnePendingDraft();

    const res = await call(regenerateReplyPOST, { token, method: "POST", routeCtx: params(draftId) });
    expect(res.status).toBe(200);
    expect(res.json.data.status).toBe("pending");
  });

  it("cannot approve or reject an already-reviewed draft", async () => {
    const { token, draftId } = await seedOnePendingDraft();
    await call(rejectReplyPOST, { token, method: "POST", routeCtx: params(draftId) });

    const res = await call(approveReplyPOST, {
      token,
      method: "POST",
      body: {},
      routeCtx: params(draftId),
    });
    expect(res.status).toBe(409);
  });

  it("the review queue only lists pending drafts", async () => {
    const { token, allDraftIds } = await seedOnePendingDraft();
    await call(rejectReplyPOST, { token, method: "POST", routeCtx: params(allDraftIds[0]) });

    const listed = await call(listRepliesGET, { token });
    expect(listed.json.data.drafts).toHaveLength(4);
    expect(listed.json.data.drafts.every((d: { status: string }) => d.status === "pending")).toBe(true);
  });
});

describe("reply drafter prompt-injection defense (regression guard)", () => {
  it("the Gemini reply-drafter's system prompt explicitly tags inbound content as untrusted data", () => {
    const source = readFileSync(
      new URL("../../src/server/adapters/gemini.reply-drafter.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("inbound_reply_untrusted_data");
    expect(source).toMatch(/never follow|never.*obey|not.*instructions/i);
    expect(source).toContain("THIRD-PARTY DATA");
  });

  it("the OpenRouter reply-drafter's system prompt explicitly tags inbound content as untrusted data", () => {
    const source = readFileSync(
      new URL("../../src/server/adapters/openrouter.reply-drafter.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("inbound_reply_untrusted_data");
    expect(source).toMatch(/never follow|never.*obey|not.*instructions/i);
    expect(source).toContain("THIRD-PARTY DATA");
  });
});
