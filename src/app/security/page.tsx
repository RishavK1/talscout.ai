import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Security — TalScout",
  description: "How TalScout keeps candidate data isolated, encrypted, and safe.",
};

export default function SecurityPage() {
  return (
    <LegalPage
      title="Security"
      updated="June 14, 2026"
      intro="Candidate data is sensitive. Security isn't a feature we bolted on — it's how TalScout is built. Here's our approach."
    >
      <h2>1. Tenant isolation</h2>
      <p>
        Every agency&apos;s data is strictly isolated. Access is scoped to a
        single tenant at the database level, so one Customer can never see
        another&apos;s candidates — even in the event of an application bug.
      </p>

      <h2>2. Encryption</h2>
      <p>
        Data is encrypted <strong>in transit</strong> (TLS 1.2+) and{" "}
        <strong>at rest</strong>. Secrets and credentials are stored in a managed
        secrets vault, never in source code.
      </p>

      <h2>3. Access control</h2>
      <ul>
        <li>Role-based access (admin, recruiter, viewer) inside each workspace.</li>
        <li>Least-privilege access for our own systems and personnel.</li>
        <li>Optional two-factor authentication for accounts.</li>
        <li>An audit log of sensitive actions for every workspace.</li>
      </ul>

      <h2>4. AI data handling</h2>
      <p>
        Résumé parsing and search use vetted AI providers under data-processing
        agreements. We don&apos;t train shared models on your proprietary
        candidate data, and we use no-retention processing where available.
      </p>

      <h2>5. Infrastructure</h2>
      <p>
        TalScout runs on reputable cloud infrastructure with automated backups,
        point-in-time recovery, and monitoring. File uploads are stored in
        access-controlled object storage and served via short-lived signed URLs.
      </p>

      <h2>6. Responsible disclosure</h2>
      <p>
        Found a vulnerability? We appreciate responsible disclosure. Email{" "}
        <a href="mailto:security@talscout.ai">security@talscout.ai</a> and
        we&apos;ll respond promptly. Please don&apos;t access data that isn&apos;t
        yours while testing.
      </p>

      <h2>7. Compliance</h2>
      <p>
        We design to align with GDPR/CCPA obligations for personal data and
        support Customers with data-subject requests, exports, and deletion. Our{" "}
        <a href="/privacy">Privacy Policy</a> covers how we process personal data.
      </p>
    </LegalPage>
  );
}
