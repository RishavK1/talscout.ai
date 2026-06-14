import { LegalPage } from "@/components/marketing/legal-page";

export const metadata = {
  title: "Cookie Policy — TalScout",
  description: "How TalScout uses cookies and similar technologies.",
};

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      updated="June 14, 2026"
      intro="This policy explains how TalScout uses cookies and similar technologies, and how you can control them."
    >
      <h2>1. What cookies are</h2>
      <p>
        Cookies are small text files stored on your device. We use cookies and
        similar technologies (local storage, pixels) to keep you signed in,
        remember preferences, and understand how the product is used.
      </p>

      <h2>2. Types we use</h2>
      <ul>
        <li>
          <strong>Strictly necessary:</strong> authentication, security, and core
          functionality. The app won&apos;t work without these.
        </li>
        <li>
          <strong>Preferences:</strong> remember settings like your workspace and
          UI choices.
        </li>
        <li>
          <strong>Analytics:</strong> aggregated, privacy-respecting product
          analytics to improve the experience.
        </li>
      </ul>

      <h2>3. Third parties</h2>
      <p>
        Some cookies are set by providers that help us run the service (e.g.
        authentication and payments). These providers are bound by
        data-protection terms.
      </p>

      <h2>4. Managing cookies</h2>
      <p>
        You can control or delete cookies in your browser settings. Blocking
        strictly necessary cookies may prevent you from signing in or using parts
        of TalScout. Where required, we ask for consent to non-essential cookies.
      </p>

      <h2>5. Changes</h2>
      <p>
        We may update this policy as our use of cookies evolves. We&apos;ll post
        the updated date at the top of this page.
      </p>

      <h2>6. Contact</h2>
      <p>
        Questions? Email <a href="mailto:privacy@talscout.ai">privacy@talscout.ai</a>.
      </p>
    </LegalPage>
  );
}
