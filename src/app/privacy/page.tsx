import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Privacy Policy — TalScout",
  description: "How TalScout collects, uses, and protects personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="June 14, 2026"
      intro="TalScout helps staffing and recruiting agencies parse résumés and search candidates. This policy explains what data we process, why, and the choices you have."
    >
      <h2>1. Who we are</h2>
      <p>
        TalScout AI (&quot;TalScout&quot;, &quot;we&quot;, &quot;us&quot;)
        provides résumé parsing and semantic candidate search to recruiting
        agencies (&quot;Customers&quot;). When a Customer uploads candidate data,
        the Customer is the <strong>data controller</strong> and TalScout acts
        as a <strong>data processor</strong> on their behalf.
      </p>

      <h2>2. Data we process</h2>
      <ul>
        <li>
          <strong>Account data:</strong> name, work email, password hash, and
          workspace settings for users who sign up.
        </li>
        <li>
          <strong>Candidate data:</strong> résumés and the structured fields we
          extract from them (contact details, work history, skills, education) —
          uploaded by Customers.
        </li>
        <li>
          <strong>Usage data:</strong> log data, device/browser information, and
          product analytics used to operate and improve the service.
        </li>
      </ul>

      <h2>3. How we use data</h2>
      <p>
        We use data to provide the service (parsing, search, shortlists,
        billing), to secure and maintain the platform, and to provide support.
        We do <strong>not</strong> sell personal data, and we do not train shared
        AI models on a Customer&apos;s proprietary candidate data.
      </p>

      <h2>4. AI processing</h2>
      <p>
        Résumé parsing and semantic search use third-party AI providers under
        data-processing agreements. Content sent for processing is used only to
        return results to your workspace and is not retained by providers to
        train their models where a no-retention option is available.
      </p>

      <h2>5. Sharing &amp; sub-processors</h2>
      <p>
        We share data only with sub-processors that help us run the service
        (cloud hosting, AI inference, payments, email). Each is bound by
        confidentiality and data-protection terms. A current list is available
        on request.
      </p>

      <h2>6. Data retention &amp; deletion</h2>
      <p>
        Customers control retention of candidate data and can export or delete it
        at any time from <a href="/settings#data-privacy">Settings → Data &amp;
        privacy</a>. When a workspace is closed, we delete or anonymize
        associated data within 30 days, except where law requires longer
        retention.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct,
        export, or delete personal data, and to object to certain processing.
        Candidates should contact the agency that holds their data; we will assist
        our Customers in responding to such requests.
      </p>

      <h2>8. Security</h2>
      <p>
        We protect data with encryption in transit and at rest, strict per-tenant
        isolation, and least-privilege access controls. See our{" "}
        <a href="/security">Security overview</a> for details.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about this policy? Email{" "}
        <a href="mailto:privacy@talscout.ai">privacy@talscout.ai</a>.
      </p>
    </LegalPage>
  );
}
