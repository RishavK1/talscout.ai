// Single source of truth for marketing FAQ content, shared by the landing
// page and pricing page so answers stay identical and accurate everywhere.
// Ordered outreach-first, matching the product's primary positioning; the
// talent questions follow, then billing.
export const FAQS = [
  {
    q: "Where do the leads actually come from?",
    a: "You choose a business category and a location, and TalScout pulls real businesses from open mapping and places data — then finds a contact email for each one through a chain of sources, starting with the business's own website. It's live discovery, not a purchased list that's been emailed a hundred times already.",
  },
  {
    q: "What's the difference between AI Automated Outreach and Bulk Fire?",
    a: "Automated Outreach finds the leads for you: it discovers businesses, verifies emails, drops the ones that aren't a fit, writes each email individually, and keeps running on a schedule. Bulk Fire is for when you already have a list — you import your contacts, build a sequence once, and send it. Same sending infrastructure, opposite starting points.",
  },
  {
    q: "Do the emails send from my own email address?",
    a: "Yes. You connect your own Gmail account or any SMTP mailbox, and every message leaves from your address and your domain. Replies come back to your inbox directly. We never send from a shared pool, so your sender reputation is entirely your own.",
  },
  {
    q: "How does the AI know what to write about my business?",
    a: "Before any campaign runs, you build a blueprint. TalScout reads your website, researches your company live on the web, and asks a short set of questions — including a free-text box where you explain the business in your own words. Every email is grounded strictly in that blueprint, and the writer is explicitly instructed never to invent claims, metrics or testimonials that aren't in it.",
  },
  {
    q: "Will this get my domain marked as spam?",
    a: "That's the risk we design around. Sends are paced across the day with natural variation instead of firing a whole batch at once, daily volume is capped, follow-ups thread into the original conversation rather than arriving as new cold emails, and a detected reply stops the remaining follow-ups. You should still warm up a new sending domain before running volume through it.",
  },
  {
    q: "Does the AI reply to prospects on its own?",
    a: "No — and this is deliberate. When someone replies, TalScout drafts a response grounded in your blueprint and puts it in your review queue. You approve, edit or reject it. There is no code path that sends an AI-written reply to a real person without a human approving it first.",
  },
  {
    q: "How do the outreach and talent sides relate to each other?",
    a: "They're two equally core engines that work in completely different ways. Outreach brings you new customers — it discovers businesses and emails them. Talent makes your candidate data usable — it parses résumés and makes them searchable. They deliberately never cross wires: a résumé never feeds an outreach campaign, and a discovered lead never lands in your candidate database. Most teams use both, but either stands on its own.",
  },
  {
    q: "How accurate is the AI résumé extraction?",
    a: "TalScout reads PDFs and Word docs and extracts name, contact, skills, full work history, and education with high accuracy. Every extraction is shown to your recruiter for a quick review before it's saved — so nothing gets locked in without a human glance.",
  },
  {
    q: "How fast is semantic search?",
    a: "Sub-second on typical databases. You type what you need in plain English and TalScout ranks your candidates by meaning instantly, highlighting exactly why each person matched.",
  },
  {
    q: "Is my data secure and private?",
    a: "Yes. Every workspace's data is isolated at the database level with row-level security, so one account can never see another's leads or candidates — even in the unlikely event of an app bug. Mailbox credentials and SMTP passwords are encrypted at rest with AES-256-GCM and only decrypted at the moment a message is sent.",
  },
  {
    q: "Can I change plans at any time?",
    a: "You can upgrade your plan or add seats at any time, self-serve, from your billing settings — it takes effect immediately. Downgrading to a smaller plan isn't available self-serve; contact support and we'll take care of it.",
  },
  {
    q: 'What is a "seat"?',
    a: "A seat refers to a single user account with login credentials. Typically, each person on your team will require their own seat.",
  },
];
