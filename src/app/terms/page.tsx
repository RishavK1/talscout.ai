import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Terms of Service — TalScout",
  description: "The terms that govern your use of TalScout.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 14, 2026"
      intro="These terms govern your access to and use of TalScout. By creating an account or using the service, you agree to them."
    >
      <h2>1. The service</h2>
      <p>
        TalScout provides software for parsing résumés and searching candidate
        data. We may update, improve, or change features over time. We&apos;ll
        give reasonable notice of material changes that adversely affect paying
        Customers.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You must provide accurate information, keep your credentials secure, and
        are responsible for activity under your account. You must be authorized
        to bind your organization to these terms.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>Only upload data you have a lawful basis to process.</li>
        <li>Don&apos;t misuse the service, attempt to breach security, or reverse-engineer it.</li>
        <li>Don&apos;t use TalScout to unlawfully discriminate against candidates.</li>
      </ul>

      <h2>4. Customer data</h2>
      <p>
        You retain all rights to data you upload. You grant us a limited license
        to process it solely to provide the service. Our handling of personal
        data is described in the <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>5. Plans &amp; billing</h2>
      <p>
        Paid plans are billed per seat on a monthly or annual basis. Fees are
        non-refundable except where required by law. You can change or cancel your
        plan from <a href="/billing">Billing</a>; changes take effect at the next
        renewal.
      </p>

      <h2>6. Availability</h2>
      <p>
        We aim for high availability but the service is provided &quot;as is&quot;
        without warranties of uninterrupted operation. Planned maintenance will be
        communicated where practical.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using the service at any time. We may suspend or terminate
        access for breach of these terms or non-payment. On termination, you can
        export your data for 30 days, after which it may be deleted.
      </p>

      <h2>8. Liability</h2>
      <p>
        To the maximum extent permitted by law, TalScout is not liable for
        indirect or consequential damages, and our total liability is limited to
        the fees you paid in the 12 months before the claim.
      </p>

      <h2>9. Contact</h2>
      <p>
        Questions about these terms? Email{" "}
        <a href="mailto:legal@talscout.ai">legal@talscout.ai</a>.
      </p>
    </LegalPage>
  );
}
