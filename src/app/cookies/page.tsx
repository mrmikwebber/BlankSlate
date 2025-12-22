export const metadata = {
  title: "Cookies Policy",
  description: "BlankSlate Cookies Policy",
};

export default function CookiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Cookies Policy</h1>
      <p className="mt-2 text-sm text-neutral-600">Last updated: December 20, 2025</p>

      <section className="mt-6 space-y-4 text-neutral-800 dark:text-neutral-200">
        <p>
          This Cookies Policy explains how BlankSlate uses cookies and similar technologies.
        </p>
        <h2 className="mt-6 text-lg font-semibold">1. What Are Cookies?</h2>
        <p>
          Cookies are small text files stored on your device to help websites function and improve user experience.
        </p>
        <h2 className="mt-6 text-lg font-semibold">2. Types of Cookies We Use</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Essential</strong>: Required for core functionality such as authentication and security.</li>
          <li><strong>Analytics</strong>: Help us understand usage to improve the product (only enabled with consent).</li>
          <li><strong>Marketing</strong>: Not used by default. If introduced, they will only be enabled with explicit consent.</li>
        </ul>
        <h2 className="mt-6 text-lg font-semibold">3. Managing Preferences</h2>
        <p>
          You can accept or decline non‑essential cookies via our cookie banner. You can also adjust settings in your browser to block or delete cookies.
        </p>
        <h2 className="mt-6 text-lg font-semibold">4. Updates</h2>
        <p>
          We may update this Cookies Policy to reflect changes in technology or our practices.
        </p>
        <h2 className="mt-6 text-lg font-semibold">5. Contact</h2>
        <p>
          Questions? Contact privacy@blankslate.example.
        </p>
      </section>
    </main>
  );
}
