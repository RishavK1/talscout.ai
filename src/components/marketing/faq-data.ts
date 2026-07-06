// Single source of truth for marketing FAQ content, shared by the landing
// page and pricing page so answers stay identical and accurate everywhere.
export const FAQS = [
  {
    q: "Can I change plans at any time?",
    a: "You can upgrade your plan or add seats at any time, self-serve, from your billing settings — it takes effect immediately. Downgrading to a smaller plan isn't available self-serve; contact support and we'll take care of it.",
  },
  {
    q: 'What is a "seat"?',
    a: "A seat refers to a single user account with login credentials. Typically, each recruiter on your team will require their own seat.",
  },
  {
    q: "How accurate is the AI résumé extraction?",
    a: "TalScout reads PDFs and Word docs and extracts name, contact, skills, full work history, and education with high accuracy. Every extraction is shown to your recruiter for a quick review before it's saved — so nothing gets locked in without a human glance.",
  },
  {
    q: "Is my candidate data secure and private?",
    a: "Yes. Every agency's data lives in its own isolated workspace, enforced at the database level (row-level security). One agency can never see another's candidates — even in the unlikely event of an app bug. Data is encrypted in transit and at rest.",
  },
  {
    q: "How fast is semantic search?",
    a: "Sub-second on typical databases. You type what you need in plain English and TalScout ranks your candidates by meaning instantly, highlighting exactly why each person matched.",
  },
  {
    q: "Can I import from Bullhorn or my current ATS?",
    a: "Bulk import and two-way ATS sync (Bullhorn, Greenhouse, Lever and more) are on the roadmap. At launch you can drag-and-drop résumés in bulk to get your database stood up in minutes.",
  },
  {
    q: "How does per-seat pricing work?",
    a: "You pay per recruiter, per month. Add a seat when you add a recruiter, remove it when they leave — billing adjusts automatically. Usage limits exist only as guardrails against abuse, never as a surprise bill.",
  },
  {
    q: "What file types can I upload?",
    a: "PDF and Word (DOCX) today, including scanned/image-based PDFs. Plain text works too. Each file is validated and stored securely under your workspace.",
  },
];
