import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
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
import { blueprints, senderAccounts, automatedReplyDrafts, automatedSends } from "../../src/server/db/schema";
import { encryptSecret } from "../../src/server/lib/secret-box";
import { withTenantTx } from "../../src/server/db/tx";
import { runAutomatedCampaigns } from "../../src/server/jobs/run-automated-campaign";
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

/** Runs discovery/enrichment/copy-gen (which now only SCHEDULES paced sends,
 *  never fires them inline — see automated-outreach-pipeline.test.ts), then
 *  directly drains every scheduled row through the send job itself rather
 *  than waiting on real wall-clock pacing delays. These reply-flow tests
 *  care about what happens once a send has gone out, not about pacing. */
async function runCampaignAndCompleteSends(tenantId: string) {
  await runAutomatedCampaigns(getServices());
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
