export const metadata = {
  title: "Privacy Policy",
  description: "BlankSlate Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-neutral-600">Last updated: December 20, 2025</p>

      <section className="mt-6 space-y-4 text-neutral-800 dark:text-neutral-200">
        <p>
          This Privacy Policy explains how BlankSlate collects, uses, and protects your information.
        </p>
        <h2 className="mt-6 text-lg font-semibold">1. Information We Collect</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Account data (email, name, authentication identifiers).</li>
          <li>Usage data (app interactions, device/browser information, approximate location from IP).</li>
          <li>Budget/account data you choose to store in the app.</li>
        </ul>
        <h2 className="mt-6 text-lg font-semibold">2. How We Use Information</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Provide, maintain, and improve the service.</li>
          <li>Authenticate users and prevent fraud or abuse.</li>
          <li>Analyze usage (if analytics cookies are enabled) to improve features.</li>
          <li>Communicate important updates and support messages.</li>
        </ul>
        <h2 className="mt-6 text-lg font-semibold">3. Legal Bases (EEA/UK)</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Contract (providing the service to you).</li>
          <li>Legitimate interests (security, product improvement).</li>
          <li>Consent (analytics cookies; marketing if applicable).</li>
        </ul>
        <h2 className="mt-6 text-lg font-semibold">4. Data Sharing</h2>
        <p>
          We may share data with service providers strictly to operate the service. For authentication and storage we use Supabase. Providers are bound by contractual obligations and may not use data for other purposes.
        </p>
        <h2 className="mt-6 text-lg font-semibold">5. Data Retention</h2>
        <p>
          We retain data for as long as your account is active and for the period necessary to fulfill the purposes in this Policy. You may request deletion and we will remove personal data subject to legal obligations.
        </p>
        <h2 className="mt-6 text-lg font-semibold">6. Your Rights</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Access, correct, or delete your data.</li>
          <li>Object to processing or request restriction where applicable.</li>
          <li>Data portability (export your data where feasible).</li>
          <li>Withdraw consent for analytics or marketing at any time.</li>
        </ul>
        <h2 className="mt-6 text-lg font-semibold">7. Cookies</h2>
        <p>
          Essential cookies are required for the app to function. Optional analytics cookies are only enabled with your consent. Manage your preferences in the cookie banner or visit the Cookies page.
        </p>
        <h2 className="mt-6 text-lg font-semibold">8. Security</h2>
        <p>
          We implement reasonable technical and organizational measures, including encryption in transit and access controls. No method of transmission is 100% secure; we strive to protect your data but cannot guarantee absolute security.
        </p>
        <h2 className="mt-6 text-lg font-semibold">9. International Transfers</h2>
        <p>
          Where data is transferred internationally, we rely on appropriate safeguards such as standard contractual clauses.
        </p>
        <h2 className="mt-6 text-lg font-semibold">10. Children</h2>
        <p>
          The service is not directed to children under 13. We do not knowingly collect data from children under 13.
        </p>
        <h2 className="mt-6 text-lg font-semibold">11. Changes</h2>
        <p>
          We may update this Policy. Material changes will be highlighted in the app or via email.
        </p>
        <h2 className="mt-6 text-lg font-semibold">12. Contact</h2>
        <p>
          For privacy inquiries, contact privacy@blankslate.example.
        </p>
      </section>
    </main>
  );
}
