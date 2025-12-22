export const metadata = {
  title: "Terms of Service",
  description: "BlankSlate Terms of Service",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="mt-2 text-sm text-neutral-600">Last updated: December 20, 2025</p>

      <section className="mt-6 space-y-4 text-neutral-800 dark:text-neutral-200">
        <p>
          Welcome to BlankSlate. By accessing or using our application, you agree to these Terms of Service ("Terms"). If you do not agree, you may not use the service.
        </p>
        <h2 className="mt-6 text-lg font-semibold">1. Accounts & Eligibility</h2>
        <p>
          You must be at least 13 years old and capable of entering into a binding agreement. You are responsible for maintaining the security of your account and for all activities occurring under it.
        </p>
        <h2 className="mt-6 text-lg font-semibold">2. Use of the Service</h2>
        <p>
          Do not misuse the service. Prohibited activities include attempting to disrupt or overload the service, reverse engineering without permission, scraping, spamming, or violating applicable laws. We may suspend or terminate accounts engaged in abuse.
        </p>
        <h2 className="mt-6 text-lg font-semibold">3. Data & Privacy</h2>
        <p>
          Our handling of personal data is described in our Privacy Policy. By using the service, you consent to the collection and processing of data as outlined there.
        </p>
        <h2 className="mt-6 text-lg font-semibold">4. Payments & Refunds</h2>
        <p>
          If we offer paid features, pricing and billing terms will be disclosed at the point of sale. Unless required by law, fees are non‑refundable once services are provided, except as otherwise stated.
        </p>
        <h2 className="mt-6 text-lg font-semibold">5. Intellectual Property</h2>
        <p>
          BlankSlate and its licensors own all rights to the service and content. You may not copy, modify, distribute, or create derivative works without permission, except as allowed by law.
        </p>
        <h2 className="mt-6 text-lg font-semibold">6. Disclaimers</h2>
        <p>
          The service is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind. We do not guarantee that the service will be uninterrupted, secure, or error‑free.
        </p>
        <h2 className="mt-6 text-lg font-semibold">7. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, BlankSlate will not be liable for indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or revenues arising from your use of the service.
        </p>
        <h2 className="mt-6 text-lg font-semibold">8. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless BlankSlate and its affiliates from any claims, damages, liabilities, and expenses arising out of or related to your use of the service or violation of these Terms.
        </p>
        <h2 className="mt-6 text-lg font-semibold">9. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be notified in‑app or via email. Continued use after changes take effect constitutes acceptance of the updated Terms.
        </p>
        <h2 className="mt-6 text-lg font-semibold">10. Governing Law</h2>
        <p>
          These Terms are governed by the laws of your primary place of business jurisdiction unless otherwise required. Disputes will be resolved in the courts of that jurisdiction.
        </p>
        <h2 className="mt-6 text-lg font-semibold">11. Contact</h2>
        <p>
          Questions? Contact us at support@blankslate.example.
        </p>
      </section>
    </main>
  );
}
